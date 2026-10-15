import { describe, expect, test } from "bun:test"

import { Effect } from "effect"

import { decodeJsonStrict } from "../codec.ts"
import type { Assignment, AssignmentDraft } from "../model/assignment.ts"
import { Intent } from "../model/intent.ts"
import { intentInUse, openIntents, resolveIntent, type State } from "../model/state.ts"
import { createAssignment, followUp } from "./assignment.ts"
import { reserve } from "./dispatch.ts"
import { closeIntent, reopenIntent } from "./intent.ts"

const AT = "2026-01-02T03:04:05.000Z"

const intent = (id: string, overrides: Partial<Intent> = {}): Intent => ({
  id,
  objective: `objective of ${id}`,
  requirements: "r",
  revision: 1,
  state: "open",
  ...overrides,
})

const row = (state: Assignment["state"], intentId = "intent-1"): Assignment => ({
  id: `assignment-${state}`,
  intent_id: intentId,
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
  state,
  agent_id: null,
  result: null,
  acceptance: null,
})

/** A Succeeded Assignment whose evidence the root accepted. */
const acceptedRow = (id: string): Assignment => ({
  ...row("Succeeded"),
  id,
  acceptance: {
    intent_revision: 1,
    rationale: "r",
    criteria_evidence: { a: "x" },
    required_evidence: { e: "x" },
  },
})

const stateOf = (
  intents: ReadonlyArray<Intent>,
  assignments: ReadonlyArray<Assignment> = [],
): State => ({ version: 1, intents, assignments, workers: [] })

const failure = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(Effect.flip(effect))

describe("an Intent record", () => {
  const decode = (text: string) => Effect.runPromise(decodeJsonStrict(Intent)(text))

  test("without a state decodes as open", async () => {
    const decoded = await decode(
      '{"id":"intent-1","objective":"o","requirements":"r","revision":2}',
    )
    expect(decoded).toMatchObject({ state: "open", revision: 2 })
  })

  test("closed carries its reason and time", async () => {
    const decoded = await decode(
      `{"id":"intent-1","objective":"o","requirements":"","revision":1,"state":"closed","close_reason":"shipped","closed_at":"${AT}"}`,
    )
    expect(decoded).toMatchObject({ state: "closed", close_reason: "shipped", closed_at: AT })
  })

  test("still rejects a field it does not know and a state it does not know", async () => {
    const base = '"id":"intent-1","objective":"o","requirements":"","revision":1'
    for (const extra of ['"owner":"x"', '"state":"paused"'])
      expect(await failure(decodeJsonStrict(Intent)(`{${base},${extra}}`))).toMatchObject({
        _tag: "SchemaError",
      })
  })
})

describe("closeIntent and reopenIntent", () => {
  test("close records the state, the reason and the time, and keeps the revision", async () => {
    const { value, state } = await Effect.runPromise(
      closeIntent(stateOf([intent("intent-1", { revision: 3 })]), {
        id: "intent-1",
        reason: "shipped",
        at: AT,
      }),
    )
    expect(value).toMatchObject({
      state: "closed",
      close_reason: "shipped",
      closed_at: AT,
      revision: 3,
    })
    expect(state.intents).toEqual([value])
  })

  test("close is refused while an Assignment of the Intent is Running, and only then", async () => {
    const input = { id: "intent-1", reason: "done", at: AT }
    const busy = stateOf([intent("intent-1"), intent("intent-2")], [row("Running")])
    expect(await failure(closeIntent(busy, input))).toMatchObject({
      _tag: "IntentBusy",
      running: ["assignment-Running"],
    })
    const settled = stateOf(
      [intent("intent-1"), intent("intent-2")],
      [acceptedRow("assignment-accepted"), row("Failed"), row("Ready"), row("Running", "intent-2")],
    )
    expect((await Effect.runPromise(closeIntent(settled, input))).value.state).toBe("closed")
  })

  test("close lists every Succeeded Assignment that was never accepted, and the override closes anyway", async () => {
    const input = { id: "intent-1", reason: "done", at: AT }
    const accepted = acceptedRow("assignment-accepted")
    const second = { ...row("Succeeded"), id: "assignment-second" }
    const state = stateOf([intent("intent-1")], [row("Succeeded"), second, accepted])
    const refused = await failure(closeIntent(state, input))
    expect(refused).toMatchObject({
      _tag: "UnacceptedAssignments",
      unaccepted: ["assignment-Succeeded", "assignment-second"],
    })
    expect(String(refused)).toContain("assignment-second")
    const { value } = await Effect.runPromise(
      closeIntent(state, { ...input, allow_unaccepted: "the work was dropped" }),
    )
    expect(value.state).toBe("closed")
    expect(value.close_reason).toContain("done")
    expect(value.close_reason).toContain("the work was dropped")
    expect(value.close_reason).toContain("assignment-Succeeded")
  })

  test("the override does not lift the Running refusal, and adds nothing when all are accepted", async () => {
    const input = { id: "intent-1", reason: "done", at: AT, allow_unaccepted: "why" }
    expect(
      await failure(closeIntent(stateOf([intent("intent-1")], [row("Running")]), input)),
    ).toMatchObject({ _tag: "IntentBusy" })
    const plain = await Effect.runPromise(closeIntent(stateOf([intent("intent-1")], []), input))
    expect(plain.value.close_reason).toBe("done")
  })

  test("closing a closed Intent and reopening an open one are refused", async () => {
    const closed = stateOf([
      intent("intent-1", { state: "closed", close_reason: "x", closed_at: AT }),
    ])
    expect(
      await failure(closeIntent(closed, { id: "intent-1", reason: "again", at: AT })),
    ).toMatchObject({ _tag: "InvalidRecord" })
    expect(await failure(reopenIntent(stateOf([intent("intent-1")]), "intent-1"))).toMatchObject({
      _tag: "InvalidRecord",
    })
  })

  test("reopen opens it, drops the close fields and bumps the revision", async () => {
    const closed = stateOf([
      intent("intent-1", { revision: 2, state: "closed", close_reason: "x", closed_at: AT }),
    ])
    const { value } = await Effect.runPromise(reopenIntent(closed, "intent-1"))
    expect(value).toEqual(intent("intent-1", { revision: 3 }))
    expect(Object.keys(value)).not.toContain("close_reason")
  })

  test("an Assignment made for the old revision no longer reserves after a reopen", async () => {
    const closed = stateOf(
      [intent("intent-1", { state: "closed", close_reason: "x", closed_at: AT })],
      [row("Ready")],
    )
    const reopened = (await Effect.runPromise(reopenIntent(closed, "intent-1"))).state
    const refused = await failure(
      reserve(
        reopened,
        { assignment_id: "assignment-Ready", capabilities: ["Write"] },
        { projectRoot: "/p", writableRoots: ["/p"], worktree: "w" },
      ),
    )
    expect(refused).toMatchObject({ _tag: "StaleRevision", given: 1, live: 2 })
  })
})

describe("a closed Intent", () => {
  const closed = stateOf(
    [intent("intent-1", { state: "closed", close_reason: "x", closed_at: AT })],
    [row("Ready"), row("Failed")],
  )
  const draft: AssignmentDraft = {
    intent_id: "intent-1",
    intent_revision: 1,
    role: "Explorer.lookup",
    objective: "o",
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
  }

  test("authorizes no create, no reserve and no follow-up", async () => {
    const closedError = { _tag: "IntentClosed", intent_id: "intent-1" }
    expect(await failure(createAssignment(closed, draft))).toMatchObject(closedError)
    expect(
      await failure(
        reserve(
          closed,
          { assignment_id: "assignment-Ready", capabilities: ["Write"] },
          { projectRoot: "/p", writableRoots: ["/p"], worktree: "w" },
        ),
      ),
    ).toMatchObject(closedError)
    expect(
      await failure(followUp(closed, { predecessor_id: "assignment-Failed", assignment: draft })),
    ).toMatchObject(closedError)
  })

  test("an open Intent still takes an Assignment", async () => {
    const open = stateOf([intent("intent-1")])
    expect((await Effect.runPromise(createAssignment(open, draft))).value.state).toBe("Ready")
  })
})

describe("the Intent a command acts on", () => {
  const closedOne = intent("intent-0003", { state: "closed", close_reason: "x", closed_at: AT })
  const two = stateOf([intent("intent-0001"), intent("intent-0002"), closedOne])
  const resolve = (state: State, flag?: string, stored?: string) =>
    Effect.runPromise(resolveIntent(state, flag, stored))

  test("the --intent flag wins, even over a stored choice and for a closed Intent", async () => {
    expect((await resolve(two, "intent-0001", "intent-0002")).id).toBe("intent-0001")
    expect((await resolve(two, "intent-0003")).state).toBe("closed")
    expect(await failure(resolveIntent(two, "intent-9999", undefined))).toMatchObject({
      _tag: "UnknownRecord",
    })
  })

  test("the stored choice is next, while it is still open", async () => {
    expect((await resolve(two, undefined, "intent-0002")).id).toBe("intent-0002")
  })

  test("without a usable choice the only open Intent is used", async () => {
    const one = stateOf([intent("intent-0001"), closedOne])
    expect((await resolve(one)).id).toBe("intent-0001")
    expect((await resolve(one, undefined, "intent-0003")).id).toBe("intent-0001")
    expect((await resolve(one, undefined, "intent-gone")).id).toBe("intent-0001")
  })

  test("with several open and no usable choice it fails listing the open Intents, never the greatest id", async () => {
    for (const stored of [undefined, "intent-0003", "intent-gone"]) {
      const error = await failure(resolveIntent(two, undefined, stored))
      expect(error).toMatchObject({ _tag: "NoActiveIntent" })
      expect(error.message).toContain("intent use")
      expect(error.message).toContain("intent-0001")
      expect(error.message).toContain("objective of intent-0002")
      expect(error.message).not.toContain("intent-0003")
    }
  })

  test("with none open it fails and says so", async () => {
    const error = await failure(resolveIntent(stateOf([closedOne]), undefined, undefined))
    expect(error).toMatchObject({ _tag: "NoActiveIntent", open: [] })
    expect(error.message).toContain("No Intent is open")
  })

  test("the Intent in use is undefined without a choice or a single open Intent", () => {
    expect(intentInUse(two, undefined)).toBeUndefined()
    expect(openIntents(two).map((open) => open.id)).toEqual(["intent-0001", "intent-0002"])
  })
})
