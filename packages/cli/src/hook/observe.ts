import { Effect } from "effect"

import { nowIso } from "../clock.ts"
import { PLUGIN_NAME } from "../fingerprint.ts"
import { appendObservation, readObservations, seenOf, type Seen } from "../observations.ts"

const OBSERVATION_BUDGET = "750 millis"

/** What a hook payload showed of an agent; an absent or empty field is not recorded. */
export type Sighting = { readonly [K in keyof Seen]?: string | undefined }

/**
 * Appends what a hook saw of an agent, unless the log already holds every field of it. Only
 * holyclaude specialists (`agent_type` of `holyclaude:<Role.task>`) are recorded, since only they
 * feed `assignment verify` and the independence rule; any other agent leaves no trace, and so never
 * creates the state directory in a repository that does not use holyclaude. A payload with no agent
 * type is a specialist's when the log already holds the type its start recorded. Best effort: a
 * failure, or running past a short bound, is dropped so that observing never holds up a tool call
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
    if (!(sighting.agent_type || known.agent_type)?.startsWith(`${PLUGIN_NAME}:`)) return
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
