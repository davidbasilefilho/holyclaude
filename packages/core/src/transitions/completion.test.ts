import { describe, expect, test } from "bun:test"

import { Effect } from "effect"

import type { Assignment } from "../model/assignment.ts"
import type { Intent } from "../model/intent.ts"
import type { State } from "../model/state.ts"
import { accept, closedWithOpenWork } from "./completion.ts"

const intent = (id: string, overrides: Partial<Intent> = {}): Intent => ({
  id,
  objective: `objective of ${id}`,
  requirements: "r",
  revision: 1,
  state: "open",
  ...overrides,
})

const row = (id: string, state: Assignment["state"], overrides: Partial<Assignment> = {}) =>
  ({
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
    ...overrides,
  }) satisfies Assignment

const stateOf = (
  intents: ReadonlyArray<Intent>,
  assignments: ReadonlyArray<Assignment>,
): State => ({
  version: 1,
  intents,
  assignments,
  workers: [],
})

const acceptance = (revision: number) => ({
  intent_revision: revision,
  rationale: "the change touched no file this work owns",
  criteria_evidence: { a: "seen" },
  required_evidence: { e: "seen" },
})

const failure = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(Effect.flip(effect))

describe("accept across a revision bump", () => {
  const bumped = stateOf([intent("intent-1", { revision: 2 })], [row("assignment-1", "Succeeded")])

  test("is refused as stale without the carry-forward flag", async () => {
    const input = { assignment_id: "assignment-1", acceptance: acceptance(2) }
    expect(await failure(accept(bumped, input))).toMatchObject({
      _tag: "StaleRevision",
      given: 1,
      live: 2,
    })
  })

  test("carry_forward accepts an earlier-revision Assignment, and the record shows it", async () => {
    const { value } = await Effect.runPromise(
      accept(bumped, {
        assignment_id: "assignment-1",
        acceptance: acceptance(2),
        carry_forward: true,
      }),
    )
    expect(value.intent_revision).toBe(1)
    expect(value.acceptance?.intent_revision).toBe(2)
  })

  test("carry_forward still needs the acceptance at the live revision", async () => {
    const input = { assignment_id: "assignment-1", acceptance: acceptance(1), carry_forward: true }
    expect(await failure(accept(bumped, input))).toMatchObject({ _tag: "StaleRevision", given: 1 })
  })

  test("carry_forward still checks the evidence labels", async () => {
    const thin = { ...acceptance(2), required_evidence: {} }
    const input = { assignment_id: "assignment-1", acceptance: thin, carry_forward: true }
    expect(await failure(accept(bumped, input))).toMatchObject({ _tag: "InsufficientEvidence" })
  })

  test("carry_forward on an Assignment at the live revision accepts it as usual", async () => {
    const live = stateOf([intent("intent-1")], [row("assignment-1", "Succeeded")])
    const { value } = await Effect.runPromise(
      accept(live, {
        assignment_id: "assignment-1",
        acceptance: acceptance(1),
        carry_forward: true,
      }),
    )
    expect(value.acceptance).toEqual(acceptance(1))
  })
})

describe("closedWithOpenWork", () => {
  test("lists a closed Intent's Ready and Running Assignments, and nothing else", () => {
    const closed = intent("intent-1", { state: "closed", close_reason: "done", closed_at: "t" })
    const state = stateOf(
      [closed, intent("intent-2")],
      [
        row("assignment-1", "Ready"),
        row("assignment-2", "Running"),
        row("assignment-3", "Succeeded"),
        row("assignment-4", "Ready", { intent_id: "intent-2" }),
      ],
    )
    const found = closedWithOpenWork(state)
    expect(found.map((entry) => entry.intent.id)).toEqual(["intent-1"])
    expect(found[0]?.assignments.map((assignment) => assignment.id)).toEqual([
      "assignment-1",
      "assignment-2",
    ])
  })

  test("a closed Intent with only finished work is not listed", () => {
    const closed = intent("intent-1", { state: "closed", close_reason: "done", closed_at: "t" })
    expect(closedWithOpenWork(stateOf([closed], [row("assignment-1", "Failed")]))).toEqual([])
  })
})
