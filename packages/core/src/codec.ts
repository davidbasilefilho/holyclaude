import { Schema } from "effect"

/** Largest `.gitignore` read from the state folder, in bytes. */
export const MAX_GITIGNORE_BYTES = 256 * 1024

/**
 * Size past which the observations log is rotated, in bytes. The log is appended to on every
 * specialist tool call and read on the next, so a log that follows the rotation stays near this
 * size per generation.
 */
export const OBSERVATIONS_ROTATE_BYTES = 1024 * 1024

/**
 * Most of one observations generation that a read takes, from its end, in bytes. A legitimate
 * generation is near {@link OBSERVATIONS_ROTATE_BYTES}, so this bound never drops its records; it
 * guards the hooks against a log that a repository supplied, or one that grew past its rotation.
 */
export const OBSERVATIONS_READ_BYTES = 4 * 1024 * 1024

/** Largest legacy single-file state read for migration, in bytes. */
export const MAX_LEGACY_STATE_BYTES = 1024 * 1024

const strict = { onExcessProperty: "error" } as const

/** Decodes an unknown value, failing on excess properties. Domain rules come afterwards. */
export const decodeStrict = <S extends Schema.Decoder<unknown>>(schema: S) =>
  Schema.decodeUnknownEffect(schema, strict)

/** Decodes JSON text for a schema, failing on excess properties. */
export const decodeJsonStrict = <S extends Schema.Decoder<unknown>>(schema: S) =>
  Schema.decodeUnknownEffect(Schema.fromJsonString(schema), strict)
