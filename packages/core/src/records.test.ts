import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises"
import { hostname, tmpdir } from "node:os"
import { dirname, join } from "node:path"

import { Effect } from "effect"

import { assignmentFile, intentFile } from "./layout.ts"
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

// Where `base` puts a record: the helpers below follow the names its objectives give.
const intentPath = (id: string) =>
  intentFile(directory, base.intents.find((row) => row.id === id) ?? intent(id))
const assignmentPath = (intentId: string, id: string) =>
  assignmentFile(
    dirname(intentPath(intentId)),
    base.assignments.find((row) => row.id === id)!,
  )

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
  test("sit at intents/<slug>-<intent-id>/intent.json and .../assignments/<slug>-<id>.json", async () => {
    await write(base)
    const names = (await committedFiles()).map(({ name }) => name).sort()
    expect(names).toEqual([
      ".gitignore",
      `intents/another-task-${INTENT_B}/assignments/write-the-store-${SECOND}.json`,
      `intents/another-task-${INTENT_B}/intent.json`,
      `intents/share-state-${INTENT_A}/assignments/write-the-store-${FIRST}.json`,
      `intents/share-state-${INTENT_A}/intent.json`,
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
    const large = intent(INTENT_A, objective)
    await write({ ...emptyState, intents: [large] })
    expect((await readFile(intentFile(directory, large))).byteLength).toBeGreaterThan(256 * 1024)
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
    expect(String(error)).toContain("does not end the directory name")
  })

  test("an Assignment whose id differs from its file name is CorruptRecord", async () => {
    await write(base)
    const path = assignmentPath(INTENT_A, FIRST)
    const record = JSON.parse(await readFile(path, "utf8"))
    await writeFile(path, JSON.stringify({ ...record, id: "assignment-0009" }))
    const error = await failure(loadState(directory))
    expect(error).toMatchObject({ _tag: "CorruptRecord" })
    expect(String(error)).toContain("does not end the file name")
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

describe("names built from objectives", () => {
  const setObjective = (id: string, objective: string) =>
    change((state) =>
      Effect.succeed({
        state: {
          ...state,
          intents: state.intents.map((row) => (row.id === id ? { ...row, objective } : row)),
          assignments: state.assignments.map((row) =>
            row.id === id ? { ...row, objective } : row,
          ),
        },
        value: "ok",
      }),
    )

  /** The path of every committed record file, relative and sorted. */
  const recordNames = async () =>
    (await committedFiles())
      .map(({ name }) => name)
      .filter((name) => name.startsWith("intents/"))
      .sort()

  test("an objective with no letter or digit leaves just the id", async () => {
    await write({ ...emptyState, intents: [intent(INTENT_B, "?!")] })
    expect(await recordNames()).toEqual([`intents/${INTENT_B}/intent.json`])
  })

  test("a changed Intent objective moves the directory in one rename, Assignments inside it", async () => {
    await write(base)
    const assignmentText = await readFile(assignmentPath(INTENT_A, FIRST), "utf8")
    await setObjective(INTENT_A, "Dividir o estado: ação por clone")

    const folder = `intents/dividir-o-estado-acao-por-clone-${INTENT_A}`
    expect(await recordNames()).toEqual([
      `intents/another-task-${INTENT_B}/assignments/write-the-store-${SECOND}.json`,
      `intents/another-task-${INTENT_B}/intent.json`,
      `${folder}/assignments/write-the-store-${FIRST}.json`,
      `${folder}/intent.json`,
    ])
    // The Assignment's own record is untouched; only its directory moved.
    expect(
      await readFile(
        join(directory, folder, "assignments", `write-the-store-${FIRST}.json`),
        "utf8",
      ),
    ).toBe(assignmentText)
    expect((await load()).intents[0]?.objective).toBe("Dividir o estado: ação por clone")
  })

  test("a changed Assignment objective renames its file", async () => {
    await write(base)
    await setObjective(FIRST, "Review the store")
    expect(await recordNames()).toContain(
      `intents/share-state-${INTENT_A}/assignments/review-the-store-${FIRST}.json`,
    )
    expect(await recordNames()).not.toContain(
      `intents/share-state-${INTENT_A}/assignments/write-the-store-${FIRST}.json`,
    )
    expect((await load()).assignments[0]?.objective).toBe("Review the store")
  })

  test("a change that keeps the slug moves nothing", async () => {
    await write(base)
    const names = await recordNames()
    await setObjective(INTENT_A, "SHARE state!")
    expect(await recordNames()).toEqual(names)
    expect((await load()).intents[0]?.objective).toBe("SHARE state!")
  })

  test("an Assignment added after its Intent was renamed lands in the new directory", async () => {
    await write({ ...base, assignments: [] })
    await change((state) =>
      Effect.succeed({
        state: {
          ...state,
          intents: state.intents.map((row) =>
            row.id === INTENT_A ? { ...row, objective: "Renamed" } : row,
          ),
          assignments: [assignment(FIRST, INTENT_A)],
        },
        value: "ok",
      }),
    )
    expect(await recordNames()).toContain(
      `intents/renamed-${INTENT_A}/assignments/write-the-store-${FIRST}.json`,
    )
  })

  describe("on disk under other names", () => {
    const plain = (id: string, ...rest: string[]) => join(directory, "intents", id, ...rest)

    /** Records as an earlier version wrote them: directory and file named by the id alone. */
    const writePlain = async () => {
      await mkdir(plain(INTENT_A, "assignments"), { recursive: true })
      await writeFile(plain(INTENT_A, "intent.json"), JSON.stringify(base.intents[0]))
      const { agent_id: _agent, ...stored } = base.assignments[0]!
      await writeFile(plain(INTENT_A, "assignments", `${FIRST}.json`), JSON.stringify(stored))
    }

    test("plain id names, legacy ids included, still load", async () => {
      await writePlain()
      const loaded = await load()
      expect(loaded.intents).toEqual([base.intents[0]!])
      expect(loaded.assignments).toEqual([base.assignments[0]!])
    })

    test("a plain name stays until its record is written, and then takes the slugged one", async () => {
      await writePlain()
      await change((state) => Effect.succeed({ state: { ...state }, value: "same" }))
      expect(await recordNames()).toEqual([
        `intents/${INTENT_A}/assignments/${FIRST}.json`,
        `intents/${INTENT_A}/intent.json`,
      ])
      await setObjective(FIRST, "Write the store, again")
      expect(await recordNames()).toEqual([
        `intents/${INTENT_A}/assignments/write-the-store-again-${FIRST}.json`,
        `intents/${INTENT_A}/intent.json`,
      ])
      await change((state) =>
        Effect.succeed({
          state: {
            ...state,
            intents: state.intents.map((row) => ({ ...row, requirements: "more" })),
          },
          value: "ok",
        }),
      )
      expect(await recordNames()).toEqual([
        `intents/share-state-${INTENT_A}/assignments/write-the-store-again-${FIRST}.json`,
        `intents/share-state-${INTENT_A}/intent.json`,
      ])
      expect((await load()).assignments).toHaveLength(1)
    })

    test("the id is the end of the name, whatever the slug holds", async () => {
      // The slug names another Intent; only the trailing id counts.
      await write({ ...emptyState, intents: [intent(INTENT_A, `See ${INTENT_B}`)] })
      expect(await recordNames()).toEqual([`intents/see-${INTENT_B}-${INTENT_A}/intent.json`])
      expect((await load()).intents.map(({ id }) => id)).toEqual([INTENT_A])
    })

    test("a slug that is stale or hand-written still loads", async () => {
      await write(base)
      await rename(plain(`share-state-${INTENT_A}`), plain(`something-else-${INTENT_A}`))
      expect((await load()).intents.map(({ id }) => id)).toEqual([INTENT_A, INTENT_B])
    })

    test("a name that does not end in the record's id is CorruptRecord", async () => {
      await write(base)
      await rename(plain(`share-state-${INTENT_A}`), plain(`${INTENT_A}-share-state`))
      const error = await failure(loadState(directory))
      expect(error).toMatchObject({ _tag: "CorruptRecord" })
      expect(String(error)).toContain("does not end the directory name")
    })

    test("a 0.1.0-style name that holds another record's id is CorruptRecord", async () => {
      await writePlain()
      await rename(plain(INTENT_A), plain("intent-0002"))
      const error = await failure(loadState(directory))
      expect(error).toMatchObject({
        _tag: "CorruptRecord",
        path: plain("intent-0002", "intent.json"),
      })
      expect(String(error)).toContain("does not end the directory name")
    })

    test("an Assignment whose file name ends in another id is CorruptRecord", async () => {
      await write(base)
      const folder = plain(`share-state-${INTENT_A}`, "assignments")
      await rename(
        join(folder, `write-the-store-${FIRST}.json`),
        join(folder, `write-the-store-${SECOND}.json`),
      )
      const error = await failure(loadState(directory))
      expect(error).toMatchObject({ _tag: "CorruptRecord" })
      expect(String(error)).toContain("does not end the file name")
    })

    test("an Assignment in the directory of another Intent is CorruptRecord", async () => {
      await write(base)
      await rename(
        plain(`share-state-${INTENT_A}`, "assignments", `write-the-store-${FIRST}.json`),
        plain(`another-task-${INTENT_B}`, "assignments", `write-the-store-${FIRST}.json`),
      )
      const error = await failure(loadState(directory))
      expect(error).toMatchObject({ _tag: "CorruptRecord" })
      expect(String(error)).toContain("is in the directory")
    })

    test("an Assignment in a folder that merely ends in its intent id is CorruptRecord", async () => {
      // The folder name ends in INTENT_A, but the Intent record of INTENT_A lives in another one.
      await write(base)
      const impostor = plain(`impostor-${INTENT_A}`, "assignments")
      await mkdir(impostor, { recursive: true })
      await rename(
        plain(`share-state-${INTENT_A}`, "assignments", `write-the-store-${FIRST}.json`),
        join(impostor, `write-the-store-${FIRST}.json`),
      )
      const error = await failure(loadState(directory))
      expect(error).toMatchObject({ _tag: "CorruptRecord" })
      expect(String(error)).toContain(`share-state-${INTENT_A}`)
      expect(String(error)).toContain(`impostor-${INTENT_A}`)
    })

    test("a file name that ends in two loaded ids is CorruptRecord", async () => {
      await write({ ...base, assignments: [assignment(FIRST, INTENT_A)] })
      const crafted = `assignment-store-${FIRST}`
      const folder = plain(`share-state-${INTENT_A}`, "assignments")
      const { agent_id: _agent, ...stored } = assignment(crafted, INTENT_A)
      await writeFile(join(folder, `${crafted}.json`), JSON.stringify(stored))
      const error = await failure(loadState(directory))
      expect(error).toMatchObject({ _tag: "CorruptRecord" })
      expect(String(error)).toContain(crafted)
      expect(String(error)).toContain(FIRST)
    })

    test("a directory name with a backslash is CorruptRecord, never read as a path of its own", async () => {
      await write(base)
      // On POSIX this is one directory. Read as a path it would be the folder of the first Intent,
      // and the Assignment in it would pass for that Intent's own.
      const trick = `share-state-${INTENT_A}\\x\\foo-assignment-9`
      await mkdir(plain(trick, "assignments"), { recursive: true })
      const { agent_id: _agent, ...stored } = assignment("assignment-9", INTENT_A)
      await writeFile(plain(trick, "assignments", "foo-assignment-9.json"), JSON.stringify(stored))
      const error = await failure(loadState(directory))
      expect(error).toMatchObject({ _tag: "CorruptRecord" })
      expect(String(error)).toContain("backslash")
      expect(String(error)).toContain(trick)
    })

    test("one id in two directories is CorruptRecord naming both paths, and no update runs", async () => {
      await write(base)
      const original = plain(`share-state-${INTENT_A}`, "intent.json")
      const copy = plain(`copy-of-${INTENT_A}`, "intent.json")
      await mkdir(plain(`copy-of-${INTENT_A}`), { recursive: true })
      await writeFile(copy, await readFile(original, "utf8"))
      const error = await failure(loadState(directory))
      expect(error).toMatchObject({ _tag: "CorruptRecord" })
      expect(String(error)).toContain(original)
      expect(String(error)).toContain(copy)
      const before = await recordNames()
      expect(
        (
          await failure(
            updateState(directory, (state) => Effect.succeed({ state: { ...state }, value: 0 })),
          )
        )._tag,
      ).toBe("CorruptRecord")
      expect(await recordNames()).toEqual(before)
    })

    test("one Assignment id in two files is CorruptRecord naming both paths", async () => {
      await write(base)
      const folder = plain(`share-state-${INTENT_A}`, "assignments")
      const original = join(folder, `write-the-store-${FIRST}.json`)
      const copy = join(folder, `older-name-${FIRST}.json`)
      await writeFile(copy, await readFile(original, "utf8"))
      const error = await failure(loadState(directory))
      expect(error).toMatchObject({ _tag: "CorruptRecord" })
      expect(String(error)).toContain(original)
      expect(String(error)).toContain(copy)
    })
  })
})

describe("a write never lands on another record's path", () => {
  const VICTIM = FIRST
  const victim = () => assignment(VICTIM, INTENT_A, { objective: "Review assignment store" })
  // Its name, `review-assignment-store-<VICTIM>`, is the victim's own path.
  const crafted = () => assignment(`assignment-store-${VICTIM}`, INTENT_A, { objective: "Review" })
  const victimPath = () =>
    join(dirname(intentPath(INTENT_A)), "assignments", `review-assignment-store-${VICTIM}.json`)

  test("an Assignment whose name is another's path is CorruptRecord, and the other stays", async () => {
    await write({ ...base, assignments: [victim()] })
    const text = await readFile(victimPath(), "utf8")
    const error = await failure(
      updateState(directory, (state) =>
        Effect.succeed({
          state: { ...state, assignments: [...state.assignments, crafted()] },
          value: "ok",
        }),
      ),
    )
    expect(error).toMatchObject({ _tag: "CorruptRecord", path: victimPath() })
    expect(String(error)).toContain(VICTIM)
    expect(String(error)).toContain(`assignment-store-${VICTIM}`)
    expect(await readFile(victimPath(), "utf8")).toBe(text)
    expect((await load()).assignments.map(({ id }) => id)).toEqual([VICTIM])
  })

  test("a name that ends in another id is refused even where nothing is overwritten", async () => {
    await write({ ...base, assignments: [victim()] })
    const error = await failure(
      updateState(directory, (state) =>
        Effect.succeed({
          state: {
            ...state,
            assignments: [
              ...state.assignments,
              assignment(`assignment-store-${VICTIM}`, INTENT_A, { objective: "Another thing" }),
            ],
          },
          value: "ok",
        }),
      ),
    )
    expect(error).toMatchObject({ _tag: "CorruptRecord" })
    expect(String(error)).toContain("ends in the id of")
    // The state still loads: nothing the next load would refuse was written.
    expect((await load()).assignments.map(({ id }) => id)).toEqual([VICTIM])
  })

  /** Adds the Assignments to the stored state, renaming the first Intent when asked to. */
  const add = (added: ReadonlyArray<Assignment>, renamed?: string) =>
    updateState(directory, (state) =>
      Effect.succeed({
        state: {
          ...state,
          intents: state.intents.map((row) =>
            renamed !== undefined && row.id === INTENT_A ? { ...row, objective: renamed } : row,
          ),
          assignments: [...state.assignments, ...added],
        },
        value: "ok",
      }),
    )

  test("a refused record writes nothing, not even the Intent move that came before it", async () => {
    await write({ ...base, assignments: [victim()] })
    const stored = await committedFiles()
    const error = await failure(add([crafted()], "Renamed"))
    expect(error).toMatchObject({ _tag: "CorruptRecord" })
    expect(await committedFiles()).toEqual(stored)
    expect((await load()).intents.map(({ objective }) => objective)).toEqual([
      "Share state",
      "Another task",
    ])
  })

  test("a record that stays is refused when its name ends in an id this change adds", async () => {
    // `assignment-0009` ends the stored name below, though the stored record's own id is longer.
    const stays = assignment("assignment-x-assignment-0009", INTENT_A)
    await write({ ...base, assignments: [stays] })
    const stored = await committedFiles()
    const error = await failure(
      add([assignment("assignment-0009", INTENT_A, { objective: "New" })]),
    )
    expect(error).toMatchObject({ _tag: "CorruptRecord" })
    expect(String(error)).toContain(stays.id)
    expect(String(error)).toContain("assignment-0009")
    expect(await committedFiles()).toEqual(stored)
    expect((await load()).assignments.map(({ id }) => id)).toEqual([stays.id])
  })

  test("an id too long for a name is refused fast, however many hyphens it has", async () => {
    // Ids have no length cap, and an old state file may hold one; its name could never be written.
    const long = `intent-${"a-".repeat(500_000)}a`
    const started = performance.now()
    const error = await failure(
      updateState(directory, () =>
        Effect.succeed({ state: { ...emptyState, intents: [intent(long, "Long")] }, value: "ok" }),
      ),
    )
    expect(error).toMatchObject({ _tag: "CorruptRecord" })
    expect(String(error)).toContain("file systems allow")
    expect(performance.now() - started).toBeLessThan(2_000)
  })

  test("two records of one write that name the same path are CorruptRecord", async () => {
    await write({ ...base, assignments: [] })
    const first = assignment("assignment-77", INTENT_A, { objective: "Review assignment store" })
    const second = assignment("assignment-store-assignment-77", INTENT_A, { objective: "Review" })
    const error = await failure(
      updateState(directory, (state) =>
        Effect.succeed({
          state: { ...state, assignments: [first, second] },
          value: "ok",
        }),
      ),
    )
    expect(error).toMatchObject({ _tag: "CorruptRecord" })
    expect(String(error)).toContain(first.id)
    expect(String(error)).toContain(second.id)
  })

  test("a new Intent whose folder is another Intent's is CorruptRecord, and the other stays", async () => {
    const holder = intent(INTENT_A, "Share intent state")
    await write({ ...emptyState, intents: [holder] })
    const path = intentFile(directory, holder)
    const text = await readFile(path, "utf8")
    // `share-intent-state-intent-0001` is the holder's folder.
    const newcomer = intent("intent-state-intent-0001", "Share")
    expect(intentFile(directory, newcomer)).toBe(path)
    const error = await failure(
      updateState(directory, (state) =>
        Effect.succeed({ state: { ...state, intents: [...state.intents, newcomer] }, value: "ok" }),
      ),
    )
    expect(error).toMatchObject({ _tag: "CorruptRecord", path })
    expect(await readFile(path, "utf8")).toBe(text)
    expect((await load()).intents.map(({ id }) => id)).toEqual([INTENT_A])
  })

  test("an Intent that moves onto a folder left behind is CorruptRecord naming that folder", async () => {
    await write(base)
    const stale = join(directory, "intents", `renamed-${INTENT_A}`)
    await mkdir(stale, { recursive: true })
    await writeFile(join(stale, "notes.txt"), "kept by a merge")
    const renameIntent = () =>
      updateState(directory, (state) =>
        Effect.succeed({
          state: {
            ...state,
            intents: state.intents.map((row) =>
              row.id === INTENT_A ? { ...row, objective: "Renamed" } : row,
            ),
          },
          value: "ok",
        }),
      )
    for (const _ of [1, 2]) {
      const error = await failure(renameIntent())
      expect(error).toMatchObject({ _tag: "CorruptRecord", path: stale })
      expect(String(error)).toContain("move")
      expect(String(error)).toContain(intentPath(INTENT_A).replace(/\/intent\.json$/, ""))
    }
    // The Intent stays where it was, and moves once the folder is out of the way.
    expect((await load()).intents.map(({ id }) => id)).toEqual([INTENT_A, INTENT_B])
    await rm(stale, { recursive: true })
    await Effect.runPromise(renameIntent())
    expect(
      (
        await Array.fromAsync(new Bun.Glob("intents/*/intent.json").scan({ cwd: directory }))
      ).sort(),
    ).toContain(`intents/renamed-${INTENT_A}/intent.json`)
  })
})

describe("a load that races a folder rename", () => {
  const scan: Bun.Glob["scan"] = Reflect.get(Bun.Glob.prototype, "scan")
  afterEach(() => {
    Bun.Glob.prototype.scan = scan
  })

  /** Makes the first `times` scans list an Intent file that is not there, as a rename leaves it. */
  const listGhost = (times: number) => {
    let left = times
    Bun.Glob.prototype.scan = function (this: Bun.Glob, options) {
      const listing = scan.call(this, options)
      if (left <= 0) return listing
      left -= 1
      return (async function* () {
        yield "intents/old-name-intent-0009/intent.json"
        yield* listing
      })()
    }
  }

  test("is repeated once, and reads the state that is there", async () => {
    await write(base)
    listGhost(1)
    expect((await load()).intents.map(({ id }) => id)).toEqual([INTENT_A, INTENT_B])
  })

  test("an Assignment listed after its Intent's folder moved is repeated once, and reads the new state", async () => {
    await write(base)
    const from = join(directory, "intents", `share-state-${INTENT_A}`)
    const to = join(directory, "intents", `renamed-${INTENT_A}`)
    let left = 1
    Bun.Glob.prototype.scan = function (this: Bun.Glob, options) {
      if (!this.match("intents/x/assignments/y.json") || left <= 0) return scan.call(this, options)
      left -= 1
      // The listing starts after the rename, as it does when a writer is quicker than the reader.
      return (async function* (glob: Bun.Glob) {
        await rename(from, to)
        yield* scan.call(glob, options)
      })(this)
    }
    expect((await load()).assignments.map(({ id }) => id)).toEqual([FIRST, SECOND])
    expect(left).toBe(0)
  })

  test("a file that stays missing is CorruptRecord naming it", async () => {
    await write(base)
    listGhost(Infinity)
    const error = await failure(loadState(directory))
    expect(error).toMatchObject({
      _tag: "CorruptRecord",
      path: join(directory, "intents/old-name-intent-0009/intent.json"),
    })
    expect(String(error)).toContain("disappeared while reading")
  })
})

describe("the clone stamp", () => {
  const reserveFirst = (state: State) =>
    reserve(
      state,
      { assignment_id: FIRST, capabilities: ["Write"] },
      { projectRoot: directory, writableRoots: [directory] },
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
