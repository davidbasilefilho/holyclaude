import { describe, expect, test } from "bun:test"

import { Effect } from "effect"

import type { Assignment } from "../model/assignment.ts"
import type { State } from "../model/state.ts"
import type { Worker } from "../model/worker.ts"
import { isIdle, selectWorker } from "./selection.ts"

const row = (id: string, state: Assignment["state"]): Assignment => ({
  id,
  intent_id: "intent-1",
  intent_revision: 1,
  role: "Worker.implementation",
  objective: "o",
  scope: [],
  constraints: [],
  acceptance_criteria: ["a"],
  required_evidence: ["e"],
  mutability: "ScopedWrite",
  metadata: {
    ownership_paths: ["src/a.ts"],
    symbols: [],
    domains: [],
    dependencies: [],
    related_assignments: [],
    independent_from: [],
  },
  state,
  agent_id: null,
  result: null,
  acceptance: null,
})

const worker = (history: ReadonlyArray<string>): Worker => ({
  agent_id: "agent-1",
  preset: "Worker.implementation",
  fingerprint: "roster:a",
  history,
})

const stateWith = (
  assignments: ReadonlyArray<Assignment>,
  workers: ReadonlyArray<Worker>,
): State => ({
  version: 1,
  intents: [{ id: "intent-1", objective: "o", requirements: "r", revision: 1 }],
  assignments,
  workers,
})

describe("isIdle", () => {
  test("a worker with no history is idle", () => {
    expect(isIdle(stateWith([], []), worker([]))).toBe(true)
  })

  test("a worker whose last Assignment is terminal is idle", () => {
    const state = stateWith([row("assignment-0001", "Succeeded")], [])
    expect(isIdle(state, worker(["assignment-0001"]))).toBe(true)
  })

  test("a worker whose last Assignment is still running is busy", () => {
    const state = stateWith([row("assignment-0001", "Running")], [])
    expect(isIdle(state, worker(["assignment-0001"]))).toBe(false)
  })

  test("a worker whose last Assignment is not in the loaded state is busy, not idle", () => {
    // Another branch's record: its outcome cannot be seen, so the worker may still be on it.
    const state = stateWith([row("assignment-0001", "Succeeded")], [])
    expect(isIdle(state, worker(["assignment-0001", "assignment-0mg8k2x2b-9abc"]))).toBe(false)
  })
})

describe("selectWorker", () => {
  test("does not reuse a worker whose last Assignment is missing from the loaded state", async () => {
    const state = stateWith(
      [row("assignment-0002", "Ready")],
      [worker(["assignment-0mg8k2x2b-9abc"])],
    )
    const selection = await Effect.runPromise(
      selectWorker(state, { assignment_id: "assignment-0002", fingerprint: "roster:a" }),
    )
    expect(selection).toEqual({ _tag: "Spawn" })
  })

  test("reuses an idle Sonnet specialist and never an idle Haiku one", async () => {
    const select = (role: Assignment["role"]) =>
      Effect.runPromise(
        selectWorker(
          stateWith(
            [row("assignment-0001", "Succeeded"), { ...row("assignment-0002", "Ready"), role }],
            [{ ...worker(["assignment-0001"]), preset: role }],
          ),
          { assignment_id: "assignment-0002", fingerprint: "roster:a" },
        ),
      )
    expect(await select("Worker.implementation")).toMatchObject({ _tag: "Reuse" })
    expect(await select("Worker.mechanical")).toEqual({ _tag: "Spawn" })
  })
})
