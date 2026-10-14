import { Effect, Schema } from "effect"

import { DispatchRefused, InvalidRecord } from "../errors.ts"
import { Id, Text } from "../model/primitives.ts"
import { Capability, routeFor } from "../model/routes.ts"
import {
  findAssignment,
  findIntent,
  invalidTransition,
  replaceAssignment,
  requireLiveRevision,
  type State,
} from "../model/state.ts"
import type { Worker } from "../model/worker.ts"
import { anyOverlap, isInsideRoots } from "../paths.ts"
import { reuseProblem } from "./selection.ts"

/** Names one Assignment. Used by every operation that needs nothing else. */
export const AssignmentRef = Schema.Struct({ assignment_id: Id })
/** Decoded AssignmentRef. */
export type AssignmentRef = typeof AssignmentRef.Type

/** Input of reserve: the capabilities the target worker is known to hold. */
export const ReserveInput = Schema.Struct({
  assignment_id: Id,
  capabilities: Schema.Array(Capability),
})
/** Decoded input of reserve. */
export type ReserveInput = typeof ReserveInput.Type

/** Input of bindAgent: the spawned agent and the fingerprint of its roster and tools. */
export const BindAgentInput = Schema.Struct({
  assignment_id: Id,
  agent_id: Id,
  fingerprint: Text,
})
/** Decoded input of bindAgent. */
export type BindAgentInput = typeof BindAgentInput.Type

/** Where the CLI runs: the project root, and the roots a ScopedWrite path must stay inside. */
export interface DispatchContext {
  readonly projectRoot: string
  readonly writableRoots: ReadonlyArray<string>
}

const MUTABILITY_RANK = { ReadOnly: 0, ScopedWrite: 1 } as const

/**
 * Revalidates an Assignment immediately before launch and reserves its ownership by moving it to
 * Running. Nothing changes when any check fails.
 */
export const reserve = (state: State, input: ReserveInput, context: DispatchContext) =>
  Effect.gen(function* () {
    const assignment = yield* findAssignment(state, input.assignment_id)
    if (assignment.state !== "Ready") return yield* invalidTransition(assignment, "reserve")
    const intent = yield* findIntent(state, assignment.intent_id)
    yield* requireLiveRevision(intent, assignment.intent_revision)

    const refuse = (reason: DispatchRefused["reason"], detail: string) =>
      new DispatchRefused({ id: assignment.id, reason, detail })
    const route = routeFor(assignment.role)
    if (MUTABILITY_RANK[assignment.mutability] > MUTABILITY_RANK[route.mutability])
      return yield* refuse("MutabilityCeiling", `${route.role} may only be ${route.mutability}`)
    const missing = route.capabilities.filter((need) => !input.capabilities.includes(need))
    if (missing.length > 0) return yield* refuse("MissingCapability", missing.join(", "))

    const { ownership_paths, dependencies } = assignment.metadata
    const writes = assignment.mutability !== "ReadOnly"
    const outside = ownership_paths.find(
      (path) => !isInsideRoots(path, context.writableRoots, context.projectRoot),
    )
    if (writes && outside !== undefined) return yield* refuse("OutsideWritableRoots", outside)

    for (const id of dependencies) {
      const dependency = yield* findAssignment(state, id)
      const accepted =
        dependency.state === "Succeeded" &&
        dependency.intent_id === assignment.intent_id &&
        dependency.acceptance?.intent_revision === assignment.intent_revision
      if (!accepted)
        return yield* refuse(
          "DependencyNotAccepted",
          `${id} is not accepted at revision ${assignment.intent_revision}`,
        )
    }

    const holder = state.assignments.find(
      (other) =>
        writes &&
        other.state === "Running" &&
        other.mutability !== "ReadOnly" &&
        anyOverlap(other.metadata.ownership_paths, ownership_paths),
    )
    if (holder !== undefined)
      return yield* refuse("OwnershipConflict", `paths overlap ${holder.id}`)

    return replaceAssignment(state, { ...assignment, state: "Running" })
  })

/** Attaches the spawned agent to a reservation and records it in the worker registry. */
export const bindAgent = (state: State, input: BindAgentInput) =>
  Effect.gen(function* () {
    const assignment = yield* findAssignment(state, input.assignment_id)
    if (assignment.state !== "Running" || assignment.agent_id !== null)
      return yield* invalidTransition(assignment, "bind an agent to")
    const known = state.workers.find((worker) => worker.agent_id === input.agent_id)
    const problem =
      known === undefined ? undefined : reuseProblem(state, known, assignment, input.fingerprint)
    if (problem !== undefined) return yield* new InvalidRecord({ message: problem })
    const worker: Worker = {
      agent_id: input.agent_id,
      preset: assignment.role,
      fingerprint: input.fingerprint,
      history: [...(known?.history ?? []), assignment.id],
    }
    const bound = replaceAssignment(state, { ...assignment, agent_id: input.agent_id })
    const workers = [...state.workers.filter((other) => other.agent_id !== worker.agent_id), worker]
    return { ...bound, state: { ...bound.state, workers } }
  })

/** Returns an unbound reservation to Ready after the spawn failed. */
export const rollbackReservation = (state: State, input: AssignmentRef) =>
  Effect.gen(function* () {
    const assignment = yield* findAssignment(state, input.assignment_id)
    if (assignment.state !== "Running" || assignment.agent_id !== null)
      return yield* invalidTransition(assignment, "roll back")
    return replaceAssignment(state, { ...assignment, state: "Ready" })
  })
