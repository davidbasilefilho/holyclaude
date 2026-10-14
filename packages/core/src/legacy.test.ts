import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { Effect } from "effect"

import { decodeJsonStrict } from "./codec.ts"
import { State } from "./model/state.ts"
import { loadState, updateState } from "./store.ts"

/** The state file as the single-file store wrote it: two-space JSON, ids from the counter. */
const legacyText = (): string => {
  const metadata = (paths: ReadonlyArray<string>, dependencies: ReadonlyArray<string> = []) => ({
    ownership_paths: paths,
    symbols: [],
    domains: ["state"],
    dependencies,
    related_assignments: [],
    independent_from: [],
  })
  const draft = {
    intent_id: "intent-0001",
    intent_revision: 3,
    scope: ["packages/core/src"],
    constraints: ["No new dependencies"],
    acceptance_criteria: ["Records round-trip"],
    required_evidence: ["checks-run"],
    mutability: "ScopedWrite",
  }
  return `${JSON.stringify(
    {
      version: 1,
      intents: [
        {
          id: "intent-0001",
          objective: "Share state between clones",
          requirements: "One file per record.\nKeep local data local.",
          revision: 3,
        },
        { id: "intent-0002", objective: "Document it", requirements: "", revision: 1 },
      ],
      assignments: [
        {
          ...draft,
          role: "Worker.implementation",
          objective: "Write the store",
          metadata: metadata(["packages/core/src/store.ts"]),
          id: "assignment-0001",
          state: "Succeeded",
          agent_id: "a7e2c91b04d5f8a31",
          result: "Done. Checks pass.",
          acceptance: {
            intent_revision: 3,
            rationale: "Evidence reviewed",
            criteria_evidence: { "Records round-trip": "store tests" },
            required_evidence: { "checks-run": "bun test, exit 0" },
          },
        },
        {
          ...draft,
          role: "Reviewer.code",
          objective: "Review the store",
          mutability: "ReadOnly",
          metadata: metadata([], ["assignment-0001"]),
          id: "assignment-0002",
          state: "Running",
          agent_id: "b81f0d7733ce2a640",
          result: null,
          acceptance: null,
        },
        {
          ...draft,
          role: "Worker.implementation",
          objective: "Write the docs",
          metadata: metadata(["README.md"]),
          id: "assignment-0003",
          state: "Failed",
          agent_id: "c0ffee00112233445",
          result: "Stopped: out of context",
          acceptance: null,
        },
        {
          ...draft,
          intent_id: "intent-0002",
          intent_revision: 1,
          role: "Worker.implementation",
          objective: "Polish",
          metadata: metadata(["docs"]),
          id: "assignment-0004",
          state: "Ready",
          agent_id: null,
          result: null,
          acceptance: null,
        },
      ],
      workers: [
        {
          agent_id: "a7e2c91b04d5f8a31",
          preset: "Worker.implementation",
          fingerprint: "roster:5f3a9c",
          history: ["assignment-0001"],
        },
        {
          agent_id: "b81f0d7733ce2a640",
          preset: "Reviewer.code",
          fingerprint: "roster:77aa10",
          history: ["assignment-0002"],
        },
      ],
    },
    null,
    2,
  )}\n`
}

const OBSERVATION = JSON.stringify({
  kind: "observed",
  agent_id: "a7e2c91b04d5f8a31",
  transcript: "C:\\Users\\someone\\.claude\\projects\\x\\a7e2c91b04d5f8a31.jsonl",
  at: "2026-01-01T00:00:00Z",
})

let directory: string

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "holyclaude-legacy-"))
  await writeFile(join(directory, "state.json"), legacyText())
  await writeFile(join(directory, ".gitignore"), "*\n")
  await writeFile(join(directory, "state.observations.jsonl"), `${OBSERVATION}\n`)
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

const legacy = () => Effect.runPromise(decodeJsonStrict(State)(legacyText()))
const touch = () =>
  Effect.runPromise(updateState(directory, (state) => Effect.succeed({ state, value: state })))
const failure = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(Effect.flip(effect))
const exists = (...parts: string[]) => Bun.file(join(directory, ...parts)).exists()
const text = (...parts: string[]) => readFile(join(directory, ...parts), "utf8")

describe("reading before the first write", () => {
  test("a reader sees the old state as it is and writes nothing", async () => {
    expect(await Effect.runPromise(loadState(directory))).toEqual(await legacy())
    expect(await exists("state.json")).toBe(true)
    expect(await exists("intents")).toBe(false)
    expect(await text(".gitignore")).toBe("*\n")
  })
})

describe("migration on first use", () => {
  test("becomes record files, keeping the legacy ids", async () => {
    const before = await legacy()
    expect(await touch()).toEqual(before)
    expect(await Effect.runPromise(loadState(directory))).toEqual(before)
    for (const path of [
      ["intents", "intent-0001", "intent.json"],
      ["intents", "intent-0002", "intent.json"],
      ["intents", "intent-0001", "assignments", "assignment-0001.json"],
      ["intents", "intent-0001", "assignments", "assignment-0002.json"],
      ["intents", "intent-0001", "assignments", "assignment-0003.json"],
      ["intents", "intent-0002", "assignments", "assignment-0004.json"],
    ])
      expect(await exists(...path)).toBe(true)
  })

  test("sends agent ids and workers to local files and keeps them out of the records", async () => {
    await touch()
    expect(JSON.parse(await text("local", "agents.json"))).toEqual({
      "assignment-0001": "a7e2c91b04d5f8a31",
      "assignment-0002": "b81f0d7733ce2a640",
      "assignment-0003": "c0ffee00112233445",
    })
    expect(JSON.parse(await text("local", "workers.json")).workers).toHaveLength(2)
    const recorded = await Effect.runPromise(
      Effect.forEach(
        [
          ["intents", "intent-0001", "intent.json"],
          ["intents", "intent-0001", "assignments", "assignment-0001.json"],
          ["intents", "intent-0001", "assignments", "assignment-0002.json"],
          ["intents", "intent-0001", "assignments", "assignment-0003.json"],
          ["intents", "intent-0002", "assignments", "assignment-0004.json"],
        ],
        (path) => Effect.promise(() => text(...path)),
        { concurrency: "unbounded" },
      ),
    )
    for (const body of recorded)
      for (const word of ["agent_id", "a7e2c91b04d5f8a31", "roster:", "fingerprint"])
        expect(body).not.toContain(word)
  })

  test("renames the old file, which no longer counts as state", async () => {
    await touch()
    expect(await exists("state.json")).toBe(false)
    expect(await text("state.json.migrated")).toBe(legacyText())
    expect(await text(".gitignore")).toContain("/state.json.migrated")
  })

  test("replaces the old ignore-everything rule, so the records can be committed", async () => {
    await touch()
    expect(await text(".gitignore")).not.toBe("*\n")
    expect(await text(".gitignore")).toContain("/local/")
  })

  test("moves the observations log into local files", async () => {
    await touch()
    expect(await exists("state.observations.jsonl")).toBe(false)
    expect(await text("local", "observations.jsonl")).toBe(`${OBSERVATION}\n`)
  })

  test("is done once: the next update does not touch the records", async () => {
    await touch()
    const path = join(directory, "intents", "intent-0001", "intent.json")
    await writeFile(path, `${await readFile(path, "utf8")}\n`)
    const marked = await readFile(path, "utf8")
    await touch()
    expect(await readFile(path, "utf8")).toBe(marked)
  })

  test("a transition on the first use sees the old state and its change is kept", async () => {
    await Effect.runPromise(
      updateState(directory, (state) =>
        Effect.succeed({
          state: {
            ...state,
            intents: state.intents.map((intent) =>
              intent.id === "intent-0002" ? { ...intent, objective: "Document it well" } : intent,
            ),
          },
          value: 0,
        }),
      ),
    )
    const loaded = await Effect.runPromise(loadState(directory))
    expect(loaded.intents.map((intent) => intent.objective)).toEqual([
      "Share state between clones",
      "Document it well",
    ])
    expect(loaded.assignments).toHaveLength(4)
  })
})

describe("migration that stopped halfway or meets other records", () => {
  test("finishes when the records already written are the old file's own", async () => {
    await touch()
    // Put the old file back, as if the final rename had not happened.
    await writeFile(join(directory, "state.json"), legacyText())
    expect(await touch()).toEqual(await legacy())
    expect(await exists("state.json")).toBe(false)
  })

  test("never overwrites records that disagree with the old file", async () => {
    await touch()
    const path = join(directory, "intents", "intent-0001", "intent.json")
    const record = JSON.parse(await readFile(path, "utf8"))
    await writeFile(path, JSON.stringify({ ...record, objective: "Edited since" }))
    await writeFile(join(directory, "state.json"), legacyText())
    expect(
      await failure(updateState(directory, (state) => Effect.succeed({ state, value: 0 }))),
    ).toMatchObject({
      _tag: "CorruptRecord",
    })
    expect(JSON.parse(await readFile(path, "utf8")).objective).toBe("Edited since")
    expect(await exists("state.json")).toBe(true)
  })
})

describe("the folder's .gitignore", () => {
  test("is left alone when it is not the rule an earlier version wrote", async () => {
    await writeFile(join(directory, ".gitignore"), "*.log\n")
    await touch()
    expect(await text(".gitignore")).toBe("*.log\n")
  })
})

describe("the ignore rule while migrating", () => {
  const RULES = [
    "/local/",
    "*.tmp",
    "/state.json.migrated",
    "/state.json",
    "/state.json.lock*",
    "/state.observations.jsonl",
  ]
  const rules = async () => (await text(".gitignore")).split("\n").filter((line) => line !== "")

  const disagree = async () => {
    await touch()
    const path = join(directory, "intents", "intent-0001", "intent.json")
    const record = JSON.parse(await readFile(path, "utf8"))
    await writeFile(path, JSON.stringify({ ...record, objective: "Edited since" }))
    await writeFile(join(directory, "state.json"), legacyText())
    await writeFile(join(directory, ".gitignore"), "*\n")
  }

  test("the old ignore-everything rule is replaced even when the migration fails", async () => {
    await disagree()
    expect(
      await failure(updateState(directory, (state) => Effect.succeed({ state, value: 0 }))),
    ).toMatchObject({ _tag: "CorruptRecord" })
    expect(await rules()).toEqual(RULES)
  })

  test("a missing .gitignore is written as the exact list while the old file waits", async () => {
    await disagree()
    await rm(join(directory, ".gitignore"))
    await failure(updateState(directory, (state) => Effect.succeed({ state, value: 0 })))
    expect(await rules()).toEqual(RULES)
    expect(await exists("state.json")).toBe(true)
  })

  test("the list covers the old state file, its copy, its locks and its log", async () => {
    await touch()
    expect(await rules()).toEqual(RULES)
  })
})

describe("the old lock files", () => {
  test("are removed once the migration has succeeded", async () => {
    await writeFile(join(directory, "state.json.lock"), "stale")
    await writeFile(join(directory, "state.json.lock.breaking"), "stale")
    await touch()
    expect(await exists("state.json.lock")).toBe(false)
    expect(await exists("state.json.lock.breaking")).toBe(false)
  })

  test("stay when the migration fails", async () => {
    await touch()
    const path = join(directory, "intents", "intent-0001", "intent.json")
    const record = JSON.parse(await readFile(path, "utf8"))
    await writeFile(path, JSON.stringify({ ...record, objective: "Edited since" }))
    await writeFile(join(directory, "state.json"), legacyText())
    await writeFile(join(directory, "state.json.lock"), "stale")
    await failure(updateState(directory, (state) => Effect.succeed({ state, value: 0 })))
    expect(await exists("state.json.lock")).toBe(true)
  })
})

describe("a state.json.migrated already in place", () => {
  test("holding other text stops the migration, with nothing written and both files kept", async () => {
    await writeFile(join(directory, "state.json.migrated"), "an older copy")
    expect(
      await failure(updateState(directory, (state) => Effect.succeed({ state, value: 0 }))),
    ).toMatchObject({ _tag: "MigratedFileInTheWay" })
    expect(await text("state.json.migrated")).toBe("an older copy")
    expect(await text("state.json")).toBe(legacyText())
    expect(await exists("intents")).toBe(false)
  })

  test("holding the same text lets the migration finish and remove the old file", async () => {
    await writeFile(join(directory, "state.json.migrated"), legacyText())
    expect(await touch()).toEqual(await legacy())
    expect(await exists("state.json")).toBe(false)
    expect(await text("state.json.migrated")).toBe(legacyText())
  })
})

describe("a symbolic link where the migration reads", () => {
  let outside: string

  beforeEach(async () => {
    outside = await mkdtemp(join(tmpdir(), "holyclaude-outside-"))
  })
  afterEach(async () => {
    await rm(outside, { recursive: true, force: true })
  })

  // A junction is a link that needs no privilege on Windows, and the check looks at the link, not
  // at what is behind it.
  test("is refused for the old observations log, which is left unread", async () => {
    await rm(join(directory, "state.observations.jsonl"))
    await symlink(outside, join(directory, "state.observations.jsonl"), "junction")
    expect(
      await failure(updateState(directory, (state) => Effect.succeed({ state, value: 0 }))),
    ).toMatchObject({ _tag: "SymlinkRefused" })
    expect(await exists("local", "observations.jsonl")).toBe(false)
    expect(await exists("state.json")).toBe(true)
  })

  test("is refused for the old state file", async () => {
    await rm(join(directory, "state.json"))
    await symlink(outside, join(directory, "state.json"), "junction")
    expect(await failure(loadState(directory))).toMatchObject({ _tag: "SymlinkRefused" })
  })

  test("is refused for a log already in local/ that the old lines would be put before", async () => {
    await mkdir(join(directory, "local"), { recursive: true })
    await symlink(outside, join(directory, "local", "observations.jsonl"), "junction")
    expect(
      await failure(updateState(directory, (state) => Effect.succeed({ state, value: 0 }))),
    ).toMatchObject({ _tag: "SymlinkRefused" })
  })
})

describe("the observations log", () => {
  test("old lines go in front of a log that is already in local/", async () => {
    const newer = JSON.stringify({ kind: "observed", agent_id: "a9", at: "2026-02-01T00:00:00Z" })
    await mkdir(join(directory, "local"), { recursive: true })
    await writeFile(join(directory, "local", "observations.jsonl"), `${newer}\n`)
    await touch()
    expect(await text("local", "observations.jsonl")).toBe(`${OBSERVATION}\n${newer}\n`)
    expect(await exists("state.observations.jsonl")).toBe(false)
  })
})

describe("record files already on disk", () => {
  const PULLED_INTENT = "intent-0mg8k2x1a-7f3q"
  const PULLED_ASSIGNMENT = "assignment-0mg8k2x2b-9abc"

  /** A teammate's records, as a pull brings them into a folder that still has the old file. */
  const pull = async () => {
    const folder = join(directory, "intents", PULLED_INTENT)
    await mkdir(join(folder, "assignments"), { recursive: true })
    await writeFile(
      join(folder, "intent.json"),
      JSON.stringify({ id: PULLED_INTENT, objective: "Theirs", requirements: "", revision: 1 }),
    )
    const old = JSON.parse(legacyText()).assignments[3]
    const { agent_id: _agent, ...record } = old
    await writeFile(
      join(folder, "assignments", `${PULLED_ASSIGNMENT}.json`),
      JSON.stringify({ ...record, id: PULLED_ASSIGNMENT, intent_id: PULLED_INTENT }),
    )
  }

  test("are kept by the migration, which adds the old file's records beside them", async () => {
    await pull()
    const loaded = await touch()
    expect(loaded.intents.map((intent) => intent.id)).toEqual([
      "intent-0001",
      "intent-0002",
      PULLED_INTENT,
    ])
    expect(loaded.assignments.map((row) => row.id)).toEqual([
      "assignment-0001",
      "assignment-0002",
      "assignment-0003",
      "assignment-0004",
      PULLED_ASSIGNMENT,
    ])
    expect(await exists("state.json")).toBe(false)
    expect(await Effect.runPromise(loadState(directory))).toEqual(loaded)
  })

  test("are read together with the old file before it is migrated", async () => {
    await pull()
    const loaded = await Effect.runPromise(loadState(directory))
    expect(loaded.intents).toHaveLength(3)
    expect(loaded.assignments).toHaveLength(5)
    expect(await exists("state.json")).toBe(true)
  })
})
