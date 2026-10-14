import { describe, expect, test } from "bun:test"

import { Effect } from "effect"

import {
  bumpVersion,
  formatVersion,
  InvalidVersion,
  parseVersion,
  type BumpKind,
} from "./version.ts"

const bump = (input: string, kind: BumpKind) =>
  Effect.runSync(
    parseVersion(input).pipe(Effect.map((version) => formatVersion(bumpVersion(version, kind)))),
  )

describe("bumpVersion", () => {
  test.each([
    ["0.3.2-1", "minor", "0.4.0"],
    ["0.3.2-1", "patch", "0.3.3"],
    ["0.3.2-1", "hotfix", "0.3.2-2"],
    ["0.3.2", "hotfix", "0.3.2-1"],
    ["0.3.2", "minor", "0.4.0"],
    ["0.3.2", "patch", "0.3.3"],
    ["0.1.0", "minor", "0.2.0"],
    ["0.1.0", "patch", "0.1.1"],
    ["0.1.0", "hotfix", "0.1.0-1"],
    ["0.9.9", "minor", "0.10.0"],
    ["0.0.9", "patch", "0.0.10"],
  ] as const)("%s bumped by %s is %s", (from, kind, to) => {
    expect(bump(from, kind)).toBe(to)
  })
})

describe("parseVersion", () => {
  test.each(["0.1.0", "0.3.2-1", "0.12.34-56"])("round-trips %s", (input) => {
    expect(Effect.runSync(parseVersion(input).pipe(Effect.map(formatVersion)))).toBe(input)
  })

  test.each([
    "",
    "1.2.3",
    "0.1",
    "0.1.0.0",
    "0.1.0-",
    "0.1.0-0",
    "0.1.0-1-2",
    "0.1.0-beta",
    "0.01.0",
    "0.1.00",
    "0.1.0-01",
    "v0.1.0",
    " 0.1.0",
    "0.1.0\n",
    "0.-1.0",
    "0.1.x",
  ])("rejects %j with InvalidVersion", (input) => {
    const error = Effect.runSync(Effect.flip(parseVersion(input)))
    expect(error).toBeInstanceOf(InvalidVersion)
    expect(error._tag).toBe("InvalidVersion")
    expect(error.input).toBe(input)
    expect(error.message).toContain(JSON.stringify(input))
  })
})
