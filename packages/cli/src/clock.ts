import { Clock, Effect } from "effect"

/** The current time as an ISO string, read from the Effect clock. */
export const nowIso = Clock.currentTimeMillis.pipe(Effect.map((ms) => new Date(ms).toISOString()))
