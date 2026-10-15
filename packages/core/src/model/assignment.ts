import { Effect, Schema } from "effect"

import { AcceptanceRecord } from "./acceptance.ts"
import { AssignmentId, CloneId } from "./ids.ts"
import { Id, Labels, Revision, StoredRevision, Text, TextList } from "./primitives.ts"
import { Mutability, Role } from "./routes.ts"

/** Lifecycle of an Assignment. Succeeded means executed, not accepted. */
export const AssignmentState = Schema.Literals([
  "Ready",
  "Running",
  "Succeeded",
  "Failed",
  "Cancelled",
])
/** One Assignment lifecycle state. */
export type AssignmentState = typeof AssignmentState.Type

/** Facts that drive overlap, dependency and reuse decisions. */
export const Metadata = Schema.Struct({
  ownership_paths: TextList,
  symbols: TextList,
  domains: TextList,
  dependencies: TextList,
  related_assignments: TextList,
  /** Assignments whose work a review must be independent from. */
  independent_from: TextList,
})
/** Assignment metadata. */
export type Metadata = typeof Metadata.Type

/** What the root provides to create an Assignment. */
export const AssignmentDraft = Schema.Struct({
  intent_id: Id,
  intent_revision: Revision,
  role: Role,
  objective: Text,
  scope: TextList,
  constraints: TextList,
  acceptance_criteria: Labels,
  required_evidence: Labels,
  mutability: Mutability,
  metadata: Metadata.pipe(Schema.withDecodingDefaultKey(Effect.succeed({}))),
})
/** A decoded Assignment draft. */
export type AssignmentDraft = typeof AssignmentDraft.Type

/**
 * A persisted Assignment. `agent_id`, `result` and `acceptance` are required keys whose explicit
 * null means "not yet": a missing key is invalid. `clone_id` is stamped by the store on a row that
 * enters Running, and names the clone of the project that reserved it. A row without one counts as
 * this clone's.
 */
export const Assignment = Schema.Struct({
  ...AssignmentDraft.fields,
  id: AssignmentId,
  intent_revision: StoredRevision,
  state: AssignmentState,
  agent_id: Schema.NullOr(Id),
  result: Schema.NullOr(Text),
  acceptance: Schema.NullOr(AcceptanceRecord),
  clone_id: Schema.optionalKey(CloneId),
})
/** A persisted unit of delegated work. */
export type Assignment = typeof Assignment.Type

/**
 * True while an Assignment still needs the root: it is Ready (planned, not yet reserved), Running,
 * or it Succeeded and its evidence has not been accepted yet.
 */
export const isOpenAssignment = (assignment: {
  readonly state: AssignmentState
  readonly acceptance: unknown
}): boolean =>
  assignment.state === "Ready" ||
  assignment.state === "Running" ||
  (assignment.state === "Succeeded" && assignment.acceptance === null)

/** True once an Assignment can no longer change state. */
export const isTerminal = (assignment: { readonly state: AssignmentState }): boolean =>
  assignment.state === "Succeeded" ||
  assignment.state === "Failed" ||
  assignment.state === "Cancelled"
