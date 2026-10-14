import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { cp, mkdir, mkdtemp, readdir, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { Effect } from "effect"

import { attempt } from "./io.ts"
import { keepLocalFilesOutOfVersionControl } from "./layout.ts"
import { emptyState, type Change, type State } from "./model/state.ts"
import { refuseSymlinks } from "./safety.ts"
import { loadState, updateState } from "./store.ts"

const INTENT = "intent-0001"
const intent = { id: INTENT, objective: "o", requirements: "r", revision: 1 }
const withIntent: State = { ...emptyState, intents: [intent] }
const assignment = {
  intent_id: INTENT,
  intent_revision: 1,
  role: "Explorer.lookup",
  objective: "x",
  scope: [],
  constraints: [],
  acceptance_criteria: ["a"],
  required_evidence: ["e"],
  mutability: "ReadOnly",
  metadata: {
    ownership_paths: [],
    symbols: [],
    domains: [],
    dependencies: [],
    related_assignments: [],
    independent_from: [],
  },
  id: "assignment-0001",
  state: "Ready",
  agent_id: null,
  result: null,
  acceptance: null,
} as const

let directory: string
let outside: string

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "holyclaude-safety-"))
  outside = await mkdtemp(join(tmpdir(), "holyclaude-outside-"))
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
  await rm(outside, { recursive: true, force: true })
})

/** A directory link: a junction on Windows, which needs no privilege, and a symlink elsewhere. */
const linkDirectory = (target: string, path: string) => symlink(target, path, "junction")

/**
 * Links a directory at the path for the body, and removes the link once the body has finished,
 * whether it passes or fails.
 */
const withLink = <A>(target: string, path: string, body: () => Promise<A>) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        yield* Effect.acquireRelease(
          attempt(() => linkDirectory(target, path)),
          () => attempt(() => rm(path, { force: true })).pipe(Effect.orDie),
        )
        return yield* Effect.promise(body)
      }),
    ),
  )

/** A file symlink needs a privilege on Windows that the machine may not grant. */
const canLinkFiles = await Effect.runPromise(
  Effect.scoped(
    Effect.gen(function* () {
      const probe = yield* Effect.acquireRelease(
        attempt(() => mkdtemp(join(tmpdir(), "holyclaude-probe-"))),
        (probe) => attempt(() => rm(probe, { recursive: true, force: true })).pipe(Effect.orDie),
      )
      return yield* attempt(async () => {
        await writeFile(join(probe, "target"), "")
        await symlink(join(probe, "target"), join(probe, "link"), "file")
      }).pipe(
        Effect.as(true),
        Effect.orElseSucceed(() => false),
      )
    }),
  ),
)

const update = (state: State) => updateState(directory, () => Effect.succeed({ state, value: 0 }))

const write = (state: State) => Effect.runPromise(update(state))

const failure = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(Effect.flip(effect))

const change = (state: State): Change<number> => ({ state, value: 0 })

/** The refusal must come before anything is written, so the target stays empty. */
const expectUntouched = async () => expect(await readdir(outside)).toEqual([])

describe("refuseSymlinks", () => {
  test("accepts real paths, including ones that do not exist yet", async () => {
    await mkdir(join(directory, "intents"))
    await Effect.runPromise(refuseSymlinks(directory, join(directory, "intents", "x", "y.json")))
    await Effect.runPromise(refuseSymlinks(join(directory, "missing"), join(directory, "missing")))
  })

  test("refuses the directory itself, a component in the middle and the last component", async () => {
    await linkDirectory(outside, join(directory, "linked"))
    await mkdir(join(directory, "real"))
    await linkDirectory(outside, join(directory, "real", "last"))
    for (const path of [
      join(directory, "linked"),
      join(directory, "linked", "deep", "file.json"),
      join(directory, "real", "last"),
    ])
      expect(await failure(refuseSymlinks(directory, path))).toMatchObject({
        _tag: "SymlinkRefused",
      })

    const root = join(tmpdir(), `holyclaude-rootlink-${Date.now()}`)
    await withLink(outside, root, async () => {
      expect(await failure(refuseSymlinks(root, join(root, "a")))).toMatchObject({
        _tag: "SymlinkRefused",
        path: root,
      })
    })
  })
})

describe("a link under the state directory", () => {
  test("as the state directory itself is refused for reads and writes", async () => {
    const root = join(tmpdir(), `holyclaude-rootlink-${Date.now()}`)
    await withLink(outside, root, async () => {
      expect(await failure(loadState(root))).toMatchObject({ _tag: "SymlinkRefused" })
      expect(
        await failure(updateState(root, () => Effect.succeed(change(withIntent)))),
      ).toMatchObject({ _tag: "SymlinkRefused" })
      await expectUntouched()
    })
  })

  test("as intents/ is refused before any write", async () => {
    await linkDirectory(outside, join(directory, "intents"))
    expect(await failure(update(withIntent))).toMatchObject({ _tag: "SymlinkRefused" })
    expect(await failure(loadState(directory))).toMatchObject({ _tag: "SymlinkRefused" })
    await expectUntouched()
  })

  test("as an assignments/ directory is refused before any write", async () => {
    await write(withIntent)
    await linkDirectory(outside, join(directory, "intents", INTENT, "assignments"))
    expect(await failure(update({ ...withIntent, assignments: [assignment] }))).toMatchObject({
      _tag: "SymlinkRefused",
    })
    await expectUntouched()
  })

  test("as intents/<id> is refused for a read, which a glob would skip without a word", async () => {
    await write({ ...withIntent, assignments: [assignment] })
    const folder = join(directory, "intents", INTENT)
    await cp(folder, outside, { recursive: true })
    await rm(folder, { recursive: true })
    await linkDirectory(outside, folder)
    expect(await failure(loadState(directory))).toMatchObject({
      _tag: "SymlinkRefused",
      path: folder,
    })
  })

  test("as an assignments/ directory is refused for a read, even when it holds no record", async () => {
    await write(withIntent)
    const folder = join(directory, "intents", INTENT, "assignments")
    await linkDirectory(outside, folder)
    expect(await failure(loadState(directory))).toMatchObject({
      _tag: "SymlinkRefused",
      path: folder,
    })
  })

  test("at the path a record is to be written is refused, and nothing lands behind it", async () => {
    await write(withIntent)
    const folder = join(directory, "intents", INTENT, "assignments")
    await mkdir(folder)
    await linkDirectory(outside, join(folder, "assignment-0001.json"))
    expect(await failure(update({ ...withIntent, assignments: [assignment] }))).toMatchObject({
      _tag: "SymlinkRefused",
    })
    await expectUntouched()
  })

  test("as local/ is refused before the lock, a write or an rm", async () => {
    await linkDirectory(outside, join(directory, "local"))
    expect(await failure(update(withIntent))).toMatchObject({ _tag: "SymlinkRefused" })
    expect(await failure(loadState(directory))).toMatchObject({ _tag: "SymlinkRefused" })
    await expectUntouched()
  })

  test("as the lock file is refused", async () => {
    await mkdir(join(directory, "local"))
    await linkDirectory(outside, join(directory, "local", "lock"))
    expect(await failure(update(withIntent))).toMatchObject({ _tag: "SymlinkRefused" })
    await expectUntouched()
  })

  test("as the .gitignore is refused, and nothing is created behind it", async () => {
    await linkDirectory(outside, join(directory, ".gitignore"))
    expect(await failure(keepLocalFilesOutOfVersionControl(directory))).toMatchObject({
      _tag: "SymlinkRefused",
    })
    expect(await failure(update(withIntent))).toMatchObject({ _tag: "SymlinkRefused" })
    await expectUntouched()
  })

  test.skipIf(!canLinkFiles)(
    "as a record file is refused, and its target is left alone",
    async () => {
      await write(withIntent)
      const target = join(outside, "target.json")
      await writeFile(target, "{}")
      const record = join(directory, "intents", INTENT, "intent.json")
      await rm(record)
      await symlink(target, record, "file")
      expect(await failure(loadState(directory))).toMatchObject({ _tag: "SymlinkRefused" })
      expect(
        await failure(update({ ...withIntent, intents: [{ ...intent, objective: "changed" }] })),
      ).toMatchObject({ _tag: "SymlinkRefused" })
      expect(await Bun.file(target).text()).toBe("{}")
    },
  )

  test.skipIf(!canLinkFiles)(
    "as a dangling .gitignore is refused, and its target is not created",
    async () => {
      const target = join(outside, "created-through-link")
      await symlink(target, join(directory, ".gitignore"), "file")
      expect(await failure(update(withIntent))).toMatchObject({ _tag: "SymlinkRefused" })
      expect(await Bun.file(target).exists()).toBe(false)
    },
  )

  test.skipIf(!canLinkFiles)("as a local file is refused", async () => {
    await mkdir(join(directory, "local"))
    const target = join(outside, "agents.json")
    await writeFile(target, "{}")
    await symlink(target, join(directory, "local", "agents.json"), "file")
    expect(await failure(loadState(directory))).toMatchObject({ _tag: "SymlinkRefused" })
    expect(await Bun.file(target).text()).toBe("{}")
  })
})
