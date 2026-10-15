import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { Effect } from "effect"

import { observationsPath, readObservations, seenOf } from "../observations.ts"
import { subagentStart, subagentStop } from "./subagent.ts"

let directory = ""
const previous = process.env["HOLYCLAUDE_STATE_DIR"]

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "holyclaude-subagent-"))
  process.env["HOLYCLAUDE_STATE_DIR"] = directory
})

afterEach(() => {
  if (previous === undefined) delete process.env["HOLYCLAUDE_STATE_DIR"]
  else process.env["HOLYCLAUDE_STATE_DIR"] = previous
  rmSync(directory, { recursive: true, force: true })
})

const records = () => Effect.runPromise(readObservations(directory))

const START = JSON.stringify({
  session_id: "s1",
  transcript_path: "/parent/s1.jsonl",
  cwd: "/project",
  hook_event_name: "SubagentStart",
  agent_id: "agent-1",
  agent_type: "holyclaude:Reviewer.audit",
})

const STOP = JSON.stringify({
  session_id: "s1",
  transcript_path: "/parent/s1.jsonl",
  cwd: "/project",
  hook_event_name: "SubagentStop",
  agent_id: "agent-1",
  agent_type: "holyclaude:Reviewer.audit",
  effort: { level: "medium" },
  agent_transcript_path: "/parent/s1/subagents/agent-agent-1.jsonl",
  last_assistant_message: "done",
})

/** The payloads of agents that are not holyclaude specialists, each with a different agent type. */
const OTHERS = [
  ["no agent type", {}],
  ["an empty agent type", { agent_type: "" }],
  ["a built-in agent type", { agent_type: "general-purpose" }],
  ["another plugin's agent type", { agent_type: "other:Reviewer.audit" }],
  ["the holyclaude prefix without the separator", { agent_type: "holyclaude" }],
] as const

describe("agents that are not holyclaude specialists", () => {
  for (const [name, fields] of OTHERS) {
    test(`${name}: both hooks write nothing, not even the state directory`, async () => {
      const payload = JSON.stringify({
        agent_id: "agent-9",
        effort: "high",
        agent_transcript_path: "/t/agent-9.jsonl",
        ...fields,
      })
      expect(await Effect.runPromise(subagentStart(payload))).toBe("")
      expect(await Effect.runPromise(subagentStop(payload))).toBe("")
      expect(existsSync(join(directory, "local"))).toBe(false)
      expect(existsSync(join(directory, ".gitignore"))).toBe(false)
      expect(await records()).toEqual([])
    })
  }
})

describe("hook subagent-start", () => {
  test("records the agent type and prints nothing", async () => {
    expect(await Effect.runPromise(subagentStart(START))).toBe("")
    expect(await records()).toMatchObject([
      { kind: "observed", agent_id: "agent-1", agent_type: "holyclaude:Reviewer.audit" },
    ])
  })

  test("records nothing it did not see: no effort and no parent transcript as the agent's", async () => {
    await Effect.runPromise(subagentStart(START))
    const [record] = await records()
    expect(record).not.toHaveProperty("effort")
    expect(record).not.toHaveProperty("transcript")
  })

  test("does not append the same sighting twice", async () => {
    await Effect.runPromise(subagentStart(START))
    await Effect.runPromise(subagentStart(START))
    expect(await records()).toHaveLength(1)
  })

  test("ignores a payload with no agent, text that is not JSON, and empty input", async () => {
    for (const stdin of [JSON.stringify({ agent_type: "x" }), "{", "", "[]"])
      expect(await Effect.runPromise(subagentStart(stdin))).toBe("")
    expect(await records()).toEqual([])
  })
})

describe("hook subagent-stop", () => {
  test("records the effort and the agent's own transcript path, and never blocks", async () => {
    expect(await Effect.runPromise(subagentStop(STOP))).toBe("")
    expect(await records()).toMatchObject([
      {
        kind: "observed",
        agent_id: "agent-1",
        effort: "medium",
        transcript: "/parent/s1/subagents/agent-agent-1.jsonl",
      },
    ])
  })

  test("reads an effort given as a plain string", async () => {
    await Effect.runPromise(
      subagentStop(
        JSON.stringify({
          agent_id: "agent-1",
          agent_type: "holyclaude:Reviewer.audit",
          effort: "high",
        }),
      ),
    )
    expect(await records()).toMatchObject([{ agent_id: "agent-1", effort: "high" }])
  })

  test("does not append the same sighting twice", async () => {
    await Effect.runPromise(subagentStop(STOP))
    await Effect.runPromise(subagentStop(STOP))
    expect(await records()).toHaveLength(1)
  })

  test("a stop with nothing to record, or one that cannot be read, still prints nothing", async () => {
    for (const stdin of [JSON.stringify({ agent_id: "agent-1" }), "{", "", "[]"])
      expect(await Effect.runPromise(subagentStop(stdin))).toBe("")
    expect(await records()).toEqual([])
  })

  test("a stop without an agent type still records for an agent whose start was recorded", async () => {
    await Effect.runPromise(subagentStart(START))
    const bare = { agent_id: "agent-1", effort: "high", agent_transcript_path: "/t/agent-1.jsonl" }
    await Effect.runPromise(subagentStop(JSON.stringify(bare)))
    const seen = seenOf(await records(), "agent-1")
    expect(seen).toEqual({
      agent_type: "holyclaude:Reviewer.audit",
      effort: "high",
      transcript: "/t/agent-1.jsonl",
    })
  })

  test("an unwritable observations file does not make the hook fail", async () => {
    await Bun.write(join(observationsPath(directory), "blocker"), "")
    expect(await Effect.runPromise(subagentStop(STOP))).toBe("")
  })
})
