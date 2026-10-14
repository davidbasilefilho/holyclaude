import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { Effect } from "effect"

import { readObservations } from "./observations.ts"

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "holyclaude-observations-"))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe("readObservations", () => {
  test("skips a record that carries an extra property and keeps the valid one", async () => {
    const valid = { kind: "observed" as const, agent_id: "a1", at: "2026-01-01T00:00:00Z" }
    const extra = { ...valid, agent_id: "a2", unexpected: true }
    const path = join(dir, "state.observations.jsonl")
    writeFileSync(path, `${JSON.stringify(valid)}\n${JSON.stringify(extra)}\n`)

    const records = await Effect.runPromise(readObservations(path))

    expect(records).toEqual([valid])
  })
})
