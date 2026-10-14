import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { MAX_LOCAL_BYTES } from "@holyclaude/core"
import { Effect } from "effect"

import { appendObservation, observationsPath, readObservations } from "./observations.ts"

let dir: string
let outside: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "holyclaude-observations-"))
  outside = mkdtempSync(join(tmpdir(), "holyclaude-outside-"))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  rmSync(outside, { recursive: true, force: true })
})

const failure = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(Effect.flip(effect))

describe("readObservations", () => {
  test("skips a record that carries an extra property and keeps the valid one", async () => {
    const valid = { kind: "observed" as const, agent_id: "a1", at: "2026-01-01T00:00:00Z" }
    const extra = { ...valid, agent_id: "a2", unexpected: true }
    mkdirSync(join(dir, "local"))
    writeFileSync(observationsPath(dir), `${JSON.stringify(valid)}\n${JSON.stringify(extra)}\n`)

    const records = await Effect.runPromise(readObservations(dir))

    expect(records).toEqual([valid])
  })

  test("reads a missing file as no records", async () => {
    expect(await Effect.runPromise(readObservations(dir))).toEqual([])
  })

  test("refuses a linked local directory and reads nothing behind it", async () => {
    writeFileSync(join(outside, "observations.jsonl"), "{}\n")
    symlinkSync(outside, join(dir, "local"), "junction")
    expect(await failure(readObservations(dir))).toMatchObject({ _tag: "SymlinkRefused" })
  })

  test("refuses a linked observations file", async () => {
    mkdirSync(join(dir, "local"))
    symlinkSync(outside, observationsPath(dir), "junction")
    expect(await failure(readObservations(dir))).toMatchObject({ _tag: "SymlinkRefused" })
  })

  test("refuses a file over the local cap before reading it", async () => {
    mkdirSync(join(dir, "local"))
    writeFileSync(observationsPath(dir), "x".repeat(MAX_LOCAL_BYTES + 1))
    expect(await failure(readObservations(dir))).toMatchObject({ _tag: "TooLarge" })
  })

  test("reads a file at the cap", async () => {
    mkdirSync(join(dir, "local"))
    writeFileSync(observationsPath(dir), "x".repeat(MAX_LOCAL_BYTES))
    expect(await Effect.runPromise(readObservations(dir))).toEqual([])
  })
})

describe("appendObservation", () => {
  const record = { kind: "observed" as const, agent_id: "a1", at: "2026-01-01T00:00:00Z" }

  test("puts the folder's .gitignore in place before the log exists", async () => {
    await Effect.runPromise(appendObservation(record, dir))
    expect(await Bun.file(join(dir, ".gitignore")).text()).toContain("/local/")
    expect(await Bun.file(observationsPath(dir)).text()).toBe(`${JSON.stringify(record)}\n`)
  })

  test("replaces the ignore-everything rule of an earlier version, whatever is left beside it", async () => {
    writeFileSync(join(dir, ".gitignore"), "*\n")
    writeFileSync(join(dir, "state.json"), "{}")
    await Effect.runPromise(appendObservation(record, dir))
    const rules = await Bun.file(join(dir, ".gitignore")).text()
    expect(rules).not.toBe("*\n")
    expect(rules).toContain("/state.json\n")
  })

  test("refuses to append through a linked local directory", async () => {
    symlinkSync(outside, join(dir, "local"), "junction")
    const error = await failure(appendObservation(record, dir))
    expect(error).toMatchObject({ _tag: "SymlinkRefused" })
    expect(readdirSync(outside)).toEqual([])
  })
})
