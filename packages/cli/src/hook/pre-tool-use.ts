import { Effect } from "effect"

import { nowIso } from "../clock.ts"
import {
  appendObservation,
  latestObserved,
  readObservations,
  type ObservationRecord,
} from "../observations.ts"
import { decodeHookInput, effortOf, subagentTranscript, type HookInput } from "./input.ts"
import { denyToolReason, UNREADABLE } from "./policy.ts"

const OBSERVATION_BUDGET = "750 millis"

/**
 * The longest deny reason sent back: a reason that echoes the call's own text must not echo a
 * megabyte of it.
 */
const MAX_REASON_CHARS = 1000

const deny = (reason: string): string =>
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason:
        reason.length > MAX_REASON_CHARS ? `${reason.slice(0, MAX_REASON_CHARS)}...` : reason,
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
 * The PreToolUse hook. A call is a subagent's when its payload carries an `agent_id` that is not
 * null, absent or empty, whatever the value's type; every other call is the main thread's and
 * passes untouched, at any size. For subagent calls it records the effort observation within a
 * short bound, never letting a failure block the call, and denies shell commands (Bash, PowerShell,
 * Monitor) that write VCS state or holyclaude state, and file writes into the state directory. A
 * subagent call that cannot be judged is denied: a command or file path over `MAX_JUDGED_BYTES`, a
 * file tool that names no path, a call that names no tool, or one the policy cannot read. Only the
 * command and the paths are measured, so padding elsewhere in the payload neither hides a call nor
 * blocks it. Empty stdin and text that is not a JSON object carry no `agent_id`, so they are
 * allowed: the guard cannot see a subagent whose payload does not parse. It also fails open when
 * the hook cannot run (stdin cannot be read, it crashes or passes the hook timeout). A subagent's
 * call is not expected to cause that: the judged fields are capped and the scan's nesting is
 * bounded, so the slowest input found takes seconds against the 30 second timeout. Returns the hook
 * JSON, or "" to allow.
 */
export const preToolUse = (stdin: string) =>
  Effect.gen(function* () {
    const input = yield* decodeHookInput(stdin).pipe(Effect.orElseSucceed(() => undefined))
    const agent = input?.agent
    if (input === undefined || agent === undefined) return ""
    const reason = yield* Effect.try(() => denyToolReason(input.tool_name, input.tool_input)).pipe(
      Effect.orElseSucceed(() => UNREADABLE),
    )
    if (agent.id !== undefined)
      yield* observe(input, agent.id).pipe(
        Effect.timeout(OBSERVATION_BUDGET),
        Effect.catchCause(() => Effect.void),
      )
    return reason === undefined ? "" : deny(reason)
  })
