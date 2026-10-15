import { readdir } from "node:fs/promises"
import { dirname, join, relative } from "node:path"

import { Data, Effect, Struct } from "effect"

import { CorruptRecord, StateIo, UnknownRecord } from "./errors.ts"
import { commitFile, encodeJson, moveFile, readJson } from "./files.ts"
import { attempt, hasCode } from "./io.ts"
import {
  assignmentFile,
  intentFolder,
  MAX_NAME_LENGTH,
  nameEndsInId,
  otherIdEnding,
} from "./layout.ts"
import { readAgents, readWorkers, readWorktrees, writeLocal } from "./local.ts"
import type { Lock } from "./lock.ts"
import { Assignment } from "./model/assignment.ts"
import { sortedById } from "./model/ids.ts"
import { Intent } from "./model/intent.ts"
import { validateState, type State } from "./model/state.ts"
import { refuseSymlinks } from "./safety.ts"

/**
 * The committed form of an Assignment. `agent_id` names a subagent of one session on one machine
 * and `worktree` keys a directory of this machine, so both are kept in local files and never
 * written to the record.
 */
const AssignmentRecord = Assignment.mapFields(Struct.omit(["agent_id", "worktree"]))

/** The last component of a path. `basename` is not on the architecture allowlist for `node:path`. */
const leaf = (path: string) => relative(dirname(path), path)

/**
 * Refuses a directory or file name with a backslash. It is an ordinary character in a POSIX name
 * but a separator on Windows, so a path built from such a name would put a record in a folder other
 * than the one it sits in.
 */
const withoutBackslash = (path: string, names: ReadonlyArray<string>) =>
  names.some((name) => name.includes("\\"))
    ? Effect.fail(
        new CorruptRecord({
          path,
          reason: "a directory or file name on its path holds a backslash; rename it",
        }),
      )
    : Effect.void

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

/**
 * What a lock-free reader saw cannot be true at one moment, as when a writer renames a record's
 * folder between two of its reads. The load is repeated once before it is reported as CorruptRecord
 * with the reason.
 */
class Raced extends Data.TaggedError("Raced")<{
  readonly path: string
  readonly reason: string
}> {}

/** A file that a scan listed and that is gone when read: the folder was renamed in between. */
const present = <A>(path: string) =>
  Effect.flatMap((value: A | undefined) =>
    value === undefined
      ? Effect.fail(new Raced({ path, reason: "the file disappeared while reading" }))
      : Effect.succeed(value),
  )

/** A record read from the file at `path`, in the directory `folder` under `intents/`. */
interface Found<A> {
  readonly record: A
  readonly path: string
  readonly folder: string
  /** The directory name of an Intent, the file name (without `.json`) of an Assignment. */
  readonly name: string
}

const readIntents = (directory: string, limit?: number) =>
  scan(directory, "intents/*/intent.json").pipe(
    Effect.flatMap((files) =>
      Effect.forEach(files, (relative) => {
        const path = join(directory, relative)
        const folder = leaf(dirname(relative))
        return withoutBackslash(path, [folder]).pipe(
          Effect.andThen(refuseSymlinks(directory, path)),
          Effect.andThen(readJson(Intent, path, limit)),
          present(path),
          Effect.filterOrFail(
            (intent) => nameEndsInId(folder, intent.id),
            (intent) =>
              new CorruptRecord({
                path,
                reason: `its id ${intent.id} does not end the directory name ${folder}`,
              }),
          ),
          Effect.map((record): Found<Intent> => ({ record, path, folder, name: folder })),
        )
      }),
    ),
  )

const readAssignments = (directory: string, limit?: number) =>
  scan(directory, "intents/*/assignments/*.json").pipe(
    Effect.flatMap((files) =>
      Effect.forEach(files, (relative) => {
        const path = join(directory, relative)
        const folder = leaf(dirname(dirname(relative)))
        const file = leaf(relative)
        const name = file.replace(/\.json$/, "")
        return withoutBackslash(path, [folder, file]).pipe(
          Effect.andThen(refuseSymlinks(directory, path)),
          Effect.andThen(readJson(AssignmentRecord, path, limit)),
          present(path),
          Effect.filterOrFail(
            (record) => nameEndsInId(name, record.id),
            (record) =>
              new CorruptRecord({
                path,
                reason: `its id ${record.id} does not end the file name ${name}`,
              }),
          ),
          Effect.map((record): Found<typeof AssignmentRecord.Type> => ({
            record,
            path,
            folder,
            name,
          })),
        )
      }),
    ),
  )

/** What a load found: the state, and the file each record sits in, keyed by record id. */
export interface Stored {
  readonly state: State
  readonly files: ReadonlyMap<string, string>
}

const loadOnce = (directory: string, limit?: number) =>
  Effect.gen(function* () {
    // A glob may skip a linked directory without a word, which would hide its records, so every
    // directory is checked here instead.
    for (const path of [directory, join(directory, "intents"), join(directory, "local")])
      yield* refuseSymlinks(directory, path)
    for (const folder of yield* intentFolders(directory)) {
      yield* refuseSymlinks(directory, join(directory, "intents", folder))
      yield* refuseSymlinks(directory, join(directory, "intents", folder, "assignments"))
    }
    const intents = yield* readIntents(directory, limit)
    const stored = yield* readAssignments(directory, limit)
    const files = new Map<string, string>()
    for (const { record, path } of [...intents, ...stored].toSorted((a, b) =>
      a.path < b.path ? -1 : 1,
    )) {
      const first = files.get(record.id)
      if (first !== undefined)
        return yield* new CorruptRecord({
          path,
          reason: `its id ${record.id} is also held by ${first}; keep one of the two`,
        })
      files.set(record.id, path)
    }
    const ids = new Set(files.keys())
    for (const { record, path, name } of [...intents, ...stored]) {
      const other = otherIdEnding(name, record.id, ids)
      if (other !== undefined)
        return yield* new CorruptRecord({
          path,
          reason: `its name ${name} ends in the id of ${other} as well as its own ${record.id}; rename it`,
        })
    }
    // An Assignment sits in the folder of its own Intent, not in any folder that ends in the id.
    const folderOf = new Map(intents.map(({ record, folder }) => [record.id, folder]))
    for (const { record, path, folder } of stored) {
      const own = folderOf.get(record.intent_id)
      if (own !== undefined && own !== folder)
        return yield* new Raced({
          path,
          reason: `its intent ${record.intent_id} is in the directory ${own}, not in ${folder}`,
        })
    }
    const agents = yield* readAgents(directory, limit)
    const worktrees = yield* readWorktrees(directory, limit)
    const assignments = sortedById(stored.map(({ record }) => record)).map((record): Assignment => {
      const worktree = record.state === "Running" ? worktrees[record.id] : undefined
      return {
        ...record,
        agent_id: agents[record.id] ?? null,
        ...(worktree === undefined ? {} : { worktree }),
      }
    })
    const workers = yield* readWorkers(directory, limit)
    const state = yield* validateState({
      version: 1,
      intents: sortedById(intents.map(({ record }) => record)),
      assignments,
      workers,
    })
    return { state, files } satisfies Stored
  })

/**
 * Reads the project state from the record files and the local files, and checks it. A directory or
 * file name ends in the id of its record, after an optional slug, and the record must carry that
 * id, and no other loaded id; an Assignment sits in the directory of its own Intent. Anything else
 * is CorruptRecord, and so is an id found in two files, which the error names. Intents and
 * Assignments come back ordered by id, which is creation order. Files are read whole unless a
 * `limit` is given, in which case a file over it fails the load as TooLarge. A file that vanishes
 * while it is read, or an Assignment listed under another folder than the one its Intent was read
 * from, as a folder rename under a writer can make them, repeats the load once.
 */
export const loadRecords = (directory: string, limit?: number) =>
  loadOnce(directory, limit).pipe(
    Effect.retry({ times: 1, while: (error) => error._tag === "Raced" }),
    Effect.catchTag("Raced", ({ path, reason }) =>
      Effect.fail(new CorruptRecord({ path, reason })),
    ),
  )

/** The file text of every record of a state, keyed by record id. */
export const recordTexts = (state: State) =>
  Effect.gen(function* () {
    const texts = new Map<string, string>()
    for (const intent of state.intents) texts.set(intent.id, yield* encodeJson(Intent, intent))
    for (const assignment of state.assignments)
      texts.set(assignment.id, yield* encodeJson(AssignmentRecord, assignment))
    return texts
  })

/**
 * Whether a failed rename onto `to` was refused because something is there. Windows reports EPERM
 * for it, as it does for a missing right, so that code counts only when the destination holds
 * something.
 */
const occupied = (cause: unknown, to: string) =>
  hasCode(cause, "ENOTEMPTY") || hasCode(cause, "EEXIST")
    ? Effect.succeed(true)
    : hasCode(cause, "EPERM")
      ? attempt(() => readdir(to)).pipe(
          Effect.map((names) => names.length > 0),
          Effect.orElseSucceed(() => false),
        )
      : Effect.succeed(false)

/**
 * Moves a record's folder. A destination that already holds something is a folder left behind, for
 * example by a merge that kept the old name of a record on one side; it is named for the user to
 * move away, since the rename could not replace it.
 */
const moveFolder = (from: string, to: string, lock: Lock) =>
  moveFile(from, to, lock).pipe(
    Effect.catchTag("StateIo", (error) =>
      occupied(error.cause, to).pipe(
        Effect.flatMap((taken) =>
          Effect.fail(
            taken
              ? new CorruptRecord({
                  path: to,
                  reason: `it is a folder left behind, probably by a merge, where ${from} must move to; move ${to} out of intents/ (or delete it if it holds no record you need), then rerun`,
                })
              : error,
          ),
        ),
      ),
    ),
  )

/**
 * Writes what a change altered, one file per record, and nothing else: records whose file text is
 * the same as before are not touched. A record that is written goes to the name its objective gives
 * it; when it was stored under another name, the file (for an Intent, its directory with the
 * Assignments in it) is moved there in one rename first, so version control sees a move. A record
 * never goes onto a path that another record holds, on disk or from an earlier write of the same
 * run, nor under a name that ends in another record's id or is too long for a file system; and no
 * record that stays as it is may end in the id of one the change adds. Each is CorruptRecord naming
 * the records, since a rename would silently replace the file, or the next load would refuse the
 * name. The new state and every one of those checks come first, so a change that fails any of them
 * writes nothing. Intents go before Assignments, so a reader never finds an Assignment without its
 * Intent. Records are never deleted.
 */
export const persist = (directory: string, before: Stored, after: State, lock: Lock) =>
  Effect.gen(function* () {
    yield* validateState(after)
    const was = yield* recordTexts(before.state)
    const ids = new Set([...after.intents, ...after.assignments].map(({ id }) => id))
    const files = new Map(before.files)
    const held = new Map([...files].map(([id, path]) => [path, id]))
    const setFile = (id: string, path: string) => {
      const old = files.get(id)
      if (old !== undefined && held.get(old) === id) held.delete(old)
      files.set(id, path)
      held.set(path, id)
    }
    // Fails when a record may not carry `name`, the directory or file name (without `.json`).
    const checkName = (id: string, name: string, target: string, extension = "") =>
      Effect.gen(function* () {
        if (name.length + extension.length > MAX_NAME_LENGTH)
          return yield* new CorruptRecord({
            path: target,
            reason: `record ${id.slice(0, 80)} would need a name of ${name.length + extension.length} characters, over the ${MAX_NAME_LENGTH} that file systems allow; shorten its id`,
          })
        const other = otherIdEnding(name, id, ids)
        if (other !== undefined)
          return yield* new CorruptRecord({
            path: target,
            reason: `record ${id} named ${name} ends in the id of ${other} too; change its objective (or rename it on disk), then rerun`,
          })
      })
    // Fails when `id` may not be written at `target`.
    const claim = (id: string, name: string, target: string, extension = "") =>
      Effect.gen(function* () {
        const holder = held.get(target)
        if (holder !== undefined && holder !== id)
          return yield* new CorruptRecord({
            path: target,
            reason: `record ${id}${files.has(id) ? ` (at ${files.get(id)})` : ""} would be written here, over record ${holder}; change the objective of one of the two, then rerun`,
          })
        yield* checkName(id, name, target, extension)
      })
    // Every check runs while this plan is made, the bookkeeping above following the writes in order;
    // the writes themselves wait in `steps` until all the checks have passed.
    const steps: Array<ReturnType<typeof moveFolder> | ReturnType<typeof commitFile>> = []
    const folders = new Map<string, string>()
    for (const intent of after.intents) {
      const current = files.get(intent.id)
      const text = yield* encodeJson(Intent, intent)
      if (current === undefined || text !== was.get(intent.id)) {
        const folder = intentFolder(directory, intent)
        const file = join(folder, "intent.json")
        yield* claim(intent.id, relative(join(directory, "intents"), folder), file)
        const old = current === undefined ? undefined : dirname(current)
        if (old !== undefined && old !== folder) {
          steps.push(moveFolder(old, folder, lock))
          for (const [id, path] of files)
            if (dirname(dirname(path)) === old) setFile(id, join(folder, relative(old, path)))
        }
        steps.push(commitFile(file, text, lock))
        setFile(intent.id, file)
      } else {
        yield* checkName(intent.id, leaf(dirname(current)), current)
      }
      folders.set(intent.id, dirname(files.get(intent.id) ?? ""))
    }
    for (const assignment of after.assignments) {
      const folder = folders.get(assignment.intent_id)
      if (folder === undefined)
        return yield* new UnknownRecord({ kind: "intent", id: assignment.intent_id })
      const current = files.get(assignment.id)
      const text = yield* encodeJson(AssignmentRecord, assignment)
      if (current !== undefined && text === was.get(assignment.id)) {
        yield* checkName(assignment.id, leaf(current).replace(/\.json$/, ""), current)
        continue
      }
      const target = assignmentFile(folder, assignment)
      yield* claim(assignment.id, leaf(target).replace(/\.json$/, ""), target, ".json")
      if (current !== undefined && current !== target) steps.push(moveFile(current, target, lock))
      steps.push(commitFile(target, text, lock))
      setFile(assignment.id, target)
    }
    yield* Effect.all(steps, { discard: true })
    yield* writeLocal(directory, before.state, after, lock)
  })
