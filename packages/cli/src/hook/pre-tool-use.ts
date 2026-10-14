import { Effect } from "effect"
import {
  appendObservation,
  latestObserved,
  readObservations,
  type ObservationRecord,
} from "../observations.ts"
import { nowIso } from "../clock.ts"
import { decodeHookInput, effortOf, subagentTranscript, type HookInput } from "./input.ts"
import { denyToolReason, UNREADABLE } from "./policy.ts"

const OBSERVATION_BUDGET = "750 millis"

const deny = (reason: string): string =>
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  })

const observe = (input: HookInput, agentId: string) =>
  Effect.gen(function* () {
    const effort = effortOf(input)
    const transcript = subagentTranscript(input)
    if (effort === undefined && input.agent_type === undefined && transcript === undefined) return
    const known = latestObserved(yield* readObservations(), agentId)
    if (
      known !== undefined &&
      known.effort === effort &&
      known.agent_type === input.agent_type &&
      known.transcript === transcript
    )
      return
    const record: ObservationRecord = {
      kind: "observed",
      agent_id: agentId,
      ...(input.agent_type ? { agent_type: input.agent_type } : {}),
      ...(effort ? { effort } : {}),
      ...(transcript ? { transcript } : {}),
      at: yield* nowIso,
    }
    yield* appendObservation(record)
  })

/**
 * The PreToolUse hook. Main-thread calls pass through. For subagent calls it records the effort
 * observation within a short bound, never letting a failure block the call, and denies shell
 * commands (Bash, PowerShell, Monitor) that write VCS state or holyclaude state, and file writes
 * into the state directory. The decision reads only `agent_id`, `tool_name` and `tool_input`; a
 * payload that cannot be judged is denied. Returns the hook JSON, or "" to allow.
 */
export const preToolUse = (stdin: string) =>
  Effect.gen(function* () {
    const input = yield* decodeHookInput(stdin)
    const agentId = input.agent_id
    if (agentId === undefined || agentId === "") return ""
    const reason = yield* Effect.try(() => denyToolReason(input.tool_name, input.tool_input)).pipe(
      Effect.orElseSucceed(() => UNREADABLE),
    )
    yield* observe(input, agentId).pipe(
      Effect.timeout(OBSERVATION_BUDGET),
      Effect.catchCause(() => Effect.void),
    )
    return reason === undefined ? "" : deny(reason)
  })
