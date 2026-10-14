import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { Effect } from "effect"

import { observationsPath, readObservations } from "../observations.ts"
import { subagentStart, subagentStop } from "./subagent.ts"

let directory = ""
let stateFile = ""
const previous = process.env["HOLYCLAUDE_STATE_FILE"]

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "holyclaude-subagent-"))
  stateFile = join(directory, "state.json")
  process.env["HOLYCLAUDE_STATE_FILE"] = stateFile
})

afterEach(() => {
  if (previous === undefined) delete process.env["HOLYCLAUDE_STATE_FILE"]
  else process.env["HOLYCLAUDE_STATE_FILE"] = previous
  rmSync(directory, { recursive: true, force: true })
})

const records = () => Effect.runPromise(readObservations(observationsPath(stateFile)))

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
    await Effect.runPromise(subagentStop(JSON.stringify({ agent_id: "agent-1", effort: "high" })))
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

  test("an unwritable observations file does not make the hook fail", async () => {
    await Bun.write(observationsPath(stateFile) + "/blocker", "")
    expect(await Effect.runPromise(subagentStop(STOP))).toBe("")
  })
})
