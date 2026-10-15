// `rename` is the one node: import kept. Bun has no rename or move API, and the atomic replace of
// a record file is what makes a write all-or-nothing. Everything else here is Bun: Bun.file reads
// and deletes, and Bun.write makes the missing directories.
import { rename } from "node:fs/promises"

import { Effect, Schema, Stream } from "effect"

import { decodeJsonStrict } from "./codec.ts"
import { CorruptRecord, LockLost, StateIo } from "./errors.ts"
import { attempt, attemptTransient, hasCode, io, readText } from "./io.ts"
import { ownsFile, type Lock } from "./lock.ts"
import { refuseSymlinks } from "./safety.ts"

/**
 * Reads and strictly decodes a JSON file. A missing file reads as undefined. A file that is not
 * valid JSON for the schema is reported as CorruptRecord with the path, so the user is pointed at
 * the file and not at the input of the command. Without a limit the file is read whole.
 */
export const readJson = <S extends Schema.Decoder<unknown>>(
  schema: S,
  path: string,
  limit?: number,
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
 * schema's field order, so the same record is always the same bytes.
 */
export const encodeJson = <S extends Schema.Codec<unknown, unknown, never, never>>(
  schema: S,
  value: S["Type"],
) =>
  Schema.encodeEffect(schema)(value).pipe(
    Effect.map((encoded) => `${JSON.stringify(encoded, null, 2)}\n`),
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

const NEWLINE = 10

/** Whether the file is empty or ends in a line break, so more lines can follow it directly. */
const endsALine = (path: string) =>
  io(path, async () => {
    const file = Bun.file(path)
    return file.size === 0 || (await file.slice(file.size - 1).bytes())[0] === NEWLINE
  })

/**
 * Rewrites a file as the lines of another file followed by its own, through a temporary neighbour
 * and a rename, provided the lock is still this writer's. Both are streamed into the new file, so
 * neither is ever held whole in memory, however large. A line break is added between them when the
 * front file does not end in one. The front file is left in place, and a failure leaves no temp
 * file.
 */
export const prependLines = (front: string, path: string, lock: Lock) => {
  const temporary = `${path}.${process.pid}.${crypto.randomUUID()}.tmp`
  const copy = (source: string, writer: Bun.FileSink) =>
    Stream.fromReadableStream({
      evaluate: () => Bun.file(source).stream(),
      onError: (cause) => new StateIo({ path: source, cause }),
    }).pipe(
      Stream.runForEach((chunk) =>
        io(temporary, async () => {
          await writer.write(chunk)
          await writer.flush()
        }),
      ),
    )
  return Effect.gen(function* () {
    yield* refuseSymlinks(lock.directory, path)
    const separator = (yield* endsALine(front)) ? "" : "\n"
    const writer = Bun.file(temporary).writer()
    yield* Effect.gen(function* () {
      yield* copy(front, writer)
      yield* io(temporary, async () => void (await writer.write(separator)))
      yield* copy(path, writer)
    }).pipe(
      Effect.ensuring(io(temporary, async () => void (await writer.end())).pipe(Effect.ignore)),
    )
    yield* moveFile(temporary, path, lock)
  }).pipe(Effect.tapError(() => deleteIfPresent(temporary).pipe(Effect.ignore)))
}
