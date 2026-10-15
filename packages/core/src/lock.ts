import { open, rm, stat } from "node:fs/promises"
import { hostname } from "node:os"

import { Clock, Effect, Schedule, Schema } from "effect"

import { decodeJsonStrict } from "./codec.ts"
import { StateIo, StateLocked } from "./errors.ts"
import { attempt, attemptTransient, hasCode, readText } from "./io.ts"
import { ensureLocalDirectory, lockFile } from "./layout.ts"
import { Text } from "./model/primitives.ts"
import { refuseSymlinks } from "./safety.ts"

const LOCK_STALE_MS = 30_000

/** Largest lock or guard file read, in bytes. An owner record is well under 1 KiB. */
const MAX_OWNER_BYTES = 4 * 1024

/** Who holds a lock file. The token tells a holder's lock from a successor's. */
const LockOwner = Schema.Struct({
  pid: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  host: Text,
  token: Text,
  acquired_at: Schema.Int,
})
type LockOwner = typeof LockOwner.Type

/**
 * The owner recorded in a lock file; undefined when the file is missing, unreadable, malformed or
 * over the owner cap. The read is capped, so a planted file cannot make every writer load it.
 */
const readOwner = (file: string) =>
  readText(file, MAX_OWNER_BYTES).pipe(
    Effect.flatMap((text) =>
      text === undefined ? Effect.succeed(undefined) : decodeJsonStrict(LockOwner)(text),
    ),
    Effect.orElseSucceed((): LockOwner | undefined => undefined),
  )

/** Whether the lock or guard file still carries the token, so it is still this holder's. */
export const ownsFile = (file: string, token: string) =>
  readOwner(file).pipe(Effect.map((owner) => owner?.token === token))

/** EPERM still means the process exists; only ESRCH proves it is gone. */
const processAlive = (pid: number) =>
  Effect.try({ try: () => process.kill(pid, 0), catch: (cause) => cause }).pipe(
    Effect.as(true),
    Effect.catch((cause) => Effect.succeed(!hasCode(cause, "ESRCH"))),
  )

/**
 * Whether a lock or guard file is stale, given the owner record read from it. The owner is provably
 * gone when it ran on this host and its pid is dead. Age decides only when the owner cannot be
 * checked (another host, or a record that is missing, unreadable or malformed), so a paused but
 * live holder keeps its lock.
 */
const isStale = (file: string, owner: LockOwner | undefined) =>
  Effect.gen(function* () {
    if (owner !== undefined && owner.host === hostname()) return !(yield* processAlive(owner.pid))
    const { mtimeMs } = yield* attempt(() => stat(file))
    return (yield* Clock.currentTimeMillis) - mtimeMs > LOCK_STALE_MS
  })

/** Creates a file that must not exist yet, holding the content. A failed write removes the file. */
const createExclusively = (file: string, content: string) =>
  attemptTransient(() => open(file, "wx")).pipe(
    Effect.flatMap((handle) =>
      attempt(() => handle.writeFile(content)).pipe(
        Effect.tapError(() => attempt(() => rm(file, { force: true })).pipe(Effect.ignore)),
        Effect.ensuring(attempt(() => handle.close()).pipe(Effect.ignore)),
      ),
    ),
  )

/** Creates a lock or guard file recording this process as its owner. Resolves to the token. */
const claim = (file: string) =>
  Effect.gen(function* () {
    const owner: LockOwner = {
      pid: process.pid,
      host: hostname(),
      token: crypto.randomUUID(),
      acquired_at: yield* Clock.currentTimeMillis,
    }
    const content = yield* Schema.encodeEffect(Schema.fromJsonString(LockOwner))(owner).pipe(
      Effect.orDie,
    )
    yield* createExclusively(file, content)
    return owner.token
  })

/** Removes a lock or guard file, but only while it still carries the token. Never fails. */
export const releaseIfOwned = (file: string, token: string) =>
  ownsFile(file, token).pipe(
    Effect.flatMap((owns) => (owns ? attempt(() => rm(file, { force: true })) : Effect.void)),
    Effect.ignore,
  )

/**
 * Removes a stale file, but only the instance that was judged stale. Resolves to whether it did;
 * never fails.
 *
 * The token is read again after the verdict, and the file is removed only if it is unchanged. That
 * order is what makes the removal safe: a dead owner can no longer release, and a new lock cannot
 * be created while this one exists, so the judged instance is still in place when removed unless a
 * breaker takes it (the lock's guard keeps those out). A holder that released and exited between
 * the first read and the verdict leaves nothing, or its successor's token, and neither is removed.
 * An age verdict has no such guarantee, only the re-read.
 */
const removeIfStale = (file: string) =>
  Effect.gen(function* () {
    const judged = yield* readOwner(file)
    if (!(yield* isStale(file, judged))) return false
    if ((yield* readOwner(file))?.token !== judged?.token) return false
    yield* attempt(() => rm(file))
    return true
  }).pipe(Effect.orElseSucceed(() => false))

/**
 * Removes the lock when it is stale (see {@link isStale} and {@link removeIfStale}). Only the process
 * that creates the `.breaking` guard may break it, so breakers do not race one another, and only
 * the instance judged stale is removed, so a lock taken by someone else afterwards survives. A
 * guard left by a crashed breaker goes stale by the same rule and is removed; that attempt breaks
 * nothing and the retry claims the guard normally. Resolves to whether this call removed the lock.
 */
export const breakStaleLock = (lockFile: string) => {
  const guard = `${lockFile}.breaking`
  return Effect.acquireUseRelease(
    claim(guard),
    () => removeIfStale(lockFile),
    (token) => releaseIfOwned(guard, token),
  ).pipe(Effect.catch(() => removeIfStale(guard).pipe(Effect.as(false))))
}

/**
 * Proof that this writer holds the state lock: the state directory it guards, the lock file and the
 * token the file carries.
 */
export interface Lock {
  readonly directory: string
  readonly file: string
  readonly token: string
}

/** Takes the state lock, retrying with backoff. Resolves to the proof of ownership. */
export const acquireLock = (directory: string, lockFile: string) => {
  const create = claim(lockFile).pipe(
    Effect.mapError((cause) =>
      hasCode(cause, "EEXIST")
        ? new StateLocked({ lockFile })
        : new StateIo({ path: lockFile, cause }),
    ),
    Effect.map((token): Lock => ({ directory, file: lockFile, token })),
  )
  return create.pipe(
    Effect.catchTag("StateLocked", (locked) =>
      breakStaleLock(lockFile).pipe(Effect.andThen(Effect.fail(locked))),
    ),
    Effect.retry({
      schedule: Schedule.exponential("10 millis", 1.5),
      times: 15,
      while: (error) => error._tag === "StateLocked",
    }),
  )
}

/**
 * Runs `use` while holding the state lock of the directory, and releases the lock afterwards
 * whatever the outcome. The lock file and its guard are checked for symbolic links before anything
 * is created, and the `local/` folder that holds them is made when it is missing, with its own
 * `.gitignore`.
 */
export const withStateLock = <A, E, R>(
  directory: string,
  use: (lock: Lock) => Effect.Effect<A, E, R>,
) => {
  const file = lockFile(directory)
  return Effect.acquireUseRelease(
    refuseSymlinks(directory, `${file}.breaking`).pipe(
      Effect.andThen(refuseSymlinks(directory, file)),
      Effect.andThen(ensureLocalDirectory(directory)),
      Effect.andThen(acquireLock(directory, file)),
    ),
    use,
    (lock) => releaseIfOwned(lock.file, lock.token),
  )
}
