import { describe, expect, test } from "bun:test"

const START = "<!-- holyclaude:writing-bar:start -->"
const END = "<!-- holyclaude:writing-bar:end -->"

/** The agent files that carry the writing bar; the first is the copy the others must match. */
const AGENTS = ["holyclaude.md", "worker-implementation.md", "reviewer-artifact.md"] as const

/**
 * Returns the trimmed text between the writing-bar markers of an agent file, or `undefined` when
 * either marker is missing or the end comes before the start.
 */
const writingBar = async (agent: string): Promise<string | undefined> => {
  const text = await Bun.file(new URL(`../plugin/agents/${agent}`, import.meta.url)).text()
  const start = text.indexOf(START)
  const end = text.indexOf(END)
  return start === -1 || end < start ? undefined : text.slice(start + START.length, end).trim()
}

describe("the shared writing bar", () => {
  test.each(AGENTS)("%s carries the markers around non-empty text", async (agent) => {
    const bar = await writingBar(agent)
    expect(bar).toBeDefined()
    expect(bar).not.toBe("")
  })

  test.each(AGENTS.slice(1))("%s matches the copy in holyclaude.md", async (agent) => {
    expect(await writingBar(agent)).toBe(await writingBar(AGENTS[0]))
  })
})
