import { join } from "node:path"

import { Effect } from "effect"

import { MAX_GITIGNORE_BYTES } from "./codec.ts"
import { io, readText } from "./io.ts"
import { refuseSymlinks } from "./safety.ts"

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

/** The file of an Intent: `intents/<intent-id>/intent.json`. */
export const intentFile = (directory: string, intentId: string): string =>
  join(directory, "intents", intentId, "intent.json")

/** The file of an Assignment: `intents/<intent-id>/assignments/<assignment-id>.json`. */
export const assignmentFile = (directory: string, intentId: string, id: string): string =>
  join(directory, "intents", intentId, "assignments", `${id}.json`)

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

/**
 * Makes the `local/` folder when it is missing, with its own `.gitignore` that ignores everything
 * in it, so local files stay out of version control even if a repository replaces the folder's
 * `.gitignore`. A `.gitignore` already there stays. Nothing is created through a symbolic link.
 * Call it wherever `local/` may come into being.
 */
export const ensureLocalDirectory = (directory: string) => {
  const path = localFile(directory, ".gitignore")
  return refuseSymlinks(directory, path).pipe(
    Effect.andThen(io(path, () => Bun.file(path).exists())),
    Effect.flatMap((present) => (present ? Effect.void : io(path, () => Bun.write(path, "*\n")))),
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
