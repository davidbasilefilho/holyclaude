import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

import { $ } from "bun"
import { Effect } from "effect"

import { bumpVersions, ManifestError, VersionMismatch } from "./bump-version.ts"
import { InvalidVersion } from "./version.ts"

const PACKAGE_FILES = [
  "package.json",
  "packages/cli/package.json",
  "packages/core/package.json",
  "plugin/package.json",
  "plugin/.claude-plugin/plugin.json",
]
const MARKETPLACE = ".claude-plugin/marketplace.json"
const ALL_FILES = [...PACKAGE_FILES, MARKETPLACE]

/** Manifest text in the repository's style, with fields before and after `version`. */
const manifest = (file: string, version: string) =>
  file === MARKETPLACE
    ? `${JSON.stringify(
        {
          name: "holyclaude",
          owner: { name: "someone" },
          plugins: [
            { name: "holyclaude", source: "./plugin", version, description: "first" },
            { name: "other", version: "9.9.9" },
          ],
        },
        null,
        2,
      )}\n`
    : `${JSON.stringify(
        { name: file, version, description: "kept", scripts: { build: "x" }, license: "MIT" },
        null,
        2,
      )}\n`

let root = ""

const read = (file: string) => readFileSync(join(root, file), "utf8")

const write = (file: string, text: string) => {
  mkdirSync(dirname(join(root, file)), { recursive: true })
  writeFileSync(join(root, file), text)
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "holyclaude-bump-"))
  for (const file of ALL_FILES) write(file, manifest(file, "0.3.2-1"))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe("bumpVersions", () => {
  test.each([
    ["minor", "0.4.0"],
    ["patch", "0.3.3"],
    ["hotfix", "0.3.2-2"],
  ] as const)("a %s bump writes %s to all six files and changes nothing else", async (kind, to) => {
    const before = ALL_FILES.map(read)
    const result = await Effect.runPromise(bumpVersions(root, kind))
    expect(result).toEqual({ from: "0.3.2-1", to })
    ALL_FILES.forEach((file, index) => {
      expect(read(file)).toBe(before[index]!.replace(`"version": "0.3.2-1"`, `"version": "${to}"`))
    })
  })

  test("bumps only the first plugin of the marketplace", async () => {
    await Effect.runPromise(bumpVersions(root, "patch"))
    expect(JSON.parse(read(MARKETPLACE)).plugins[1].version).toBe("9.9.9")
  })

  test("refuses disagreeing versions, names each file and writes nothing", async () => {
    write("packages/core/package.json", manifest("packages/core/package.json", "0.3.1"))
    const before = ALL_FILES.map(read)
    const error = await Effect.runPromise(Effect.flip(bumpVersions(root, "minor")))
    expect(error).toBeInstanceOf(VersionMismatch)
    for (const file of ALL_FILES) expect(error.message).toContain(file)
    expect(error.message).toContain("packages/core/package.json 0.3.1")
    expect(error.message).toContain("package.json 0.3.2-1")
    expect(ALL_FILES.map(read)).toEqual(before)
  })

  test("refuses a marketplace that disagrees", async () => {
    write(MARKETPLACE, manifest(MARKETPLACE, "0.3.2"))
    const error = await Effect.runPromise(Effect.flip(bumpVersions(root, "patch")))
    expect(error).toBeInstanceOf(VersionMismatch)
    expect(error.message).toContain(`${MARKETPLACE} 0.3.2`)
  })

  test("fails with InvalidVersion when all files agree on a malformed version", async () => {
    for (const file of ALL_FILES) write(file, manifest(file, "1.0"))
    const error = await Effect.runPromise(Effect.flip(bumpVersions(root, "patch")))
    expect(error).toBeInstanceOf(InvalidVersion)
  })

  test("fails with ManifestError naming a file that is missing", async () => {
    rmSync(join(root, "plugin/package.json"))
    const error = await Effect.runPromise(Effect.flip(bumpVersions(root, "patch")))
    expect(error).toBeInstanceOf(ManifestError)
    expect(error.message).toContain("plugin/package.json")
  })

  test.each([
    ["has no version", `{ "name": "x" }\n`],
    ["has a non-string version", `{ "version": 1 }\n`],
    ["is not JSON", "nope"],
  ])("fails with ManifestError when a file %s", async (_name, text) => {
    write("packages/cli/package.json", text)
    const error = await Effect.runPromise(Effect.flip(bumpVersions(root, "patch")))
    expect(error).toBeInstanceOf(ManifestError)
    expect(error.message).toContain("packages/cli/package.json")
  })

  test("fails with ManifestError when the marketplace lists no plugin", async () => {
    write(MARKETPLACE, `{ "plugins": [] }\n`)
    const error = await Effect.runPromise(Effect.flip(bumpVersions(root, "patch")))
    expect(error).toBeInstanceOf(ManifestError)
    expect(error.message).toContain(MARKETPLACE)
  })
})

describe("the command line", () => {
  const run = async (...args: string[]) => {
    const result = await $`${process.execPath} ${join(import.meta.dir, "bump-version.ts")} ${args}`
      .nothrow()
      .quiet()
    return { code: result.exitCode, out: result.stdout.toString(), err: result.stderr.toString() }
  }

  test("prints the old and new version and exits 0", async () => {
    const { code, out } = await run("hotfix", root)
    expect(code).toBe(0)
    expect(out.trim()).toBe("0.3.2-1 -> 0.3.2-2")
    expect(read("package.json")).toContain(`"version": "0.3.2-2"`)
  })

  test("prints the tagged error and exits 1 on disagreement", async () => {
    write("plugin/package.json", manifest("plugin/package.json", "0.3.1"))
    const { code, err } = await run("patch", root)
    expect(code).toBe(1)
    expect(err).toContain("error: VersionMismatch")
    expect(err).toContain("plugin/package.json 0.3.1")
  })

  test("prints usage and exits 1 on an unknown bump", async () => {
    const { code, err } = await run("major", root)
    expect(code).toBe(1)
    expect(err).toContain("error: Usage")
  })
})
