import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test"
import { rmSync, writeFileSync } from "node:fs"
import * as nodeFs from "node:fs/promises"
import { hostname, tmpdir } from "node:os"
import { join } from "node:path"

import { Effect } from "effect"

import { breakStaleLock } from "./lock.ts"
import { emptyState, type Change } from "./model/state.ts"
import { loadState, updateState } from "./store.ts"

// Far above any real pid range, so process.kill(pid, 0) reports ESRCH.
const DEAD_PID = 2_147_483_646
const LONG_AGO = new Date(Date.now() - 10 * 60_000)

// Taken before the mock below replaces the module's exports.
const real = { ...nodeFs }
const { mkdtemp, rm, utimes } = real
const realKill = process.kill.bind(process)

// A test arms `failures` to make the next calls of open or rename fail with `code`; anything else
// passes through to the real function. Windows raises EPERM and EBUSY like this while another
// process has a file open, which a test cannot provoke the same way on every platform.
const injected = {
  open: { failures: 0, calls: 0, code: "EPERM" },
  rename: { failures: 0, calls: 0, code: "EPERM" },
}
const inject = <A>(name: keyof typeof injected, run: () => Promise<A>) => {
  const fault = injected[name]
  fault.calls += 1
  if (fault.failures === 0) return run()
  fault.failures -= 1
  return Promise.reject(Object.assign(new Error(`${fault.code}: injected`), { code: fault.code }))
}
void mock.module("node:fs/promises", () => ({
  ...real,
  open: (...args: Parameters<typeof real.open>) => inject("open", () => real.open(...args)),
  rename: (...args: Parameters<typeof real.rename>) => inject("rename", () => real.rename(...args)),
}))

let directory: string
let lockFile: string
let guardFile: string

beforeEach(async () => {
  for (const fault of Object.values(injected))
    Object.assign(fault, { failures: 0, calls: 0, code: "EPERM" })
  directory = await mkdtemp(join(tmpdir(), "holyclaude-store-"))
  lockFile = join(directory, "local", "lock")
  guardFile = `${lockFile}.breaking`
})

afterEach(async () => {
  mock.restore()
  await rm(directory, { recursive: true, force: true })
})

const record = (owner: Record<string, unknown>) => JSON.stringify(owner)

const owner = (overrides: Record<string, unknown> = {}) => ({
  pid: process.pid,
  host: hostname(),
  token: "someone-else",
  acquired_at: Date.now(),
  ...overrides,
})

const plant = async (file: string, content: string, mtime?: Date) => {
  await Bun.write(file, content)
  if (mtime !== undefined) await utimes(file, mtime, mtime)
}

const withIntent = (state: typeof emptyState, objective = "o"): Change<string> => ({
  state: {
    ...state,
    intents: [{ id: "intent-1", objective, requirements: "r", revision: 1, state: "open" }],
  },
  value: "ok",
})

/** Every file under the directory, relative and sorted, dot files included. */
const files = async () =>
  (await Array.fromAsync(new Bun.Glob("**/*").scan({ cwd: directory, dot: true })))
    .map((name) => name.replaceAll("\\", "/"))
    .sort()
const INTENT_FILE = "intents/o-intent-1/intent.json"

const breaks = () => Effect.runPromise(breakStaleLock(lockFile))

describe("lock staleness", () => {
  test("a live owner on this host keeps its lock however old it is", async () => {
    await plant(lockFile, record(owner()), LONG_AGO)
    expect(await breaks()).toBe(false)
    expect(await Bun.file(lockFile).exists()).toBe(true)
  })

  test("a dead owner on this host loses the lock even when it is fresh", async () => {
    await plant(lockFile, record(owner({ pid: DEAD_PID })))
    expect(await breaks()).toBe(true)
    expect(await Bun.file(lockFile).exists()).toBe(false)
  })

  test("another host is judged by age only", async () => {
    await plant(lockFile, record(owner({ host: "elsewhere", pid: DEAD_PID })))
    expect(await breaks()).toBe(false)
    await utimes(lockFile, LONG_AGO, LONG_AGO)
    expect(await breaks()).toBe(true)
  })

  test("an unreadable record is judged by age only", async () => {
    await plant(lockFile, "not json")
    expect(await breaks()).toBe(false)
    await utimes(lockFile, LONG_AGO, LONG_AGO)
    expect(await breaks()).toBe(true)
  })

  test("a record with excess properties is undecodable, so a dead pid alone proves nothing", async () => {
    await plant(lockFile, record(owner({ pid: DEAD_PID, extra: true })))
    expect(await breaks()).toBe(false)
  })

  test("a record that fails validation is undecodable", async () => {
    await plant(lockFile, record(owner({ pid: 0, token: "  " })))
    expect(await breaks()).toBe(false)
  })

  test("a lock file over the owner cap is not read, so it is judged by age only", async () => {
    // Valid JSON naming a dead owner, padded past the cap. Read whole, the dead pid would break it.
    const padded = record(owner({ pid: DEAD_PID })) + " ".repeat(8 * 1024)
    await plant(lockFile, padded)
    expect(await breaks()).toBe(false)
    await utimes(lockFile, LONG_AGO, LONG_AGO)
    expect(await breaks()).toBe(true)
  })

  test("a guard over the owner cap is not read, so a live-looking breaker is judged by age", async () => {
    await plant(lockFile, record(owner({ pid: DEAD_PID })))
    await plant(guardFile, record(owner()) + " ".repeat(8 * 1024), LONG_AGO)
    expect(await breaks()).toBe(false)
    expect(await Bun.file(guardFile).exists()).toBe(false)
    expect(await breaks()).toBe(true)
  })

  test("a guard left by a dead breaker expires, and the next attempt breaks the lock", async () => {
    await plant(lockFile, record(owner({ pid: DEAD_PID })))
    await plant(guardFile, record(owner({ pid: DEAD_PID })))
    expect(await breaks()).toBe(false)
    expect(await Bun.file(guardFile).exists()).toBe(false)
    expect(await breaks()).toBe(true)
  })

  test("a guard held by a live breaker is respected", async () => {
    await plant(lockFile, record(owner({ pid: DEAD_PID })))
    await plant(guardFile, record(owner()), LONG_AGO)
    expect(await breaks()).toBe(false)
    expect(await Bun.file(guardFile).exists()).toBe(true)
    expect(await Bun.file(lockFile).exists()).toBe(true)
  })

  // The owner looks dead only after `during` has run. That stands for a holder that released and
  // exited, and a successor that took its place, while the verdict was being reached.
  const diesAfter = (during: () => void) =>
    spyOn(process, "kill").mockImplementation((pid, signal) => {
      if (pid !== DEAD_PID) return realKill(pid, signal)
      during()
      throw Object.assign(new Error("kill ESRCH"), { code: "ESRCH" })
    })

  test("a lock taken over after its owner was judged dead is not removed", async () => {
    const successor = record(owner({ token: "successor" }))
    await plant(lockFile, record(owner({ pid: DEAD_PID, token: "dead-holder" })))
    diesAfter(() => writeFileSync(lockFile, successor))
    expect(await breaks()).toBe(false)
    expect(await Bun.file(lockFile).text()).toBe(successor)
  })

  test("a lock released after its owner was judged dead is left alone", async () => {
    await plant(lockFile, record(owner({ pid: DEAD_PID, token: "dead-holder" })))
    diesAfter(() => rmSync(lockFile))
    expect(await breaks()).toBe(false)
    expect(await Bun.file(lockFile).exists()).toBe(false)
  })

  test("a guard taken over after its owner was judged dead is not removed", async () => {
    const successor = record(owner({ token: "successor" }))
    await plant(lockFile, record(owner({ pid: DEAD_PID, token: "dead-holder" })))
    await plant(guardFile, record(owner({ pid: DEAD_PID, token: "dead-breaker" })))
    diesAfter(() => writeFileSync(guardFile, successor))
    expect(await breaks()).toBe(false)
    expect(await Bun.file(guardFile).text()).toBe(successor)
    expect(await Bun.file(lockFile).exists()).toBe(true)
  })

  test("updateState reclaims a dead owner's lock and guard and releases its own lock", async () => {
    await plant(lockFile, record(owner({ pid: DEAD_PID })))
    await plant(guardFile, record(owner({ pid: DEAD_PID })))
    expect(
      await Effect.runPromise(updateState(directory, (state) => Effect.succeed(withIntent(state)))),
    ).toBe("ok")
    expect((await Effect.runPromise(loadState(directory))).intents).toHaveLength(1)
    expect(await Bun.file(lockFile).exists()).toBe(false)
    expect(await Bun.file(guardFile).exists()).toBe(false)
  })
})

describe("commit", () => {
  test("aborts with the state untouched when the lock is no longer its own", async () => {
    await Effect.runPromise(updateState(directory, (state) => Effect.succeed(withIntent(state))))
    const before = await Bun.file(join(directory, INTENT_FILE)).text()
    const stolen = record(owner({ token: "successor" }))
    const exit = await Effect.runPromise(
      updateState(directory, (state) =>
        // The lock is broken and retaken while this writer is paused inside its transition.
        Effect.promise(() => Bun.write(lockFile, stolen)).pipe(
          Effect.as(withIntent(state, "changed while paused")),
        ),
      ).pipe(Effect.flip),
    )
    expect(exit._tag).toBe("LockLost")
    expect(await Bun.file(join(directory, INTENT_FILE)).text()).toBe(before)
    expect((await files()).filter((name) => name.endsWith(".tmp"))).toEqual([])
    // The successor's lock is not released by the loser.
    expect(await Bun.file(lockFile).text()).toBe(stolen)
  })

  test("a normal write leaves no temp file and no lock", async () => {
    await Effect.runPromise(updateState(directory, (state) => Effect.succeed(withIntent(state))))
    expect(await files()).toEqual([".gitignore", INTENT_FILE, "local/.gitignore"])
  })
})

describe("writing", () => {
  test("refuses a state that loading would reject, and leaves the store usable", async () => {
    const intent = {
      id: "intent-1",
      objective: "o",
      requirements: "r",
      revision: 1,
      state: "open" as const,
    }
    const failure = await Effect.runPromise(
      updateState(directory, (state) =>
        Effect.succeed({
          state: { ...state, intents: [intent, intent] },
          value: "dup",
        } satisfies Change<string>),
      ).pipe(Effect.flip),
    )
    expect(failure._tag).toBe("InvalidRecord")
    expect(await files()).toEqual([".gitignore", "local/.gitignore"])
    expect(await Effect.runPromise(loadState(directory))).toEqual(emptyState)
  })
})

describe("transient Windows errors", () => {
  const commit = (objective = "o") =>
    Effect.runPromise(
      updateState(directory, (state) => Effect.succeed(withIntent(state, objective))),
    )

  test("opening the lock is retried after EPERM", async () => {
    injected.open.failures = 2
    expect(await commit()).toBe("ok")
    expect(injected.open.calls).toBe(3)
    expect((await Effect.runPromise(loadState(directory))).intents).toHaveLength(1)
  })

  test("the commit rename is retried after EPERM and EBUSY", async () => {
    // The objectives differ but share a slug, so the second commit rewrites the file in place.
    for (const [code, objective] of [
      ["EPERM", "o"],
      ["EBUSY", "o."],
    ] as const) {
      Object.assign(injected.rename, { failures: 2, calls: 0, code })
      expect(await commit(objective)).toBe("ok")
      expect(injected.rename.calls).toBe(3)
    }
    expect(await files()).toEqual([".gitignore", INTENT_FILE, "local/.gitignore"])
  })

  test("the rename of a directory to its new name is retried too", async () => {
    await commit()
    Object.assign(injected.rename, { failures: 2, calls: 0, code: "EBUSY" })
    expect(await commit("renamed")).toBe("ok")
    expect(injected.rename.calls).toBe(4)
    expect(await files()).toEqual([
      ".gitignore",
      "intents/renamed-intent-1/intent.json",
      "local/.gitignore",
    ])
  })

  test("a rename that keeps failing gives up with StateIo and cleans up", async () => {
    injected.rename.failures = 1000
    const failure = await Effect.runPromise(
      updateState(directory, (state) => Effect.succeed(withIntent(state))).pipe(Effect.flip),
    )
    expect(failure._tag).toBe("StateIo")
    expect(injected.rename.calls).toBeGreaterThan(1)
    expect(injected.rename.calls).toBeLessThan(10)
    expect(await files()).toEqual([".gitignore", "local/.gitignore"])
  })

  test("an Intent folder moving onto a folder with something in it is guided even when Windows says EPERM", async () => {
    await commit()
    await Bun.write(join(directory, "intents", "renamed-intent-1", "notes.txt"), "left by a merge")
    injected.rename.failures = 1000
    const failure = await Effect.runPromise(
      updateState(directory, (state) => Effect.succeed(withIntent(state, "renamed"))).pipe(
        Effect.flip,
      ),
    )
    expect(failure).toMatchObject({
      _tag: "CorruptRecord",
      path: join(directory, "intents", "renamed-intent-1"),
    })
  })

  test("EPERM onto a destination that holds nothing stays StateIo", async () => {
    await commit()
    injected.rename.failures = 1000
    const failure = await Effect.runPromise(
      updateState(directory, (state) => Effect.succeed(withIntent(state, "renamed"))).pipe(
        Effect.flip,
      ),
    )
    expect(failure._tag).toBe("StateIo")
  })

  test("any other code is not retried", async () => {
    Object.assign(injected.rename, { failures: 1, code: "EACCES" })
    const failure = await Effect.runPromise(
      updateState(directory, (state) => Effect.succeed(withIntent(state))).pipe(Effect.flip),
    )
    expect(failure._tag).toBe("StateIo")
    expect(injected.rename.calls).toBe(1)
  })
})
