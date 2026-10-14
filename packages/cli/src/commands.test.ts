import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { loadState, type State } from "@holyclaude/core"
import { Effect } from "effect"

import { COMMANDS } from "./commands.ts"
import { observationsPath } from "./observations.ts"

const reserved: State = {
  version: 1,
  intents: [{ id: "intent-1", objective: "o", requirements: "r", revision: 1 }],
  assignments: [
    {
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
        ownership_paths: ["src/a.ts"],
        symbols: [],
        domains: [],
        dependencies: [],
        related_assignments: [],
        independent_from: [],
      },
      state: "Running",
      agent_id: null,
      result: null,
      acceptance: null,
    },
  ],
  workers: [],
}

let directory = ""
let stateFile = ""
const previous = process.env["HOLYCLAUDE_STATE_FILE"]

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "holyclaude-cli-"))
  stateFile = join(directory, "state.json")
  writeFileSync(stateFile, JSON.stringify(reserved))
  process.env["HOLYCLAUDE_STATE_FILE"] = stateFile
})

afterEach(() => {
  if (previous === undefined) delete process.env["HOLYCLAUDE_STATE_FILE"]
  else process.env["HOLYCLAUDE_STATE_FILE"] = previous
  rmSync(directory, { recursive: true, force: true })
})

const bind = COMMANDS.find((command) => command.path.join(" ") === "assignment bind")

describe("assignment bind with an observation that cannot be written", () => {
  test("still binds the agent and reports the observation as not recorded", async () => {
    // A directory where the observations file belongs makes every append fail with EISDIR.
    mkdirSync(observationsPath(stateFile))
    const outcome = await Effect.runPromise(
      bind!.run(
        {
          positionals: ["assignment-0001"],
          flags: { agent: "agent-1", model: "sonnet", fingerprint: "roster:test" },
        },
        Effect.succeed(""),
      ),
    )
    expect(outcome.value).toMatchObject({ id: "assignment-0001", agent_id: "agent-1" })
    expect(outcome.value).toHaveProperty("observation")
    const state = await Effect.runPromise(loadState(stateFile))
    expect(state.assignments[0]?.agent_id).toBe("agent-1")
    expect(state.workers.map((worker) => worker.agent_id)).toEqual(["agent-1"])
  })
})
