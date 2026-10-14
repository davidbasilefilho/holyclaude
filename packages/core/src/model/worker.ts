import { Schema } from "effect"

import { Id, Text } from "./primitives.ts"
import { Role } from "./routes.ts"

/** A spawned agent the root can reuse by SendMessage. */
export const Worker = Schema.Struct({
  agent_id: Id,
  preset: Role,
  /** Fingerprint of the roster and tools the agent was launched with. */
  fingerprint: Text,
  /** Assignment ids in the order they were bound. */
  history: Schema.Array(Id),
})
/** A registry entry for one worker. */
export type Worker = typeof Worker.Type
