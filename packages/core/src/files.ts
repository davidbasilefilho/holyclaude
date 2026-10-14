// `rename` is the one node: import kept. Bun has no rename or move API, and the atomic replace of
// a record file is what makes a write all-or-nothing. Everything else here is Bun: Bun.file reads
// and deletes, and Bun.write makes the missing directories.
import { rename } from "node:fs/promises"

import { Effect, Schema } from "effect"

import { decodeJsonStrict, MAX_RECORD_BYTES, withinLimit } from "./codec.ts"
import { CorruptRecord, LockLost, StateIo } from "./errors.ts"
import { attempt, attemptTransient, hasCode, io, readText } from "./io.ts"
import { ownsFile, type Lock } from "./lock.ts"
import { refuseSymlinks } from "./safety.ts"

/** The text after the first line break, so it starts on a whole line; none when there is no break. */
const fromNextLine = (text: string) => {
  const at = text.indexOf("\n")
  return at === -1 ? "" : text.slice(at + 1)
}

/**
 * The newest whole lines of a text that fit in the limit, in bytes. A text within the limit comes
 * back as it is; otherwise the oldest lines go, and the line the cut falls in goes with them.
 */
export const keepNewestLines = (text: string, limit: number) => {
  const bytes = new TextEncoder().encode(text)
  // One byte before the cut is kept too, so a line that starts exactly at the cut survives.
  return bytes.byteLength <= limit
    ? text
    : fromNextLine(new TextDecoder().decode(bytes.subarray(bytes.byteLength - limit - 1)))
}

/**
 * Reads the newest whole lines of a file that fit in the limit, in bytes, without reading the rest:
 * a log over the limit loses its oldest lines rather than failing. A missing file reads as
 * undefined. It does not look for symbolic links, so call {@link refuseSymlinks} first.
 */
export const readNewestLines = (path: string, limit: number) =>
  Effect.gen(function* () {
    const file = Bun.file(path)
    if (!(yield* io(path, () => file.exists()))) return undefined
    const size = file.size
    if (size <= limit) return yield* readText(path, limit)
    const bytes = yield* io(path, () => file.slice(size - limit - 1, size).bytes())
    return fromNextLine(new TextDecoder().decode(bytes))
  })

/**
 * Reads and strictly decodes a JSON file. A missing file reads as undefined. A file that is not
 * valid JSON for the schema is reported as CorruptRecord with the path, so the user is pointed at
 * the file and not at the input of the command.
 */
export const readJson = <S extends Schema.Decoder<unknown>>(
  schema: S,
  path: string,
  limit: number = MAX_RECORD_BYTES,
) =>
  readText(path, limit).pipe(
    Effect.flatMap((text) =>
      text === undefined
        ? Effect.succeed(undefined)
        : decodeJsonStrict(schema)(text).pipe(
            Effect.mapError((error) => new CorruptRecord({ path, reason: error.message })),
          ),
    ),
  )

/**
 * Encodes a value as the text of its file: two-space indent, a trailing newline, and keys in the
 * schema's field order, so the same record is always the same bytes. Fails with TooLarge over the
 * given cap, a record's by default.
 */
export const encodeJson = <S extends Schema.Codec<unknown, unknown, never, never>>(
  schema: S,
  value: S["Type"],
  path: string,
  limit: number = MAX_RECORD_BYTES,
) =>
  Schema.encodeEffect(schema)(value).pipe(
    Effect.map((encoded) => `${JSON.stringify(encoded, null, 2)}\n`),
    Effect.flatMap((json) => withinLimit(path, json, limit)),
  )

/**
 * Renames a file into place, provided the lock is still this writer's and neither end is, or sits
 * below, a symbolic link. The lock may have been broken while the writer was paused; committing
 * then could overwrite a successor's work, so the move is abandoned unless the lock carries this
 * writer's token. The parent of `to` must exist.
 */
export const moveFile = (from: string, to: string, lock: Lock) =>
  Effect.gen(function* () {
    if (!(yield* ownsFile(lock.file, lock.token)))
      return yield* new LockLost({ lockFile: lock.file })
    yield* refuseSymlinks(lock.directory, from)
    yield* refuseSymlinks(lock.directory, to)
    yield* attemptTransient(() => rename(from, to)).pipe(
      Effect.mapError((cause) => new StateIo({ path: to, cause })),
    )
  })

/** Deletes a file, and a file that is not there counts as deleted. Look for links first. */
const deleteIfPresent = (path: string) =>
  attempt(() => Bun.file(path).delete()).pipe(
    Effect.catch((cause) =>
      hasCode(cause, "ENOENT") ? Effect.void : Effect.fail(new StateIo({ path, cause })),
    ),
  )

/**
 * Writes a file through a temporary neighbour and a rename; a failure leaves no temp file. Nothing
 * is created before the path is checked for symbolic links, and `Bun.write` makes the missing
 * directories.
 */
export const commitFile = (path: string, content: string, lock: Lock) => {
  const temporary = `${path}.${process.pid}.${crypto.randomUUID()}.tmp`
  return refuseSymlinks(lock.directory, path).pipe(
    Effect.andThen(io(path, () => Bun.write(temporary, content))),
    Effect.andThen(moveFile(temporary, path, lock)),
    Effect.tapError(() => deleteIfPresent(temporary).pipe(Effect.ignore)),
  )
}

/** Removes a file under the lock, never through a symbolic link. */
export const removeFile = (path: string, lock: Lock) =>
  refuseSymlinks(lock.directory, path).pipe(Effect.andThen(deleteIfPresent(path)))
