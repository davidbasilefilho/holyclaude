import { Effect } from "effect"

import { decodeHookInput, effortOf, type HookInput } from "./input.ts"
import { observe, type Sighting } from "./observe.ts"

/**
 * Records what one subagent lifecycle payload shows of the agent it names. Both lifecycle hooks
 * only observe: they print nothing and never block, and a payload that does not parse or names no
 * agent is ignored.
 */
const record = (stdin: string, sighting: (input: HookInput) => Sighting) =>
  Effect.gen(function* () {
    const input = yield* decodeHookInput(stdin).pipe(Effect.orElseSucceed(() => undefined))
    const agentId = input?.agent?.id
    if (input !== undefined && agentId !== undefined) yield* observe(agentId, sighting(input))
    return ""
  })

/**
 * The SubagentStart hook. The payload carries the agent's type but no model and no effort, so it
 * records the type, which PreToolUse sees only when the agent calls a guarded tool. Returns "".
 */
export const subagentStart = (stdin: string) =>
  record(stdin, (input) => ({ agent_type: input.agent_type }))

/**
 * The SubagentStop hook. It records the effort and the agent's own transcript path, so an agent
 * that never called a guarded tool, such as a read-only reviewer, still verifies. Never blocks the
 * stop. Returns "".
 */
export const subagentStop = (stdin: string) =>
  record(stdin, (input) => ({
    effort: effortOf(input),
    transcript: input.agent_transcript_path,
  }))
