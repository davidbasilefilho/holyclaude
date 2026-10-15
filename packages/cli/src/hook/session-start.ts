import { join } from "node:path"

import {
  latestIntent,
  loadState,
  sortedById,
  stateDirPath,
  type Assignment,
  type State,
} from "@holyclaude/core"
import { Effect } from "effect"

import { PLUGIN_NAME, pluginRoot } from "../fingerprint.ts"
import { toon } from "../toon.ts"
import { decodeHookInput } from "./input.ts"

/**
 * The `agent_type` a SessionStart payload shows when the main thread runs as the holyclaude agent:
 * the plugin-qualified name, or the bare one. That agent's system prompt already carries the core
 * rules.
 */
const MAIN_AGENT_TYPES: ReadonlyArray<string> = [`${PLUGIN_NAME}:${PLUGIN_NAME}`, PLUGIN_NAME]

/** SessionStart `additionalContext` is capped at this many characters. */
const CAP = 10_000
const RULES_START = "<!-- holyclaude:core-rules:start -->"
const RULES_END = "<!-- holyclaude:core-rules:end -->"
const PLUGIN_ROOT_VAR = "${CLAUDE_PLUGIN_ROOT}"
/** The one-line pointer to the CLI, which `cli` names as the root should run it. */
const pointer = (cli: string) => `Full state: ${cli} intent show; ${cli} assignment list`
const RULES_CUT = "\n[core rules cut to fit; full text in agents/holyclaude.md]"
const RULES_DROPPED = "[core rules dropped to fit; full text in agents/holyclaude.md]"

/** Shortens text to at most `max` characters, ending in an ellipsis when it was cut. */
export const clip = (text: string, max: number) =>
  max <= 0 ? "" : text.length <= max ? text : `${text.slice(0, max - 1)}…`

const cutRules = (rules: string, room: number) => {
  const cut = rules.slice(0, room)
  const newline = cut.lastIndexOf("\n")
  return newline > 0 ? cut.slice(0, newline) : cut
}

const row = (assignment: Assignment) => ({
  id: assignment.id,
  role: assignment.role,
  state: assignment.state,
  agent_id: assignment.agent_id,
  rev: assignment.intent_revision,
  objective: clip(assignment.objective.replace(/\s+/g, " "), 60),
})

/** Running and Succeeded-but-unaccepted Assignments, the ones that need the root's attention. */
const open = (state: State) =>
  sortedById(state.assignments).filter(
    (assignment) =>
      assignment.state === "Running" ||
      (assignment.state === "Succeeded" && assignment.acceptance === null),
  )

/** A state summary that can be rendered with fewer rows and shorter text. */
interface Summary {
  readonly rows: number
  readonly render: (rows: number, textLimit: number) => string
}

const summaryOf = (state: State): Summary => {
  const rows = open(state)
  return {
    rows: rows.length,
    render: (limit, textLimit) => {
      const intent = latestIntent(state)
      return toon({
        intent:
          intent === undefined
            ? null
            : {
                id: intent.id,
                revision: intent.revision,
                objective: clip(intent.objective, textLimit),
                requirements: clip(intent.requirements, textLimit),
              },
        assignments: rows.slice(0, limit).map(row),
        ...(rows.length > limit ? { more_assignments: rows.length - limit } : {}),
      }).trimEnd()
    },
  }
}

const brokenSummary = (message: string): Summary => ({
  rows: 0,
  render: () => toon({ state_error: clip(message, 300) }).trimEnd(),
})

const block = (text: string) => `State:\n${text}`

/** Shrinks the state summary: all rows first, then fewer rows, then shorter text, then nothing. */
const fitSummary = (summary: Summary, budget: number): string => {
  for (const textLimit of [400, 120, 0]) {
    let rows = summary.rows
    for (;;) {
      const text = summary.render(rows, textLimit)
      if (block(text).length <= budget) return block(text)
      if (rows === 0) break
      rows = Math.min(rows - 1, Math.floor(rows * 0.8))
    }
  }
  return ""
}

/**
 * Joins the pieces under the cap. The core rules are cut first, then the state summary shrinks, and
 * the one-line pointer to the CLI stays last.
 */
const composeContext = (rules: string | undefined, summary: Summary, cli: string): string => {
  const state = block(summary.render(summary.rows, 400))
  const full = [rules, state].filter((part) => part !== undefined).join("\n\n")
  if (full.length <= CAP) return full
  const tail = `\n\n${pointer(cli)}`
  const room = CAP - tail.length - `\n\n${state}`.length - RULES_CUT.length
  if (rules !== undefined && room > 0)
    return `${cutRules(rules, room)}${RULES_CUT}\n\n${state}${tail}`
  // The rules are dropped whole. Say so, so the root knows to read its agent prompt.
  const marker = rules === undefined ? "" : `${RULES_DROPPED}\n\n`
  return `${marker}${fitSummary(summary, CAP - tail.length - marker.length)}${tail}`.trimStart()
}

/** Composes the SessionStart context for a state: rules, summary and, if cut, the pointer. */
export const composeForState = (
  rules: string | undefined,
  state: State,
  cli = "holyclaude",
): string => composeContext(rules, summaryOf(state), cli)

/**
 * Pulls the text between the core-rules markers out of the root agent file. Claude Code substitutes
 * `${CLAUDE_PLUGIN_ROOT}` only in the agent prompt it loads, so a given `root` is substituted
 * here.
 */
export const extractRules = (agentFile: string, root?: string): string | undefined => {
  const start = agentFile.indexOf(RULES_START)
  const end = agentFile.indexOf(RULES_END)
  if (start === -1 || end === -1 || end < start) return undefined
  const rules = agentFile.slice(start + RULES_START.length, end).trim()
  return root === undefined ? rules : rules.replaceAll(PLUGIN_ROOT_VAR, () => root)
}

/**
 * The SessionStart hook: the core rules from the root agent file plus a TOON summary of the
 * authoritative state, as `additionalContext` within the 10,000 character cap. When the payload
 * shows the main thread already runs as the holyclaude agent, the rules are left out, since its
 * system prompt carries them; any other payload, or one that cannot be read, gets them, because
 * then this is the root's only copy. Emits nothing when the agent file is absent.
 */
export const sessionStart = (stdin: string) =>
  Effect.gen(function* () {
    const root = yield* pluginRoot
    if (root === undefined) return ""
    const file = Bun.file(join(root, "agents", "holyclaude.md"))
    if (!(yield* Effect.tryPromise(() => file.exists()))) return ""
    const input = yield* decodeHookInput(stdin).pipe(Effect.orElseSucceed(() => undefined))
    const runsAsMainAgent = MAIN_AGENT_TYPES.includes(input?.agent_type ?? "")
    const rules = runsAsMainAgent
      ? undefined
      : extractRules(yield* Effect.tryPromise(() => file.text()), root)
    const summary = yield* loadState(stateDirPath()).pipe(
      Effect.map(summaryOf),
      Effect.catch((error) => Effect.succeed(brokenSummary(error.message))),
    )
    const additionalContext = composeContext(rules, summary, `"${root}/scripts/holyclaude"`)
    return JSON.stringify({
      hookSpecificOutput: { hookEventName: "SessionStart", additionalContext },
    })
  })
