import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { delimiter, dirname, join } from "node:path"

import { $ } from "bun"

const WRAPPER = join(import.meta.dir, "..", "..", "..", "plugin", "scripts", "holyclaude")
const posix = (path: string) => path.replaceAll("\\", "/")
// CDPATH is colon separated, so Git Bash for Windows needs /c/Users/... rather than C:/Users/...
const forShell = (path: string) =>
  posix(path).replace(/^([A-Za-z]):/, (_, drive: string) => `/${drive.toLowerCase()}`)

let root = ""

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "holyclaude-wrapper-"))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

/** Installs the wrapper in a new scripts directory, with a stand-in bundle that echoes what it saw. */
const install = (name: string, withBundle: boolean) => {
  const bin = join(root, name, "scripts")
  mkdirSync(bin, { recursive: true })
  copyFileSync(WRAPPER, join(bin, "holyclaude"))
  copyFileSync(join(dirname(WRAPPER), "empty-bunfig.toml"), join(bin, "empty-bunfig.toml"))
  if (withBundle)
    writeFileSync(
      join(bin, "holyclaude.js"),
      "console.log(JSON.stringify({ probe: process.env.HC_PROBE ?? null, argv: process.argv.slice(2) }))\n",
    )
  return join(root, name)
}

const withBun = { PATH: `${dirname(process.execPath)}${delimiter}${process.env["PATH"] ?? ""}` }

const run = async (
  cwd: string,
  script: string,
  args: string[],
  env: Record<string, string> = {},
) => {
  const result = await $`sh ${script} ${args}`
    .cwd(cwd)
    .env({ ...process.env, ...withBun, ...env })
    .nothrow()
    .quiet()
  return { code: result.exitCode, out: result.stdout.toString(), err: result.stderr.toString() }
}

describe.skipIf(Bun.which("sh") === null)("plugin/scripts/holyclaude", () => {
  test("the project's .env and bunfig.toml cannot change the CLI", async () => {
    const installed = install("install", true)
    const project = join(root, "project")
    mkdirSync(project)
    writeFileSync(join(project, ".env"), "HC_PROBE=from-env\n")
    writeFileSync(join(project, "bunfig.toml"), 'preload = ["./pre.ts"]\n')
    writeFileSync(join(project, "pre.ts"), 'console.log("PRELOAD RAN")\n')
    const { code, out } = await run(project, posix(join(installed, "scripts", "holyclaude")), [
      "a",
      "b",
    ])
    expect(code).toBe(0)
    expect(out).not.toContain("PRELOAD RAN")
    expect(JSON.parse(out)).toEqual({ probe: null, argv: ["a", "b"] })
  })

  test("a set CDPATH does not break the path lookup of a relative invocation", async () => {
    const installed = install("install", true)
    const { code, out, err } = await run(installed, "scripts/holyclaude", ["x"], {
      CDPATH: forShell(installed),
    })
    expect(err).toBe("")
    expect(code).toBe(0)
    expect(JSON.parse(out)).toEqual({ probe: null, argv: ["x"] })
  })

  test("the common path forks nothing: the only command substitution is readlink for a symlink", async () => {
    const lines = (await Bun.file(WRAPPER).text()).split("\n")
    const code = lines.filter((line) => !line.trimStart().startsWith("#"))
    expect(code.filter((line) => line.includes("$(") || line.includes("`"))).toEqual([
      '  link=$(readlink "$self")',
    ])
  })

  test.skipIf(process.platform === "win32")("a symlinked wrapper finds its bundle", async () => {
    const installed = install("install", true)
    const link = join(root, "link")
    symlinkSync(join(installed, "scripts", "holyclaude"), link)
    const { code, out } = await run(root, "link", ["x"])
    expect(code).toBe(0)
    expect(JSON.parse(out)).toEqual({ probe: null, argv: ["x"] })
  })

  test("a relative invocation through a bare name finds its bundle in the working directory", async () => {
    const installed = install("install", true)
    const { code, out } = await run(join(installed, "scripts"), "holyclaude", ["y"])
    expect(code).toBe(0)
    expect(JSON.parse(out)).toEqual({ probe: null, argv: ["y"] })
  })

  test("without the bundle a command prints one TOON error line and exits 127", async () => {
    const installed = install("install", false)
    const { code, out, err } = await run(installed, "scripts/holyclaude", ["routes"])
    expect(code).toBe(127)
    expect(out).toBe("")
    expect(err.trimEnd().split("\n")).toHaveLength(1)
    expect(err).toStartWith('error: "BunMissing: ')
    expect(err).toContain("https://bun.sh")
  })

  test("without Bun a command exits 127 and a hook exits 0 and says nothing", async () => {
    const installed = install("install", true)
    const empty = join(root, "empty")
    mkdirSync(empty)
    const sh = Bun.which("sh") ?? "sh"
    const script = posix(join(installed, "scripts", "holyclaude"))
    const runWithoutBun = async (args: string[]) => {
      const result = await $`${sh} ${script} ${args}`
        .env({ ...process.env, PATH: empty, BUN_INSTALL: posix(empty), HOME: posix(empty) })
        .nothrow()
        .quiet()
      return { code: result.exitCode, out: result.stdout.toString(), err: result.stderr.toString() }
    }
    const command = await runWithoutBun(["routes"])
    expect(command.code).toBe(127)
    expect(command.err).toStartWith('error: "BunMissing: ')
    expect(await runWithoutBun(["hook", "pre-tool-use"])).toEqual({ code: 0, out: "", err: "" })
  })

  test("without the bundle a hook exits 0 and says nothing", async () => {
    const installed = install("install", false)
    for (const hook of ["pre-tool-use", "session-start"]) {
      const { code, out, err } = await run(installed, "scripts/holyclaude", ["hook", hook])
      expect({ code, out, err }).toEqual({ code: 0, out: "", err: "" })
    }
  })
})
