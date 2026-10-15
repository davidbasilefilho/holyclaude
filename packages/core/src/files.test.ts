import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { Effect } from "effect"

import { readText } from "./io.ts"

let directory: string

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "holyclaude-files-"))
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

describe("readText", () => {
  test("refuses a file over the limit and reads one at it", async () => {
    const path = join(directory, "file")
    await writeFile(path, "12345")
    expect(await Effect.runPromise(readText(path, 5))).toBe("12345")
    expect(await Effect.runPromise(Effect.flip(readText(path, 4)))).toMatchObject({
      _tag: "TooLarge",
      bytes: 5,
      limit: 4,
    })
  })

  test("reads a file of any size when no limit is given", async () => {
    const path = join(directory, "file")
    const text = "x".repeat(5 * 1024 * 1024)
    await writeFile(path, text)
    expect(await Effect.runPromise(readText(path))).toBe(text)
  })
})
