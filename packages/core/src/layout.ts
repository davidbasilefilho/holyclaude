import { join } from "node:path"

import { Effect } from "effect"

import { MAX_GITIGNORE_BYTES } from "./codec.ts"
import { io, readText } from "./io.ts"
import { refuseSymlinks } from "./safety.ts"
import { slugOf } from "./slug.ts"

const STORE_DIRECTORY = ".holyclaude"
const LOCAL_DIRECTORY = "local"
const LEGACY_FILE = "state.json"
const MIGRATED_FILE = "state.json.migrated"

/** The project root: CLAUDE_PROJECT_DIR, else the working directory. */
export const projectRoot = (env: NodeJS.ProcessEnv = process.env): string =>
  env["CLAUDE_PROJECT_DIR"] || process.cwd()

/** The state directory: HOLYCLAUDE_STATE_DIR, else `<projectRoot>/.holyclaude`. */
export const stateDirPath = (env: NodeJS.ProcessEnv = process.env): string =>
  env["HOLYCLAUDE_STATE_DIR"] || join(projectRoot(env), STORE_DIRECTORY)

/**
 * The name of a record's directory or file: its objective's slug, a hyphen and its id, or the id
 * alone when the objective has no slug. The id is the key and always ends the name.
 */
export const recordName = (objective: string, id: string): string => {
  const slug = slugOf(objective)
  return slug === "" ? id : `${slug}-${id}`
}

/** Whether a directory or file name (without `.json`) ends in the id, or is exactly the id. */
export const nameEndsInId = (name: string, id: string): boolean =>
  name === id || name.endsWith(`-${id}`)

/** Most characters in a directory or file name, which every file system enforces in bytes or fewer. */
export const MAX_NAME_LENGTH = 255

/** What every id starts with after the hyphen that joins it to a slug. */
const ID_STARTS = ["-intent-", "-assignment-"]

/**
 * The id of another record that the name ends in as well, if any: `name` ends in `id`, but a name
 * that also ends in a second id could be read as that record's, so neither can own it. Only
 * suffixes that begin like an id are tried, and the name is at most {@link MAX_NAME_LENGTH}
 * characters: a caller refuses a longer one first, so the work here stays small whatever the ids
 * are.
 */
export const otherIdEnding = (name: string, id: string, ids: ReadonlySet<string>) => {
  for (let at = name.indexOf("-"); at !== -1; at = name.indexOf("-", at + 1)) {
    if (!ID_STARTS.some((start) => name.startsWith(start, at))) continue
    const suffix = name.slice(at + 1)
    if (suffix !== id && ids.has(suffix)) return suffix
  }
  return name !== id && ids.has(name) ? name : undefined
}

/** The directory of an Intent: `intents/<slug>-<intent-id>`. */
export const intentFolder = (
  directory: string,
  intent: { readonly id: string; readonly objective: string },
): string => join(directory, "intents", recordName(intent.objective, intent.id))

/** The file of an Intent: `intent.json` in its directory. */
export const intentFile = (
  directory: string,
  intent: { readonly id: string; readonly objective: string },
): string => join(intentFolder(directory, intent), "intent.json")

/** The file of an Assignment: `assignments/<slug>-<assignment-id>.json` in its Intent's directory. */
export const assignmentFile = (
  folder: string,
  assignment: { readonly id: string; readonly objective: string },
): string => join(folder, "assignments", `${recordName(assignment.objective, assignment.id)}.json`)

/** A machine-local file. Everything under `local/` stays out of version control. */
export const localFile = (directory: string, name: string): string =>
  join(directory, LOCAL_DIRECTORY, name)

/** The observations log the hooks append to, one JSON record per line. */
export const observationsFile = (directory: string): string =>
  localFile(directory, "observations.jsonl")

/**
 * The previous generation of the observations log. The log moves here once it outgrows
 * `OBSERVATIONS_ROTATE_BYTES`, replacing the generation before it, and readers read it first.
 */
export const previousObservationsFile = (directory: string): string =>
  localFile(directory, "observations.1.jsonl")

/** The lock file. Its `.breaking` neighbour guards the breaking of a stale lock. */
export const lockFile = (directory: string): string => localFile(directory, "lock")

/** The single file of the old layout, read once to migrate it. */
export const legacyFile = (directory: string): string => join(directory, LEGACY_FILE)

/** Where the old single file goes once its records are migrated. */
export const migratedFile = (directory: string): string => join(directory, MIGRATED_FILE)

/** The lock file of the old layout and its guard, which migration removes once it has succeeded. */
export const legacyLockFiles = (directory: string): ReadonlyArray<string> => [
  join(directory, `${LEGACY_FILE}.lock`),
  join(directory, `${LEGACY_FILE}.lock.breaking`),
]

/**
 * The folder's own `.gitignore`. It lists exactly what must not be committed: the machine-local
 * files under `local/` (lock and its guard, worker list, agent ids, clone id, the two generations
 * of the observations log), the temporary files a write renames into place, and what an earlier
 * version left beside the records, namely its state file, the copy of it after migration, its lock
 * files and its observations log. Everything else in the folder is committed.
 */
const IGNORE_RULES =
  [
    `/${LOCAL_DIRECTORY}/`,
    "*.tmp",
    `/${MIGRATED_FILE}`,
    `/${LEGACY_FILE}`,
    `/${LEGACY_FILE}.lock*`,
    "/state.observations.jsonl",
  ].join("\n") + "\n"

/** What the `local/` folder's own `.gitignore` holds: everything in the folder is ignored. */
const LOCAL_IGNORE_RULES = "*\n"

/**
 * Most of the `local/` folder's `.gitignore` that is read, in bytes. The expected content is two
 * bytes, so a longer file differs and is replaced without being read whole.
 */
const LOCAL_IGNORE_READ_BYTES = 16

/**
 * Makes the `local/` folder when it is missing, with its own `.gitignore` that ignores everything
 * in it, so local files stay out of version control even if a repository replaces the folder's
 * `.gitignore`. That file is committed state too, so a repository could also ship one that
 * un-ignores a local file; any content other than the expected rule is replaced by it. Nothing is
 * created through a symbolic link. Call it wherever `local/` may come into being.
 */
export const ensureLocalDirectory = (directory: string) => {
  const path = localFile(directory, ".gitignore")
  return refuseSymlinks(directory, path).pipe(
    Effect.andThen(readText(path, LOCAL_IGNORE_READ_BYTES)),
    Effect.catchTag("TooLarge", () => Effect.succeed(undefined)),
    Effect.flatMap((current) =>
      current === LOCAL_IGNORE_RULES
        ? Effect.void
        : io(path, () => Bun.write(path, LOCAL_IGNORE_RULES)),
    ),
    Effect.asVoid,
  )
}

/** What an earlier version wrote: a rule that ignores the whole folder, records included. */
const LEGACY_IGNORE_RULES = "*\n"

/**
 * Puts the folder's own `.gitignore` in place, and never through a symbolic link. A missing file is
 * written as the exact list of ignored files, and the rule an earlier version wrote is replaced by
 * it, since that rule would hide the records. The list covers the old state file and its neighbours
 * too, so replacing the old rule is safe before a migration. Any other content is the user's and
 * stays. A `.gitignore` over 256 KiB is TooLarge rather than read whole.
 */
export const keepLocalFilesOutOfVersionControl = (directory: string) => {
  const path = join(directory, ".gitignore")
  return refuseSymlinks(directory, path).pipe(
    Effect.andThen(readText(path, MAX_GITIGNORE_BYTES)),
    Effect.map((current) =>
      current === undefined || current === LEGACY_IGNORE_RULES ? IGNORE_RULES : undefined,
    ),
    Effect.flatMap((rules) =>
      rules === undefined ? Effect.void : io(path, () => Bun.write(path, rules)),
    ),
    Effect.asVoid,
  )
}
