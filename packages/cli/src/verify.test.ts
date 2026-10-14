import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

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
let stateFile = ""
let transcript = ""
const previous = process.env["HOLYCLAUDE_STATE_FILE"]

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "holyclaude-verify-"))
  stateFile = join(directory, "state.json")
  transcript = join(directory, "agent-agent-1.jsonl")
  writeFileSync(stateFile, JSON.stringify(state))
  process.env["HOLYCLAUDE_STATE_FILE"] = stateFile
})

afterEach(() => {
  if (previous === undefined) delete process.env["HOLYCLAUDE_STATE_FILE"]
  else process.env["HOLYCLAUDE_STATE_FILE"] = previous
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
const writeObservations = (...records: ReadonlyArray<ObservationRecord>) =>
  writeFileSync(
    observationsPath(stateFile),
    records.map((record) => `${JSON.stringify(record)}\n`).join(""),
  )

const verify = async () => {
  const { value, code } = await Effect.runPromise(verifyAssignment("assignment-0001"))
  const { verdict, checks } = value
  const status = Object.fromEntries(checks.map((row) => [row.field, row.status]))
  return { verdict, status, code }
}

describe("verify combines what the three hooks saw", () => {
  test("a reviewer that never called a guarded tool is complete after SubagentStart and SubagentStop", async () => {
    writeTranscript("claude-sonnet-5-5")
    writeObservations(
      observed({ agent_type: "holyclaude:Reviewer.audit" }),
      observed({ effort: "medium", transcript }),
    )
    expect(await verify()).toEqual({
      verdict: "ok",
      status: { model: "match", effort: "match", agent_type: "match" },
      code: 0,
    })
  })

  test("SubagentStart alone is incomplete: effort and model are still unobserved", async () => {
    writeObservations(observed({ agent_type: "holyclaude:Reviewer.audit" }))
    expect(await verify()).toEqual({
      verdict: "incomplete",
      status: { model: "unobserved", effort: "unobserved", agent_type: "match" },
      code: 0,
    })
  })

  test("a PreToolUse record alone still completes, as before the lifecycle hooks", async () => {
    writeTranscript("claude-sonnet-5-5")
    writeObservations(
      observed({ agent_type: "holyclaude:Reviewer.audit", effort: "medium", transcript }),
    )
    expect((await verify()).verdict).toBe("ok")
  })

  test("a field comes from the newest record that carries it", async () => {
    writeTranscript("claude-sonnet-5-5")
    writeObservations(
      observed({
        agent_type: "holyclaude:Reviewer.audit",
        effort: "low",
        transcript: "stale.jsonl",
      }),
      observed({ effort: "medium", transcript }),
    )
    expect(await verify()).toMatchObject({ verdict: "ok" })
  })

  test("a wrong effort reported at stop is a mismatch, exit code 3", async () => {
    writeTranscript("claude-sonnet-5-5")
    writeObservations(
      observed({ agent_type: "holyclaude:Reviewer.audit" }),
      observed({ effort: "low", transcript }),
    )
    expect(await verify()).toEqual({
      verdict: "mismatch",
      status: { model: "match", effort: "mismatch", agent_type: "match" },
      code: 3,
    })
  })

  test("a wrong model in the transcript is a mismatch", async () => {
    writeTranscript("claude-haiku-5-5")
    writeObservations(
      observed({ agent_type: "holyclaude:Reviewer.audit" }),
      observed({ effort: "medium", transcript }),
    )
    expect((await verify()).status["model"]).toBe("mismatch")
  })

  test("another agent's records are not mixed in", async () => {
    writeObservations({
      ...observed({ agent_type: "holyclaude:Reviewer.audit", effort: "medium" }),
      agent_id: "agent-2",
    })
    expect(await verify()).toMatchObject({ verdict: "incomplete" })
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

  test("is empty for an agent no hook has seen", () => {
    expect(seenOf([observed({ effort: "low" })], "agent-9")).toEqual({})
  })
})
