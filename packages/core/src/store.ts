import { mkdir, open, rename, rm, stat } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import { Clock, Effect, Schedule, Schema } from "effect"
import { decodeJsonStrict, MAX_STATE_BYTES, withinLimit } from "./codec.ts"
import { StateIo, StateLocked, TooLarge } from "./errors.ts"
import { emptyState, State, validateState, type Change } from "./model/state.ts"

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

/** Reads and validates the state without locking. A missing file is the empty state. */
export const loadState = (path: string) =>
  Effect.gen(function* () {
    const file = Bun.file(path)
    if (!(yield* io(path, () => file.exists()))) return emptyState
    if (file.size > MAX_STATE_BYTES)
      return yield* new TooLarge({ subject: path, bytes: file.size, limit: MAX_STATE_BYTES })
    const text = yield* io(path, () => file.text())
    return yield* decodeJsonStrict(State)(text).pipe(Effect.flatMap(validateState))
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

/** Writes the state to a temporary file and renames it into place; a failure leaves no temp file. */
const writeState = (path: string, state: State) =>
  Effect.gen(function* () {
    const encoded = yield* Schema.encodeEffect(State)(state)
    const json = yield* withinLimit(path, `${JSON.stringify(encoded, null, 2)}\n`, MAX_STATE_BYTES)
    const temporary = `${path}.${process.pid}.${crypto.randomUUID()}.tmp`
    // Before the commit, so a failure here never reports an error for committed state.
    yield* keepOutOfVersionControl(dirname(path))
    yield* io(path, () => Bun.write(temporary, json)).pipe(
      Effect.andThen(io(path, () => rename(temporary, path))),
      Effect.tapError(() => attempt(() => rm(temporary, { force: true })).pipe(Effect.ignore)),
    )
  })

const createExclusively = (file: string) =>
  attempt(() => open(file, "wx")).pipe(Effect.flatMap((handle) => attempt(() => handle.close())))

/** Removes a file older than the stale threshold. Resolves to whether it did; never fails. */
const removeIfStale = (file: string) =>
  Effect.gen(function* () {
    const { mtimeMs } = yield* attempt(() => stat(file))
    const age = (yield* Clock.currentTimeMillis) - mtimeMs
    if (age <= LOCK_STALE_MS) return false
    yield* attempt(() => rm(file))
    return true
  }).pipe(Effect.orElseSucceed(() => false))

/**
 * Removes the lock when it is older than the stale threshold. Only the process that creates the
 * `.breaking` guard may break it, and it re-checks the age under the guard, so one stale lock has
 * exactly one breaker and a lock freshly taken by someone else is never removed. A guard left by a
 * crashed breaker is itself removed once stale; that attempt breaks nothing and the retry claims
 * the guard normally. Resolves to whether this call removed the lock.
 */
export const breakStaleLock = (lockFile: string) => {
  const guard = `${lockFile}.breaking`
  return Effect.acquireUseRelease(
    createExclusively(guard),
    () => removeIfStale(lockFile),
    () => attempt(() => rm(guard, { force: true })).pipe(Effect.ignore),
  ).pipe(Effect.catch(() => removeIfStale(guard).pipe(Effect.as(false))))
}

const acquireLock = (path: string) => {
  const lockFile = `${path}.lock`
  const create = createExclusively(lockFile).pipe(
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

const releaseLock = (path: string) =>
  io(path, () => rm(`${path}.lock`, { force: true })).pipe(Effect.ignore)

/**
 * Applies a pure transition under the state lock: lock, reload, transition, then write a temporary
 * file and rename it over the state. A transition that returns the same state writes nothing.
 */
export const updateState = <A, E>(
  path: string,
  transition: (state: State) => Effect.Effect<Change<A>, E>,
) =>
  Effect.acquireUseRelease(
    io(path, () => mkdir(dirname(path), { recursive: true })).pipe(
      Effect.andThen(acquireLock(path)),
    ),
    () =>
      Effect.gen(function* () {
        const before = yield* loadState(path)
        const { state, value } = yield* transition(before)
        if (state !== before) yield* writeState(path, state)
        return value
      }),
    () => releaseLock(path),
  )
