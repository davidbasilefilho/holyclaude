import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

import type { State } from "@holyclaude/core"
import { Effect } from "effect"

import { observationsPath, seenOf, type ObservationRecord } from "./observations.ts"
import { verifyAssignment } from "./verify.ts"

/** A read-only reviewer, the kind of agent that never calls a tool the guard judges. */
const state: State = {
  version: 1,
  intents: [{ id: "intent-1", objective: "o", requirements: "r", revision: 1 }],
  assignments: [
    {
      id: "assignment-0001",
      intent_id: "intent-1",
      intent_revision: 1,
      role: "Reviewer.audit",
      objective: "o",
      scope: [],
      constraints: [],
      acceptance_criteria: ["a"],
      required_evidence: ["e"],
      mutability: "ReadOnly",
      metadata: {
        ownership_paths: [],
        symbols: [],
        domains: [],
        dependencies: [],
        related_assignments: [],
        independent_from: [],
      },
      state: "Running",
      agent_id: "agent-1",
      result: null,
      acceptance: null,
    },
  ],
  workers: [],
}

let directory = ""
let transcript = ""
const previous = process.env["HOLYCLAUDE_STATE_DIR"]

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "holyclaude-verify-"))
  transcript = join(directory, "agent-agent-1.jsonl")
  // An earlier version's state file, which the store reads until a write migrates it.
  writeFileSync(join(directory, "state.json"), JSON.stringify(state))
  process.env["HOLYCLAUDE_STATE_DIR"] = directory
})

afterEach(() => {
  if (previous === undefined) delete process.env["HOLYCLAUDE_STATE_DIR"]
  else process.env["HOLYCLAUDE_STATE_DIR"] = previous
  rmSync(directory, { recursive: true, force: true })
})

const AT = "2026-01-01T00:00:00.000Z"
const observed = (fields: object): ObservationRecord => ({
  kind: "observed",
  agent_id: "agent-1",
  ...fields,
  at: AT,
})

const writeTranscript = (model: string) =>
  writeFileSync(transcript, `${JSON.stringify({ message: { model } })}\n`)
const writeObservations = (...records: ReadonlyArray<ObservationRecord>) => {
  mkdirSync(dirname(observationsPath(directory)), { recursive: true })
  writeFileSync(
    observationsPath(directory),
    records.map((record) => `${JSON.stringify(record)}\n`).join(""),
  )
}

const verify = async () => {
  const { value, code } = await Effect.runPromise(verifyAssignment("assignment-0001"))
  const { verdict, checks, model_source } = value
  const status = Object.fromEntries(checks.map((row) => [row.field, row.status]))
  return { verdict, status, code, model_source }
}

describe("verify combines what the three hooks saw", () => {
  test("a reviewer that never called a guarded tool is complete after SubagentStart and SubagentStop", async () => {
    writeTranscript("claude-haiku-5-5")
    writeObservations(
      observed({ agent_type: "holyclaude:Reviewer.audit" }),
      observed({ effort: "high", transcript }),
    )
    expect(await verify()).toEqual({
      verdict: "ok",
      status: { model: "match", effort: "match", agent_type: "match" },
      code: 0,
      model_source: "transcript",
    })
  })

  test("SubagentStart alone is incomplete: effort and model are still unobserved", async () => {
    writeObservations(observed({ agent_type: "holyclaude:Reviewer.audit" }))
    expect(await verify()).toEqual({
      verdict: "incomplete",
      status: { model: "unobserved", effort: "unobserved", agent_type: "match" },
      code: 0,
      model_source: "none",
    })
  })

  test("a PreToolUse record alone still completes, as before the lifecycle hooks", async () => {
    writeTranscript("claude-haiku-5-5")
    writeObservations(
      observed({ agent_type: "holyclaude:Reviewer.audit", effort: "high", transcript }),
    )
    expect((await verify()).verdict).toBe("ok")
  })

  test("a field comes from the newest record that carries it", async () => {
    writeTranscript("claude-haiku-5-5")
    writeObservations(
      observed({
        agent_type: "holyclaude:Reviewer.audit",
        effort: "low",
        transcript: "stale.jsonl",
      }),
      observed({ effort: "high", transcript }),
    )
    expect(await verify()).toMatchObject({ verdict: "ok" })
  })

  test("a wrong effort reported at stop is a mismatch, exit code 3", async () => {
    writeTranscript("claude-haiku-5-5")
    writeObservations(
      observed({ agent_type: "holyclaude:Reviewer.audit" }),
      observed({ effort: "low", transcript }),
    )
    expect(await verify()).toEqual({
      verdict: "mismatch",
      status: { model: "match", effort: "mismatch", agent_type: "match" },
      code: 3,
      model_source: "transcript",
    })
  })

  test("a wrong model in the transcript is a mismatch", async () => {
    writeTranscript("claude-sonnet-5-5")
    writeObservations(
      observed({ agent_type: "holyclaude:Reviewer.audit" }),
      observed({ effort: "high", transcript }),
    )
    expect((await verify()).status["model"]).toBe("mismatch")
  })

  test("another agent's records are not mixed in", async () => {
    writeObservations({
      ...observed({ agent_type: "holyclaude:Reviewer.audit", effort: "high" }),
      agent_id: "agent-2",
    })
    expect(await verify()).toMatchObject({ verdict: "incomplete" })
  })
})

describe("the model comes from the PostToolUse record when there is one", () => {
  const REVIEWER = { agent_type: "holyclaude:Reviewer.audit", effort: "high" }

  test("a full model id matches the expected alias, with no transcript at all", async () => {
    writeObservations(observed({ ...REVIEWER, model: "claude-haiku-5-5" }))
    expect(await verify()).toEqual({
      verdict: "ok",
      status: { model: "match", effort: "match", agent_type: "match" },
      code: 0,
      model_source: "hook",
    })
  })

  test("a full model id of another family is a mismatch, exit code 3", async () => {
    writeObservations(observed({ ...REVIEWER, model: "claude-sonnet-5-5" }))
    expect(await verify()).toMatchObject({ status: { model: "mismatch" }, code: 3 })
  })

  test("the recorded model wins over what the transcript shows", async () => {
    writeTranscript("claude-sonnet-5-5")
    writeObservations(observed({ ...REVIEWER, transcript, model: "claude-haiku-5-5" }))
    expect(await verify()).toMatchObject({ status: { model: "match" }, model_source: "hook" })
  })

  test("a record without a model falls back to the transcript", async () => {
    writeTranscript("claude-haiku-5-5")
    writeObservations(observed({ ...REVIEWER, transcript }))
    expect(await verify()).toMatchObject({ status: { model: "match" }, model_source: "transcript" })
  })

  test("the row reports the model it compared", async () => {
    writeObservations(observed({ ...REVIEWER, model: "claude-haiku-5-5" }))
    const { value } = await Effect.runPromise(verifyAssignment("assignment-0001"))
    expect(value.checks[0]).toEqual({
      field: "model",
      expected: "haiku",
      observed: "claude-haiku-5-5",
      status: "match",
    })
  })
})

describe("seenOf", () => {
  test("keeps each field from the newest record that carries it", () => {
    expect(
      seenOf(
        [
          observed({ agent_type: "a", effort: "low" }),
          observed({ effort: "high", transcript: "t" }),
          { ...observed({ effort: "other" }), agent_id: "agent-2" },
        ],
        "agent-1",
      ),
    ).toEqual({ agent_type: "a", effort: "high", transcript: "t" })
  })

  test("takes the model from the record that carries it", () => {
    expect(seenOf([observed({ model: "m" }), observed({ effort: "high" })], "agent-1")).toEqual({
      model: "m",
      effort: "high",
    })
  })

  test("is empty for an agent no hook has seen", () => {
    expect(seenOf([observed({ effort: "low" })], "agent-9")).toEqual({})
  })
})
