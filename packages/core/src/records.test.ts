import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { hostname, tmpdir } from "node:os"
import { join } from "node:path"

import { Effect } from "effect"

import { readCloneId } from "./local.ts"
import type { Assignment } from "./model/assignment.ts"
import { emptyState, type Change, type State } from "./model/state.ts"
import { loadState, updateState } from "./store.ts"
import { reserve } from "./transitions/dispatch.ts"

const INTENT_A = "intent-0001"
const INTENT_B = "intent-0mg8k2x1a-7f3q"
const FIRST = "assignment-0001"
const SECOND = "assignment-0mg8k2x2b-9abc"

const intent = (id: string, objective = "Share state") => ({
  id,
  objective,
  requirements: "One file per record",
  revision: 1,
  state: "open" as const,
})

const assignment = (id: string, intentId: string, overrides: Partial<Assignment> = {}) =>
  ({
    intent_id: intentId,
    intent_revision: 1,
    role: "Worker.implementation",
    objective: "Write the store",
    scope: ["packages/core"],
    constraints: [],
    acceptance_criteria: ["records round-trip"],
    required_evidence: ["checks-run"],
    mutability: "ScopedWrite",
    metadata: {
      ownership_paths: ["packages/core/src"],
      symbols: [],
      domains: [],
      dependencies: [],
      related_assignments: [],
      independent_from: [],
    },
    id,
    state: "Ready",
    agent_id: null,
    result: null,
    acceptance: null,
    ...overrides,
  }) satisfies Assignment

const base: State = {
  ...emptyState,
  intents: [intent(INTENT_A), intent(INTENT_B, "Another task")],
  assignments: [assignment(FIRST, INTENT_A), assignment(SECOND, INTENT_B)],
}

let directory: string

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "holyclaude-records-"))
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

const write = (state: State) =>
  Effect.runPromise(updateState(directory, () => Effect.succeed({ state, value: "ok" })))

const change = <E>(transition: (state: State) => Effect.Effect<Change<string>, E>) =>
  Effect.runPromise(updateState(directory, transition))

const load = () => Effect.runPromise(loadState(directory))

const failure = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(Effect.flip(effect))

const intentPath = (id: string) => join(directory, "intents", id, "intent.json")
const assignmentPath = (intentId: string, id: string) =>
  join(directory, "intents", intentId, "assignments", `${id}.json`)

/** The text of each file, read together. */
const readTexts = (paths: ReadonlyArray<string>) =>
  Effect.runPromise(
    Effect.forEach(paths, (path) => Effect.promise(() => readFile(path, "utf8")), {
      concurrency: "unbounded",
    }),
  )

/** Every file under the directory outside `local/`, with its text. */
const committedFiles = async () => {
  const names = await Array.fromAsync(new Bun.Glob("**/*").scan({ cwd: directory, dot: true }))
  const committed = names
    .map((name) => name.replaceAll("\\", "/"))
    .filter((name) => !name.startsWith("local/"))
  return Effect.runPromise(
    Effect.forEach(
      committed,
      (name) =>
        Effect.promise(() => readFile(join(directory, name), "utf8")).pipe(
          Effect.map((text) => ({ name, text })),
        ),
      { concurrency: "unbounded" },
    ),
  )
}

describe("round trip", () => {
  test("loads what was written, Intents and Assignments in id order", async () => {
    await write({
      ...base,
      intents: [...base.intents].reverse(),
      assignments: [...base.assignments].reverse(),
    })
    const loaded = await load()
    expect(loaded.intents.map(({ id }) => id)).toEqual([INTENT_A, INTENT_B])
    expect(loaded.assignments.map(({ id }) => id)).toEqual([FIRST, SECOND])
    expect(loaded).toEqual(base)
  })

  test("writes an open Intent without a state and a closed one with it, and both read back", async () => {
    const closed = {
      ...base.intents[1]!,
      state: "closed" as const,
      close_reason: "shipped",
      closed_at: "2026-01-02T03:04:05.000Z",
    }
    await write({ ...base, intents: [base.intents[0]!, closed] })
    const [open, shut] = await readTexts([intentPath(INTENT_A), intentPath(INTENT_B)])
    expect(JSON.parse(open ?? "")).not.toHaveProperty("state")
    expect(JSON.parse(shut ?? "")).toMatchObject({ state: "closed", close_reason: "shipped" })
    expect((await load()).intents).toEqual([base.intents[0]!, closed])
  })

  test("keeps the agent id and the workers, which live in local files", async () => {
    const running = assignment(FIRST, INTENT_A, { state: "Running", agent_id: "agent-7" })
    const state: State = {
      ...base,
      assignments: [running, base.assignments[1]!],
      workers: [
        {
          agent_id: "agent-7",
          preset: "Worker.implementation",
          fingerprint: "roster:abc",
          history: [FIRST],
        },
      ],
    }
    await write(state)
    const loaded = await load()
    expect(loaded.workers).toEqual(state.workers)
    expect(loaded.assignments[0]).toMatchObject({ id: FIRST, agent_id: "agent-7" })
  })

  test("an empty directory is the empty state, and so is one that does not exist yet", async () => {
    expect(await load()).toEqual(emptyState)
    expect(await Effect.runPromise(loadState(join(directory, "not-yet")))).toEqual(emptyState)
  })

  test("a worker whose history names an Assignment from another branch still loads", async () => {
    await write({
      ...base,
      workers: [
        {
          agent_id: "agent-7",
          preset: "Worker.implementation",
          fingerprint: "roster:abc",
          history: ["assignment-0mg8k2x3c-zzzz"],
        },
      ],
    })
    expect((await load()).workers).toHaveLength(1)
  })
})

describe("record files", () => {
  test("sit at intents/<intent-id>/intent.json and intents/<intent-id>/assignments/<id>.json", async () => {
    await write(base)
    const names = (await committedFiles()).map(({ name }) => name).sort()
    expect(names).toEqual([
      ".gitignore",
      `intents/${INTENT_A}/assignments/${FIRST}.json`,
      `intents/${INTENT_A}/intent.json`,
      `intents/${INTENT_B}/assignments/${SECOND}.json`,
      `intents/${INTENT_B}/intent.json`,
    ])
  })

  test("have a stable key order, a two-space indent and a trailing newline", async () => {
    await write(base)
    const text = await readFile(intentPath(INTENT_A), "utf8")
    const { state: _open, ...stored } = intent(INTENT_A)
    expect(text).toBe(`${JSON.stringify(stored, null, 2)}\n`)
    expect(text).toContain('\n  "objective"')
    expect(Object.keys(JSON.parse(text))).toEqual(["id", "objective", "requirements", "revision"])
    const record = JSON.parse(await readFile(assignmentPath(INTENT_A, FIRST), "utf8"))
    expect(Object.keys(record)).toEqual([
      "intent_id",
      "intent_revision",
      "role",
      "objective",
      "scope",
      "constraints",
      "acceptance_criteria",
      "required_evidence",
      "mutability",
      "metadata",
      "id",
      "state",
      "result",
      "acceptance",
    ])
  })

  test("a rewrite of the same state produces the same bytes", async () => {
    await write(base)
    const first = await committedFiles()
    await change((state) => Effect.succeed({ state: { ...state }, value: "same" }))
    expect(await committedFiles()).toEqual(first)
  })

  test("a record over 256 KiB writes and reads back whole", async () => {
    const objective = "x".repeat(256 * 1024 + 1)
    await write({ ...emptyState, intents: [intent(INTENT_A, objective)] })
    expect((await readFile(intentPath(INTENT_A))).byteLength).toBeGreaterThan(256 * 1024)
    expect((await load()).intents[0]?.objective).toBe(objective)
  })

  describe("with a read bound", () => {
    const LIMIT = 4096
    const padded = "x".repeat(LIMIT)
    const bounded = () => failure(loadState(directory, LIMIT))

    test("an Intent over it fails the load as TooLarge, and reads whole with no bound", async () => {
      await write({ ...base, intents: [intent(INTENT_A, padded), intent(INTENT_B)] })
      expect(await bounded()).toMatchObject({ _tag: "TooLarge", limit: LIMIT })
      expect((await load()).intents[0]?.objective).toBe(padded)
    })

    test("an Assignment over it fails the load as TooLarge", async () => {
      await write({
        ...base,
        assignments: [assignment(FIRST, INTENT_A, { objective: padded }), base.assignments[1]!],
      })
      expect(await bounded()).toMatchObject({ _tag: "TooLarge", limit: LIMIT })
      expect((await load()).assignments).toHaveLength(2)
    })

    test("a local file over it fails the load as TooLarge", async () => {
      await write(base)
      expect((await Effect.runPromise(loadState(directory, LIMIT))).assignments).toHaveLength(2)
      await writeFile(join(directory, "local", "agents.json"), JSON.stringify({ [FIRST]: padded }))
      expect(await bounded()).toMatchObject({ _tag: "TooLarge", limit: LIMIT })
      expect((await load()).assignments[0]?.agent_id).toBe(padded)
    })
  })
})

describe("writing only what changed", () => {
  test("a change to one Assignment rewrites that file and no other", async () => {
    await write(base)
    // Valid JSON the writer would never produce. A file the writer does not touch keeps it.
    const untouched = [intentPath(INTENT_A), intentPath(INTENT_B), assignmentPath(INTENT_B, SECOND)]
    for (const path of untouched) await writeFile(path, `${await readFile(path, "utf8")}\n`)
    const marked = await readTexts(untouched)

    await change((state) =>
      Effect.succeed({
        state: {
          ...state,
          assignments: state.assignments.map((row) =>
            row.id === FIRST ? { ...row, state: "Cancelled" as const, result: "dropped" } : row,
          ),
        },
        value: "ok",
      }),
    )

    expect(await readTexts(untouched)).toEqual(marked)
    expect(JSON.parse(await readFile(assignmentPath(INTENT_A, FIRST), "utf8"))).toMatchObject({
      state: "Cancelled",
      result: "dropped",
    })
  })

  test("a transition that changes nothing writes nothing", async () => {
    await write(base)
    const path = intentPath(INTENT_A)
    await writeFile(path, `${await readFile(path, "utf8")}\n`)
    const marked = await readFile(path, "utf8")
    await change((state) =>
      Effect.succeed({ state: { ...state, intents: [...state.intents] }, value: "ok" }),
    )
    expect(await readFile(path, "utf8")).toBe(marked)
  })

  test("binding an agent changes no committed file", async () => {
    await write({
      ...base,
      assignments: [assignment(FIRST, INTENT_A, { state: "Running" }), base.assignments[1]!],
    })
    const before = await committedFiles()
    await change((state) =>
      Effect.succeed({
        state: {
          ...state,
          assignments: state.assignments.map((row) =>
            row.id === FIRST ? { ...row, agent_id: "agent-9" } : row,
          ),
        },
        value: "ok",
      }),
    )
    expect(await committedFiles()).toEqual(before)
    expect((await load()).assignments[0]?.agent_id).toBe("agent-9")
  })

  test("agent ids of Assignments that are not in this state survive a write", async () => {
    await write({
      ...base,
      assignments: [assignment(FIRST, INTENT_A, { state: "Running", agent_id: "agent-1" })],
      intents: [intent(INTENT_A)],
    })
    // The Assignment's record leaves with a branch switch; its agent id stays in the local file.
    await rm(assignmentPath(INTENT_A, FIRST))
    await write({ ...(await load()), intents: [intent(INTENT_A)] })
    expect(await Bun.file(join(directory, "local", "agents.json")).json()).toEqual({
      [FIRST]: "agent-1",
    })
  })
})

describe("a record that disagrees with where it lives", () => {
  test("an Intent whose id differs from its directory is CorruptRecord", async () => {
    await write(base)
    await writeFile(intentPath(INTENT_A), JSON.stringify(intent("intent-0002")))
    const error = await failure(loadState(directory))
    expect(error).toMatchObject({ _tag: "CorruptRecord" })
    expect(String(error)).toContain("does not match the directory")
  })

  test("an Assignment whose id differs from its file name is CorruptRecord", async () => {
    await write(base)
    const path = assignmentPath(INTENT_A, FIRST)
    const record = JSON.parse(await readFile(path, "utf8"))
    await writeFile(path, JSON.stringify({ ...record, id: "assignment-0009" }))
    const error = await failure(loadState(directory))
    expect(error).toMatchObject({ _tag: "CorruptRecord" })
    expect(String(error)).toContain("does not match the file name")
  })

  test("an Assignment filed under another Intent is CorruptRecord", async () => {
    await write(base)
    const path = assignmentPath(INTENT_A, FIRST)
    const record = JSON.parse(await readFile(path, "utf8"))
    await writeFile(path, JSON.stringify({ ...record, intent_id: INTENT_B }))
    expect(await failure(loadState(directory))).toMatchObject({ _tag: "CorruptRecord" })
  })

  test("a record with an unknown field is CorruptRecord", async () => {
    await write(base)
    const record = JSON.parse(await readFile(intentPath(INTENT_A), "utf8"))
    await writeFile(intentPath(INTENT_A), JSON.stringify({ ...record, surprise: 1 }))
    expect(await failure(loadState(directory))).toMatchObject({ _tag: "CorruptRecord" })
  })

  test("a record that is not valid JSON is CorruptRecord and names the file", async () => {
    await write(base)
    await writeFile(intentPath(INTENT_A), "{ not json")
    const error = await failure(loadState(directory))
    expect(error).toMatchObject({ _tag: "CorruptRecord", path: intentPath(INTENT_A) })
  })

  test("a record with git conflict markers names the file and says to resolve it in git", async () => {
    await write(base)
    const record = await readFile(intentPath(INTENT_A), "utf8")
    const merged = `<<<<<<< HEAD\n${record}=======\n${record}>>>>>>> feature\n`
    await writeFile(intentPath(INTENT_A), merged)
    const error = await failure(loadState(directory))
    expect(error).toMatchObject({ _tag: "CorruptRecord", path: intentPath(INTENT_A) })
    expect(String(error)).toContain(intentPath(INTENT_A))
    expect(String(error)).toContain("resolve the conflict in git")
    expect(String(error)).toContain("rerun")
  })

  test("an update refuses to run over a corrupt record", async () => {
    await write(base)
    await writeFile(intentPath(INTENT_A), "{ not json")
    expect(
      (await failure(updateState(directory, (state) => Effect.succeed({ state, value: 0 }))))._tag,
    ).toBe("CorruptRecord")
  })
})

describe("the clone stamp", () => {
  const reserveFirst = (state: State) =>
    reserve(
      state,
      { assignment_id: FIRST, capabilities: ["Write"] },
      { projectRoot: directory, writableRoots: [directory], worktree: "w" },
    ).pipe(Effect.map(({ state: next }) => ({ state: next, value: "reserved" })))

  test("a row entering Running is stamped with this clone's id, created on first use", async () => {
    await write(base)
    expect(await Effect.runPromise(readCloneId(directory))).toBeUndefined()
    await change(reserveFirst)
    const cloneId = await Effect.runPromise(readCloneId(directory))
    expect(cloneId).toMatch(/^clone-[0-9a-z]{9}-[0-9a-z]{4}$/)
    const [first, second] = (await load()).assignments
    expect(first).toMatchObject({ id: FIRST, state: "Running", clone_id: cloneId })
    expect(second).not.toHaveProperty("clone_id")
    expect(JSON.parse(await readFile(assignmentPath(INTENT_A, FIRST), "utf8")).clone_id).toBe(
      cloneId,
    )
  })

  test("a row that does not enter Running is not stamped", async () => {
    await write(base)
    expect(await Effect.runPromise(readCloneId(directory))).toBeUndefined()
    expect((await load()).assignments.every((row) => !("clone_id" in row))).toBe(true)
  })

  test("each directory is its own clone", async () => {
    const running: State = {
      ...base,
      assignments: [assignment(FIRST, INTENT_A, { state: "Running" })],
    }
    const ids = await Effect.runPromise(
      Effect.acquireUseRelease(
        Effect.promise(() => mkdtemp(join(tmpdir(), "holyclaude-records-"))),
        (other) =>
          Effect.forEach(
            [directory, other],
            (where) =>
              updateState(where, () => Effect.succeed({ state: running, value: "ok" })).pipe(
                Effect.andThen(readCloneId(where)),
              ),
            { concurrency: "unbounded" },
          ),
        (other) => Effect.promise(() => rm(other, { recursive: true, force: true })),
      ),
    )
    expect(ids[0]).toBeDefined()
    expect(ids[0]).not.toBe(ids[1])
  })
})

describe("what is committed and what stays local", () => {
  test("nothing machine-specific reaches a committed file", async () => {
    const running = assignment(FIRST, INTENT_A, {
      state: "Running",
      agent_id: "agent-a1b2c3-secret",
    })
    await write({
      ...base,
      assignments: [running, base.assignments[1]!],
      workers: [
        {
          agent_id: "agent-a1b2c3-secret",
          preset: "Worker.implementation",
          fingerprint: "roster:fingerprint-value",
          history: [FIRST],
        },
      ],
    })
    const committed = await committedFiles()
    expect(committed.length).toBeGreaterThan(1)
    const forbidden = [
      "agent_id",
      "agent-a1b2c3-secret",
      "fingerprint",
      "roster:fingerprint-value",
      hostname(),
      directory,
      directory.replaceAll("\\", "/"),
      tmpdir(),
      "transcript",
    ]
    for (const { name, text } of committed)
      for (const word of forbidden)
        expect({ name, has: text.includes(word) }).toEqual({ name, has: false })
    // The same facts are in the local files, so the loss is not silent.
    expect(await Bun.file(join(directory, "local", "agents.json")).text()).toContain(
      "agent-a1b2c3-secret",
    )
    expect(await Bun.file(join(directory, "local", "workers.json")).text()).toContain(
      "roster:fingerprint-value",
    )
  })

  test("the folder's .gitignore lists exactly the local files, never everything", async () => {
    await write(base)
    const rules = (await readFile(join(directory, ".gitignore"), "utf8"))
      .split("\n")
      .filter((line) => line !== "" && !line.startsWith("#"))
    expect(rules).toEqual([
      "/local/",
      "*.tmp",
      "/state.json.migrated",
      "/state.json",
      "/state.json.lock*",
      "/state.observations.jsonl",
    ])
    expect(rules).not.toContain("*")
  })

  test("an .gitignore the user wrote stays; the rule an earlier version wrote is replaced", async () => {
    await writeFile(join(directory, ".gitignore"), "mine\n")
    await write(base)
    expect(await readFile(join(directory, ".gitignore"), "utf8")).toBe("mine\n")
    await writeFile(join(directory, ".gitignore"), "*\n")
    await write({ ...base, intents: [intent(INTENT_A, "edited"), intent(INTENT_B)] })
    expect(await readFile(join(directory, ".gitignore"), "utf8")).not.toBe("*\n")
  })
})

describe("the local files", () => {
  const agentsFile = () => join(directory, "local", "agents.json")
  /** Agent ids for many Assignments of other branches. */
  const agents = (count: number) =>
    Object.fromEntries(
      Array.from({ length: count }, (_, index) => [
        `assignment-${String(index).padStart(9, "0")}-aaaa`,
        `agent-${"x".repeat(40)}${index}`,
      ]),
    )

  test("agents.json may outgrow 256 KiB, and a write keeps every entry", async () => {
    await write(base)
    await writeFile(agentsFile(), JSON.stringify(agents(6000)))
    expect((await readFile(agentsFile())).byteLength).toBeGreaterThan(256 * 1024)
    expect((await load()).assignments).toHaveLength(2)

    await write({
      ...base,
      assignments: [
        assignment(FIRST, INTENT_A, { state: "Running", agent_id: "agent-new" }),
        base.assignments[1]!,
      ],
    })
    const stored = JSON.parse(await readFile(agentsFile(), "utf8"))
    expect(Object.keys(stored)).toHaveLength(6001)
    expect(stored[FIRST]).toBe("agent-new")
  })

  test("a local file over 4 MiB reads and takes a write", async () => {
    await write(base)
    await writeFile(agentsFile(), JSON.stringify(agents(80_000)))
    expect((await readFile(agentsFile())).byteLength).toBeGreaterThan(4 * 1024 * 1024)
    expect((await load()).assignments).toHaveLength(2)

    await write({
      ...base,
      assignments: [
        assignment(FIRST, INTENT_A, { state: "Running", agent_id: "agent-new" }),
        base.assignments[1]!,
      ],
    })
    const stored = JSON.parse(await readFile(agentsFile(), "utf8"))
    expect(Object.keys(stored)).toHaveLength(80_001)
    expect(stored[FIRST]).toBe("agent-new")
  })
})
