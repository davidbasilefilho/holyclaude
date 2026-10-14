import { Effect, Schedule } from "effect"

import { StateIo, TooLarge } from "./errors.ts"

/** Runs a promise as an effect whose failure is the raw cause. */
export const attempt = <A>(run: () => Promise<A>) =>
  Effect.tryPromise({ try: run, catch: (cause) => cause })

/** Runs a file operation, reporting a failure as StateIo for the path. */
export const io = <A>(path: string, run: () => Promise<A>) =>
  attempt(run).pipe(Effect.mapError((cause) => new StateIo({ path, cause })))

/** True when the cause is a system error with the given code. */
export const hasCode = (cause: unknown, code: string) =>
  typeof cause === "object" && cause !== null && "code" in cause && cause.code === code

/**
 * Like `attempt`, but retries briefly on EPERM and EBUSY. Windows reports them while another
 * process has the file open (a reader, or a lock being deleted) and they clear within milliseconds;
 * every other code fails at once.
 */
export const attemptTransient = <A>(run: () => Promise<A>) =>
  attempt(run).pipe(
    Effect.retry({
      schedule: Schedule.exponential("5 millis", 2),
      times: 4,
      while: (cause) => hasCode(cause, "EPERM") || hasCode(cause, "EBUSY"),
    }),
  )

/**
 * Reads a file as text. A missing file reads as undefined; a file over the limit is TooLarge. The
 * read itself stops one byte past the limit, so a file that grows after its size was taken, or one
 * whose size the system does not report, is never read whole. It does not look for symbolic links,
 * so call `refuseSymlinks` first.
 */
export const readText = (path: string, limit: number) =>
  Effect.gen(function* () {
    const file = Bun.file(path)
    if (!(yield* io(path, () => file.exists()))) return undefined
    if (file.size > limit) return yield* new TooLarge({ subject: path, bytes: file.size, limit })
    const bytes = yield* io(path, () => file.slice(0, limit + 1).bytes())
    if (bytes.byteLength > limit)
      return yield* new TooLarge({ subject: path, bytes: bytes.byteLength, limit })
    return new TextDecoder().decode(bytes)
  })
