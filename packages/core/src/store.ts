import { mkdir, open, rename, rm, stat } from "node:fs/promises"
import { hostname } from "node:os"
import { basename, dirname, join } from "node:path"
import { Clock, Effect, Schedule, Schema } from "effect"
import { decodeJsonStrict, MAX_STATE_BYTES, withinLimit } from "./codec.ts"
import { LockLost, StateIo, StateLocked, TooLarge } from "./errors.ts"
import { emptyState, State, validateState, type Change } from "./model/state.ts"
import { Text } from "./model/primitives.ts"

const LOCK_STALE_MS = 30_000
const STORE_DIRECTORY = ".holyclaude"

/** The project root: CLAUDE_PROJECT_DIR, else the working directory. */
export const projectRoot = (env: NodeJS.ProcessEnv = process.env): string =>
  env["CLAUDE_PROJECT_DIR"] || process.cwd()

/** The state file: HOLYCLAUDE_STATE_FILE, else `<projectRoot>/.holyclaude/state.json`. */
export const stateFilePath = (env: NodeJS.ProcessEnv = process.env): string =>
  env["HOLYCLAUDE_STATE_FILE"] || join(projectRoot(env), STORE_DIRECTORY, "state.json")

const attempt = <A>(run: () => Promise<A>) =>
  Effect.tryPromise({ try: run, catch: (cause) => cause })

const io = <A>(path: string, run: () => Promise<A>) =>
  attempt(run).pipe(Effect.mapError((cause) => new StateIo({ path, cause })))

const hasCode = (cause: unknown, code: string) =>
  typeof cause === "object" && cause !== null && "code" in cause && cause.code === code

/**
 * Like `attempt`, but retries briefly on EPERM and EBUSY. Windows reports them while another
 * process has the file open (a reader, or a lock being deleted) and they clear within milliseconds;
 * every other code fails at once.
 */
const attemptTransient = <A>(run: () => Promise<A>) =>
  attempt(run).pipe(
    Effect.retry({
      schedule: Schedule.exponential("5 millis", 2),
      times: 4,
      while: (cause) => hasCode(cause, "EPERM") || hasCode(cause, "EBUSY"),
    }),
  )

/**
 * Decodes state JSON and checks its domain rules. Loading and writing share it, so nothing is
 * written that could not be read back.
 */
const parseState = (text: string) =>
  decodeJsonStrict(State)(text).pipe(Effect.flatMap(validateState))

/** Reads and validates the state without locking. A missing file is the empty state. */
export const loadState = (path: string) =>
  Effect.gen(function* () {
    const file = Bun.file(path)
    if (!(yield* io(path, () => file.exists()))) return emptyState
    if (file.size > MAX_STATE_BYTES)
      return yield* new TooLarge({ subject: path, bytes: file.size, limit: MAX_STATE_BYTES })
    const text = yield* io(path, () => file.text())
    return yield* parseState(text)
  })

const keepOutOfVersionControl = (directory: string) => {
  const ignore = Bun.file(join(directory, ".gitignore"))
  return basename(directory) === STORE_DIRECTORY
    ? io(directory, () => ignore.exists()).pipe(
        Effect.flatMap((exists) =>
          exists ? Effect.void : io(directory, () => Bun.write(ignore, "*\n")),
        ),
      )
    : Effect.void
}

/** Who holds a lock file. The token tells a holder's lock from a successor's. */
const LockOwner = Schema.Struct({
  pid: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  host: Text,
  token: Text,
  acquired_at: Schema.Int,
})
type LockOwner = typeof LockOwner.Type

const lockPath = (path: string) => `${path}.lock`

/** The owner recorded in a lock file; undefined when the file is missing, unreadable or malformed. */
const readOwner = (file: string) =>
  attempt(() => Bun.file(file).text()).pipe(
    Effect.flatMap(decodeJsonStrict(LockOwner)),
    Effect.orElseSucceed((): LockOwner | undefined => undefined),
  )

const ownsFile = (file: string, token: string) =>
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
const releaseIfOwned = (file: string, token: string) =>
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

/** Takes the state lock, retrying with backoff. Resolves to the token that proves ownership. */
const acquireLock = (path: string) => {
  const lockFile = lockPath(path)
  const create = claim(lockFile).pipe(
    Effect.mapError((cause) =>
      hasCode(cause, "EEXIST") ? new StateLocked({ lockFile }) : new StateIo({ path, cause }),
    ),
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
 * Writes the state to a temporary file and renames it into place; a failure leaves no temp file.
 * The state is decoded and validated as loading would first, so an invalid one is never written.
 */
const writeState = (path: string, state: State, token: string) =>
  Effect.gen(function* () {
    const lockFile = lockPath(path)
    const encoded = yield* Schema.encodeEffect(State)(state)
    const json = yield* withinLimit(path, `${JSON.stringify(encoded, null, 2)}\n`, MAX_STATE_BYTES)
    yield* parseState(json)
    const temporary = `${path}.${process.pid}.${crypto.randomUUID()}.tmp`
    // Before the commit, so a failure here never reports an error for committed state.
    yield* keepOutOfVersionControl(dirname(path))
    // The lock may have been broken while this writer was paused; committing then could overwrite a
    // successor's state, so the commit is abandoned unless the lock is still this writer's.
    const commit = Effect.gen(function* () {
      if (!(yield* ownsFile(lockFile, token))) return yield* new LockLost({ lockFile })
      yield* attemptTransient(() => rename(temporary, path)).pipe(
        Effect.mapError((cause) => new StateIo({ path, cause })),
      )
    })
    yield* io(path, () => Bun.write(temporary, json)).pipe(
      Effect.andThen(commit),
      Effect.tapError(() => attempt(() => rm(temporary, { force: true })).pipe(Effect.ignore)),
    )
  })

/**
 * Applies a pure transition under the state lock: lock, reload, transition, then write a temporary
 * file and rename it over the state, provided the lock still carries this writer's token. A
 * transition that returns the same state writes nothing.
 */
export const updateState = <A, E>(
  path: string,
  transition: (state: State) => Effect.Effect<Change<A>, E>,
) =>
  Effect.acquireUseRelease(
    io(path, () => mkdir(dirname(path), { recursive: true })).pipe(
      Effect.andThen(acquireLock(path)),
    ),
    (token) =>
      Effect.gen(function* () {
        const before = yield* loadState(path)
        const { state, value } = yield* transition(before)
        if (state !== before) yield* writeState(path, state, token)
        return value
      }),
    (token) => releaseIfOwned(lockPath(path), token),
  )
