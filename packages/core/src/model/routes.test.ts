import { describe, expect, test } from "bun:test"
import { join } from "node:path"

import { ROUTES, type Role } from "./routes.ts"

const PLUGIN = join(import.meta.dir, "..", "..", "..", "..", "plugin")

/** The routing matrix the plugin documents: each specialist's pinned model and effort. */
const MATRIX: Readonly<Record<Role, string>> = {
  "Explorer.map": "haiku/medium",
  "Explorer.lookup": "haiku/medium",
  "Librarian.lookup": "haiku/medium",
  "Worker.mechanical": "haiku/high",
  "Worker.operations": "haiku/high",
  "Worker.validation": "haiku/high",
  "Reviewer.artifact": "haiku/high",
  "Reviewer.audit": "haiku/high",
  "Explorer.trace": "sonnet/medium",
  "Librarian.research": "sonnet/medium",
  "Reviewer.testing": "sonnet/medium",
  "Worker.implementation": "sonnet/high",
  "Worker.integration": "sonnet/high",
  "Worker.visual": "sonnet/high",
  "Worker.debugging": "sonnet/high",
  "Reviewer.code": "sonnet/high",
  "Reviewer.visual": "sonnet/high",
  "Reviewer.security": "sonnet/high",
}

interface Frontmatter {
  readonly name: string
  readonly model: string
  readonly effort: string
  readonly skills?: ReadonlyArray<string>
  readonly experimental?: { readonly cacheTtl?: string }
}

const readPlugin = (path: string) => Bun.file(join(PLUGIN, path)).text()

const frontmatterOf = (text: string): Frontmatter => {
  const [, yaml = ""] = text.split("---\n", 3)
  return Bun.YAML.parse(yaml) as Frontmatter
}

describe("the routing matrix", () => {
  test("pins every specialist's model and effort in routes.ts", () => {
    const pinned = Object.fromEntries(
      ROUTES.map((route) => [route.role, `${route.model}/${route.effort}`]),
    )
    expect(pinned).toEqual(MATRIX)
  })

  test("matches each specialist's agent frontmatter", async () => {
    for (const route of ROUTES) {
      const agent = frontmatterOf(await readPlugin(`agents/${route.agent}.md`))
      expect({ name: agent.name, pin: `${agent.model}/${agent.effort}` }).toEqual({
        name: route.agent,
        pin: MATRIX[route.role],
      })
    }
  })

  test("matches the root's specialist table", async () => {
    const table = await readPlugin("agents/holyclaude.md")
    for (const route of ROUTES) {
      const row = table.split("\n").find((line) => line.startsWith(`| ${route.role} `))
      const cells = (row ?? "").split("|").map((cell) => cell.trim())
      expect({ role: route.role, pin: cells[4] }).toEqual({
        role: route.role,
        pin: `${route.model} / ${route.effort}`,
      })
    }
  })
})

describe("the agent prompts", () => {
  const agentFiles = ["holyclaude", ...ROUTES.map((route) => route.agent)]

  test("preload only skills the plugin ships", async () => {
    for (const file of agentFiles) {
      const { skills = [] } = frontmatterOf(await readPlugin(`agents/${file}.md`))
      for (const skill of skills) {
        expect(skill.startsWith("holyclaude:")).toBe(true)
        const shipped = await Bun.file(
          join(PLUGIN, "skills", skill.slice("holyclaude:".length), "SKILL.md"),
        ).exists()
        expect({ file, skill, shipped }).toEqual({ file, skill, shipped: true })
      }
    }
  })

  test("have every specialist preload the shared conduct skill", async () => {
    for (const route of ROUTES) {
      const { skills = [] } = frontmatterOf(await readPlugin(`agents/${route.agent}.md`))
      expect({
        role: route.role,
        conduct: skills.includes("holyclaude:specialist-conduct"),
      }).toEqual({ role: route.role, conduct: true })
    }
  })

  test("ask for a one-hour cache on the Sonnet specialists, the only ones the root resumes", async () => {
    for (const route of ROUTES) {
      const { experimental } = frontmatterOf(await readPlugin(`agents/${route.agent}.md`))
      expect({ role: route.role, cacheTtl: experimental?.cacheTtl }).toEqual({
        role: route.role,
        cacheTtl: route.model === "sonnet" ? "1h" : undefined,
      })
    }
  })

  test("leave the root's cache lifetime to the main-conversation setting", async () => {
    // Claude Code reads `experimental.cacheTtl` only for a subagent's requests; the root runs as
    // the main conversation, whose lifetime comes from `promptCacheTtl`.
    const root = frontmatterOf(await readPlugin("agents/holyclaude.md"))
    expect(root.experimental?.cacheTtl).toBeUndefined()
  })

  test("leave reports and skills uncapped in words", async () => {
    const files = [
      ...agentFiles.map((file) => `agents/${file}.md`),
      ...(await Array.fromAsync(new Bun.Glob("*/SKILL.md").scan({ cwd: join(PLUGIN, "skills") })))
        .filter((path) => !path.startsWith("frontend-design"))
        .map((path) => `skills/${path}`),
    ]
    for (const file of files) {
      const text = await readPlugin(file)
      expect({ file, capped: /\bat most \d+ words\b/i.test(text) }).toEqual({
        file,
        capped: false,
      })
    }
  })
})
