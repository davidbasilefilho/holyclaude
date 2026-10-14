import { afterEach, beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { $ } from "bun"

const MAIN = join(import.meta.dir, "main.ts")

// Each test starts the CLI as a process many times, which can pass the 5 second default on a busy machine.
setDefaultTimeout(30_000)

let repo = ""

beforeEach(async () => {
  repo = mkdtempSync(join(tmpdir(), "holyclaude-shared-"))
  await $`git init -q -b main ${repo}`.quiet()
})

afterEach(() => {
  rmSync(repo, { recursive: true, force: true })
})

/** Runs git in the temporary repository, never in this one. */
const git = async (...args: string[]) => {
  const result = await $`git -C ${repo} -c user.name=Test -c user.email=test@example.com ${args}`
    .nothrow()
    .quiet()
  return { code: result.exitCode, out: result.stdout.toString(), err: result.stderr.toString() }
}

/** Runs the CLI as a user would, with the state directory override pointing into the repository. */
const holyclaude = async (stdin: object | undefined, ...args: string[]) => {
  const input = stdin === undefined ? "" : JSON.stringify(stdin)
  const result = await $`${process.execPath} ${MAIN} ${args} < ${new Response(input)}`
    .cwd(repo)
    .env({ ...process.env, HOLYCLAUDE_STATE_DIR: join(repo, ".holyclaude") })
    .nothrow()
    .quiet()
  expect(result.stderr.toString()).toBe("")
  expect(result.exitCode).toBe(0)
  return result.stdout.toString()
}

const idOf = (output: string) => /^id: (\S+)$/m.exec(output)?.[1] ?? ""

const createIntent = async (objective: string) =>
  idOf(await holyclaude({ objective, requirements: "r" }, "intent", "create"))

const createAssignment = async (intentId: string, objective: string) =>
  idOf(
    await holyclaude(
      {
        intent_id: intentId,
        intent_revision: 1,
        role: "Explorer.lookup",
        objective,
        acceptance_criteria: ["answered"],
        required_evidence: ["findings"],
        mutability: "ReadOnly",
      },
      "assignment",
      "create",
    ),
  )

const commit = async (message: string) => {
  expect((await git("add", "-A")).code).toBe(0)
  expect((await git("commit", "-q", "-m", message)).code).toBe(0)
}

const trackedFiles = async () =>
  (await git("ls-files")).out.split("\n").filter((line) => line !== "")

const listedIds = async () =>
  [...(await holyclaude(undefined, "assignment", "list")).matchAll(/assignment-[0-9a-z-]+/g)].map(
    ([id]) => id,
  )

describe("two branches that each add records", () => {
  test("merge without a conflict, and both records load afterwards", async () => {
    const intent = await createIntent("Share state")
    await commit("base")

    await git("checkout", "-q", "-b", "branch-a")
    const first = await createAssignment(intent, "Look at the store")
    await commit("assignment on a")

    await git("checkout", "-q", "main")
    await git("checkout", "-q", "-b", "branch-b")
    const second = await createAssignment(intent, "Look at the hooks")
    await commit("assignment on b")
    expect(first).not.toBe(second)

    await git("checkout", "-q", "main")
    const mergedA = await git("merge", "--no-ff", "-m", "merge a", "branch-a")
    const mergedB = await git("merge", "--no-ff", "-m", "merge b", "branch-b")
    expect(mergedA.code).toBe(0)
    expect(mergedB.code).toBe(0)
    expect(mergedA.out + mergedB.out).not.toContain("CONFLICT")

    const files = await trackedFiles()
    for (const id of [first, second])
      expect(files).toContain(`.holyclaude/intents/${intent}/assignments/${id}.json`)

    expect(await listedIds()).toEqual([first, second].toSorted())
    await holyclaude(undefined, "assignment", "show", first)
    await holyclaude(undefined, "assignment", "show", second)
    expect((await git("status", "--porcelain")).out).toBe("")
  })

  test("merge without a conflict when each branch adds an Intent", async () => {
    const base = await createIntent("Base")
    await commit("base")

    await git("checkout", "-q", "-b", "branch-a")
    const first = await createIntent("From a")
    await commit("intent on a")

    await git("checkout", "-q", "main")
    await git("checkout", "-q", "-b", "branch-b")
    await Bun.sleep(5)
    const second = await createIntent("From b")
    await commit("intent on b")

    await git("checkout", "-q", "main")
    expect((await git("merge", "--no-ff", "-m", "merge a", "branch-a")).code).toBe(0)
    expect((await git("merge", "--no-ff", "-m", "merge b", "branch-b")).code).toBe(0)

    // The latest Intent is the greatest id, here the one created last.
    expect(second > first).toBe(true)
    expect(first > base).toBe(true)
    expect(idOf(await holyclaude(undefined, "intent", "show"))).toBe(second)
  })
})

describe("local files and version control", () => {
  test("stay out of git, while the records and the folder's .gitignore are committed", async () => {
    const intent = await createIntent("Share state")
    const assignment = await createAssignment(intent, "Look at the store")
    await holyclaude(undefined, "assignment", "reserve", assignment)
    await holyclaude(
      undefined,
      "assignment",
      "bind",
      assignment,
      "--agent",
      "agent-7c1f9a",
      "--fingerprint",
      "roster:abc123",
    )
    await commit("everything")

    const files = await trackedFiles()
    expect(files.toSorted()).toEqual([
      ".holyclaude/.gitignore",
      `.holyclaude/intents/${intent}/assignments/${assignment}.json`,
      `.holyclaude/intents/${intent}/intent.json`,
    ])

    const local = [".holyclaude/local/agents.json", ".holyclaude/local/workers.json"]
    for (const file of local) {
      expect(await Bun.file(join(repo, file)).exists()).toBe(true)
      expect((await git("check-ignore", "-q", file)).code).toBe(0)
    }
    expect((await git("check-ignore", "-q", ".holyclaude/local/lock")).code).toBe(0)
    expect((await git("check-ignore", "-q", ".holyclaude/state.json.migrated")).code).toBe(0)
    expect((await git("check-ignore", "-q", ".holyclaude/intents/x/a.json.1.abc.tmp")).code).toBe(0)
    expect(
      (await git("check-ignore", "-q", `.holyclaude/intents/${intent}/intent.json`)).code,
    ).toBe(1)

    for (const file of files)
      expect(await Bun.file(join(repo, file)).text()).not.toMatch(/agent-7c1f9a|roster:abc123/)
    expect(await Bun.file(join(repo, ".holyclaude/local/clone.json")).text()).toContain("clone-")
  })
})
