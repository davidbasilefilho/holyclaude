import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, truncateSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { loadState, updateState, type State } from "@holyclaude/core"
import { Effect } from "effect"

import { COMMANDS } from "./commands.ts"
import { observationsPath } from "./observations.ts"

const reserved: State = {
  version: 1,
  intents: [{ id: "intent-0001", objective: "o", requirements: "r", revision: 1, state: "open" }],
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
const runCommand = (path: string, positionals: string[] = [], flags = {}, stdin = "") =>
  Effect.runPromise(command(path).run({ positionals, flags }, Effect.succeed(stdin)))

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

describe("list rows", () => {
  test("show a long objective whole", async () => {
    const objective = Array.from({ length: 40 }, (_, word) => `step${word}`).join("  ")
    await Effect.runPromise(
      updateState(directory, (state) =>
        Effect.succeed({
          state: {
            ...state,
            assignments: state.assignments.map((row) => ({ ...row, objective })),
          },
          value: 0,
        }),
      ),
    )
    const { value } = await runCommand("assignment list")
    const rows = (value as { assignments: ReadonlyArray<{ objective: string }> }).assignments
    expect(rows[0]?.objective).toBe(objective.replace(/\s+/g, " "))
  })
})

describe("JSON on stdin", () => {
  test("is accepted at any size, here over 64 KiB", async () => {
    const requirements = "x".repeat(70 * 1024)
    const outcome = await Effect.runPromise(
      command("intent create").run(
        { positionals: [], flags: {} },
        Effect.succeed(JSON.stringify({ objective: "o", requirements })),
      ),
    )
    expect(outcome.value).toMatchObject({ requirements })
  })
})

describe("order by id", () => {
  test("assignment list is in id order", async () => {
    await addRowFrom(undefined)
    const { value } = await runCommand("assignment list")
    expect(ids((value as { assignments: unknown }).assignments)).toEqual([
      "assignment-0001",
      "assignment-0002",
    ])
  })
})

const OLDER = "intent-0001"
const NEWER = "intent-0mg8k2x1a-7f3q"
const AT = /^\d{4}-\d\d-\d\dT/

/** Adds a second open Intent, and a Ready Assignment of it, to the state. */
const addNewerIntent = () =>
  Effect.runPromise(
    updateState(directory, (state) =>
      Effect.succeed({
        state: {
          ...state,
          intents: [
            ...state.intents,
            { id: NEWER, objective: "newer\n  goal", requirements: "", revision: 1, state: "open" },
          ],
          assignments: [
            ...state.assignments,
            {
              ...reserved.assignments[0]!,
              id: "assignment-0009",
              intent_id: NEWER,
              state: "Ready",
            },
          ],
        },
        value: 0,
      }),
    ),
  )

const intentOf = async (id: string) =>
  (await Effect.runPromise(loadState(directory))).intents.find((intent) => intent.id === id)!

const chosenFile = () => join(directory, "local", "active-intent.json")

describe("intent list", () => {
  test("prints id, state, revision, objective and the open-Assignment count, and filters by state", async () => {
    await addNewerIntent()
    const rows = (await runCommand("intent list")).value as { intents: ReadonlyArray<object> }
    expect(rows.intents).toEqual([
      { id: OLDER, state: "open", revision: 1, objective: "o", open_assignments: 1 },
      { id: NEWER, state: "open", revision: 1, objective: "newer goal", open_assignments: 1 },
    ])
    await runCommand("intent close", [], { intent: NEWER, reason: "done" })
    const closed = (await runCommand("intent list", [], { state: "closed" })).value
    expect(closed).toEqual({
      intents: [expect.objectContaining({ id: NEWER, state: "closed", open_assignments: 1 })],
    })
  })

  test("an unknown state is a usage error that names the states", async () => {
    const error = await refusal("intent list", [], { state: "paused" })
    expect(error).toMatchObject({ _tag: "Usage" })
    expect(String(error)).toContain("open|closed")
  })
})

describe("intent close and reopen", () => {
  test("close is refused while an Assignment of the Intent is Running", async () => {
    expect(await refusal("intent close", [], { reason: "done" })).toMatchObject({
      _tag: "IntentBusy",
      running: ["assignment-0001"],
    })
    expect((await intentOf(OLDER)).state).toBe("open")
  })

  test("close records the reason and the time once nothing runs, and a reason is required", async () => {
    await runCommand("reconcile resolve", ["assignment-0001"], { fail: "gone" })
    expect(await refusal("intent close", [])).toMatchObject({ _tag: "Usage" })
    await runCommand("intent close", [], { reason: "shipped" })
    expect(await intentOf(OLDER)).toMatchObject({
      state: "closed",
      close_reason: "shipped",
      closed_at: expect.stringMatching(AT),
      revision: 1,
    })
  })

  test("reopen returns it to open and bumps the revision", async () => {
    await runCommand("reconcile resolve", ["assignment-0001"], { fail: "gone" })
    await runCommand("intent close", [], { reason: "shipped" })
    await runCommand("intent reopen", [], { intent: OLDER })
    const reopened = await intentOf(OLDER)
    expect(reopened).toMatchObject({ state: "open", revision: 2 })
    expect(reopened).not.toHaveProperty("close_reason")
  })

  test("a closed Intent refuses to be created into, reserved, or followed up", async () => {
    await runCommand("reconcile resolve", ["assignment-0001"], { fail: "gone" })
    await runCommand("intent close", [], { reason: "shipped" })
    const draft = {
      intent_id: OLDER,
      intent_revision: 1,
      role: "Explorer.lookup",
      objective: "o",
      acceptance_criteria: ["a"],
      required_evidence: ["e"],
      mutability: "ReadOnly",
    }
    const json = JSON.stringify(draft)
    for (const [path, positionals] of [
      ["assignment create", []],
      ["assignment follow-up", ["assignment-0001"]],
    ] as const)
      expect(await refusal(path, [...positionals], {}, json)).toMatchObject({
        _tag: "IntentClosed",
      })
    await Effect.runPromise(
      updateState(directory, (state) =>
        Effect.succeed({
          state: {
            ...state,
            assignments: state.assignments.map((row) => ({ ...row, state: "Ready" as const })),
          },
          value: 0,
        }),
      ),
    )
    expect(
      await refusal("assignment reserve", ["assignment-0001"], { root: ["src"] }),
    ).toMatchObject({ _tag: "IntentClosed" })
  })
})

describe("intent use and the Intent a command acts on", () => {
  test("with one open Intent, commands act on it without a choice", async () => {
    expect((await runCommand("intent show")).value).toMatchObject({ id: OLDER })
    expect(
      ids(((await runCommand("assignment list")).value as { assignments: unknown }).assignments),
    ).toEqual(["assignment-0001"])
  })

  test("with several open and no choice, commands fail listing the open Intents", async () => {
    await addNewerIntent()
    for (const [path, flags] of [
      ["intent show", {}],
      ["assignment list", {}],
      ["intent close", { reason: "x" }],
    ] as const) {
      const error = await refusal(path, [], flags)
      expect(error).toMatchObject({ _tag: "NoActiveIntent" })
      expect(String(error)).toContain(OLDER)
      expect(String(error)).toContain(NEWER)
      expect(String(error)).toContain("intent use")
    }
  })

  test("use stores the choice in a local file, and commands then follow it", async () => {
    await addNewerIntent()
    await runCommand("intent use", [NEWER])
    expect(await Bun.file(chosenFile()).text()).toContain(NEWER)
    expect((await runCommand("intent show")).value).toMatchObject({ id: NEWER })
    const rows = (await runCommand("assignment list")).value as { assignments: unknown }
    expect(ids(rows.assignments)).toEqual(["assignment-0009"])
  })

  test("the choice is local: no record of the state changes", async () => {
    await addNewerIntent()
    const before = await Effect.runPromise(loadState(directory))
    await runCommand("intent use", [NEWER])
    expect(await Effect.runPromise(loadState(directory))).toEqual(before)
  })

  test("--intent beats the choice", async () => {
    await addNewerIntent()
    await runCommand("intent use", [NEWER])
    expect((await runCommand("intent show", [], { intent: OLDER })).value).toMatchObject({
      id: OLDER,
    })
  })

  test("use refuses a closed Intent and an unknown one", async () => {
    await addNewerIntent()
    await runCommand("intent close", [], { intent: NEWER, reason: "done" })
    expect(await refusal("intent use", [NEWER])).toMatchObject({ _tag: "IntentClosed" })
    expect(await refusal("intent use", ["intent-9999"])).toMatchObject({ _tag: "UnknownRecord" })
    expect(await Bun.file(chosenFile()).exists()).toBe(false)
  })

  test("a chosen Intent that closed later is ignored", async () => {
    await addNewerIntent()
    await runCommand("intent use", [NEWER])
    await runCommand("intent close", [], { intent: NEWER, reason: "done" })
    expect((await runCommand("intent show")).value).toMatchObject({ id: OLDER })
  })
})

describe("intent create", () => {
  const create = (objective: string) => runCommand("intent create", [], {}, objective)

  test("puts the new Intent in use and says which one it replaced", async () => {
    await addNewerIntent()
    await runCommand("intent use", [OLDER])
    const made = (await create('{"objective":"third"}')).value as {
      id: string
      in_use: string
      replaced: string | null
    }
    expect(made).toMatchObject({ in_use: made.id, replaced: OLDER, revision: 1, state: "open" })
    expect(await Bun.file(chosenFile()).text()).toContain(made.id)
    expect((await runCommand("intent show")).value).toMatchObject({ id: made.id })
  })

  test("replaces the only open Intent when none was chosen, and says none when none was open", async () => {
    const first = (await create('{"objective":"second"}')).value as { replaced: string | null }
    expect(first.replaced).toBe(OLDER)
    await runCommand("reconcile resolve", ["assignment-0001"], { fail: "gone" })
    for (const id of [OLDER, (first as { id?: string }).id!])
      await runCommand("intent close", [], { intent: id, reason: "done" })
    const fresh = (await create('{"objective":"fresh"}')).value as { replaced: string | null }
    expect(fresh.replaced).toBeNull()
  })
})

describe("a stored choice that cannot be read", () => {
  test("does not block a command that names its Intent", async () => {
    await addNewerIntent()
    await Bun.write(chosenFile(), "{ not json")
    expect((await runCommand("intent show", [], { intent: NEWER })).value).toMatchObject({
      id: NEWER,
    })
    expect((await runCommand("intent show", [NEWER])).value).toMatchObject({ id: NEWER })
    expect(await refusal("intent show", [])).toMatchObject({ _tag: "NoActiveIntent" })
  })

  test("counts as no choice, so the only open Intent is still used", async () => {
    await Bun.write(chosenFile(), "{ not json")
    expect((await runCommand("intent show")).value).toMatchObject({ id: OLDER })
  })
})

describe("intent reopen without --intent", () => {
  const close = async (id: string) => {
    await runCommand("intent close", [], { intent: id, reason: "done" })
  }

  test("reopens the only closed Intent", async () => {
    await runCommand("reconcile resolve", ["assignment-0001"], { fail: "gone" })
    await close(OLDER)
    expect((await runCommand("intent reopen")).value).toMatchObject({ id: OLDER, state: "open" })
  })

  test("is a usage error naming the closed Intents when several are closed, or none", async () => {
    expect(await refusal("intent reopen", [])).toMatchObject({ _tag: "Usage" })
    await addNewerIntent()
    await runCommand("reconcile resolve", ["assignment-0001"], { fail: "gone" })
    await close(OLDER)
    await close(NEWER)
    const error = await refusal("intent reopen", [])
    expect(error).toMatchObject({ _tag: "Usage" })
    expect(String(error)).toContain(OLDER)
    expect(String(error)).toContain(NEWER)
    expect((await runCommand("intent reopen", [], { intent: NEWER })).value).toMatchObject({
      id: NEWER,
      state: "open",
    })
  })
})

describe("two different targets", () => {
  test("intent show with an id and a different --intent is a usage error", async () => {
    await addNewerIntent()
    expect(await refusal("intent show", [OLDER], { intent: NEWER })).toMatchObject({
      _tag: "Usage",
    })
    expect((await runCommand("intent show", [NEWER], { intent: NEWER })).value).toMatchObject({
      id: NEWER,
    })
  })

  test("intent update with a JSON id and a different --intent is a usage error that changes nothing", async () => {
    await addNewerIntent()
    const before = await Effect.runPromise(loadState(directory))
    const body = JSON.stringify({ id: OLDER, objective: "renamed" })
    expect(await refusal("intent update", [], { intent: NEWER }, body)).toMatchObject({
      _tag: "Usage",
    })
    expect(await Effect.runPromise(loadState(directory))).toEqual(before)
    await runCommand("intent update", [], { intent: OLDER }, body)
    expect((await intentOf(OLDER)).objective).toBe("renamed")
  })
})

describe("assignment list scope", () => {
  test("defaults to the Intent in use, --intent selects another, --all shows every Intent", async () => {
    await addNewerIntent()
    await runCommand("intent use", [OLDER])
    const list = async (flags = {}) =>
      ids(
        ((await runCommand("assignment list", [], flags)).value as { assignments: unknown })
          .assignments,
      )
    expect(await list()).toEqual(["assignment-0001"])
    expect(await list({ intent: NEWER })).toEqual(["assignment-0009"])
    expect(await list({ all: true })).toEqual(["assignment-0001", "assignment-0009"])
    expect(await refusal("assignment list", [], { all: true, intent: NEWER })).toMatchObject({
      _tag: "Usage",
    })
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

  const observeTranscript = async (transcript: string) => {
    await runCommand("assignment bind", ["assignment-0001"], {
      agent: "agent-1",
      fingerprint: "roster:test",
    })
    const seen = { kind: "observed", agent_id: "agent-1", transcript, at: "2026-01-01T00:00:00Z" }
    appendFileSync(observationsPath(directory), `${JSON.stringify(seen)}\n`)
  }

  const verify = command("assignment verify").run(
    { positionals: ["assignment-0001"], flags: {} },
    Effect.succeed(""),
  )

  test("reads the model from a transcript within the cap", async () => {
    const transcript = join(outside, "transcript.jsonl")
    await Bun.write(transcript, `${JSON.stringify({ message: { model: "claude-sonnet-x" } })}\n`)
    await observeTranscript(transcript)
    const outcome = await Effect.runPromise(verify)
    expect(outcome.value).toMatchObject({
      checks: [{ field: "model", observed: "claude-sonnet-x" }, {}, {}],
    })
  })

  test("refuses a transcript over the cap rather than reading it whole", async () => {
    const transcript = join(outside, "transcript.jsonl")
    // A sparse file: its size is past the cap without writing the bytes.
    await Bun.write(transcript, "")
    truncateSync(transcript, 64 * 1024 * 1024 + 1)
    await observeTranscript(transcript)
    expect(await Effect.runPromise(Effect.flip(verify))).toMatchObject({ _tag: "TooLarge" })
  })
})

/** Marks the Running Assignment as Succeeded, as `assignment finish` leaves it. */
const succeed = () =>
  Effect.runPromise(
    updateState(directory, (state) =>
      Effect.succeed({
        state: {
          ...state,
          assignments: state.assignments.map((row) => ({ ...row, state: "Succeeded" as const })),
        },
        value: 0,
      }),
    ),
  )

const review = (revision: number, rationale = "the change touched none of its files") =>
  JSON.stringify({
    intent_revision: revision,
    rationale,
    criteria_evidence: { a: "seen" },
    required_evidence: { e: "seen" },
  })

const bumpRevision = () => runCommand("intent update", [], { material: true }, "{}")

describe("assignment accept --carry-forward", () => {
  test("accepts work from an earlier revision at the live one, and only with the flag", async () => {
    await succeed()
    await bumpRevision()
    expect(await refusal("assignment accept", ["assignment-0001"], {}, review(2))).toMatchObject({
      _tag: "StaleRevision",
      given: 1,
      live: 2,
    })
    const done = await runCommand(
      "assignment accept",
      ["assignment-0001"],
      { "carry-forward": true },
      review(2),
    )
    expect(done.value).toMatchObject({ id: "assignment-0001", rev: 1, accepted: true })
    const row = (await Effect.runPromise(loadState(directory))).assignments[0]!
    expect(row.intent_revision).toBe(1)
    expect(row.acceptance?.intent_revision).toBe(2)
  })

  test("needs a rationale, and an acceptance at the live revision", async () => {
    await succeed()
    await bumpRevision()
    const flags = { "carry-forward": true }
    expect(
      await refusal("assignment accept", ["assignment-0001"], flags, review(2, "  ")),
    ).toMatchObject({ _tag: "SchemaError" })
    expect(await refusal("assignment accept", ["assignment-0001"], flags, review(1))).toMatchObject(
      { _tag: "StaleRevision" },
    )
    expect((await Effect.runPromise(loadState(directory))).assignments[0]?.acceptance).toBeNull()
  })

  test("on work at the live revision the flag changes nothing", async () => {
    await succeed()
    const done = await runCommand(
      "assignment accept",
      ["assignment-0001"],
      { "carry-forward": true },
      review(1),
    )
    expect(done.value).toMatchObject({ accepted: true })
  })
})

describe("intent close and unaccepted work", () => {
  test("is refused listing the Succeeded Assignments never accepted, and --allow-unaccepted records why", async () => {
    await succeed()
    const error = await refusal("intent close", [], { reason: "shipped" })
    expect(error).toMatchObject({
      _tag: "UnacceptedAssignments",
      unaccepted: ["assignment-0001"],
    })
    expect(String(error)).toContain("assignment-0001")
    expect((await intentOf(OLDER)).state).toBe("open")
    await runCommand("intent close", [], {
      reason: "shipped",
      "allow-unaccepted": "superseded by the rewrite",
    })
    const closed = await intentOf(OLDER)
    expect(closed.state).toBe("closed")
    expect(closed.close_reason).toContain("shipped")
    expect(closed.close_reason).toContain("superseded by the rewrite")
  })

  test("an accepted Assignment does not block the close", async () => {
    await succeed()
    await runCommand("assignment accept", ["assignment-0001"], {}, review(1))
    await runCommand("intent close", [], { reason: "shipped" })
    expect((await intentOf(OLDER)).close_reason).toBe("shipped")
  })
})

describe("intent reopen and the Intent in use", () => {
  test("puts the reopened Intent in use and says which one it replaced", async () => {
    await runCommand("reconcile resolve", ["assignment-0001"], { fail: "gone" })
    await runCommand("intent close", [], { reason: "shipped" })
    await addNewerIntent()
    await runCommand("intent use", [NEWER])
    const reopened = (await runCommand("intent reopen", [], { intent: OLDER })).value as object
    expect(reopened).toMatchObject({ id: OLDER, in_use: OLDER, replaced: NEWER, revision: 2 })
    expect(await Bun.file(chosenFile()).text()).toContain(OLDER)
    expect((await runCommand("intent show")).value).toMatchObject({ id: OLDER })
  })

  test("says none was replaced when no Intent was open", async () => {
    await runCommand("reconcile resolve", ["assignment-0001"], { fail: "gone" })
    await runCommand("intent close", [], { reason: "shipped" })
    expect((await runCommand("intent reopen")).value).toMatchObject({
      in_use: OLDER,
      replaced: null,
    })
  })
})

describe("reconcile and a closed Intent", () => {
  test("flags a closed Intent that still has Ready or Running Assignments", async () => {
    await Effect.runPromise(
      updateState(directory, (state) =>
        Effect.succeed({
          state: {
            ...state,
            intents: state.intents.map((intent) => ({
              ...intent,
              state: "closed" as const,
              close_reason: "shipped",
              closed_at: "2026-01-02T03:04:05.000Z",
            })),
          },
          value: 0,
        }),
      ),
    )
    const { value } = await runCommand("reconcile")
    expect(value).toMatchObject({
      closed_with_open_work: [
        { intent: OLDER, close_reason: "shipped", assignments: [{ id: "assignment-0001" }] },
      ],
    })
  })

  test("says nothing about closed Intents when none has open work", async () => {
    await runCommand("reconcile resolve", ["assignment-0001"], { fail: "gone" })
    await runCommand("intent close", [], { reason: "shipped" })
    expect((await runCommand("reconcile")).value).not.toHaveProperty("closed_with_open_work")
  })
})
