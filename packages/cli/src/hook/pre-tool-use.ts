import { stateDirPath } from "@holyclaude/core"
import { Effect } from "effect"

import { guardDispatch } from "./dispatch.ts"
import { decodeHookInput, effortOf, subagentTranscript } from "./input.ts"
import { observe } from "./observe.ts"
import { denyToolReason, UNREADABLE } from "./policy.ts"

/**
 * The most stdin the hook reads, in bytes. A payload over it is denied for every caller, so the
 * hook never parses, or waits for, more than this.
 */
export const MAX_HOOK_BYTES = 1024 * 1024

const REFUSALS = {
  oversized: `This call's payload is over ${MAX_HOOK_BYTES} bytes, so the guard cannot check it. Send the work in smaller calls, for example one shorter command or a smaller write at a time.`,
  unreadable: `This call's payload is empty or not valid JSON, so the guard cannot check it. Send the call again; if it is refused again, say so in your report.`,
}

const deny = (reason: string): string =>
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  })

/**
 * The PreToolUse hook. hooks.json runs it only for the tools the guard judges and the Agent tool;
 * any other tool skips the hook. It reads at most `MAX_HOOK_BYTES` of stdin, and a payload that is
 * over that limit, empty or not a JSON object is denied for every caller, the main thread included:
 * the guard cannot tell whose call it is, and Claude Code sends no such payload. A call is a
 * subagent's when its payload carries an `agent_id` that is not null, absent or empty, whatever the
 * value's type; every other call is the main thread's and passes untouched, except an Agent call
 * made by a holyclaude root, which {@link guardDispatch} refuses unless it launches a holyclaude
 * specialist. For subagent calls it starts recording the effort observation in the background: the
 * verdict is printed first, and the process ends after the recording, which has its own short bound
 * (a failure is dropped). It denies shell commands (Bash, PowerShell, Monitor) that write VCS state
 * or holyclaude state, and file writes into the `.holyclaude` and `.git` directories. A subagent
 * call that cannot be judged is denied: a command or file path over `MAX_JUDGED_BYTES`, or a text
 * read out of a command that is (a nested shell's script, a launcher's argument line, a script
 * block written back), a file tool that names no path, a call that names no tool, or one the policy
 * cannot read. Only the command and the paths are judged, so padding elsewhere in the payload
 * neither hides a call nor changes its verdict, as long as the payload stays within the limit. The
 * guard fails open only when the hook cannot run (stdin cannot be read, it crashes or passes the
 * hook timeout). A subagent's call is not expected to cause that: the payload and the judged fields
 * are capped and the scan's nesting and work are bounded, so the slowest input found takes seconds
 * against the 30 second timeout. Returns the hook JSON, or "" to allow.
 */
export const preToolUse = (stdin: string) =>
  Effect.gen(function* () {
    if (Buffer.byteLength(stdin) > MAX_HOOK_BYTES) return deny(REFUSALS.oversized)
    const input = yield* decodeHookInput(stdin).pipe(Effect.orElseSucceed(() => undefined))
    if (input === undefined) return deny(REFUSALS.unreadable)
    const agent = input.agent
    if (agent === undefined)
      return yield* guardDispatch(input).pipe(
        Effect.as(""),
        Effect.catchTag("DispatchRefused", (refusal) => Effect.succeed(deny(refusal.message))),
      )
    const reason = yield* Effect.try(() => denyToolReason(input.tool_name, input.tool_input)).pipe(
      Effect.orElseSucceed(() => UNREADABLE),
    )
    if (agent.id !== undefined) {
      // Resolved here, before the fork, so the recording goes where this call found the state.
      const directory = stateDirPath()
      yield* Effect.forkDetach(
        observe(
          agent.id,
          {
            agent_type: input.agent_type,
            effort: effortOf(input),
            transcript: subagentTranscript(input),
          },
          directory,
        ),
      )
    }
    return reason === undefined ? "" : deny(reason)
  })
