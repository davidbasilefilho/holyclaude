import { lstat } from "node:fs/promises"
import { join, relative, sep } from "node:path"

import { Effect } from "effect"

import { SymlinkRefused, StateIo } from "./errors.ts"
import { attempt, hasCode } from "./io.ts"

const lstatIfPresent = (path: string) =>
  attempt(() => lstat(path)).pipe(
    Effect.catch((cause) =>
      hasCode(cause, "ENOENT") || hasCode(cause, "ENOTDIR")
        ? Effect.succeed(undefined)
        : Effect.fail(new StateIo({ path, cause })),
    ),
  )

/**
 * Fails with SymlinkRefused when the state directory, or any component of the path below it, is a
 * symbolic link (or a Windows junction). A link committed to the repository could otherwise send a
 * write, rename, remove or append outside the state directory. Components that do not exist yet are
 * fine. Call it before touching a path, since it only looks.
 */
export const refuseSymlinks = (directory: string, path: string) =>
  Effect.gen(function* () {
    const parts = relative(directory, path)
      .split(sep)
      .filter((part) => part !== "" && part !== ".")
    let current = directory
    for (const part of [undefined, ...parts]) {
      if (part !== undefined) current = join(current, part)
      const info = yield* lstatIfPresent(current)
      if (info === undefined) return
      if (info.isSymbolicLink()) return yield* new SymlinkRefused({ path: current })
    }
  })
