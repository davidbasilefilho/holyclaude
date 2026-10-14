import { Effect } from "effect"

import { nowIso } from "../clock.ts"
import { appendObservation, readObservations, seenOf, type Seen } from "../observations.ts"

const OBSERVATION_BUDGET = "750 millis"

/** What a hook payload showed of an agent; an absent or empty field is not recorded. */
export type Sighting = { readonly [K in keyof Seen]?: string | undefined }

/**
 * Appends what a hook saw of an agent, unless the log already holds every field of it. Best effort:
 * a failure, or running past a short bound, is dropped so that observing never holds up a tool call
 * or an agent's start or stop.
 */
export const observe = (agentId: string, sighting: Sighting) =>
  Effect.gen(function* () {
    const seen: Seen = {
      ...(sighting.agent_type ? { agent_type: sighting.agent_type } : {}),
      ...(sighting.effort ? { effort: sighting.effort } : {}),
      ...(sighting.transcript ? { transcript: sighting.transcript } : {}),
    }
    const known = seenOf(yield* readObservations(), agentId)
    const keys = Object.keys(seen) as Array<keyof Seen>
    if (keys.every((key) => seen[key] === known[key])) return
    yield* appendObservation({
      kind: "observed",
      agent_id: agentId,
      ...seen,
      at: yield* nowIso,
    })
  }).pipe(
    Effect.timeout(OBSERVATION_BUDGET),
    Effect.catchCause(() => Effect.void),
  )
