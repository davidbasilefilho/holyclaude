import { join } from "node:path"

import { Effect } from "effect"

import { MAX_LEGACY_STATE_BYTES } from "./codec.ts"
import { CorruptRecord, MigratedFileInTheWay } from "./errors.ts"
import { moveFile, prependLines, readJson, removeFile } from "./files.ts"
import { io, readText } from "./io.ts"
import { legacyFile, legacyLockFiles, migratedFile, previousObservationsFile } from "./layout.ts"
import type { Lock } from "./lock.ts"
import { State, validateState } from "./model/state.ts"
import { loadRecordState, persist, recordTexts } from "./records.ts"
import { refuseSymlinks } from "./safety.ts"

/**
 * The single-file state of an earlier version, or undefined when there is none. Until it is
 * migrated it counts as state, so readers merge it with the record files.
 */
export const readLegacy = (directory: string) =>
  refuseSymlinks(directory, legacyFile(directory)).pipe(
    Effect.andThen(readJson(State, legacyFile(directory), MAX_LEGACY_STATE_BYTES)),
    Effect.flatMap((state) =>
      state === undefined ? Effect.succeed(undefined) : validateState(state),
    ),
  )

/**
 * The records of the old file together with record files already on disk, such as a teammate's
 * pulled from version control. The old file wins for an id both have; migration refuses that case
 * unless the two agree.
 */
export const mergeLegacy = (legacy: State, existing: State): State => {
  const known = <A extends { readonly id: string }>(own: ReadonlyArray<A>) =>
    new Set(own.map((record) => record.id))
  const intents = known(legacy.intents)
  const assignments = known(legacy.assignments)
  const workers = new Set(legacy.workers.map((worker) => worker.agent_id))
  return {
    version: 1,
    intents: [...legacy.intents, ...existing.intents.filter(({ id }) => !intents.has(id))],
    assignments: [
      ...legacy.assignments,
      ...existing.assignments.filter(({ id }) => !assignments.has(id)),
    ],
    workers: [
      ...legacy.workers,
      ...existing.workers.filter(({ agent_id }) => !workers.has(agent_id)),
    ],
  }
}

/**
 * An earlier version kept the observations log beside the state file; it now lives in `local/`. The
 * old lines are older than anything this version appended, so they go in front of the previous
 * generation of the log, which readers read first, and the log that hooks append to without the
 * lock is never rewritten. Where there is no previous generation the old file is simply moved, and
 * where there is one the two are streamed into a new file, so a log of any size is never loaded
 * whole. Both ends are checked for symbolic links before either is touched.
 */
const moveObservations = (directory: string, lock: Lock) => {
  const from = join(directory, "state.observations.jsonl")
  const to = previousObservationsFile(directory)
  return Effect.gen(function* () {
    yield* refuseSymlinks(directory, from)
    yield* refuseSymlinks(directory, to)
    if (!(yield* io(from, () => Bun.file(from).exists()))) return
    if (yield* io(to, () => Bun.file(to).exists())) {
      yield* prependLines(from, to, lock)
      yield* removeFile(from, lock)
    } else yield* moveFile(from, to, lock)
  })
}

/**
 * Turns an earlier version's `state.json` into record files: legacy ids are kept, agent ids and
 * workers go to the local files, and the old file is renamed to `state.json.migrated` (ignored by
 * version control) so it is not read again. The old lock files are removed last, under the new
 * lock. Record files already on disk stay; the ones the old file also has must agree with it, since
 * a record is never overwritten, and a disagreement is reported. A `state.json.migrated` already in
 * place is never overwritten either: when it holds the same text the old file is simply removed, as
 * after a migration that stopped before its last step, and when it differs the migration stops with
 * MigratedFileInTheWay before writing a record, because renaming over it would destroy a copy the
 * user may still need, and a suffixed name would not be covered by the folder's `.gitignore`.
 * Rewriting the same records is harmless, so a migration that stopped halfway finishes on the next
 * use.
 */
export const migrateLegacy = (directory: string, lock: Lock) =>
  Effect.gen(function* () {
    const legacy = yield* readLegacy(directory)
    if (legacy === undefined) return
    const migrated = migratedFile(directory)
    yield* refuseSymlinks(directory, migrated)
    const kept = yield* readText(migrated, MAX_LEGACY_STATE_BYTES)
    if (
      kept !== undefined &&
      kept !== (yield* readText(legacyFile(directory), MAX_LEGACY_STATE_BYTES))
    )
      return yield* new MigratedFileInTheWay({ path: migrated })
    const existing = yield* loadRecordState(directory)
    const incoming = yield* recordTexts(directory, legacy)
    for (const [path, text] of yield* recordTexts(directory, existing)) {
      const old = incoming.get(path)
      if (old !== undefined && old !== text)
        return yield* new CorruptRecord({
          path,
          reason: `it disagrees with ${legacyFile(directory)}; move one of them away`,
        })
    }
    yield* persist(directory, existing, mergeLegacy(legacy, existing), lock)
    yield* moveObservations(directory, lock)
    if (kept === undefined) yield* moveFile(legacyFile(directory), migrated, lock)
    else yield* removeFile(legacyFile(directory), lock)
    for (const file of legacyLockFiles(directory)) yield* removeFile(file, lock)
  })
