import { Schema } from "effect"

import { Id, StoredRevision, Text } from "./primitives.ts"

/** The user's accepted task. The revision bumps only on a material change. */
export const Intent = Schema.Struct({
  id: Id,
  objective: Text,
  requirements: Schema.String,
  revision: StoredRevision,
})
/** An accepted task with its live revision. */
export type Intent = typeof Intent.Type
