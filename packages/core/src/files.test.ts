import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { Effect } from "effect"

import { keepNewestLines, readNewestLines } from "./files.ts"
import { readText } from "./io.ts"

let directory: string

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "holyclaude-files-"))
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

describe("keepNewestLines", () => {
  test("returns a text within the limit as it is", () => {
    expect(keepNewestLines("a\nb\n", 4)).toBe("a\nb\n")
  })

  test("keeps a line that starts exactly at the cut", () => {
    expect(keepNewestLines("aaa\nbb\n", 3)).toBe("bb\n")
  })

  test("drops the line the cut falls in", () => {
    expect(keepNewestLines("aaa\nbbb\ncc\n", 6)).toBe("cc\n")
  })

  test("counts bytes, not characters, and never splits a character it keeps", () => {
    const text = "ééé\néé\n"
    const kept = keepNewestLines(text, 6)
    expect(kept).toBe("éé\n")
    expect(new TextEncoder().encode(kept).byteLength).toBeLessThanOrEqual(6)
  })

  test("keeps nothing when the newest line alone is over the limit", () => {
    expect(keepNewestLines("aaaaaaaa\n", 4)).toBe("")
  })
})

describe("readNewestLines", () => {
  test("reads the newest whole lines of a file over the limit", async () => {
    const path = join(directory, "log")
    await writeFile(path, "first\nsecond\nthird\n")
    expect(await Effect.runPromise(readNewestLines(path, 13))).toBe("second\nthird\n")
    expect(await Effect.runPromise(readNewestLines(path, 100))).toBe("first\nsecond\nthird\n")
  })

  test("reads a missing file as undefined", async () => {
    expect(await Effect.runPromise(readNewestLines(join(directory, "none"), 10))).toBeUndefined()
  })
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
})
