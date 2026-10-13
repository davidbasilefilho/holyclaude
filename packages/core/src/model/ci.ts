import { Schema } from "effect"

/** Aggregate CI state. Pending and Unknown are never success. Declared as data only. */
export const CiGate = Schema.Literals(["Pending", "Passed", "Failed", "Unknown"])
/** One CI gate state. */
export type CiGate = typeof CiGate.Type
