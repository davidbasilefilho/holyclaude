import { Effect, Schema } from "effect"
import { withinLimit } from "@holyclaude/core"

/** Largest hook payload read, in bytes. Hook payloads carry whole tool inputs. */
const MAX_HOOK_BYTES = 1024 * 1024

/**
 * The fields of a Claude Code hook payload the CLI reads. Claude Code owns this shape and may add
 * fields, so unknown ones are ignored here, unlike the CLI's own structured input.
 */
const HookInput = Schema.Struct({
  session_id: Schema.optionalKey(Schema.String),
  transcript_path: Schema.optionalKey(Schema.String),
  tool_name: Schema.optionalKey(Schema.String),
  tool_input: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown)),
  agent_id: Schema.optionalKey(Schema.String),
  agent_type: Schema.optionalKey(Schema.String),
  effort: Schema.optionalKey(
    Schema.Union([Schema.Struct({ level: Schema.optionalKey(Schema.String) }), Schema.String]),
  ),
})
/** A decoded hook payload. */
export type HookInput = typeof HookInput.Type

const decode = Schema.decodeUnknownEffect(Schema.fromJsonString(HookInput))

/** Decodes the JSON Claude Code writes to a hook's stdin. */
export const decodeHookInput = (text: string) =>
  withinLimit("Hook input", text, MAX_HOOK_BYTES).pipe(Effect.flatMap(decode))

/** The effort level of a payload, whichever shape carries it. */
export const effortOf = (input: HookInput): string | undefined => {
  const { effort } = input
  return typeof effort === "string" ? effort : effort?.level
}

/** The subagent's transcript: the session directory's `subagents/agent-<id>.jsonl`. */
export const subagentTranscript = (input: HookInput): string | undefined => {
  const { transcript_path: path, agent_id: agent } = input
  if (path === undefined || agent === undefined || agent === "") return undefined
  if (path.includes("/subagents/")) return path
  return `${path.replace(/\.jsonl$/, "")}/subagents/agent-${agent}.jsonl`
}
