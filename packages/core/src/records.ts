import { readdir } from "node:fs/promises"
import { join } from "node:path"

import { Effect, Struct } from "effect"

import { CorruptRecord, StateIo } from "./errors.ts"
import { commitFile, encodeJson, readJson } from "./files.ts"
import { attempt, hasCode } from "./io.ts"
import { assignmentFile, intentFile } from "./layout.ts"
import { readAgents, readWorkers, writeLocal } from "./local.ts"
import type { Lock } from "./lock.ts"
import { Assignment } from "./model/assignment.ts"
import { sortedById } from "./model/ids.ts"
import { Intent } from "./model/intent.ts"
import { validateState, type State } from "./model/state.ts"
import { refuseSymlinks } from "./safety.ts"

/**
 * The committed form of an Assignment. `agent_id` names a subagent of one session on one machine,
 * so it is kept in a local file and never written to the record.
 */
const AssignmentRecord = Assignment.mapFields(Struct.omit(["agent_id"]))

const segments = (relative: string) => relative.split(/[\\/]/)

/**
 * Paths, relative to the directory, of the files that match the pattern. A missing directory has
 * none.
 */
const scan = (directory: string, pattern: string) =>
  attempt(() =>
    Array.fromAsync(new Bun.Glob(pattern).scan({ cwd: directory, onlyFiles: true })),
  ).pipe(
    Effect.catch((cause) =>
      hasCode(cause, "ENOENT")
        ? Effect.succeed([])
        : Effect.fail(new StateIo({ path: directory, cause })),
    ),
  )

/** The names inside `intents/`, whatever they are; a missing directory has none. */
const intentFolders = (directory: string) =>
  attempt(() => readdir(join(directory, "intents"))).pipe(
    Effect.catch((cause) =>
      hasCode(cause, "ENOENT") || hasCode(cause, "ENOTDIR")
        ? Effect.succeed([])
        : Effect.fail(new StateIo({ path: join(directory, "intents"), cause })),
    ),
  )

const present = <A>(path: string) =>
  Effect.flatMap((value: A | undefined) =>
    value === undefined
      ? Effect.fail(new CorruptRecord({ path, reason: "the file disappeared while reading" }))
      : Effect.succeed(value),
  )

const readIntents = (directory: string) =>
  scan(directory, "intents/*/intent.json").pipe(
    Effect.flatMap((files) =>
      Effect.forEach(files, (relative) => {
        const path = join(directory, relative)
        const folder = segments(relative)[1] ?? ""
        return refuseSymlinks(directory, path).pipe(
          Effect.andThen(readJson(Intent, path)),
          present(path),
          Effect.filterOrFail(
            (intent) => intent.id === folder,
            (intent) =>
              new CorruptRecord({
                path,
                reason: `its id ${intent.id} does not match the directory ${folder}`,
              }),
          ),
        )
      }),
    ),
  )

const readAssignments = (directory: string) =>
  scan(directory, "intents/*/assignments/*.json").pipe(
    Effect.flatMap((files) =>
      Effect.forEach(files, (relative) => {
        const path = join(directory, relative)
        const parts = segments(relative)
        const folder = parts[1] ?? ""
        const name = (parts[3] ?? "").replace(/\.json$/, "")
        return refuseSymlinks(directory, path).pipe(
          Effect.andThen(readJson(AssignmentRecord, path)),
          present(path),
          Effect.filterOrFail(
            (record) => record.id === name,
            (record) =>
              new CorruptRecord({
                path,
                reason: `its id ${record.id} does not match the file name ${name}`,
              }),
          ),
          Effect.filterOrFail(
            (record) => record.intent_id === folder,
            (record) =>
              new CorruptRecord({
                path,
                reason: `its intent ${record.intent_id} does not match the directory ${folder}`,
              }),
          ),
        )
      }),
    ),
  )

/**
 * Reads the project state from the record files and the local files, and checks it. Each record
 * must carry the id of the file or directory it sits in; anything else is CorruptRecord. Intents
 * and Assignments come back ordered by id, which is creation order.
 */
export const loadRecordState = (directory: string) =>
  Effect.gen(function* () {
    // A glob may skip a linked directory without a word, which would hide its records, so every
    // directory is checked here instead.
    for (const path of [directory, join(directory, "intents"), join(directory, "local")])
      yield* refuseSymlinks(directory, path)
    for (const folder of yield* intentFolders(directory)) {
      yield* refuseSymlinks(directory, join(directory, "intents", folder))
      yield* refuseSymlinks(directory, join(directory, "intents", folder, "assignments"))
    }
    const intents = sortedById(yield* readIntents(directory))
    const agents = yield* readAgents(directory)
    const assignments = sortedById(yield* readAssignments(directory)).map((record): Assignment => ({
      ...record,
      agent_id: agents[record.id] ?? null,
    }))
    const workers = yield* readWorkers(directory)
    return yield* validateState({ version: 1, intents, assignments, workers })
  })

/** The file text of every record of a state, keyed by the path the record is stored at. */
export const recordTexts = (directory: string, state: State) =>
  Effect.gen(function* () {
    const texts = new Map<string, string>()
    for (const intent of state.intents) {
      const path = intentFile(directory, intent.id)
      texts.set(path, yield* encodeJson(Intent, intent, path))
    }
    for (const assignment of state.assignments) {
      const path = assignmentFile(directory, assignment.intent_id, assignment.id)
      texts.set(path, yield* encodeJson(AssignmentRecord, assignment, path))
    }
    return texts
  })

/**
 * Writes what a change altered, one file per record, and nothing else: records whose file text is
 * the same as before are not touched. The new state is checked first, so an invalid one writes
 * nothing. Intents go before Assignments, so a reader never finds an Assignment without its Intent.
 * Records are never deleted.
 */
export const persist = (directory: string, before: State, after: State, lock: Lock) =>
  Effect.gen(function* () {
    yield* validateState(after)
    const was = yield* recordTexts(directory, before)
    const now = yield* recordTexts(directory, after)
    for (const [path, text] of now) if (was.get(path) !== text) yield* commitFile(path, text, lock)
    yield* writeLocal(directory, before, after, lock)
  })
