import { join } from "node:path"

import {
  intentInUse,
  isOpenAssignment,
  loadState,
  openIntents,
  readActiveIntent,
  sortedById,
  stateDirPath,
  type Assignment,
  type State,
} from "@holyclaude/core"
import { Effect, Option, type Duration } from "effect"

import { pluginRoot, ROOT_AGENT_TYPES } from "../fingerprint.ts"
import { toon } from "../toon.ts"
import { decodeHookInput } from "./input.ts"

/** SessionStart `additionalContext` is capped at this many characters. */
const CAP = 10_000
const RULES_START = "<!-- holyclaude:core-rules:start -->"
const RULES_END = "<!-- holyclaude:core-rules:end -->"
const PLUGIN_ROOT_VAR = "${CLAUDE_PLUGIN_ROOT}"
/** The one-line pointer to the CLI, which `cli` names as the root should run it. */
const pointer = (cli: string) => `Full state: ${cli} intent list; ${cli} assignment list --all`
const RULES_CUT = "\n[core rules cut to fit; full text in agents/holyclaude.md]"

/** The text limit of a summary that is shown whole. */
const WHOLE = Number.POSITIVE_INFINITY

/** The text limits a tight summary tries in turn, each keeping the text that fits under it. */
const TEXT_LIMITS = [WHOLE, 2000, 400, 120, 0]

/**
 * Rows are dropped only once the text limit is down to this, so a row's objective is shortened
 * before the row, and its id and agent id, is lost.
 */
const ROWS_DROP_AT = 120

/**
 * Most of one state file that SessionStart reads, in bytes. The state belongs to the project, but a
 * repository can commit files into it, and this hook runs at every start: a file over it fails the
 * load, and the context carries the rules and a state error instead of the state.
 */
export const MAX_STATE_FILE_BYTES = 64 * 1024 * 1024

/**
 * How long SessionStart waits for the state before it gives up. The hook's own timeout is 30
 * seconds, and running past it would drop the injected rules, so a slow load degrades to the rules
 * and a state error, as an oversized file does.
 */
export const STATE_LOAD_BUDGET: Duration.Input = "10 seconds"

/** What {@link sessionStart} can be told: the state load, and how long to wait for it. */
export interface SessionStartOptions {
  readonly load?: typeof loadState
  readonly budget?: Duration.Input
}

/** Shortens text to at most `max` characters, ending in an ellipsis when it was cut. */
export const clip = (text: string, max: number) =>
  max <= 0 ? "" : text.length <= max ? text : `${text.slice(0, max - 1)}…`

const cutRules = (rules: string, room: number) => {
  const cut = rules.slice(0, room)
  const newline = cut.lastIndexOf("\n")
  return newline > 0 ? cut.slice(0, newline) : cut
}

const row = (assignment: Assignment, textLimit: number) => ({
  id: assignment.id,
  role: assignment.role,
  state: assignment.state,
  agent_id: assignment.agent_id,
  rev: assignment.intent_revision,
  objective: clip(assignment.objective.replace(/\s+/g, " "), textLimit),
})

/** Ready, Running and Succeeded-but-unaccepted Assignments, the ones that need the root's attention. */
const open = (state: State) => sortedById(state.assignments).filter(isOpenAssignment)

/** A state summary that is whole until the budget asks for fewer rows and shorter text. */
interface Summary {
  readonly rows: number
  readonly render: (rows: number, textLimit: number) => string
}

/**
 * The summary of a state: every open Intent with its open Assignments counted, the requirements of
 * the one in use (the clone's stored choice while it is open, else the only open Intent), and the
 * Assignments that need attention.
 */
const summaryOf = (state: State, chosen: string | undefined): Summary => {
  const rows = open(state)
  const intents = openIntents(state)
  const inUse = intentInUse(state, chosen)
  const openCounts = Map.groupBy(rows, (assignment) => assignment.intent_id)
  return {
    rows: rows.length,
    render: (limit, textLimit) =>
      toon({
        intents: intents.map((intent) => ({
          id: intent.id,
          revision: intent.revision,
          objective: clip(intent.objective, textLimit),
          open_assignments: openCounts.get(intent.id)?.length ?? 0,
        })),
        in_use:
          inUse === undefined
            ? null
            : { id: inUse.id, requirements: clip(inUse.requirements, textLimit) },
        assignments: rows.slice(0, limit).map((assignment) => row(assignment, textLimit)),
        ...(rows.length > limit ? { more_assignments: rows.length - limit } : {}),
      }).trimEnd(),
  }
}

const brokenSummary = (message: string): Summary => ({
  rows: 0,
  render: (_rows, textLimit) => toon({ state_error: clip(message, textLimit) }).trimEnd(),
})

const block = (text: string) => `State:\n${text}`

/**
 * Shrinks the state summary: the text of the Intent and the rows first, step by step, keeping every
 * row; fewer rows only once the text is down to {@link ROWS_DROP_AT}; then nothing.
 */
const fitSummary = (summary: Summary, budget: number): string => {
  for (const textLimit of TEXT_LIMITS) {
    let rows = summary.rows
    for (;;) {
      const text = summary.render(rows, textLimit)
      if (block(text).length <= budget) return block(text)
      if (rows === 0 || textLimit > ROWS_DROP_AT) break
      rows = Math.min(rows - 1, Math.floor(rows * 0.8))
    }
  }
  return ""
}

/**
 * Joins the pieces under the cap. The core rules stay whole: the state summary shrinks first (fewer
 * rows, shorter text, then nothing but the one-line pointer to the CLI). The rules are cut, from
 * their end, only when they cannot fit even beside the pointer.
 */
const composeContext = (rules: string | undefined, summary: Summary, cli: string): string => {
  const state = block(summary.render(summary.rows, WHOLE))
  const full = [rules, state].filter((part) => part !== undefined).join("\n\n")
  if (full.length <= CAP) return full
  const tail = `\n\n${pointer(cli)}`
  if (rules !== undefined && rules.length + tail.length > CAP)
    return `${cutRules(rules, CAP - tail.length - RULES_CUT.length)}${RULES_CUT}${tail}`
  const roomForState = CAP - tail.length - (rules === undefined ? 0 : rules.length + 2)
  const body = [rules, fitSummary(summary, roomForState)].filter((part) => part)
  return `${body.join("\n\n")}${tail}`.trimStart()
}

/**
 * Composes the SessionStart context for a state: rules, summary and, if cut, the pointer. `chosen`
 * is the id this clone stored with `intent use`.
 */
export const composeForState = (
  rules: string | undefined,
  state: State,
  cli = "holyclaude",
  chosen?: string,
): string => composeContext(rules, summaryOf(state, chosen), cli)

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
export const sessionStart = (
  stdin: string,
  { load = loadState, budget = STATE_LOAD_BUDGET }: SessionStartOptions = {},
) =>
  Effect.gen(function* () {
    const root = yield* pluginRoot
    if (root === undefined) return ""
    const file = Bun.file(join(root, "agents", "holyclaude.md"))
    if (!(yield* Effect.tryPromise(() => file.exists()))) return ""
    const input = yield* decodeHookInput(stdin).pipe(Effect.orElseSucceed(() => undefined))
    const runsAsMainAgent = ROOT_AGENT_TYPES.includes(input?.agent_type ?? "")
    const rules = runsAsMainAgent
      ? undefined
      : extractRules(yield* Effect.tryPromise(() => file.text()), root)
    const summary = yield* load(stateDirPath(), MAX_STATE_FILE_BYTES).pipe(
      Effect.flatMap((state) =>
        // An unreadable choice leaves nothing in use; it never hides the state.
        readActiveIntent(stateDirPath(), MAX_STATE_FILE_BYTES).pipe(
          Effect.orElseSucceed(() => undefined),
          Effect.map((id) => summaryOf(state, id)),
        ),
      ),
      Effect.timeoutOption(budget),
      Effect.map(
        Option.getOrElse(() =>
          brokenSummary("the state did not load within the time the hook allows it"),
        ),
      ),
      Effect.catch((error) => Effect.succeed(brokenSummary(error.message))),
    )
    const additionalContext = composeContext(rules, summary, `"${root}/scripts/holyclaude"`)
    return JSON.stringify({
      hookSpecificOutput: { hookEventName: "SessionStart", additionalContext },
    })
  })
