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

describe("hook pre-tool-use", () => {
  /** Runs the hook as Claude Code does: the payload on stdin, the decision on stdout. */
  const hook = async (stdin: string) => {
    const result = await $`${process.execPath} ${MAIN} hook pre-tool-use < ${Buffer.from(stdin)}`
      .env({ ...process.env, HOLYCLAUDE_STATE_DIR: directory })
      .nothrow()
      .quiet()
    return { code: result.exitCode, out: result.stdout.toString() }
  }
  const payload = (input: object, extra: object = {}) =>
    JSON.stringify({ agent_id: "agent-1", tool_name: "Bash", tool_input: input, ...extra })
  const MEGABYTE = 1024 * 1024
  const padding = "x".repeat(MEGABYTE + 200_000)
  const reasonOf = (out: string): string =>
    JSON.parse(out).hookSpecificOutput.permissionDecisionReason

  test("a subagent write padded past 1 MB is denied for the payload's size, with exit code 0", async () => {
    const { code, out } = await hook(payload({ command: "git commit -m x" }, { padding }))
    expect(code).toBe(0)
    expect(reasonOf(out)).toContain(`payload is over ${MEGABYTE} bytes`)
  })

  test("a subagent command over 1 MB is denied with the reason", async () => {
    const { code, out } = await hook(payload({ command: `git status ${padding}` }))
    expect(code).toBe(0)
    expect(reasonOf(out)).toContain("cannot check it")
  })

  test("a write of over 1 MB is denied, one within the limit into an allowed path passes", async () => {
    const write = (content: string) => ({ file_path: "packages/cli/src/big.ts", content })
    expect(reasonOf((await hook(payload(write(padding), { tool_name: "Write" }))).out)).toContain(
      "payload is over",
    )
    const within = "x".repeat(MEGABYTE / 2)
    expect(await hook(payload(write(within), { tool_name: "Write" }))).toEqual({ code: 0, out: "" })
  })

  test("the hook reads at most one byte past the limit of a stdin that never ends", async () => {
    const result = await $`yes | ${process.execPath} ${MAIN} hook pre-tool-use`
      .env({ ...process.env, HOLYCLAUDE_STATE_DIR: directory })
      .nothrow()
      .quiet()
    expect(result.exitCode).toBe(0)
    expect(reasonOf(result.stdout.toString())).toContain("payload is over")
  }, 20_000)

  test("a non-string agent_id is a subagent and null is the main thread", async () => {
    const write = { command: "git commit -m x" }
    expect(JSON.parse((await hook(payload(write, { agent_id: 7 }))).out)).toMatchObject({
      hookSpecificOutput: { permissionDecision: "deny" },
    })
    expect(await hook(payload(write, { agent_id: null }))).toEqual({ code: 0, out: "" })
  })

  test("a main-thread payload past 1 MB, an empty one and one that is not JSON are denied", async () => {
    const write = { command: "git commit -m x", description: padding }
    for (const stdin of [payload(write, { agent_id: undefined }), "", "{"])
      expect(reasonOf((await hook(stdin)).out)).toMatch(/payload is over|empty or not valid JSON/)
  })
})
