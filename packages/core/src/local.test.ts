import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { Effect } from "effect"

import { readActiveIntent } from "./local.ts"
import { emptyState, type Change } from "./model/state.ts"
import { updateState } from "./store.ts"

let directory = ""
const localIgnore = () => join(directory, "local", ".gitignore")

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "holyclaude-local-"))
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

const touch = () =>
  Effect.runPromise(
    updateState(directory, (state) => Effect.succeed({ state, value: 0 } satisfies Change<number>)),
  )

describe("the local folder's own .gitignore", () => {
  test("a write that creates local/ puts a .gitignore of * in it", async () => {
    await touch()
    expect(await readFile(localIgnore(), "utf8")).toBe("*\n")
  })

  test("a local/ folder that has none gets one, and one already there stays", async () => {
    await mkdir(join(directory, "local"), { recursive: true })
    await touch()
    expect(await readFile(localIgnore(), "utf8")).toBe("*\n")
    await writeFile(localIgnore(), "mine\n")
    await touch()
    expect(await readFile(localIgnore(), "utf8")).toBe("mine\n")
  })
})

describe("the Intent in use", () => {
  const intent = { id: "intent-1", objective: "o", requirements: "", revision: 1, state: "open" }

  test("is stored in a local file and read back", async () => {
    expect(await Effect.runPromise(readActiveIntent(directory))).toBeUndefined()
    await Effect.runPromise(
      updateState(directory, (_state, { useIntent }) =>
        useIntent("intent-1").pipe(
          Effect.as({ state: { ...emptyState, intents: [intent] }, value: 0 } as Change<number>),
        ),
      ),
    )
    expect(await Effect.runPromise(readActiveIntent(directory))).toBe("intent-1")
    expect(await readFile(join(directory, "local", "active-intent.json"), "utf8")).toContain(
      "intent-1",
    )
  })
})
