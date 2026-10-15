import { Effect, Schema } from "effect"

import { commitFile, encodeJson, readJson } from "./files.ts"
import { localFile } from "./layout.ts"
import type { Lock } from "./lock.ts"
import { AssignmentId, CloneId, compareIds, newId } from "./model/ids.ts"
import { Id } from "./model/primitives.ts"
import type { State } from "./model/state.ts"
import { Worker } from "./model/worker.ts"
import { refuseSymlinks } from "./safety.ts"

// Machine-local state: files under `local/` that never leave this clone. They hold what means
// nothing on another machine, such as the ids of Claude subagents and the id of this clone.

const WorkersFile = Schema.Struct({ workers: Schema.Array(Worker) })
/** Subagent ids keyed by Assignment id. They name agents of one session on one machine. */
const AgentsFile = Schema.Record(AssignmentId, Id)
const CloneFile = Schema.Struct({ clone_id: CloneId })

const workersPath = (directory: string) => localFile(directory, "workers.json")
const agentsPath = (directory: string) => localFile(directory, "agents.json")
const clonePath = (directory: string) => localFile(directory, "clone.json")

const readLocal = <S extends Schema.Decoder<unknown>>(
  schema: S,
  directory: string,
  path: string,
  limit?: number,
) => refuseSymlinks(directory, path).pipe(Effect.andThen(readJson(schema, path, limit)))

/** The worker list of this clone; empty when none was written. A file over `limit` is TooLarge. */
export const readWorkers = (directory: string, limit?: number) =>
  readLocal(WorkersFile, directory, workersPath(directory), limit).pipe(
    Effect.map((file) => file?.workers ?? []),
  )

/**
 * The agent id of each Assignment this clone bound one to, keyed by Assignment id. A file over
 * `limit` is TooLarge.
 */
export const readAgents = (directory: string, limit?: number) =>
  readLocal(AgentsFile, directory, agentsPath(directory), limit).pipe(
    Effect.map((file) => file ?? {}),
  )

/**
 * The id of this clone, or undefined when it never reserved anything. A reader that finds none
 * knows no row was stamped by it, so reading never creates the file.
 */
export const readCloneId = (directory: string) =>
  readLocal(CloneFile, directory, clonePath(directory)).pipe(Effect.map((file) => file?.clone_id))

/**
 * The id of this clone, created on first use. Call it under the lock, so that two writers that both
 * find none cannot each make one.
 */
export const ensureCloneId = (directory: string, lock: Lock) =>
  Effect.gen(function* () {
    const existing = yield* readCloneId(directory)
    if (existing !== undefined) return existing
    const created = yield* newId("clone")
    const content = yield* encodeJson(CloneFile, { clone_id: created })
    yield* commitFile(clonePath(directory), content, lock)
    return created
  })

/**
 * Stamps this clone's id on every Assignment that enters Running in the change, so that a clone
 * reading the row later can tell whose reservation it is. A transition stays pure; the store adds
 * the stamp when it writes. The id is only asked for when a row needs it.
 */
export const stampClone = <E>(cloneId: Effect.Effect<string, E>, before: State, after: State) => {
  const wasRunning = new Set(
    before.assignments.filter((row) => row.state === "Running").map((row) => row.id),
  )
  const entering = new Set(
    after.assignments
      .filter((row) => row.state === "Running" && !wasRunning.has(row.id))
      .map((row) => row.id),
  )
  return entering.size === 0
    ? Effect.succeed(after)
    : cloneId.pipe(
        Effect.map((own): State => ({
          ...after,
          assignments: after.assignments.map((row) =>
            entering.has(row.id) ? { ...row, clone_id: own } : row,
          ),
        })),
      )
}

const sortedKeys = (agents: Readonly<Record<string, string>>) =>
  Object.fromEntries(Object.entries(agents).toSorted(([a], [b]) => compareIds(a, b)))

/**
 * Writes the worker list and the agent ids when they changed. Agent ids already stored for
 * Assignments that are not in this state stay: they belong to rows on other branches.
 */
export const writeLocal = (directory: string, before: State, after: State, lock: Lock) =>
  Effect.gen(function* () {
    const workersFile = workersPath(directory)
    const workers = yield* encodeJson(WorkersFile, after)
    const workersBefore = yield* encodeJson(WorkersFile, before)
    if (workers !== workersBefore) yield* commitFile(workersFile, workers, lock)

    const agentsFile = agentsPath(directory)
    const stored = yield* readAgents(directory)
    const bound = after.assignments.flatMap((row) =>
      row.agent_id === null ? [] : [[row.id, row.agent_id] as const],
    )
    const merged = sortedKeys({ ...stored, ...Object.fromEntries(bound) })
    const agents = yield* encodeJson(AgentsFile, merged)
    const agentsBefore = yield* encodeJson(AgentsFile, sortedKeys(stored))
    if (agents !== agentsBefore) yield* commitFile(agentsFile, agents, lock)
  })
