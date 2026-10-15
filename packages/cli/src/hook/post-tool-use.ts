import { Effect } from "effect"

import { PLUGIN_NAME } from "../fingerprint.ts"
import { decodeHookInput } from "./input.ts"
import { observe } from "./observe.ts"

/**
 * The PostToolUse hook, which hooks.json runs only for the Agent tool. The result of an Agent call
 * names the subagent it launched (`agentId`) and the model it started on (`resolvedModel`), which
 * may differ from the model requested. A background launch and a foreground completion both carry
 * them, so the model is known before the subagent writes a transcript, and `assignment verify`
 * reads it instead of the transcript. Only a launch whose `subagent_type` is a holyclaude
 * specialist (`holyclaude:<role-task>`) is recorded; any other leaves no trace. It only observes:
 * it prints nothing and never blocks, and a payload that does not parse or lacks either field is
 * ignored. Returns "".
 */
export const postToolUse = (stdin: string) =>
  Effect.gen(function* () {
    const input = yield* decodeHookInput(stdin).pipe(Effect.orElseSucceed(() => undefined))
    const { subagent_type: type, agentId, resolvedModel } = input?.launch ?? {}
    if (type?.startsWith(`${PLUGIN_NAME}:`) && agentId && resolvedModel)
      yield* observe(agentId, { agent_type: type, model: resolvedModel })
    return ""
  })
