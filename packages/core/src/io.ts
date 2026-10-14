import { Effect, Schedule } from "effect"

import { StateIo } from "./errors.ts"

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
