import { encode } from "@toon-format/toon"

/** Encodes model-facing output as TOON, with a trailing newline. */
export const toon = (value: unknown): string => `${encode(value)}\n`
