import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { $ } from "bun"

import { JUDGED_TOOLS } from "./policy.ts"

const PLUGIN = join(import.meta.dir, "..", "..", "..", "..", "plugin")

interface CommandHook {
  readonly type: string
  readonly command: string
  readonly args?: ReadonlyArray<string>
  readonly timeout: number
}
interface Group {
  readonly matcher?: string
  readonly hooks: ReadonlyArray<CommandHook>
}
const config: { readonly hooks: Readonly<Record<string, ReadonlyArray<Group>>> } = await Bun.file(
  join(PLUGIN, "hooks", "hooks.json"),
).json()

/**
 * Whether Claude Code runs a hook group for a tool, by its documented matcher rule: a list of exact
 * names joined with `|` when the matcher is only letters, digits, `_` and `|`, otherwise an
 * unanchored regular expression. A group with no matcher always runs.
 */
const runsFor = (matcher: string | undefined, tool: string): boolean => {
  if (matcher === undefined || matcher === "" || matcher === "*") return true
  return /^[A-Za-z0-9_|]+$/.test(matcher)
    ? matcher.split("|").includes(tool)
    : new RegExp(matcher).test(tool)
}

const groups = (event: string) => config.hooks[event] ?? []

describe("the PreToolUse matcher", () => {
  const [group, ...others] = groups("PreToolUse")

  test("is one group with a matcher", () => {
    expect(others).toEqual([])
    expect(group?.matcher).toBeString()
  })

  test("runs the guard for every tool it judges, and for Agent, which it only observes", () => {
    for (const tool of [...JUDGED_TOOLS, "Agent"]) expect(runsFor(group?.matcher, tool)).toBe(true)
  })

  test("lists nothing else, so an unmatched tool never reaches the guard", () => {
    expect(group?.matcher?.split("|").toSorted()).toEqual([...JUDGED_TOOLS, "Agent"].toSorted())
    for (const tool of [
      "Read",
      "Grep",
      "Glob",
      "WebFetch",
      "WebSearch",
      "TodoWrite",
      "Skill",
      "SendMessage",
      "mcp__server__write",
      "Bash2",
      "bash",
    ])
      expect(runsFor(group?.matcher, tool)).toBe(false)
  })
})

describe("the hooks run in exec form on Bun", () => {
  const entries = Object.entries(config.hooks).flatMap(([event, eventGroups]) =>
    eventGroups.flatMap((group) => group.hooks.map((hook) => ({ event, hook }))),
  )

  test("hooks the plugin registers for session start, tool use and the subagent lifecycle", () => {
    expect(Object.keys(config.hooks).toSorted()).toEqual([
      "PreToolUse",
      "SessionStart",
      "SubagentStart",
      "SubagentStop",
    ])
  })

  for (const { event, hook } of entries)
    test(`${event} spawns bun with args, no shell, and keeps Bun off the project's files`, () => {
      expect(hook.type).toBe("command")
      expect(hook.command).toBe("bun")
      expect(hook.args).toContain("--no-env-file")
      expect(hook.args).toContain("--config=${CLAUDE_PLUGIN_ROOT}/scripts/empty-bunfig.toml")
      expect(hook.args).toContain("${CLAUDE_PLUGIN_ROOT}/scripts/holyclaude.js")
    })

  test("the empty config file the hooks point Bun at ships in the plugin", async () => {
    expect(await Bun.file(join(PLUGIN, "scripts", "empty-bunfig.toml")).exists()).toBe(true)
  })
})

describe("a hook as Claude Code spawns it", () => {
  let root = ""
  let project = ""

  beforeAll(() => {
    const base = mkdtempSync(join(tmpdir(), "holyclaude-hooks-"))
    root = join(base, "plugin")
    project = join(base, "project")
    mkdirSync(join(root, "scripts"), { recursive: true })
    mkdirSync(project)
    copyFileSync(
      join(PLUGIN, "scripts", "empty-bunfig.toml"),
      join(root, "scripts", "empty-bunfig.toml"),
    )
    // A stand-in bundle that echoes what Bun let it see.
    writeFileSync(
      join(root, "scripts", "holyclaude.js"),
      "console.log(JSON.stringify({ probe: process.env.HC_PROBE ?? null, argv: process.argv.slice(2) }))\n",
    )
    writeFileSync(join(project, ".env"), "HC_PROBE=from-env\n")
    writeFileSync(join(project, "bunfig.toml"), 'preload = ["./pre.ts"]\n')
    writeFileSync(join(project, "pre.ts"), 'console.log("PRELOAD RAN")\n')
  })

  afterAll(() => {
    rmSync(join(root, ".."), { recursive: true, force: true })
  })

  for (const [event, [group]] of Object.entries(config.hooks))
    test(`${event} runs the bundle, and the project's .env and bunfig.toml change nothing`, async () => {
      const hook = group?.hooks[0]
      // Claude Code substitutes the placeholder into each argument and resolves `bun` on PATH.
      const args = (hook?.args ?? []).map((arg) => arg.replaceAll("${CLAUDE_PLUGIN_ROOT}", root))
      const result = await $`${process.execPath} ${args}`
        .cwd(project)
        .env({ ...process.env, HC_PROBE: undefined })
        .nothrow()
        .quiet()
      expect(result.exitCode).toBe(0)
      expect(result.stdout.toString()).not.toContain("PRELOAD RAN")
      // The arguments are Bun's two options, the bundle, then the hook's own words.
      expect(JSON.parse(result.stdout.toString())).toEqual({ probe: null, argv: args.slice(3) })
    })
})
