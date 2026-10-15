import { Data, Effect } from "effect"

import { PLUGIN_NAME, ROOT_AGENT_TYPES } from "../fingerprint.ts"
import type { HookInput } from "./input.ts"

/** The tool that launches a subagent, which the dispatch guard judges. */
export const DISPATCH_TOOL = "Agent"

/**
 * A holyclaude root launched a subagent that is not a holyclaude specialist. Built-in types ignore
 * the pinned model and effort of the specialists, and a fork inherits the root's own model, so the
 * root dispatches only `holyclaude:<role-task>` types.
 */
export class DispatchRefused extends Data.TaggedError("DispatchRefused")<{}> {
  override get message() {
    return `The holyclaude root dispatches only holyclaude specialists, so this Agent call is refused: its subagent_type must be a ${PLUGIN_NAME}:<role-task> type, and a call without one, a fork, general-purpose, Explore or Plan is not. \`select <id>\` and \`assignment reserve <id>\` of the holyclaude CLI print the subagent_type to launch, for example ${PLUGIN_NAME}:worker-implementation.`
  }
}

/**
 * The dispatch guard: fails with {@link DispatchRefused} when the main thread, running as the
 * holyclaude root, launches a subagent whose `subagent_type` is missing or does not start with
 * `holyclaude:`. It judges only the root's own calls: a session with another root, and a call a
 * subagent makes (it carries an `agent_id`; the specialists are not given the Agent tool), pass
 * untouched, as does any other tool.
 */
export const guardDispatch = (input: HookInput): Effect.Effect<void, DispatchRefused> => {
  const type = input.launch.subagent_type
  const refused =
    input.tool_name === DISPATCH_TOOL &&
    input.agent === undefined &&
    ROOT_AGENT_TYPES.includes(input.agent_type ?? "") &&
    !type?.startsWith(`${PLUGIN_NAME}:`)
  return refused ? Effect.fail(new DispatchRefused()) : Effect.void
}
