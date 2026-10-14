import { describe, expect, test } from "bun:test"

import { protectedNameOf } from "./glob.ts"

describe("a path pattern is judged by every path it expands to", () => {
  test("wildcards, bracket expressions, brace lists and ranges that can name .git", () => {
    for (const pattern of [
      ".gi?/config",
      ".g*t/hooks/pre-commit",
      ".*",
      "./.*",
      ".gi[t]/hooks/x",
      ".gi[!a]/hooks/x",
      ".gi[a-z]/hooks/x",
      ".{git,x}/hooks/x",
      "{.git/hooks/x,y}",
      ".{g..g}it/config",
      "C:\\repo\\.G?T\\hooks\\x",
      ".gi?./config",
      ".gi?::$DATA",
    ])
      expect([pattern, protectedNameOf(pattern)]).toEqual([pattern, ".git"])
  })

  test("and .holyclaude", () => {
    for (const pattern of [".holy*/state.json", ".holyclaud?", "{.holyclaude,x}/state.json"])
      expect([pattern, protectedNameOf(pattern)]).toEqual([pattern, ".holyclaude"])
  })

  test("a wildcard does not start a part with a dot, so * alone names neither", () => {
    for (const pattern of [
      "*",
      "*/",
      "./*",
      "*/*",
      "?git",
      "[.]git",
      "*.txt",
      "build/*.js",
      "dist/{a,b}.map",
      "{src,lib}/",
      ".gitignore*",
      ".github/*",
      ".gitattrib*",
      "x{.,}git",
      ".*a",
      "{a,.}*[a]",
    ])
      expect([pattern, protectedNameOf(pattern)]).toEqual([pattern, undefined])
  })

  test("brace lists nested past the depth followed are taken to name anything", () => {
    expect(protectedNameOf(`${"{a,".repeat(40)}b${"}".repeat(40)}`)).toBe(".git")
    expect(protectedNameOf(`${"{a,".repeat(10)}b${"}".repeat(10)}`)).toBeUndefined()
  })

  const MIB = 1024 * 1024
  const SHAPES: ReadonlyArray<readonly [string, string]> = [
    ["stars", "*".repeat(MIB)],
    ["unclosed brackets", "[".repeat(MIB)],
    ["bracket expressions", "[a]".repeat(MIB / 3)],
    ["unclosed braces", "{".repeat(MIB)],
    ["nested braces", "{".repeat(MIB / 2) + "}".repeat(MIB / 2)],
    ["brace lists", "{a,b}".repeat(MIB / 5)],
    ["one wide brace list", `{${"a,".repeat(MIB / 2)}}`],
    ["ranges", "{a..z}".repeat(MIB / 6)],
  ]
  for (const [name, pattern] of SHAPES)
    test(`${name}, at 1 MiB, are read in under a second`, () => {
      const started = performance.now()
      protectedNameOf(pattern)
      expect(performance.now() - started).toBeLessThan(1000)
    })
})
