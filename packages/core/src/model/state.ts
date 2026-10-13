import { Effect, Schema } from "effect"
import {
  InvalidRecord,
  InvalidTransition,
  NoRevision,
  StaleRevision,
  UnknownRecord,
} from "../errors.ts"
import { Assignment } from "./assignment.ts"
import { Intent } from "./intent.ts"
import { Worker } from "./worker.ts"

/** Everything the store persists. */
export const State = Schema.Struct({
  version: Schema.Literal(1),
  intents: Schema.Array(Intent),
  assignments: Schema.Array(Assignment),
  workers: Schema.Array(Worker),
})
/** The persisted state document. */
export type State = typeof State.Type

/** The state of a project that has never been written. */
export const emptyState: State = { version: 1, intents: [], assignments: [], workers: [] }

/** A new state together with the record a transition produced. */
export interface Change<A> {
  readonly state: State
  readonly value: A
}

/** Finds an Intent or fails with UnknownRecord. */
export const findIntent = (state: State, id: string) => {
  const found = state.intents.find((intent) => intent.id === id)
  return found === undefined
    ? Effect.fail(new UnknownRecord({ kind: "intent", id }))
    : Effect.succeed(found)
}

/** Finds an Assignment or fails with UnknownRecord. */
export const findAssignment = (state: State, id: string) => {
  const found = state.assignments.find((assignment) => assignment.id === id)
  return found === undefined
    ? Effect.fail(new UnknownRecord({ kind: "assignment", id }))
    : Effect.succeed(found)
}

/** Fails because the operation does not apply to the Assignment's current state. */
export const invalidTransition = (assignment: Assignment, action: string) =>
  Effect.fail(new InvalidTransition({ id: assignment.id, state: assignment.state, action }))

/**
 * Checks that a revision may act on an Intent. An Intent at revision 0 (legacy or missing)
 * authorizes nothing; otherwise the given revision must equal the live one.
 */
export const requireLiveRevision = (intent: Intent, given: number) =>
  intent.revision < 1
    ? Effect.fail(new NoRevision({ intent_id: intent.id }))
    : given === intent.revision
      ? Effect.void
      : Effect.fail(new StaleRevision({ given, live: intent.revision }))

/** The next identifier for a kind of record. Records are never deleted, so counts are unique. */
export const nextId = (prefix: string, existing: ReadonlyArray<unknown>): string =>
  `${prefix}-${String(existing.length + 1).padStart(4, "0")}`

/** Returns the state with one Assignment replaced. */
export const withAssignment = (state: State, next: Assignment): State => ({
  ...state,
  assignments: state.assignments.map((assignment) =>
    assignment.id === next.id ? next : assignment,
  ),
})

/** A change that replaces one Assignment. */
export const replaceAssignment = (state: State, next: Assignment): Change<Assignment> => ({
  state: withAssignment(state, next),
  value: next,
})

/** A change that leaves the state as it is, so the store writes nothing. */
export const unchanged = (state: State, assignment: Assignment): Change<Assignment> => ({
  state,
  value: assignment,
})

const duplicate = (ids: ReadonlyArray<string>) => ids.find((id, index) => ids.indexOf(id) !== index)

/** Domain rules for a decoded state: unique ids and known references. */
export const validateState = (state: State) =>
  Effect.gen(function* () {
    const fail = (message: string) => Effect.fail(new InvalidRecord({ message }))
    const intentIds = state.intents.map((intent) => intent.id)
    const assignmentIds = state.assignments.map((assignment) => assignment.id)
    const workerIds = state.workers.map((worker) => worker.agent_id)
    for (const [kind, ids] of [
      ["intent", intentIds],
      ["assignment", assignmentIds],
      ["worker", workerIds],
    ] as const) {
      const repeated = duplicate(ids)
      if (repeated !== undefined) return yield* fail(`Duplicate ${kind} id ${repeated}`)
    }
    for (const assignment of state.assignments) {
      if (!intentIds.includes(assignment.intent_id))
        return yield* fail(
          `Assignment ${assignment.id} names unknown intent ${assignment.intent_id}`,
        )
      const { dependencies, related_assignments, independent_from } = assignment.metadata
      const unknown = [...dependencies, ...related_assignments, ...independent_from].find(
        (id) => !assignmentIds.includes(id),
      )
      if (unknown !== undefined)
        return yield* fail(`Assignment ${assignment.id} references unknown assignment ${unknown}`)
    }
    const unknownHistory = state.workers
      .flatMap((worker) => worker.history)
      .find((id) => !assignmentIds.includes(id))
    if (unknownHistory !== undefined)
      return yield* fail(`Worker history names unknown assignment ${unknownHistory}`)
    return state
  })
