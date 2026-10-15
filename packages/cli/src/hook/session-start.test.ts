import { afterEach, describe, expect, test } from "bun:test"
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, truncateSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import type { Assignment, State } from "@holyclaude/core"
import { Effect } from "effect"

import {
  clip,
  composeForState,
  extractRules,
  MAX_STATE_FILE_BYTES,
  sessionStart,
} from "./session-start.ts"

const running = (index: number): Assignment => ({
  id: `assignment-${String(index).padStart(4, "0")}`,
  intent_id: "intent-1",
  intent_revision: 1,
  role: "Worker.implementation",
  objective: `Implement part ${index} of the change`,
  scope: [],
  constraints: [],
  acceptance_criteria: ["a"],
  required_evidence: ["e"],
  mutability: "ScopedWrite",
  metadata: {
    ownership_paths: [`src/part-${index}.ts`],
    symbols: [],
    domains: [],
    dependencies: [],
    related_assignments: [],
    independent_from: [],
  },
  state: "Running",
  agent_id: `agent-${index}`,
  result: null,
  acceptance: null,
})

const stateWith = (count: number): State => ({
  version: 1,
  intents: [{ id: "intent-1", objective: "o", requirements: "r", revision: 1 }],
  assignments: Array.from({ length: count }, (_, index) => running(index + 1)),
  workers: [],
})

const RULES = Array.from({ length: 60 }, (_, line) => `Rule ${line}: ${"x".repeat(18)}`).join("\n")

describe("clip", () => {
  test("keeps short text and ends cut text in an ellipsis", () => {
    expect(clip("abc", 3)).toBe("abc")
    expect(clip("abcdef", 4)).toBe("abc…")
    expect(clip("abcdef", 1)).toBe("…")
  })

  test("a limit of zero leaves nothing, not the text", () => {
    expect(clip("abcdef", 0)).toBe("")
    expect(clip("", 0)).toBe("")
  })
})

describe("truncation of the core rules", () => {
  test("rules that fit are kept whole, with no marker", () => {
    const context = composeForState(RULES, stateWith(3))
    expect(context).toContain(RULES)
    expect(context).not.toContain("core rules")
  })

  test("rules that must be trimmed leave a marker pointing at the root agent prompt", () => {
    const long = Array.from({ length: 400 }, (_, line) => `Rule ${line}: ${"x".repeat(30)}`).join(
      "\n",
    )
    const context = composeForState(long, stateWith(5))
    expect(context.length).toBeLessThanOrEqual(10_000)
    expect(context).toContain("[core rules cut to fit; full text in agents/holyclaude.md]")
  })

  test("a state too large for the cap shrinks beside the whole rules, with the pointer", () => {
    const context = composeForState(RULES, stateWith(150))
    expect(context.length).toBeLessThanOrEqual(10_000)
    expect(context).toContain(RULES)
    expect(context).not.toContain("core rules")
    expect(context).toContain("more_assignments")
    expect(context).toContain("holyclaude intent show")
  })

  test("without rules there is nothing to mark", () => {
    const context = composeForState(undefined, stateWith(150))
    expect(context).not.toContain("core rules")
  })
})

describe("the shipped core rules", () => {
  const agentFile = Bun.file(new URL("../../../../plugin/agents/holyclaude.md", import.meta.url))

  test("are injected whole, within the cap, beside a state summary", async () => {
    const rules = extractRules(await agentFile.text())
    expect(rules).toBeDefined()
    const context = composeForState(rules, stateWith(1))
    expect(context.length).toBeLessThanOrEqual(10_000)
    expect(context).toContain(rules ?? "")
  })

  test("keep AskUserQuestion for information and send material choices to grill-me", async () => {
    const rules = extractRules(await agentFile.text()) ?? ""
    expect(rules).toContain("Use AskUserQuestion when missing information or authorization")
    expect(rules).toContain(
      "When a material choice cannot be settled from the repository, the documentation or the user's own words, load the `grill-me` skill",
    )
  })
})

describe("the shipped core rules beside a large state", () => {
  const agentFile = Bun.file(new URL("../../../../plugin/agents/holyclaude.md", import.meta.url))

  /** An Intent with long requirements and several open Assignments with long objectives. */
  const largeState = (): State => ({
    ...stateWith(12),
    intents: [
      {
        id: "intent-1",
        objective: "Ship the reworked release flow across every package. ".repeat(20),
        requirements: "The release flow keeps each package on one shared version. ".repeat(60),
        revision: 3,
      },
    ],
    assignments: Array.from({ length: 12 }, (_, index) => ({
      ...running(index + 1),
      objective: `Implement part ${index + 1} of the release flow and its tests. `.repeat(5),
    })),
  })

  test("keep their last sentence, and the whole text, while the state shrinks", async () => {
    const rules = extractRules(await agentFile.text()) ?? ""
    const lastSentence =
      rules
        .trimEnd()
        .split(/(?<=[.!?])\s+/)
        .at(-1) ?? ""
    expect(lastSentence.length).toBeGreaterThan(20)
    const state = largeState()
    // The premise: whole rules and the full summary together would not fit the cap.
    expect(`${rules}\n\n${composeForState(undefined, state)}`.length).toBeGreaterThan(10_000)
    const context = composeForState(rules, state)
    expect(context.length).toBeLessThanOrEqual(10_000)
    expect(context).toContain(rules)
    expect(context).toContain(lastSentence)
    expect(context).not.toContain("core rules cut")
    expect(context).toContain("assignment-0001")
  })

  test("are cut, from their end, only when they cannot fit even beside the pointer", () => {
    const huge = Array.from({ length: 600 }, (_, line) => `Rule ${line}: ${"x".repeat(30)}`).join(
      "\n",
    )
    const context = composeForState(huge, largeState())
    expect(context.length).toBeLessThanOrEqual(10_000)
    expect(context).toContain("Rule 0:")
    expect(context).not.toContain("Rule 599:")
    expect(context).toContain("[core rules cut to fit; full text in agents/holyclaude.md]")
    expect(context).toContain("holyclaude intent show")
  })
})

describe("the Intent in the summary", () => {
  test("is the latest by id order, so a generated id beats legacy intent-1000", () => {
    const intent = (id: string) => ({
      id,
      objective: `objective of ${id}`,
      requirements: "",
      revision: 1,
    })
    const state: State = {
      ...stateWith(0),
      intents: [intent("intent-0mg8k2x1a-7f3q"), intent("intent-1000"), intent("intent-0999")],
    }
    const context = composeForState(undefined, state)
    expect(context).toContain("objective of intent-0mg8k2x1a-7f3q")
    expect(context).not.toContain("objective of intent-1000")
  })
})

describe("text that fits the budget", () => {
  const long = (label: string) =>
    Array.from({ length: 80 }, (_, word) => `${label}${word}`).join(" ")

  test("an Assignment objective, and the Intent text, are shown whole", () => {
    const state: State = {
      ...stateWith(1),
      intents: [
        { id: "intent-1", objective: long("goal"), requirements: long("need"), revision: 1 },
      ],
      assignments: [{ ...running(1), objective: long("task") }],
    }
    const context = composeForState(undefined, state)
    for (const text of [long("goal"), long("need"), long("task")]) expect(context).toContain(text)
  })

  test("long objectives beside long rules are shortened and their rows kept", () => {
    const rules = "r".repeat(8000)
    const state: State = {
      ...stateWith(3),
      assignments: [1, 2, 3].map((index) => ({
        ...running(index),
        objective: "word ".repeat(600),
      })),
    }
    const context = composeForState(rules, state)
    expect(context.length).toBeLessThanOrEqual(10_000)
    expect(context).toContain(rules)
    for (const index of [1, 2, 3]) {
      expect(context).toContain(`assignment-000${index}`)
      expect(context).toContain(`agent-${index}`)
    }
    expect(context).toContain("…")
    expect(context).not.toContain("word ".repeat(600))
  })

  test("shrinks only to fit the budget, and then by Intent text before rows", () => {
    const state: State = {
      ...stateWith(3),
      intents: [{ id: "intent-1", objective: "o", requirements: "r".repeat(12_000), revision: 1 }],
    }
    const context = composeForState(undefined, state)
    expect(context.length).toBeLessThanOrEqual(10_000)
    expect(context).toContain("assignment-0003")
    expect(context).not.toContain("r".repeat(12_000))
  })
})

describe("the plugin root in injected text", () => {
  const AGENT = new URL("../../../../plugin/agents/holyclaude.md", import.meta.url)
  const saved = {
    root: process.env["CLAUDE_PLUGIN_ROOT"],
    state: process.env["HOLYCLAUDE_STATE_DIR"],
  }
  let base = ""

  afterEach(() => {
    for (const [key, value] of [
      ["CLAUDE_PLUGIN_ROOT", saved.root],
      ["HOLYCLAUDE_STATE_DIR", saved.state],
    ] as const)
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    if (base !== "") rmSync(base, { recursive: true, force: true })
  })

  test("extractRules substitutes a given root and leaves the text alone without one", () => {
    const file =
      '<!-- holyclaude:core-rules:start -->\nrun `"${CLAUDE_PLUGIN_ROOT}/scripts/holyclaude" routes`\n<!-- holyclaude:core-rules:end -->'
    expect(extractRules(file, "/opt/hc")).toBe('run `"/opt/hc/scripts/holyclaude" routes`')
    expect(extractRules(file)).toBe('run `"${CLAUDE_PLUGIN_ROOT}/scripts/holyclaude" routes`')
  })

  test("extractRules inserts a root with replacement patterns literally", () => {
    const file =
      '<!-- holyclaude:core-rules:start -->\nrun `"${CLAUDE_PLUGIN_ROOT}/scripts/holyclaude"`\n<!-- holyclaude:core-rules:end -->'
    expect(extractRules(file, "/home/u/a$&b$'c")).toBe(
      'run `"/home/u/a$&b$\'c/scripts/holyclaude"`',
    )
  })

  test("the pointer names the CLI as given", () => {
    const context = composeForState(RULES, stateWith(150), '"/opt/hc/scripts/holyclaude"')
    expect(context).toContain(
      'Full state: "/opt/hc/scripts/holyclaude" intent show; "/opt/hc/scripts/holyclaude" assignment list',
    )
  })

  test("the SessionStart hook injects the shipped rules with the real plugin root", async () => {
    base = mkdtempSync(join(tmpdir(), "holyclaude-session-start-"))
    const root = join(base, "plugin")
    mkdirSync(join(root, "agents"), { recursive: true })
    copyFileSync(AGENT, join(root, "agents", "holyclaude.md"))
    process.env["CLAUDE_PLUGIN_ROOT"] = root
    process.env["HOLYCLAUDE_STATE_DIR"] = join(base, ".holyclaude")
    const output = JSON.parse(await Effect.runPromise(sessionStart("")))
    const context: string = output.hookSpecificOutput.additionalContext
    expect(context).not.toContain("${CLAUDE_PLUGIN_ROOT}")
    expect(context).toContain(`"${root}/scripts/holyclaude"`)
  })

  test("a state error is shown whole", async () => {
    base = mkdtempSync(join(tmpdir(), "holyclaude-session-start-"))
    const root = join(base, "plugin")
    mkdirSync(join(root, "agents"), { recursive: true })
    copyFileSync(AGENT, join(root, "agents", "holyclaude.md"))
    // A long path makes the error message longer than any fixed clip.
    const state = join(base, "d".repeat(200), ".holyclaude")
    const record = join(state, "intents", "intent-1", "intent.json")
    mkdirSync(join(state, "intents", "intent-1"), { recursive: true })
    writeFileSync(record, "{ not json")
    process.env["CLAUDE_PLUGIN_ROOT"] = root
    process.env["HOLYCLAUDE_STATE_DIR"] = state
    const output = JSON.parse(
      await Effect.runPromise(sessionStart(JSON.stringify({ agent_type: "holyclaude" }))),
    )
    const context: string = output.hookSpecificOutput.additionalContext
    expect(context).toContain(`${record} is not a valid`)
    expect(context).not.toContain("…")
  })

  test("a state file over the read bound gives the rules and a state error, not the state", async () => {
    base = mkdtempSync(join(tmpdir(), "holyclaude-session-start-"))
    const root = join(base, "plugin")
    mkdirSync(join(root, "agents"), { recursive: true })
    copyFileSync(AGENT, join(root, "agents", "holyclaude.md"))
    const state = join(base, ".holyclaude")
    const record = join(state, "intents", "intent-1", "intent.json")
    mkdirSync(join(state, "intents", "intent-1"), { recursive: true })
    writeFileSync(record, "")
    // A sparse file: its size is past the bound, and no content is written.
    truncateSync(record, MAX_STATE_FILE_BYTES + 1)
    process.env["CLAUDE_PLUGIN_ROOT"] = root
    process.env["HOLYCLAUDE_STATE_DIR"] = state
    const output = JSON.parse(await Effect.runPromise(sessionStart("")))
    const context: string = output.hookSpecificOutput.additionalContext
    expect(context).toContain(extractRules(await Bun.file(AGENT).text(), root) ?? "")
    expect(context).toContain("state_error")
    expect(context).toContain(`the limit is ${MAX_STATE_FILE_BYTES}`)
  })

  test("a state load that outlasts its time bound gives the rules and a state error", async () => {
    base = mkdtempSync(join(tmpdir(), "holyclaude-session-start-"))
    const root = join(base, "plugin")
    mkdirSync(join(root, "agents"), { recursive: true })
    copyFileSync(AGENT, join(root, "agents", "holyclaude.md"))
    process.env["CLAUDE_PLUGIN_ROOT"] = root
    process.env["HOLYCLAUDE_STATE_DIR"] = join(base, ".holyclaude")
    const never = () => Effect.never
    const output = JSON.parse(
      await Effect.runPromise(sessionStart("", { load: never, budget: "50 millis" })),
    )
    const context: string = output.hookSpecificOutput.additionalContext
    expect(context).toContain(extractRules(await Bun.file(AGENT).text(), root) ?? "")
    expect(context).toContain("state_error")
  })

  describe("by the agent the main thread runs as", () => {
    const start = async (payload: object | string) => {
      if (base !== "") rmSync(base, { recursive: true, force: true })
      base = mkdtempSync(join(tmpdir(), "holyclaude-session-start-"))
      const root = join(base, "plugin")
      mkdirSync(join(root, "agents"), { recursive: true })
      copyFileSync(AGENT, join(root, "agents", "holyclaude.md"))
      process.env["CLAUDE_PLUGIN_ROOT"] = root
      process.env["HOLYCLAUDE_STATE_DIR"] = join(base, ".holyclaude")
      const stdin = typeof payload === "string" ? payload : JSON.stringify(payload)
      const output = JSON.parse(await Effect.runPromise(sessionStart(stdin)))
      // The rules as injected, with the plugin root substituted, are what a context must or must not hold.
      const rules = extractRules(await Bun.file(AGENT).text(), root) ?? ""
      return { context: output.hookSpecificOutput.additionalContext as string, rules }
    }

    test("the holyclaude agent, qualified or bare, gets the state summary without the rules", async () => {
      for (const agent_type of ["holyclaude:holyclaude", "holyclaude"]) {
        const { context, rules } = await start({ hook_event_name: "SessionStart", agent_type })
        expect(rules.length).toBeGreaterThan(1000)
        expect(context).toStartWith("State:")
        expect(context).not.toContain(rules.slice(0, 200))
      }
    })

    test("any other session, or an unreadable payload, gets the rules and the summary", async () => {
      const others: Array<object | string> = [
        {},
        { agent_type: "" },
        { agent_type: "general-purpose" },
        { agent_type: "other:holyclaude" },
        { agent_type: "holyclaude-x" },
        { agent_type: "holyclaude:Worker.x" },
        { agent_type: "holyclaude:holyclaude-x" },
        "",
        "{",
      ]
      for (const payload of others) {
        const { context, rules } = await start(payload)
        expect(context).toContain(rules)
        expect(context).toContain("State:")
      }
    })
  })
})
