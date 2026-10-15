import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { Effect } from "effect"

import { readObservations, seenOf } from "../observations.ts"
import { postToolUse } from "./post-tool-use.ts"

let directory = ""
const previous = process.env["HOLYCLAUDE_STATE_DIR"]

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "holyclaude-post-tool-use-"))
  process.env["HOLYCLAUDE_STATE_DIR"] = directory
})

afterEach(() => {
  if (previous === undefined) delete process.env["HOLYCLAUDE_STATE_DIR"]
  else process.env["HOLYCLAUDE_STATE_DIR"] = previous
  rmSync(directory, { recursive: true, force: true })
})

const records = () => Effect.runPromise(readObservations(directory))
const run = (payload: object | string) =>
  Effect.runPromise(postToolUse(typeof payload === "string" ? payload : JSON.stringify(payload)))

const TYPE = "holyclaude:worker-implementation"

/** An Agent call's payload as Claude Code documents it, with fields the hook does not read. */
const payload = (response: object, input: object = {}) => ({
  session_id: "s1",
  transcript_path: "/parent/s1.jsonl",
  cwd: "/project",
  hook_event_name: "PostToolUse",
  tool_name: "Agent",
  tool_use_id: "toolu_1",
  tool_input: {
    description: "implement",
    prompt: "do it",
    subagent_type: TYPE,
    model: "sonnet",
    ...input,
  },
  tool_response: response,
})

const BACKGROUND = {
  status: "async_launched",
  agentId: "agent-7",
  description: "implement",
  prompt: "do it",
  outputFile: "/tmp/out.txt",
  resolvedModel: "claude-sonnet-5-5",
}

const FOREGROUND = {
  status: "completed",
  agentId: "agent-7",
  content: [{ type: "text", text: "done" }],
  resolvedModel: "claude-sonnet-5-5",
  modelsUsed: ["claude-sonnet-5-5"],
  totalTokens: 1200,
  totalDurationMs: 9000,
  totalToolUseCount: 4,
  usage: { input_tokens: 10, output_tokens: 20 },
}

describe("the model a specialist started on", () => {
  for (const [name, response] of [
    ["a background launch", BACKGROUND],
    ["a foreground completion", FOREGROUND],
  ] as const)
    test(`${name} records resolvedModel for the launched agent, and prints nothing`, async () => {
      expect(await run(payload(response))).toBe("")
      expect(seenOf(await records(), "agent-7")).toEqual({
        agent_type: TYPE,
        model: "claude-sonnet-5-5",
      })
    })

  test("a call made inside a subagent records the launched agent, not the caller", async () => {
    await run({ ...payload(FOREGROUND), agent_id: "caller-1", agent_type: "general-purpose" })
    const written = await records()
    expect(seenOf(written, "agent-7").model).toBe("claude-sonnet-5-5")
    expect(seenOf(written, "caller-1")).toEqual({})
  })

  test("the same sighting twice is written once", async () => {
    await run(payload(BACKGROUND))
    await run(payload(FOREGROUND))
    expect(await records()).toHaveLength(1)
  })
})

describe("launches that are not a holyclaude specialist's", () => {
  const others = [
    ["no subagent type", {}, { subagent_type: undefined }],
    ["an empty subagent type", {}, { subagent_type: "" }],
    ["a built-in type", {}, { subagent_type: "general-purpose" }],
    ["another plugin's type", {}, { subagent_type: "other:worker-implementation" }],
    ["the plugin name without the separator", {}, { subagent_type: "holyclaude" }],
    ["a name that only begins like it", {}, { subagent_type: "holyclaude-x" }],
    ["a non-string type", {}, { subagent_type: 7 }],
    ["no agent id", { agentId: undefined }, {}],
    ["no resolved model", { resolvedModel: undefined }, {}],
    ["an empty resolved model", { resolvedModel: "" }, {}],
    ["a non-string resolved model", { resolvedModel: { id: "x" } }, {}],
  ] as const

  for (const [name, response, input] of others)
    test(`${name}: nothing is written, not even the state directory`, async () => {
      expect(await run(payload({ ...FOREGROUND, ...response }, input))).toBe("")
      expect(existsSync(join(directory, "local"))).toBe(false)
      expect(existsSync(join(directory, ".gitignore"))).toBe(false)
      expect(await records()).toEqual([])
    })

  test("a payload that is not JSON, or has no tool response, is ignored", async () => {
    for (const text of ["", "{", "[]", JSON.stringify({ tool_input: { subagent_type: TYPE } })])
      expect(await run(text)).toBe("")
    expect(await records()).toEqual([])
  })
})
