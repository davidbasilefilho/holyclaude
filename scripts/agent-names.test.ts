import { describe, expect, test } from "bun:test"

// claude.ai's plugin sync accepts an agent name only when it starts and ends with a letter or digit
// and holds letters, digits and hyphens. `claude plugin validate --strict` does not check this, so
// the test does, and it ties each name to its file so the agent type is predictable.

const NAME_RULE = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/

const AGENTS = new URL("../plugin/agents/", import.meta.url)

/** The agent files, as base names without `.md`. */
const agentFiles = await Array.fromAsync(new Bun.Glob("*.md").scan({ cwd: AGENTS.pathname }))

/** The `name:` of an agent file's frontmatter, or `undefined` when it has none. */
const frontmatterName = async (file: string): Promise<string | undefined> => {
  const [, yaml = ""] = (await Bun.file(new URL(file, AGENTS)).text()).split("---\n", 3)
  const { name } = Bun.YAML.parse(yaml) as { readonly name?: unknown }
  return typeof name === "string" ? name : undefined
}

describe("the agent names", () => {
  test("cover the root and the 18 specialists", () => {
    expect(agentFiles).toHaveLength(19)
  })

  test.each(agentFiles.toSorted())(
    "%s names itself with characters claude.ai accepts",
    async (file) => {
      const name = await frontmatterName(file)
      expect(name).toMatch(NAME_RULE)
      expect(name).toBe(file.slice(0, -".md".length))
    },
  )
})
