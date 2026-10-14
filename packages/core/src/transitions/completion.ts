import { Effect, Schema } from "effect"

import { Conflict, InsufficientEvidence } from "../errors.ts"
import { AcceptanceRecord } from "../model/acceptance.ts"
import { isTerminal, type Assignment } from "../model/assignment.ts"
import { sortedById } from "../model/ids.ts"
import { Id, Text } from "../model/primitives.ts"
import {
  findAssignment,
  findIntent,
  invalidTransition,
  replaceAssignment,
  requireLiveRevision,
  unchanged,
  type State,
} from "../model/state.ts"

/** How a worker's run ended, as read from its completion notification. */
export const Outcome = Schema.Literals(["Success", "Failure", "Errored", "Interrupted", "Stopped"])
/** One notification outcome. */
export type Outcome = typeof Outcome.Type

/** Input of finish: the specialist's execution result. */
export const FinishInput = Schema.Struct({ assignment_id: Id, outcome: Outcome, result: Text })
/** Decoded input of finish. */
export type FinishInput = typeof FinishInput.Type

/** Input of cancel. Cancelling is only valid once the stopped notification arrived. */
export const CancelInput = Schema.Struct({
  assignment_id: Id,
  notification: Schema.Literal("stopped"),
  reason: Schema.optionalKey(Text),
})
/** Decoded input of cancel. */
export type CancelInput = typeof CancelInput.Type

/** Input of accept: the root's evidence review. */
export const AcceptInput = Schema.Struct({ assignment_id: Id, acceptance: AcceptanceRecord })
/** Decoded input of accept. */
export type AcceptInput = typeof AcceptInput.Type

/** Input of resolveReconcile: fail a Running row with a reason, or keep it reserved. */
export const ResolveReconcileInput = Schema.Union([
  Schema.TaggedStruct("Fail", { assignment_id: Id, reason: Text }),
  Schema.TaggedStruct("Keep", { assignment_id: Id }),
])
/** Decoded input of resolveReconcile. */
export type ResolveReconcileInput = typeof ResolveReconcileInput.Type

/**
 * Records a worker's execution outcome. Success becomes Succeeded and every other outcome becomes
 * Failed. A repeat with identical content changes nothing; different content is rejected.
 */
export const finish = (state: State, input: FinishInput) =>
  Effect.gen(function* () {
    const assignment = yield* findAssignment(state, input.assignment_id)
    const target = input.outcome === "Success" ? "Succeeded" : "Failed"
    if (isTerminal(assignment))
      return assignment.state === target && assignment.result === input.result
        ? unchanged(state, assignment)
        : yield* new Conflict({ id: assignment.id, what: "finish" })
    if (assignment.state !== "Running" || assignment.agent_id === null)
      return yield* invalidTransition(assignment, "finish")
    return replaceAssignment(state, { ...assignment, state: target, result: input.result })
  })

/** Records Cancelled for a Running Assignment whose stopped notification has arrived. */
export const cancel = (state: State, input: CancelInput) =>
  Effect.gen(function* () {
    const assignment = yield* findAssignment(state, input.assignment_id)
    if (assignment.state !== "Running") return yield* invalidTransition(assignment, "cancel")
    return replaceAssignment(state, {
      ...assignment,
      state: "Cancelled",
      result: input.reason ?? null,
    })
  })

const coverageProblems = (
  name: string,
  declared: ReadonlyArray<string>,
  given: Readonly<Record<string, string>>,
): ReadonlyArray<string> => {
  const labels = Object.keys(given)
  const missing = declared.filter((label) => !labels.includes(label))
  const extra = labels.filter((label) => !declared.includes(label))
  return [
    ...(missing.length > 0 ? [`${name} missing ${missing.join(", ")}`] : []),
    ...(extra.length > 0 ? [`${name} unknown ${extra.join(", ")}`] : []),
  ]
}

const sameEvidence = (a: Readonly<Record<string, string>>, b: Readonly<Record<string, string>>) =>
  Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([k, v]) => b[k] === v)

const sameAcceptance = (a: AcceptanceRecord, b: AcceptanceRecord) =>
  a.intent_revision === b.intent_revision &&
  a.rationale === b.rationale &&
  sameEvidence(a.criteria_evidence, b.criteria_evidence) &&
  sameEvidence(a.required_evidence, b.required_evidence)

/**
 * Records the root's acceptance of a Succeeded Assignment. The record must carry the Assignment's
 * revision, which must be the live one, and cover exactly the declared labels. An identical repeat
 * changes nothing; a different record is refused.
 */
export const accept = (state: State, input: AcceptInput) =>
  Effect.gen(function* () {
    const assignment = yield* findAssignment(state, input.assignment_id)
    const { acceptance } = input
    if (assignment.acceptance !== null)
      return sameAcceptance(assignment.acceptance, acceptance)
        ? unchanged(state, assignment)
        : yield* new Conflict({ id: assignment.id, what: "acceptance" })
    if (assignment.state !== "Succeeded") return yield* invalidTransition(assignment, "accept")
    const intent = yield* findIntent(state, assignment.intent_id)
    yield* requireLiveRevision(intent, assignment.intent_revision)
    yield* requireLiveRevision(intent, acceptance.intent_revision)

    const problems = [
      ...coverageProblems("criteria", assignment.acceptance_criteria, acceptance.criteria_evidence),
      ...coverageProblems(
        "required evidence",
        assignment.required_evidence,
        acceptance.required_evidence,
      ),
    ]
    if (problems.length > 0)
      return yield* new InsufficientEvidence({ id: assignment.id, detail: problems.join("; ") })
    return replaceAssignment(state, { ...assignment, acceptance })
  })

/** The Running rows of a project, split by the clone that reserved them. */
export interface RunningRows {
  /** Reserved by this clone, or by a clone that left no stamp. The root confirms these. */
  readonly local: ReadonlyArray<Assignment>
  /** Reserved by another clone. Its own root confirms these, so they are left alone. */
  readonly elsewhere: ReadonlyArray<Assignment>
}

/**
 * Lists Running rows, oldest first, so the root can confirm each worker by agent id. Rows stamped
 * by another clone are separated, since their workers live in a session this clone cannot see.
 * Changes nothing.
 */
export const reconcile = (state: State, cloneId: string | undefined): RunningRows => {
  const running = sortedById(
    state.assignments.filter((assignment) => assignment.state === "Running"),
  )
  const isElsewhere = (assignment: Assignment) =>
    assignment.clone_id !== undefined && assignment.clone_id !== cloneId
  return {
    local: running.filter((assignment) => !isElsewhere(assignment)),
    elsewhere: running.filter(isElsewhere),
  }
}

/** Settles one Running row after reconcile: mark it Failed with a reason, or keep it reserved. */
export const resolveReconcile = (state: State, input: ResolveReconcileInput) =>
  Effect.gen(function* () {
    const assignment = yield* findAssignment(state, input.assignment_id)
    if (assignment.state !== "Running") return yield* invalidTransition(assignment, "reconcile")
    return input._tag === "Keep"
      ? unchanged(state, assignment)
      : replaceAssignment(state, { ...assignment, state: "Failed", result: input.reason })
  })
