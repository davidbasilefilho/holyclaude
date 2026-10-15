import { describe, expect, test } from "bun:test"

import { Effect } from "effect"

import type { Assignment } from "./assignment.ts"
import { emptyState, validateState, type State } from "./state.ts"

const assignment = (index: number, dependencies: ReadonlyArray<string>): Assignment => ({
  id: `assignment-${index}`,
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
    ownership_paths: ["src"],
    symbols: [],
    domains: [],
    dependencies,
    related_assignments: [],
    independent_from: [],
  },
  state: "Ready",
  agent_id: null,
  result: null,
  acceptance: null,
})

const stateOf = (assignments: ReadonlyArray<Assignment>): State => ({
  ...emptyState,
  intents: [{ id: "intent-1", objective: "o", requirements: "", revision: 1 }],
  assignments,
})

const failure = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(Effect.flip(effect))

describe("validateState", () => {
  test("checks a state of 100,000 records in linear time", async () => {
    const count = 100_000
    const state = stateOf(
      Array.from({ length: count }, (_, index) =>
        assignment(index, index === 0 ? [] : [`assignment-${index - 1}`]),
      ),
    )
    const started = performance.now()
    await Effect.runPromise(validateState(state))
    expect(performance.now() - started).toBeLessThan(1000)
  })

  test("reports a repeated id, an unknown intent and an unknown reference", async () => {
    expect(
      await failure(validateState(stateOf([assignment(1, []), assignment(1, [])]))),
    ).toMatchObject({ message: "Duplicate assignment id assignment-1" })
    const orphan = { ...assignment(1, []), intent_id: "intent-9" }
    expect(await failure(validateState(stateOf([orphan])))).toMatchObject({
      message: "Assignment assignment-1 names unknown intent intent-9",
    })
    expect(await failure(validateState(stateOf([assignment(1, ["assignment-7"])])))).toMatchObject({
      message: "Assignment assignment-1 references unknown assignment assignment-7",
    })
  })
})
