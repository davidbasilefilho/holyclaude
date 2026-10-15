import { describe, expect, test } from "bun:test"

import { Effect } from "effect"

import { agentType } from "../fingerprint.ts"
import { preToolUse } from "./pre-tool-use.ts"

/** An Agent call as PreToolUse receives it; `extra` adds payload fields such as who made it. */
const agentCall = (toolInput: object, extra: object = {}) =>
  JSON.stringify({ tool_name: "Agent", tool_input: toolInput, ...extra })

/** The reason the hook gives for a deny, or undefined when it allows. */
const reasonOf = async (stdin: string): Promise<string | undefined> => {
  const out = await Effect.runPromise(preToolUse(stdin))
  if (out === "") return undefined
  const { hookSpecificOutput } = JSON.parse(out)
  expect(hookSpecificOutput.hookEventName).toBe("PreToolUse")
  expect(hookSpecificOutput.permissionDecision).toBe("deny")
  return hookSpecificOutput.permissionDecisionReason
}

const ROOT = { agent_type: "holyclaude:holyclaude" }

describe("a holyclaude root's Agent call", () => {
  test.each(["fork", "general-purpose", "Explore", "Plan", "claude", "other:worker", "holyclaude"])(
    "to %s is denied, with the way to the right type",
    async (subagent_type) => {
      const reason = await reasonOf(agentCall({ subagent_type, prompt: "go" }, ROOT))
      expect(reason).toContain("only holyclaude specialists")
      expect(reason).toContain("select")
      expect(reason).toContain("reserve")
    },
  )

  test.each([
    ["no subagent_type", { prompt: "go" }],
    ["an empty subagent_type", { subagent_type: "", prompt: "go" }],
    ["a non-string subagent_type", { subagent_type: 7, prompt: "go" }],
    ["no tool input", undefined],
  ])("with %s is denied", async (_name, toolInput) => {
    expect(await reasonOf(agentCall(toolInput ?? {}, ROOT))).toBeDefined()
  })

  test("to a holyclaude specialist is allowed", async () => {
    const subagent_type = agentType("Worker.implementation")
    expect(subagent_type).toBe("holyclaude:worker-implementation")
    expect(await reasonOf(agentCall({ subagent_type, prompt: "go" }, ROOT))).toBeUndefined()
  })

  test("is judged under the bare root name too", async () => {
    const bare = { agent_type: "holyclaude" }
    expect(await reasonOf(agentCall({ subagent_type: "fork" }, bare))).toBeDefined()
    expect(
      await reasonOf(agentCall({ subagent_type: "holyclaude:reviewer-code" }, bare)),
    ).toBeUndefined()
  })
})

describe("an Agent call that is not a holyclaude root's", () => {
  test.each([
    ["no root agent", {}],
    ["another root agent", { agent_type: "general-purpose" }],
    ["a root named like holyclaude", { agent_type: "other:holyclaude" }],
    ["a subagent as the caller", { ...ROOT, agent_id: "agent-1" }],
  ])("is untouched with %s", async (_name, extra) => {
    for (const subagent_type of ["fork", "general-purpose", undefined])
      expect(await reasonOf(agentCall({ subagent_type }, extra))).toBeUndefined()
  })

  test("by a holyclaude root with another tool is untouched", async () => {
    const call = JSON.stringify({ tool_name: "Read", tool_input: {}, ...ROOT })
    expect(await reasonOf(call)).toBeUndefined()
  })
})
