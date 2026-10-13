import { describe, expect, test } from "bun:test"
import { resolve } from "node:path"
import { Effect } from "effect"
import { isInsideRoots, normalizePath, normalizePaths, pathsOverlap } from "./paths.ts"

const reason = (raw: string) =>
  Effect.runPromise(
    normalizePath(raw).pipe(
      Effect.flip,
      Effect.map((error) => error.reason),
    ),
  )

describe("normalizePath", () => {
  test.each([
    "src/con",
    "CON",
    "a/NUL.txt",
    "Lpt1.log/x",
    "prn",
    "x/Aux.tar.gz",
    "com1",
    "COM9.txt",
    "lpt9",
    "dir\\Nul",
    "CONIN$",
    "conout$",
    "a/CONOUT$.txt",
    "COM¹",
    "lpt²",
    "x/LPT³.log",
    "NUL .txt",
    "a/con  .x/y",
  ])("rejects the reserved device name in %s", async (raw) => {
    expect(await reason(raw)).toBe("Windows reserved device name")
  })

  test.each([
    "src/console",
    "a/null",
    "com0",
    "com10",
    "lpt",
    "auxiliary.txt",
    "x/.con",
    "conin",
    "conin$x",
    "com⁴",
    "com¹x",
    "con x",
  ])("accepts %s, which is not a device name", async (raw) => {
    expect(await Effect.runPromise(normalizePath(raw))).toBe(raw)
  })

  test.each([
    ["/abs", "absolute path"],
    ["\\abs", "absolute path"],
    ["a/../b", '".." segment'],
    ["./a", '"." segment'],
    ["", "empty segment"],
    ["a//b", "empty segment"],
    ["a/", "empty segment"],
    ["a./b", "trailing dot or space"],
    ["a/b ", "trailing dot or space"],
    ["a/b\u0007c", "control character"],
    ["a/b\tc", "control character"],
    ["a:b", 'one of : * ? " < > |'],
    ["a*", 'one of : * ? " < > |'],
    ["a?", 'one of : * ? " < > |'],
    ['a"b', 'one of : * ? " < > |'],
    ["<a", 'one of : * ? " < > |'],
    ["a>", 'one of : * ? " < > |'],
    ["a|b", 'one of : * ? " < > |'],
  ])("rejects %j", async (raw, expected) => {
    expect(await reason(raw)).toBe(expected)
  })

  test("normalizes backslashes to slashes and keeps case", async () => {
    expect(await Effect.runPromise(normalizePath("Src\\Lib\\a.ts"))).toBe("Src/Lib/a.ts")
  })
})

describe("isInsideRoots", () => {
  // Resolved against the host's own path rules, so the Windows backslash case is exercised on Windows.
  const base = resolve("workspace")

  test.each(["src", "src/a.ts", "src/deep/er/a.ts", "lib/b.ts"])("accepts %s", (path) => {
    expect(isInsideRoots(path, ["src", "lib"], base)).toBe(true)
  })

  test.each([
    "other/a.ts",
    "a.ts",
    "srcx/a.ts",
    "src/../other/a.ts",
    "../src/a.ts",
    "../outside.ts",
    "src/../../x",
  ])("rejects the sibling or escaping path %s", (path) => {
    expect(isInsideRoots(path, ["src"], base)).toBe(false)
  })

  test("rejects everything when there is no writable root", () => {
    expect(isInsideRoots("src/a.ts", [], base)).toBe(false)
  })

  test("accepts a root given as an absolute path", () => {
    expect(isInsideRoots("src/a.ts", [resolve(base, "src")], base)).toBe(true)
    expect(isInsideRoots("other/a.ts", [resolve(base, "src")], base)).toBe(false)
  })
})

describe("case-insensitive comparison", () => {
  test("pathsOverlap ignores case", () => {
    expect(pathsOverlap("Src/A.ts", "src/a.ts")).toBe(true)
    expect(pathsOverlap("SRC", "src/a.ts")).toBe(true)
    expect(pathsOverlap("src/a", "src/ab")).toBe(false)
  })

  test("normalizePaths drops case-insensitive duplicates, keeping the first spelling", async () => {
    expect(await Effect.runPromise(normalizePaths(["Src/A.ts", "src/a.ts", "b"]))).toEqual([
      "Src/A.ts",
      "b",
    ])
  })
})
