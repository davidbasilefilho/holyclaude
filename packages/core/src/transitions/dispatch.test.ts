import { describe, expect, test } from "bun:test"
import { resolve } from "node:path"
import { Effect } from "effect"
import type { Assignment } from "../model/assignment.ts"
import type { State } from "../model/state.ts"
import { reserve } from "./dispatch.ts"

const assignment = (ownershipPaths: ReadonlyArray<string>): Assignment => ({
  id: "assignment-0001",
  intent_id: "intent-1",
  intent_revision: 1,
  role: "Worker.implementation",
  objective: "o",
  scope: [],
  constraints: [],
  acceptance_criteria: ["a"],
  required_evidence: ["e"],
  mutability: "ScopedWrite",
  metadata: {
    ownership_paths: ownershipPaths,
    symbols: [],
    domains: [],
    dependencies: [],
    related_assignments: [],
    independent_from: [],
  },
  state: "Ready",
  agent_id: null,
  result: null,
  acceptance: null,
})

const stateWith = (ownershipPaths: ReadonlyArray<string>): State => ({
  version: 1,
  intents: [{ id: "intent-1", objective: "o", requirements: "r", revision: 1 }],
  assignments: [assignment(ownershipPaths)],
  workers: [],
})

const context = { projectRoot: resolve("workspace"), writableRoots: ["src"] }
const input = { assignment_id: "assignment-0001", capabilities: ["Write"] } as const

describe("reserve and the writable roots", () => {
  test("reserves an assignment whose paths are inside the roots", async () => {
    const change = await Effect.runPromise(reserve(stateWith(["src/a.ts"]), input, context))
    expect(change.value.state).toBe("Running")
  })

  test.each(["other/a.ts", "srcx/a.ts", "../outside.ts"])(
    "refuses OutsideWritableRoots for the ownership path %s",
    async (path) => {
      const refused = await Effect.runPromise(
        reserve(stateWith(["src/a.ts", path]), input, context).pipe(Effect.flip),
      )
      expect(refused).toMatchObject({
        _tag: "DispatchRefused",
        reason: "OutsideWritableRoots",
        detail: path,
      })
    },
  )
})
