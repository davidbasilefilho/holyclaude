import { Effect, Schema } from "effect"

import {
  IntentClosed,
  InvalidRecord,
  NoActiveIntent,
  OwnedElsewhere,
  InvalidTransition,
  NoRevision,
  StaleRevision,
  UnknownRecord,
} from "../errors.ts"
import { Assignment } from "./assignment.ts"
import { sortedById } from "./ids.ts"
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

/**
 * Fails with OwnedElsewhere when the Assignment is Running for another clone. Its worker lives in a
 * session this clone cannot see, so binding, rolling back, cancelling or finishing it here would
 * act on a row that is not this clone's. An unknown id passes; the transition reports that.
 */
export const refuseOtherClone = (state: State, id: string, cloneId: string | undefined) => {
  const row = state.assignments.find((assignment) => assignment.id === id)
  return row?.state === "Running" && row.clone_id !== undefined && row.clone_id !== cloneId
    ? Effect.fail(new OwnedElsewhere({ id, clone_id: row.clone_id }))
    : Effect.void
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

/** Fails with IntentClosed unless the Intent is open. A closed Intent authorizes no dispatch. */
export const requireOpen = (intent: Intent) =>
  intent.state === "open" ? Effect.void : Effect.fail(new IntentClosed({ intent_id: intent.id }))

/** The open Intents, oldest first. */
export const openIntents = (state: State): ReadonlyArray<Intent> =>
  sortedById(state.intents).filter((intent) => intent.state === "open")

/**
 * The Intent this clone works on without being told: the stored choice while it is still open,
 * otherwise the only open Intent. Undefined when neither names one.
 */
export const intentInUse = (state: State, stored: string | undefined): Intent | undefined => {
  const open = openIntents(state)
  const chosen = open.find((intent) => intent.id === stored)
  return chosen ?? (open.length === 1 ? open[0] : undefined)
}

/**
 * The Intent a command acts on: the one named by `flag` (open or closed), else the one
 * {@link intentInUse} finds. Fails with NoActiveIntent, listing the open Intents, when nothing names
 * one.
 */
export const resolveIntent = (state: State, flag: string | undefined, stored: string | undefined) =>
  Effect.gen(function* () {
    if (flag !== undefined) return yield* findIntent(state, flag)
    const inUse = intentInUse(state, stored)
    if (inUse !== undefined) return inUse
    return yield* new NoActiveIntent({
      open: openIntents(state).map(({ id, objective }) => ({ id, objective })),
    })
  })

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

/** The first id that an earlier one repeats, found in one pass. */
const duplicate = (ids: ReadonlyArray<string>) => {
  const seen = new Set<string>()
  for (const id of ids) {
    if (seen.has(id)) return id
    seen.add(id)
  }
  return undefined
}

/**
 * Domain rules for a decoded state: unique ids and known references. A worker's history may name an
 * Assignment that is not here: workers are kept per clone while Assignments are shared through
 * version control, so a branch switch can leave a worker with history from another branch.
 */
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
    // Sets keep the checks linear, since a repository can commit any number of records.
    const knownIntents = new Set(intentIds)
    const knownAssignments = new Set(assignmentIds)
    for (const assignment of state.assignments) {
      if (!knownIntents.has(assignment.intent_id))
        return yield* fail(
          `Assignment ${assignment.id} names unknown intent ${assignment.intent_id}`,
        )
      const { dependencies, related_assignments, independent_from } = assignment.metadata
      const unknown = [...dependencies, ...related_assignments, ...independent_from].find(
        (id) => !knownAssignments.has(id),
      )
      if (unknown !== undefined)
        return yield* fail(`Assignment ${assignment.id} references unknown assignment ${unknown}`)
    }
    return state
  })
