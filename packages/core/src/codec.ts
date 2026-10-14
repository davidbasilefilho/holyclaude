import { Effect, Schema } from "effect"

import { TooLarge } from "./errors.ts"

/** Largest MCP or CLI input accepted, in bytes. */
export const MAX_INPUT_BYTES = 64 * 1024

/** Largest state file read or written, in bytes. */
export const MAX_STATE_BYTES = 1024 * 1024

const strict = { onExcessProperty: "error" } as const

/** Decodes an unknown value, failing on excess properties. Domain rules come afterwards. */
export const decodeStrict = <S extends Schema.Decoder<unknown>>(schema: S) =>
  Schema.decodeUnknownEffect(schema, strict)

/** Decodes JSON text for a schema, failing on excess properties. */
export const decodeJsonStrict = <S extends Schema.Decoder<unknown>>(schema: S) =>
  Schema.decodeUnknownEffect(Schema.fromJsonString(schema), strict)

const byteLength = (text: string) => new TextEncoder().encode(text).byteLength

/** Fails with TooLarge when text exceeds the limit. */
export const withinLimit = (
  subject: string,
  text: string,
  limit: number,
): Effect.Effect<string, TooLarge> => {
  const bytes = byteLength(text)
  return bytes > limit ? Effect.fail(new TooLarge({ subject, bytes, limit })) : Effect.succeed(text)
}

/** Decodes a CLI or MCP input given as JSON text, enforcing the size cap first. */
export const decodeInput = <S extends Schema.Decoder<unknown>>(schema: S) => {
  const decode = decodeJsonStrict(schema)
  return (text: string) =>
    withinLimit("Input", text, MAX_INPUT_BYTES).pipe(Effect.flatMap((ok) => decode(ok)))
}
