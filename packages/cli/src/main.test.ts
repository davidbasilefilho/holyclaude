import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { $ } from "bun"

const MAIN = join(import.meta.dir, "main.ts")

let directory = ""
let stateFile = ""

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "holyclaude-main-"))
  stateFile = join(directory, "state.json")
})

afterEach(() => {
  rmSync(directory, { recursive: true, force: true })
})

/** Runs the CLI entry point as a user would, against the test's state file. */
const run = async (...args: string[]) => {
  const result = await $`${process.execPath} ${MAIN} ${args}`
    .env({ ...process.env, HOLYCLAUDE_STATE_FILE: stateFile })
    .nothrow()
    .quiet()
  return { code: result.exitCode, out: result.stdout.toString(), err: result.stderr.toString() }
}

describe("a corrupt state file", () => {
  test("is reported as a state file problem, not as bad input", async () => {
    writeFileSync(stateFile, JSON.stringify({ version: 1, intents: "nope" }))
    const { code, err } = await run("intent", "show")
    expect(code).toBe(1)
    expect(err).toContain("error: StateCorrupt")
    expect(err).toContain(stateFile.replaceAll("\\", "/").split("/").at(-1) ?? "")
    expect(err).not.toContain("input shape")
    expect(err).toContain("restore the file from a backup")
  })

  test("is reported the same way before a command changes state", async () => {
    writeFileSync(stateFile, "{ not json")
    const { code, err } = await run("reconcile", "resolve", "assignment-0001", "--keep")
    expect(code).toBe(1)
    expect(err).toContain("error: StateCorrupt")
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
