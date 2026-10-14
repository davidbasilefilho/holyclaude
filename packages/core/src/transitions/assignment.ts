import { Effect, Schema } from "effect"

import { InvalidRecord } from "../errors.ts"
import { AssignmentDraft, isTerminal, type Assignment } from "../model/assignment.ts"
import { newId } from "../model/ids.ts"
import { Id } from "../model/primitives.ts"
import {
  findAssignment,
  findIntent,
  invalidTransition,
  type Change,
  type State,
} from "../model/state.ts"
import { normalizePaths } from "../paths.ts"

/** Input of followUp: a draft linked to the terminal Assignment it continues. */
export const FollowUpInput = Schema.Struct({ predecessor_id: Id, assignment: AssignmentDraft })
/** Decoded input of followUp. */
export type FollowUpInput = typeof FollowUpInput.Type

/** Creates a Ready Assignment after checking ownership paths and references. */
export const createAssignment = (state: State, draft: AssignmentDraft) =>
  Effect.gen(function* () {
    yield* findIntent(state, draft.intent_id)
    const ownership_paths = yield* normalizePaths(draft.metadata.ownership_paths)
    if (draft.mutability !== "ReadOnly" && ownership_paths.length === 0)
      return yield* new InvalidRecord({
        message: "A non-ReadOnly Assignment needs an ownership path",
      })
    const { dependencies, related_assignments, independent_from } = draft.metadata
    yield* Effect.forEach([...dependencies, ...related_assignments, ...independent_from], (id) =>
      findAssignment(state, id),
    )
    const assignment: Assignment = {
      ...draft,
      metadata: { ...draft.metadata, ownership_paths },
      id: yield* newId("assignment"),
      state: "Ready",
      agent_id: null,
      result: null,
      acceptance: null,
    }
    const change: Change<Assignment> = {
      state: { ...state, assignments: [...state.assignments, assignment] },
      value: assignment,
    }
    return change
  })

/** Creates an Assignment that continues a terminal one, with its own criteria and revision. */
export const followUp = (state: State, input: FollowUpInput) =>
  Effect.gen(function* () {
    const predecessor = yield* findAssignment(state, input.predecessor_id)
    if (!isTerminal(predecessor)) return yield* invalidTransition(predecessor, "follow up")
    const { metadata } = input.assignment
    const related = new Set([...metadata.related_assignments, predecessor.id])
    return yield* createAssignment(state, {
      ...input.assignment,
      metadata: { ...metadata, related_assignments: [...related] },
    })
  })
