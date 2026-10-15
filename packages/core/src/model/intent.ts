import { Effect, Schema } from "effect"

import { IntentId } from "./ids.ts"
import { StoredRevision, Text } from "./primitives.ts"

/** Whether an Intent still authorizes work. */
export const IntentState = Schema.Literals(["open", "closed"])
/** One Intent state. */
export type IntentState = typeof IntentState.Type

/**
 * The user's accepted task. The revision bumps only on a material change, and when a closed Intent
 * is reopened. A record without a `state` reads as open; a closed one carries the reason and the
 * time it was closed.
 */
export const Intent = Schema.Struct({
  id: IntentId,
  objective: Text,
  requirements: Schema.String,
  revision: StoredRevision,
  state: IntentState.pipe(Schema.withDecodingDefaultKey(Effect.succeed("open" as const))),
  close_reason: Schema.optionalKey(Text),
  closed_at: Schema.optionalKey(Schema.String),
})
/** An accepted task with its live revision. */
export type Intent = typeof Intent.Type
