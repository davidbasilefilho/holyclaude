import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { loadState, updateState, type State } from "@holyclaude/core"
import { Effect } from "effect"

import { COMMANDS } from "./commands.ts"
import { observationsPath } from "./observations.ts"

const reserved: State = {
  version: 1,
  intents: [{ id: "intent-0001", objective: "o", requirements: "r", revision: 1 }],
  assignments: [
    {
      id: "assignment-0001",
      intent_id: "intent-0001",
      intent_revision: 1,
      role: "Worker.implementation",
      objective: "o",
      scope: [],
      constraints: [],
      acceptance_criteria: ["a"],
      required_evidence: ["e"],
      mutability: "ScopedWrite",
      metadata: {
        ownership_paths: ["src/a.ts"],
        symbols: [],
        domains: [],
        dependencies: [],
        related_assignments: [],
        independent_from: [],
      },
      state: "Running",
      agent_id: null,
      result: null,
      acceptance: null,
    },
  ],
  workers: [],
}

let directory = ""
const previous = process.env["HOLYCLAUDE_STATE_DIR"]

beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), "holyclaude-cli-"))
  process.env["HOLYCLAUDE_STATE_DIR"] = directory
  await Effect.runPromise(
    updateState(directory, () => Effect.succeed({ state: reserved, value: 0 })),
  )
})

afterEach(() => {
  if (previous === undefined) delete process.env["HOLYCLAUDE_STATE_DIR"]
  else process.env["HOLYCLAUDE_STATE_DIR"] = previous
  rmSync(directory, { recursive: true, force: true })
})

const bind = COMMANDS.find((command) => command.path.join(" ") === "assignment bind")

describe("assignment bind with an observation that cannot be written", () => {
  test("still binds the agent and reports the observation as not recorded", async () => {
    // A directory where the observations file belongs makes every append fail with EISDIR.
    mkdirSync(observationsPath(directory), { recursive: true })
    const outcome = await Effect.runPromise(
      bind!.run(
        {
          positionals: ["assignment-0001"],
          flags: { agent: "agent-1", model: "sonnet", fingerprint: "roster:test" },
        },
        Effect.succeed(""),
      ),
    )
    expect(outcome.value).toMatchObject({ id: "assignment-0001", agent_id: "agent-1" })
    expect(outcome.value).toHaveProperty("observation")
    const state = await Effect.runPromise(loadState(directory))
    expect(state.assignments[0]?.agent_id).toBe("agent-1")
    expect(state.workers.map((worker) => worker.agent_id)).toEqual(["agent-1"])
  })
})

const command = (path: string) => COMMANDS.find((candidate) => candidate.path.join(" ") === path)!
const runCommand = (path: string, positionals: string[] = [], flags = {}) =>
  Effect.runPromise(command(path).run({ positionals, flags }, Effect.succeed("")))

/** Adds a Running row as another clone left it, by writing its record the way a merge brings it. */
const addRowFrom = async (clone: string | undefined) => {
  const folder = join(directory, "intents", "intent-0001", "assignments")
  const record = await Bun.file(join(folder, "assignment-0001.json")).json()
  const { clone_id: _own, ...unstamped } = record
  await Bun.write(
    join(folder, "assignment-0002.json"),
    JSON.stringify({
      ...unstamped,
      id: "assignment-0002",
      metadata: { ...unstamped.metadata, ownership_paths: ["src/b.ts"] },
      ...(clone === undefined ? {} : { clone_id: clone }),
    }),
  )
}

const ids = (rows: unknown) => (rows as ReadonlyArray<{ id: string }>).map((row) => row.id)

describe("reconcile and the clone stamp", () => {
  test("lists this clone's Running rows apart from rows running elsewhere", async () => {
    await addRowFrom("clone-0mg8k2x1a-7f3q")
    const { value } = await runCommand("reconcile")
    const report = value as { running: unknown; running_elsewhere: unknown }
    expect(ids(report.running)).toEqual(["assignment-0001"])
    expect(ids(report.running_elsewhere)).toEqual(["assignment-0002"])
    expect(report.running_elsewhere).toEqual([
      expect.objectContaining({ id: "assignment-0002", clone: "clone-0mg8k2x1a-7f3q" }),
    ])
  })

  test("a row without a stamp counts as this clone's", async () => {
    await addRowFrom(undefined)
    const { value } = await runCommand("reconcile")
    const report = value as { running: unknown }
    expect(ids(report.running)).toEqual(["assignment-0001", "assignment-0002"])
    expect(value).not.toHaveProperty("running_elsewhere")
  })

  test("reconcile changes nothing, and resolve still settles a row running elsewhere by name", async () => {
    await addRowFrom("clone-0mg8k2x1a-7f3q")
    await runCommand("reconcile")
    const untouched = (await Effect.runPromise(loadState(directory))).assignments
    expect(untouched.map((row) => row.state)).toEqual(["Running", "Running"])

    await runCommand("reconcile resolve", ["assignment-0002"], { fail: "its clone is gone" })
    const settled = (await Effect.runPromise(loadState(directory))).assignments
    expect(settled.map((row) => [row.id, row.state])).toEqual([
      ["assignment-0001", "Running"],
      ["assignment-0002", "Failed"],
    ])
  })
})

describe("order by id", () => {
  test("intent show without an id shows the greatest id, and assignment list is in id order", async () => {
    await Effect.runPromise(
      updateState(directory, (state) =>
        Effect.succeed({
          state: {
            ...state,
            intents: [
              { id: "intent-0mg8k2x1a-7f3q", objective: "newer", requirements: "", revision: 1 },
              ...state.intents,
            ],
          },
          value: 0,
        }),
      ),
    )
    expect((await runCommand("intent show")).value).toMatchObject({ objective: "newer" })
    expect((await runCommand("intent show", ["intent-0001"])).value).toMatchObject({
      id: "intent-0001",
    })
    await addRowFrom(undefined)
    const { value } = await runCommand("assignment list")
    expect(ids((value as { assignments: unknown }).assignments)).toEqual([
      "assignment-0001",
      "assignment-0002",
    ])
  })
})

describe("reserve and rows running elsewhere", () => {
  const readyRow = async (id: string, path: string) => {
    const folder = join(directory, "intents", "intent-0001", "assignments")
    const record = await Bun.file(join(folder, "assignment-0001.json")).json()
    const { clone_id: _own, ...unstamped } = record
    await Bun.write(
      join(folder, `${id}.json`),
      JSON.stringify({
        ...unstamped,
        id,
        state: "Ready",
        metadata: { ...unstamped.metadata, ownership_paths: [path] },
      }),
    )
  }
  const reserveRoot = (id: string) => runCommand("assignment reserve", [id], { root: ["src"] })

  test("a Running writer of another clone does not block a local reserve", async () => {
    await addRowFrom("clone-0mg8k2x1a-7f3q")
    await readyRow("assignment-0003", "src/b.ts")
    const { value } = await reserveRoot("assignment-0003")
    expect(value).toMatchObject({ id: "assignment-0003", state: "Running" })
  })

  test("a Running writer of this clone still blocks it", async () => {
    await readyRow("assignment-0003", "src/a.ts")
    const refused = await Effect.runPromise(
      command("assignment reserve")
        .run({ positionals: ["assignment-0003"], flags: { root: ["src"] } }, Effect.succeed(""))
        .pipe(Effect.flip),
    )
    expect(refused).toMatchObject({ reason: "OwnershipConflict" })
  })
})

const OTHER = "clone-0mg8k2x1a-7f3q"
const refusal = (path: string, positionals: string[], flags = {}, stdin = "") =>
  Effect.runPromise(
    command(path).run({ positionals, flags }, Effect.succeed(stdin)).pipe(Effect.flip),
  )

describe("operations on a row another clone reserved", () => {
  const cases: ReadonlyArray<readonly [string, string[], object, string]> = [
    ["assignment bind", ["assignment-0002"], { agent: "agent-9", fingerprint: "f" }, ""],
    ["assignment rollback", ["assignment-0002"], {}, ""],
    ["assignment cancel", ["assignment-0002"], {}, ""],
    ["assignment finish", ["assignment-0002"], { outcome: "success" }, '{"result":"done"}'],
  ]

  for (const [path, positionals, flags, stdin] of cases)
    test(`${path} is refused and names the owning clone`, async () => {
      await addRowFrom(OTHER)
      const error = await refusal(path, positionals, flags, stdin)
      expect(error).toMatchObject({
        _tag: "OwnedElsewhere",
        id: "assignment-0002",
        clone_id: OTHER,
      })
      expect(String(error)).toContain(OTHER)
      const rows = (await Effect.runPromise(loadState(directory))).assignments
      expect(rows.map((row) => [row.id, row.state, row.agent_id])).toEqual([
        ["assignment-0001", "Running", null],
        ["assignment-0002", "Running", null],
      ])
    })

  test("reconcile resolve on the named row still works", async () => {
    await addRowFrom(OTHER)
    await runCommand("reconcile resolve", ["assignment-0002"], { fail: "its clone is gone" })
    expect((await Effect.runPromise(loadState(directory))).assignments[1]?.state).toBe("Failed")
  })

  test("an unknown id is still reported as unknown, and an unstamped row is not refused", async () => {
    expect(
      await refusal("assignment bind", ["assignment-0009"], { agent: "a", fingerprint: "f" }),
    ).toMatchObject({ _tag: "UnknownRecord" })
    await addRowFrom(undefined)
    await runCommand("assignment bind", ["assignment-0002"], { agent: "agent-9", fingerprint: "f" })
    expect((await Effect.runPromise(loadState(directory))).assignments[1]?.agent_id).toBe("agent-9")
  })
})

describe("two first reserves at once", () => {
  test("exactly one of two overlapping reserves succeeds, whoever creates the clone id", async () => {
    // A project that has never reserved anything, so no clone id exists yet.
    rmSync(directory, { recursive: true, force: true })
    mkdirSync(directory, { recursive: true })
    const ready = (id: string) => ({ ...reserved.assignments[0]!, id, state: "Ready" as const })
    await Effect.runPromise(
      updateState(directory, () =>
        Effect.succeed({
          state: { ...reserved, assignments: [ready("assignment-0001"), ready("assignment-0002")] },
          value: 0,
        }),
      ),
    )
    expect(await Bun.file(join(directory, "local", "clone.json")).exists()).toBe(false)

    const attempts = await Effect.runPromise(
      Effect.forEach(
        ["assignment-0001", "assignment-0002"],
        (id) =>
          command("assignment reserve")
            .run({ positionals: [id], flags: { root: ["src"] } }, Effect.succeed(""))
            .pipe(Effect.result),
        { concurrency: "unbounded" },
      ),
    )
    expect(attempts.map((attempt) => attempt._tag).sort()).toEqual(["Failure", "Success"])
    const refused = attempts.find((attempt) => attempt._tag === "Failure")
    expect(refused).toMatchObject({ failure: { reason: "OwnershipConflict" } })
    const running = (await Effect.runPromise(loadState(directory))).assignments.filter(
      (row) => row.state === "Running",
    )
    expect(running).toHaveLength(1)
  })
})

describe("assignment verify", () => {
  let outside = ""
  beforeEach(() => {
    outside = mkdtempSync(join(tmpdir(), "holyclaude-outside-"))
  })
  afterEach(() => rmSync(outside, { recursive: true, force: true }))

  test("refuses an observations file that is a link, rather than reading what it points at", async () => {
    await runCommand("assignment bind", ["assignment-0001"], {
      agent: "agent-1",
      model: "sonnet",
      fingerprint: "roster:test",
    })
    rmSync(observationsPath(directory), { force: true })
    symlinkSync(outside, observationsPath(directory), "junction")
    const error = await Effect.runPromise(
      command("assignment verify")
        .run({ positionals: ["assignment-0001"], flags: {} }, Effect.succeed(""))
        .pipe(Effect.flip),
    )
    expect(error).toMatchObject({ _tag: "SymlinkRefused" })
  })
})
