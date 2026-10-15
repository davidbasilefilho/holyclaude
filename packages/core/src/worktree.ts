import { realpath, stat } from "node:fs/promises"
import { resolve } from "node:path"

import { Effect } from "effect"

import { InvalidWorktree, StateIo } from "./errors.ts"
import { attempt, hasCode, io } from "./io.ts"

/** A directory ownership paths are relative to, and the opaque key that tells it from another. */
export interface Worktree {
  readonly root: string
  readonly key: string
}

/**
 * Opens an existing directory as a worktree. The key is a hash of its real path, so two spellings
 * of one directory share a key and the path itself never reaches a record. A path that is blank,
 * missing or not a directory is InvalidWorktree: a blank one would otherwise resolve to the cwd.
 */
export const openWorktree = (path: string) =>
  Effect.gen(function* () {
    if (path.trim() === "") return yield* new InvalidWorktree({ path, reason: "empty path" })
    const root = resolve(path)
    const info = yield* attempt(() => stat(root)).pipe(
      Effect.catch((cause) =>
        Effect.fail(
          hasCode(cause, "ENOENT") || hasCode(cause, "ENOTDIR")
            ? new InvalidWorktree({ path, reason: "no such directory" })
            : new StateIo({ path, cause }),
        ),
      ),
    )
    if (!info.isDirectory()) return yield* new InvalidWorktree({ path, reason: "not a directory" })
    const real = yield* io(root, () => realpath(root))
    const key = new Bun.CryptoHasher("sha256").update(real).digest("hex").slice(0, 16)
    return { root, key } satisfies Worktree
  })
