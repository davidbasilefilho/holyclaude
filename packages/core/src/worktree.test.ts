import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { Effect } from "effect"

import { openWorktree } from "./worktree.ts"

let directory = ""
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "holyclaude-worktree-"))
})
afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

describe("openWorktree", () => {
  test("keys a directory by its real path, without revealing the path", async () => {
    const real = join(directory, "real")
    await mkdir(real)
    await symlink(real, join(directory, "link"))
    const [first, second, other] = await Effect.runPromise(
      Effect.forEach([real, join(directory, "link"), directory], openWorktree),
    )
    expect(first?.key).toBe(second?.key)
    expect(first?.key).not.toBe(other?.key)
    expect(first?.key).not.toContain("real")
    expect(first?.root).toBe(real)
  })

  test.each([
    ["a missing path", "missing", "no such directory"],
    ["a file", "file", "not a directory"],
  ])("refuses %s as InvalidWorktree", async (_label, name, reason) => {
    await writeFile(join(directory, "file"), "x")
    const refused = await Effect.runPromise(openWorktree(join(directory, name)).pipe(Effect.flip))
    expect(refused).toMatchObject({ _tag: "InvalidWorktree", reason })
  })

  test.each(["", "   "])(
    "refuses the blank path %j, which would resolve to the cwd",
    async (blank) => {
      const refused = await Effect.runPromise(openWorktree(blank).pipe(Effect.flip))
      expect(refused).toMatchObject({ _tag: "InvalidWorktree", reason: "empty path" })
    },
  )
})
