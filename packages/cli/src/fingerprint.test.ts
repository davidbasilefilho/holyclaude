import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { rosterFingerprintAt } from "./fingerprint.ts"

describe("rosterFingerprintAt without a plugin root", () => {
  test("never equals a fingerprint from an earlier call, so no roster looks unchanged", async () => {
    const first = await Effect.runPromise(rosterFingerprintAt(undefined))
    const second = await Effect.runPromise(rosterFingerprintAt(undefined))
    expect(first).toStartWith("roster:unknown:")
    expect(second).not.toBe(first)
  })
})
