import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  OBSERVATIONS_READ_BYTES,
  OBSERVATIONS_ROTATE_BYTES,
  previousObservationsFile,
} from "@holyclaude/core"
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

  const numbered = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      kind: "observed" as const,
      agent_id: `agent-${index}`,
      at: "2026-01-01T00:00:00Z",
    }))
  const linesOf = (records: ReadonlyArray<object>) =>
    records.map((record) => `${JSON.stringify(record)}\n`).join("")

  test("reads a generation of the size rotation keeps whole", async () => {
    mkdirSync(join(dir, "local"))
    const records = numbered(Math.ceil((OBSERVATIONS_ROTATE_BYTES * 1.1) / 80))
    writeFileSync(observationsPath(dir), linesOf(records))
    expect(await Effect.runPromise(readObservations(dir))).toEqual(records)
  })

  test("reads a generation far past that size from its end, in whole lines", async () => {
    mkdirSync(join(dir, "local"))
    const records = numbered(Math.ceil((OBSERVATIONS_READ_BYTES * 3) / 80))
    writeFileSync(previousObservationsFile(dir), linesOf(records))
    writeFileSync(observationsPath(dir), linesOf(records))
    const read = await Effect.runPromise(readObservations(dir))
    // Each generation yields only its newest lines: a suffix, ending at the very last record.
    expect(read.length).toBeLessThan(records.length * 2)
    expect(read.length).toBeGreaterThan(OBSERVATIONS_READ_BYTES / 200)
    const half = read.length / 2
    expect(read.slice(0, half)).toEqual(read.slice(half))
    expect(read.slice(half)).toEqual(records.slice(records.length - half))
  })
})

describe("appendObservation", () => {
  const record = { kind: "observed" as const, agent_id: "a1", at: "2026-01-01T00:00:00Z" }

  test("puts the folder's .gitignore in place before the log exists", async () => {
    await Effect.runPromise(appendObservation(record, dir))
    expect(await Bun.file(join(dir, ".gitignore")).text()).toContain("/local/")
    expect(await Bun.file(observationsPath(dir)).text()).toBe(`${JSON.stringify(record)}\n`)
  })

  test("makes local/ with a .gitignore of * so the log stays ignored on its own", async () => {
    await Effect.runPromise(appendObservation(record, dir))
    expect(await Bun.file(join(dir, "local", ".gitignore")).text()).toBe("*\n")
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

describe("the bounded log", () => {
  const observed = (agent: string) => ({
    kind: "observed" as const,
    agent_id: agent,
    at: "2026-01-01T00:00:00Z",
  })
  const previousPath = () => join(dir, "local", "observations.1.jsonl")

  /** A log of valid lines at least the given size, numbered from the given start. */
  const plant = (path: string, bytes: number, from = 0) => {
    const lines: string[] = []
    let size = 0
    for (let at = from; size < bytes; at++) {
      const line = `${JSON.stringify(observed(`old-${at}`))}\n`
      lines.push(line)
      size += line.length
    }
    mkdirSync(join(dir, "local"), { recursive: true })
    writeFileSync(path, lines.join(""))
    return lines.length
  }

  test("rotates a log past its rotation size, so the next append starts a new one", async () => {
    const planted = plant(observationsPath(dir), OBSERVATIONS_ROTATE_BYTES + 1)
    await Effect.runPromise(appendObservation(observed("newest"), dir))
    expect(await Bun.file(observationsPath(dir)).text()).toBe(
      `${JSON.stringify(observed("newest"))}\n`,
    )
    const records = await Effect.runPromise(readObservations(dir))
    expect(records).toHaveLength(planted + 1)
    expect(records[0]).toEqual(observed("old-0"))
    expect(records.at(-1)).toEqual(observed("newest"))
    expect(await Bun.file(join(dir, "local", "lock")).exists()).toBe(false)
  })

  test("leaves a log within its rotation size where it is", async () => {
    plant(observationsPath(dir), 1024)
    await Effect.runPromise(appendObservation(observed("newest"), dir))
    expect(await Bun.file(previousPath()).exists()).toBe(false)
  })

  test("drops the oldest generation, never the newest records, on the next rotation", async () => {
    plant(previousPath(), 1024)
    const planted = plant(observationsPath(dir), OBSERVATIONS_ROTATE_BYTES + 1, 1_000_000)
    await Effect.runPromise(appendObservation(observed("newest"), dir))
    const records = await Effect.runPromise(readObservations(dir))
    expect(records).toHaveLength(planted + 1)
    expect(records[0]).toEqual(observed("old-1000000"))
    expect(records.at(-1)).toEqual(observed("newest"))
  })

  test("refuses a linked previous generation for reads and appends", async () => {
    mkdirSync(join(dir, "local"))
    symlinkSync(outside, previousPath(), "junction")
    expect(await failure(readObservations(dir))).toMatchObject({ _tag: "SymlinkRefused" })
    expect(await failure(appendObservation(observed("a"), dir))).toMatchObject({
      _tag: "SymlinkRefused",
    })
    expect(readdirSync(outside)).toEqual([])
  })
})
