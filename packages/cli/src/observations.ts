import { appendFile, mkdir } from "node:fs/promises"
import { dirname } from "node:path"
import { Effect, Schema } from "effect"
import { decodeJsonStrict, stateFilePath } from "@holyclaude/core"

const Text = Schema.String.check(Schema.isPattern(/\S/))

/** What a hook saw of a running subagent: its effort, role and transcript. */
const Observed = Schema.Struct({
  kind: Schema.Literal("observed"),
  agent_id: Text,
  agent_type: Schema.optionalKey(Text),
  effort: Schema.optionalKey(Text),
  transcript: Schema.optionalKey(Text),
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

/** The observations file next to the state file: append-only JSON lines, never locked. */
export const observationsPath = (statePath: string = stateFilePath()): string =>
  statePath.endsWith(".json")
    ? `${statePath.slice(0, -".json".length)}.observations.jsonl`
    : `${statePath}.observations.jsonl`

// Strict like every persisted file: a record with extra fields is not ours, so it is skipped.
const decodeLine = decodeJsonStrict(ObservationRecord)

/** Reads every valid line; a missing file or an unreadable line is skipped. */
export const readObservations = (path: string = observationsPath()) =>
  Effect.gen(function* () {
    const text = yield* Effect.tryPromise(() => Bun.file(path).text()).pipe(
      Effect.orElseSucceed(() => ""),
    )
    const records: ObservationRecord[] = []
    for (const line of text.split("\n")) {
      if (line === "") continue
      const record = yield* decodeLine(line).pipe(Effect.option)
      if (record._tag === "Some") records.push(record.value)
    }
    return records
  })

/**
 * Appends one record. A single small append is atomic, so no lock is needed. Bun has no append
 * write: `Bun.write` and `Bun.file().writer()` truncate the file, and a read-then-rewrite would
 * lose records to concurrent hooks. So the append uses `node:fs` `appendFile`, and `mkdir` stands
 * in for the missing Bun directory creation; the read side already uses `Bun.file`.
 */
export const appendObservation = (record: ObservationRecord, path: string = observationsPath()) =>
  Effect.tryPromise(() => mkdir(dirname(path), { recursive: true })).pipe(
    Effect.andThen(Effect.tryPromise(() => appendFile(path, `${JSON.stringify(record)}\n`))),
  )

/** The newest observation of an agent, if any. */
export const latestObserved = (records: ReadonlyArray<ObservationRecord>, agentId: string) =>
  records.findLast(
    (record): record is typeof Observed.Type =>
      record.kind === "observed" && record.agent_id === agentId,
  )

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
