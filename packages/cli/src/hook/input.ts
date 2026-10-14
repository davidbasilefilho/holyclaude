import { Effect, Option, Schema } from "effect"

/**
 * A hook payload as JSON: an object whose fields are read one by one below. Claude Code owns this
 * shape and may add or change fields, so unknown fields are ignored here, unlike the CLI's own
 * structured input, and one field with an unexpected type must not hide the others.
 */
const Envelope = Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown))

const Effort = Schema.Union([
  Schema.Struct({ level: Schema.optionalKey(Schema.String) }),
  Schema.String,
])

/** The `tool_input` fields the guard reads: a shell command, or the file a tool writes. */
export interface ToolInput {
  readonly command: string | undefined
  readonly file_path: string | undefined
  readonly notebook_path: string | undefined
}

/**
 * The fields of a hook payload the CLI reads, each undefined when absent or of another type. The
 * guard decides from `agent`, `tool_name` and `tool_input` alone; the rest only feed the
 * observation, which is best effort.
 */
export interface HookInput {
  /**
   * The subagent that made the call, or undefined for the main thread. `id` is its `agent_id`, or
   * undefined when that is not a string.
   */
  readonly agent: { readonly id: string | undefined } | undefined
  readonly tool_name: string | undefined
  readonly tool_input: ToolInput | undefined
  readonly agent_type: string | undefined
  readonly transcript_path: string | undefined
  readonly effort: typeof Effort.Type | undefined
}

/** Reads one value as the schema's type, or undefined when it has another type. */
const lenient = <S extends Schema.Decoder<unknown>>(
  schema: S,
  value: unknown,
): S["Type"] | undefined => Option.getOrUndefined(Schema.decodeUnknownOption(schema)(value))

const toolInput = (value: unknown): ToolInput | undefined => {
  const fields = lenient(Schema.Record(Schema.String, Schema.Unknown), value)
  return fields === undefined
    ? undefined
    : {
        command: lenient(Schema.String, fields["command"]),
        file_path: lenient(Schema.String, fields["file_path"]),
        notebook_path: lenient(Schema.String, fields["notebook_path"]),
      }
}

/**
 * Whether an `agent_id` marks a subagent's call. Null, absent and the empty string say there is no
 * agent, as the main thread's calls do; any other value is an agent, even one of an unexpected
 * type, so a drifted payload is judged instead of passed.
 */
const isAgentId = (value: unknown): boolean => value !== undefined && value !== null && value !== ""

const decode = Schema.decodeUnknownEffect(Envelope)

/**
 * Decodes the JSON Claude Code writes to a hook's stdin. Fails when the text is not a JSON object.
 */
export const decodeHookInput = (text: string) =>
  decode(text).pipe(
    Effect.map((envelope): HookInput => ({
      agent: isAgentId(envelope["agent_id"])
        ? { id: lenient(Schema.String, envelope["agent_id"]) }
        : undefined,
      tool_name: lenient(Schema.String, envelope["tool_name"]),
      tool_input: toolInput(envelope["tool_input"]),
      agent_type: lenient(Schema.String, envelope["agent_type"]),
      transcript_path: lenient(Schema.String, envelope["transcript_path"]),
      effort: lenient(Effort, envelope["effort"]),
    })),
  )

/** The effort level of a payload, whichever shape carries it. */
export const effortOf = (input: HookInput): string | undefined => {
  const { effort } = input
  return typeof effort === "string" ? effort : effort?.level
}

/** The subagent's transcript: the session directory's `subagents/agent-<id>.jsonl`. */
export const subagentTranscript = (input: HookInput): string | undefined => {
  const { transcript_path: path } = input
  const agent = input.agent?.id
  if (path === undefined || agent === undefined) return undefined
  if (path.includes("/subagents/")) return path
  return `${path.replace(/\.jsonl$/, "")}/subagents/agent-${agent}.jsonl`
}
