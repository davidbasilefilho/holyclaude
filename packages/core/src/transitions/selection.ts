import { Effect, Schema } from "effect"

import { isTerminal, type Assignment } from "../model/assignment.ts"
import { Id, Text } from "../model/primitives.ts"
import { routeFor } from "../model/routes.ts"
import { findAssignment, invalidTransition, type State } from "../model/state.ts"
import type { Worker } from "../model/worker.ts"
import { anyOverlap } from "../paths.ts"

/** Input of selectWorker. The fingerprint describes the current roster and tools. */
export const SelectWorkerInput = Schema.Struct({ assignment_id: Id, fingerprint: Text })
/** Decoded input of selectWorker. */
export type SelectWorkerInput = typeof SelectWorkerInput.Type

/** Reuse an idle worker, or spawn a new one. */
export type Selection =
  | {
      readonly _tag: "Reuse"
      readonly agent_id: string
      readonly reason: "RelevantContext" | "SameRole"
    }
  | { readonly _tag: "Spawn" }

/**
 * True when the worker has no Assignment or its last one is terminal. A last Assignment that is not
 * in the loaded state, such as one from another branch, cannot be shown finished, so the worker
 * counts as busy.
 */
export const isIdle = (state: State, worker: Worker): boolean => {
  const lastId = worker.history.at(-1)
  if (lastId === undefined) return true
  const last = state.assignments.find((assignment) => assignment.id === lastId)
  return last !== undefined && isTerminal(last)
}

const intersects = (a: ReadonlyArray<string>, b: ReadonlyArray<string>) =>
  a.some((item) => b.includes(item))

const hasRelevantContext = (state: State, worker: Worker, next: Assignment): boolean => {
  const last = state.assignments.find((assignment) => assignment.id === worker.history.at(-1))
  if (last === undefined) return false
  return (
    next.metadata.related_assignments.includes(last.id) ||
    anyOverlap(next.metadata.ownership_paths, last.metadata.ownership_paths) ||
    intersects(next.metadata.symbols, last.metadata.symbols) ||
    intersects(next.metadata.domains, last.metadata.domains)
  )
}

const smallestId = (workers: ReadonlyArray<Worker>): Worker | undefined =>
  workers.toSorted((a, b) => (a.agent_id < b.agent_id ? -1 : 1))[0]

/**
 * Why a registered worker may not take the Assignment, or undefined when it may: it must be the
 * same specialist, one that does not run on Haiku, with an unchanged fingerprint and idle, and for
 * review work its whole history must be independent from the work under review. A Haiku specialist
 * always gets a new worker, since a follow-up rereads a context it has grown. Selection and binding
 * share this rule.
 */
export const reuseProblem = (
  state: State,
  worker: Worker,
  next: Assignment,
  fingerprint: string,
): string | undefined => {
  if (worker.preset !== next.role)
    return `${worker.agent_id} is a ${worker.preset}, not a ${next.role}`
  if (routeFor(next.role).model === "haiku")
    return `${next.role} runs on Haiku, so every Assignment gets a new worker`
  if (worker.fingerprint !== fingerprint)
    return `${worker.agent_id} was launched with a different roster or tools`
  if (!isIdle(state, worker))
    return `${worker.agent_id} is still working on ${worker.history.at(-1)}`
  if (
    routeFor(next.role).independence === "IndependentReview" &&
    intersects(worker.history, next.metadata.independent_from)
  )
    return `${worker.agent_id} worked on what this review must be independent from`
  return undefined
}

const reuse = (worker: Worker, reason: "RelevantContext" | "SameRole"): Selection => ({
  _tag: "Reuse",
  agent_id: worker.agent_id,
  reason,
})

/**
 * Picks a worker for a Ready Assignment among those {@link reuseProblem} accepts. Relevant retained
 * context wins, then the same role, with ties going to the smallest id; otherwise a new worker is
 * spawned.
 */
export const selectWorker = (state: State, input: SelectWorkerInput) =>
  Effect.gen(function* () {
    const next = yield* findAssignment(state, input.assignment_id)
    if (next.state !== "Ready") return yield* invalidTransition(next, "select a worker for")
    const candidates = state.workers.filter(
      (worker) => reuseProblem(state, worker, next, input.fingerprint) === undefined,
    )
    const relevant = smallestId(
      candidates.filter((worker) => hasRelevantContext(state, worker, next)),
    )
    if (relevant !== undefined) return reuse(relevant, "RelevantContext")
    const sameRole = smallestId(candidates)
    const selection: Selection =
      sameRole === undefined ? { _tag: "Spawn" } : reuse(sameRole, "SameRole")
    return selection
  })
