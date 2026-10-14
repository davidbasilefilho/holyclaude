import { describe, expect, test } from "bun:test"
import type { Assignment, State } from "@holyclaude/core"
import { clip, composeForState } from "./session-start.ts"

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

  test("rules dropped whole leave a marker pointing at the root agent prompt", () => {
    const context = composeForState(RULES, stateWith(150))
    expect(context.length).toBeLessThanOrEqual(10_000)
    expect(context).not.toContain("Rule 0:")
    expect(context).toContain("[core rules dropped to fit; full text in agents/holyclaude.md]")
    expect(context).toContain("holyclaude intent show")
  })

  test("without rules there is nothing to mark", () => {
    const context = composeForState(undefined, stateWith(150))
    expect(context).not.toContain("core rules")
  })
})
