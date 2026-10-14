import { mkdir } from "node:fs/promises"
import { dirname } from "node:path"

import { Effect } from "effect"

import { io } from "./io.ts"
import { keepLocalFilesOutOfVersionControl, lockFile } from "./layout.ts"
import { mergeLegacy, migrateLegacy, readLegacy } from "./legacy.ts"
import { ensureCloneId, stampClone } from "./local.ts"
import { acquireLock, releaseIfOwned } from "./lock.ts"
import type { Change, State } from "./model/state.ts"
import { loadRecordState, persist } from "./records.ts"
import { refuseSymlinks } from "./safety.ts"

/**
 * Reads and validates the project state without locking: one file per record, plus the local worker
 * list and agent ids. A directory with nothing in it is the empty state. A state file of an earlier
 * version that is still waiting to be migrated is read together with the record files.
 */
export const loadState = (directory: string) =>
  Effect.gen(function* () {
    const legacy = yield* readLegacy(directory)
    const existing = yield* loadRecordState(directory)
    return legacy === undefined ? existing : mergeLegacy(legacy, existing)
  })

/** What a transition can ask the store for while it holds the lock. */
export interface UpdateContext {
  /**
   * The id of this clone, created on first use. Reading it inside the transition, under the lock,
   * keeps two first-time writers from each making one.
   */
  readonly cloneId: ReturnType<typeof ensureCloneId>
}

/**
 * Applies a pure transition under the state lock: lock, migrate an earlier version's file when one
 * is there, reload, transition, then write only the records the transition changed, each through a
 * temporary file and a rename, provided the lock still carries this writer's token. A transition
 * that returns the same state writes nothing. Nothing is written through a symbolic link.
 */
export const updateState = <A, E>(
  directory: string,
  transition: (state: State, context: UpdateContext) => Effect.Effect<Change<A>, E>,
) =>
  Effect.acquireUseRelease(
    refuseSymlinks(directory, `${lockFile(directory)}.breaking`).pipe(
      Effect.andThen(refuseSymlinks(directory, lockFile(directory))),
      Effect.andThen(io(directory, () => mkdir(dirname(lockFile(directory)), { recursive: true }))),
      Effect.andThen(acquireLock(directory, lockFile(directory))),
    ),
    (lock) =>
      Effect.gen(function* () {
        // Before any write, so a failure never reports an error for committed state. The list
        // covers an earlier version's files too, so it is safe in front of a migration.
        yield* keepLocalFilesOutOfVersionControl(directory)
        yield* migrateLegacy(directory, lock)
        const before = yield* loadRecordState(directory)
        const cloneId = ensureCloneId(directory, lock)
        const { state, value } = yield* transition(before, { cloneId })
        if (state !== before)
          yield* persist(directory, before, yield* stampClone(cloneId, before, state), lock)
        return value
      }),
    (lock) => releaseIfOwned(lock.file, lock.token),
  )
