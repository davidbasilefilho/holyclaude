import { appendFile, mkdir } from "node:fs/promises"
import { dirname } from "node:path"

import {
  decodeJsonStrict,
  keepLocalFilesOutOfVersionControl,
  OBSERVATIONS_READ_BYTES,
  observationsFile,
  previousObservationsFile,
  readTail,
  refuseSymlinks,
  rotateObservations,
  StateIo,
  stateDirPath,
} from "@holyclaude/core"
import { Effect, Schema } from "effect"

const Text = Schema.String.check(Schema.isPattern(/\S/))

/**
 * What a hook saw of a running subagent: its effort, role, transcript and the model it started on,
 * which the PostToolUse hook reads from the Agent call's result.
 */
const Observed = Schema.Struct({
  kind: Schema.Literal("observed"),
  agent_id: Text,
  agent_type: Schema.optionalKey(Text),
  effort: Schema.optionalKey(Text),
  transcript: Schema.optionalKey(Text),
  model: Schema.optionalKey(Text),
  at: Schema.String,
})

/** A per-call model or effort the root chose for one dispatch, recorded at bind time. */
const Override = Schema.Struct({
  kind: Schema.Literal("override"),
  assignment_id: Text,
  agent_id: Text,
  model: Schema.optionalKey(Text),
  effort: Schema.optionalKey(Text),
  at: Schema.String,
})

/** One line of the observations file. */
export const ObservationRecord = Schema.Union([Observed, Override])
/** One decoded line of the observations file. */
export type ObservationRecord = typeof ObservationRecord.Type

/**
 * The observations file in the state directory's local files: JSON lines, appended without the
 * lock. Once it outgrows its rotation size it becomes the previous generation, under the lock.
 */
export const observationsPath = (directory: string = stateDirPath()): string =>
  observationsFile(directory)

// Strict like every persisted file: a record with extra fields is not ours, so it is skipped.
const decodeLine = decodeJsonStrict(ObservationRecord)

/**
 * Every valid line in the last {@link OBSERVATIONS_READ_BYTES} of one generation of the log; a
 * missing file has none. A generation that follows the rotation is read whole.
 */
const readGeneration = (directory: string, path: string) =>
  Effect.gen(function* () {
    yield* refuseSymlinks(directory, path)
    const text = (yield* readTail(path, OBSERVATIONS_READ_BYTES)) ?? ""
    const records: ObservationRecord[] = []
    for (const line of text.split("\n")) {
      if (line === "") continue
      const record = yield* decodeLine(line).pipe(Effect.option)
      if (record._tag === "Some") records.push(record.value)
    }
    return records
  })

/**
 * Reads every valid line, oldest first: the previous generation of the log, then the current one. A
 * missing file or an unreadable line is skipped. A file is never read through a symbolic link,
 * since the `transcript` field of its records is later opened as a path. Each generation is read
 * from its end, up to {@link OBSERVATIONS_READ_BYTES}: rotation keeps a log that hooks wrote near 1
 * MiB per generation, so the bound only matters for a log that was supplied or grew past it, whose
 * oldest lines go unread.
 */
export const readObservations = (directory: string = stateDirPath()) =>
  Effect.gen(function* () {
    // The current log is read first. A rotation between the two reads then shows the rotated
    // records twice, which a newest-first lookup does not mind, instead of not at all.
    const current = yield* readGeneration(directory, observationsPath(directory))
    const previous = yield* readGeneration(directory, previousObservationsFile(directory))
    return [...previous, ...current]
  })

/**
 * Appends one record to the observations file of the state directory. A single small append is
 * atomic, so no lock is needed. Bun has no append write: `Bun.write` and `Bun.file().writer()`
 * truncate the file, and a read-then-rewrite would lose records to concurrent hooks. So the append
 * uses `node:fs` `appendFile`, and `mkdir` stands in for the missing Bun directory creation; the
 * read side already uses `Bun.file`. The folder's `.gitignore` is put in place first, so the log is
 * never left where version control would pick it up, and nothing is written through a symbolic
 * link. A log that has outgrown its rotation size is rotated first, so the file stays bounded.
 */
export const appendObservation = (
  record: ObservationRecord,
  directory: string = stateDirPath(),
) => {
  const path = observationsPath(directory)
  return refuseSymlinks(directory, path).pipe(
    Effect.andThen(
      Effect.tryPromise({
        try: () => mkdir(dirname(path), { recursive: true }),
        catch: (cause) => new StateIo({ path, cause }),
      }),
    ),
    Effect.andThen(keepLocalFilesOutOfVersionControl(directory)),
    Effect.andThen(rotateObservations(directory)),
    Effect.andThen(
      Effect.tryPromise({
        try: () => appendFile(path, `${JSON.stringify(record)}\n`),
        catch: (cause) => new StateIo({ path, cause }),
      }),
    ),
  )
}

/** What the hooks have seen of one agent, each field from the newest record that carries it. */
export type Seen = Partial<
  Pick<typeof Observed.Type, "agent_type" | "effort" | "transcript" | "model">
>

/**
 * Combines an agent's observations field by field. Three hooks write them, each seeing different
 * fields at different times: SubagentStart the agent type, PreToolUse the effort and a transcript
 * path inferred from the parent's, SubagentStop the effort and the real transcript path, and
 * PostToolUse on the Agent tool the model the agent started on. So no single record is complete,
 * and a later record wins only for the fields it carries.
 */
export const seenOf = (records: ReadonlyArray<ObservationRecord>, agentId: string): Seen => {
  const seen: { -readonly [K in keyof Seen]: Seen[K] } = {}
  for (const record of records) {
    if (record.kind !== "observed" || record.agent_id !== agentId) continue
    if (record.agent_type !== undefined) seen.agent_type = record.agent_type
    if (record.effort !== undefined) seen.effort = record.effort
    if (record.transcript !== undefined) seen.transcript = record.transcript
    if (record.model !== undefined) seen.model = record.model
  }
  return seen
}

/** The newest per-call override recorded for an Assignment and agent, if any. */
export const latestOverride = (
  records: ReadonlyArray<ObservationRecord>,
  assignmentId: string,
  agentId: string,
) =>
  records.findLast(
    (record): record is typeof Override.Type =>
      record.kind === "override" &&
      record.assignment_id === assignmentId &&
      record.agent_id === agentId,
  )
