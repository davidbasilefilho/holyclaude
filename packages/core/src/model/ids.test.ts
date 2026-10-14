import { describe, expect, test } from "bun:test"

import { Effect, Schema } from "effect"

import { AssignmentId, compareIds, IntentId, newId, sortedById } from "./ids.ts"
import { latestIntent, emptyState } from "./state.ts"

const generate = (kind: Parameters<typeof newId>[0]) => Effect.runPromise(newId(kind))

describe("generated ids", () => {
  test("carry the kind, a fixed-width base36 time and a short random suffix", async () => {
    expect(await generate("intent")).toMatch(/^intent-[0-9a-z]{9}-[0-9a-z]{4}$/)
    expect(await generate("assignment")).toMatch(/^assignment-[0-9a-z]{9}-[0-9a-z]{4}$/)
  })

  test("are path-safe and accepted by the id schemas", async () => {
    const intent = await generate("intent")
    const assignment = await generate("assignment")
    expect(intent).toMatch(/^[a-z0-9-]+$/)
    expect(Schema.decodeUnknownSync(IntentId)(intent)).toBe(intent)
    expect(Schema.decodeUnknownSync(AssignmentId)(assignment)).toBe(assignment)
  })

  test("sort in creation order as plain text", async () => {
    const ids: string[] = []
    for (let count = 0; count < 5; count++) {
      ids.push(await generate("assignment"))
      await Bun.sleep(2)
    }
    expect(ids.toSorted()).toEqual(ids)
  })

  test("two ids made in the same millisecond differ", async () => {
    const ids = await Effect.runPromise(
      Effect.forEach(
        Array.from({ length: 50 }, () => "intent" as const),
        (kind) => newId(kind),
        { concurrency: "unbounded" },
      ),
    )
    expect(new Set(ids).size).toBe(50)
  })

  test("legacy counter ids sort before every generated one", async () => {
    const generated = await generate("intent")
    expect(compareIds("intent-0001", generated)).toBe(-1)
    expect(compareIds("intent-0999", generated)).toBe(-1)
    expect(["intent-0mg8k2x1a-7f3q", "intent-0002", "intent-0001"].toSorted()).toEqual([
      "intent-0001",
      "intent-0002",
      "intent-0mg8k2x1a-7f3q",
    ])
  })
})

describe("id schemas", () => {
  test.each(["intent-0001", "intent-1", "intent-0mg8k2x1a-7f3q"])("accept %s", (id) => {
    expect(Schema.decodeUnknownSync(IntentId)(id)).toBe(id)
  })

  test.each([
    "Intent-1",
    "intent-",
    "intent-1/../x",
    "intent-1\\x",
    "intent-1.json",
    "intent 1",
    "assignment-0001",
    "../intent-1",
    "intent--1",
    "intent-é",
  ])("reject %s", (id) => {
    expect(() => Schema.decodeUnknownSync(IntentId)(id)).toThrow()
  })
})

describe("ordering by id", () => {
  const intent = (id: string) => ({ id, objective: "o", requirements: "", revision: 1 })

  test("the latest Intent is the greatest id whatever the array order", () => {
    const state = {
      ...emptyState,
      intents: [intent("intent-0mg8k2x1a-7f3q"), intent("intent-0002"), intent("intent-0001")],
    }
    expect(latestIntent(state)?.id).toBe("intent-0mg8k2x1a-7f3q")
    expect(latestIntent(emptyState)).toBeUndefined()
  })

  test("sortedById leaves the input alone and orders oldest first", () => {
    const records = [{ id: "b" }, { id: "a" }, { id: "c" }]
    expect(sortedById(records).map((record) => record.id)).toEqual(["a", "b", "c"])
    expect(records.map((record) => record.id)).toEqual(["b", "a", "c"])
  })
})

describe("comparing legacy and generated ids", () => {
  test("every legacy id comes before every generated one, whatever its digit count", () => {
    expect(compareIds("intent-1000", "intent-0mg8k2x1a-7f3q")).toBe(-1)
    expect(compareIds("intent-99999", "intent-0000000aa-0000")).toBe(-1)
    expect(compareIds("intent-0mg8k2x1a-7f3q", "intent-1000")).toBe(1)
    expect(compareIds("intent-1", "intent-0mg8k2x1a-7f3q")).toBe(-1)
  })

  test("legacy ids are in numeric order, not text order", () => {
    const ids = ["intent-1000", "intent-0002", "intent-0010", "intent-0001", "intent-0999"]
    expect(ids.toSorted(compareIds)).toEqual([
      "intent-0001",
      "intent-0002",
      "intent-0010",
      "intent-0999",
      "intent-1000",
    ])
  })

  test("generated ids are in plain text order", () => {
    expect(["intent-0mg8k2x1b-0000", "intent-0mg8k2x1a-zzzz"].toSorted(compareIds)).toEqual([
      "intent-0mg8k2x1a-zzzz",
      "intent-0mg8k2x1b-0000",
    ])
  })

  test("a mixed list sorts as legacy first, then generated", () => {
    const records = ["intent-0mg8k2x1a-7f3q", "intent-1000", "intent-0001", "intent-0mg8k2x0z-aaaa"]
    expect(sortedById(records.map((id) => ({ id }))).map((record) => record.id)).toEqual([
      "intent-0001",
      "intent-1000",
      "intent-0mg8k2x0z-aaaa",
      "intent-0mg8k2x1a-7f3q",
    ])
  })

  test("the latest Intent is a generated one over legacy 1000", () => {
    const state = {
      ...emptyState,
      intents: ["intent-1000", "intent-0mg8k2x1a-7f3q", "intent-0999"].map((id) => ({
        id,
        objective: "o",
        requirements: "",
        revision: 1,
      })),
    }
    expect(latestIntent(state)?.id).toBe("intent-0mg8k2x1a-7f3q")
  })
})
