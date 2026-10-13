import { Schema } from "effect"
import { Revision, Text } from "./primitives.ts"

/**
 * The root's evidence review of one Succeeded Assignment. The runtime checks that the maps cover
 * exactly the declared labels; the root judges whether the evidence is true.
 */
export const AcceptanceRecord = Schema.Struct({
  intent_revision: Revision,
  rationale: Text,
  criteria_evidence: Schema.Record(Text, Text),
  required_evidence: Schema.Record(Text, Text),
})
/** An acceptance record. */
export type AcceptanceRecord = typeof AcceptanceRecord.Type
