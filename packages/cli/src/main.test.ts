import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { $ } from "bun"

const MAIN = join(import.meta.dir, "main.ts")

let directory = ""
let intentFile = ""

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "holyclaude-main-"))
  intentFile = join(directory, "intents", "intent-1", "intent.json")
  mkdirSync(join(directory, "intents", "intent-1"), { recursive: true })
})

afterEach(() => {
  rmSync(directory, { recursive: true, force: true })
})

/** Runs the CLI entry point as a user would, against the test's state directory. */
const run = async (...args: string[]) => {
  const result = await $`${process.execPath} ${MAIN} ${args}`
    .env({ ...process.env, HOLYCLAUDE_STATE_DIR: directory })
    .nothrow()
    .quiet()
  return { code: result.exitCode, out: result.stdout.toString(), err: result.stderr.toString() }
}

describe("a corrupt record file", () => {
  test("is reported as a state file problem, not as bad input", async () => {
    writeFileSync(intentFile, JSON.stringify({ id: "intent-1", objective: 7 }))
    const { code, err } = await run("intent", "show")
    expect(code).toBe(1)
    expect(err).toContain("error: CorruptRecord")
    expect(err).toContain("intent.json")
    expect(err).not.toContain("input shape")
    expect(err).toContain("restore it from version control")
  })

  test("is reported the same way before a command changes state", async () => {
    writeFileSync(intentFile, "{ not json")
    const { code, err } = await run("reconcile", "resolve", "assignment-0001", "--keep")
    expect(code).toBe(1)
    expect(err).toContain("error: CorruptRecord")
  })

  test("a record whose id differs from its directory is rejected", async () => {
    writeFileSync(
      intentFile,
      JSON.stringify({ id: "intent-2", objective: "o", requirements: "", revision: 1 }),
    )
    const { code, err } = await run("intent", "show")
    expect(code).toBe(1)
    expect(err).toContain("error: CorruptRecord")
    expect(err).toContain("does not match the directory")
  })
})

describe("assignment list --state", () => {
  test("an unknown state is an error that names the valid states", async () => {
    const { code, out, err } = await run("assignment", "list", "--state", "Bogus")
    expect(code).toBe(2)
    expect(out).toBe("")
    for (const state of ["Ready", "Running", "Succeeded", "Failed", "Cancelled"])
      expect(err).toContain(state)
    expect(err).toContain("Bogus")
  })

  test("a valid state lists", async () => {
    const { code, err } = await run("assignment", "list", "--state", "Running")
    expect(code).toBe(0)
    expect(err).toBe("")
  })
})

describe("--version", () => {
  test("prints the version declared in packages/cli/package.json", async () => {
    const manifest: { version: string } = await Bun.file(
      join(import.meta.dir, "..", "package.json"),
    ).json()
    const { code, out } = await run("--version")
    expect(code).toBe(0)
    expect(out).toBe(`${manifest.version}\n`)
  })
})
