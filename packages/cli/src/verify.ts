import { findAssignment, readText, routeFor } from "@holyclaude/core"
import { Effect, Schema } from "effect"

import { NotBound } from "./errors.ts"
import { PLUGIN_NAME } from "./fingerprint.ts"
import { latestOverride, readObservations, seenOf } from "./observations.ts"
import { loadStateFile } from "./state.ts"

const TranscriptLine = Schema.Struct({
  message: Schema.optionalKey(Schema.Struct({ model: Schema.optionalKey(Schema.String) })),
})
const decodeLine = Schema.decodeUnknownEffect(Schema.fromJsonString(TranscriptLine))

/**
 * Largest subagent transcript read, in bytes. The path comes from the unlocked observations log, so
 * the read is capped like every state read; a real transcript stays far below it.
 */
const MAX_TRANSCRIPT_BYTES = 64 * 1024 * 1024

/**
 * Every real model id the subagent transcript shows, in order of first appearance. A missing or
 * unreadable transcript shows none; one over the cap is TooLarge.
 */
const transcriptModels = (path: string) =>
  Effect.gen(function* () {
    const text = yield* readText(path, MAX_TRANSCRIPT_BYTES).pipe(
      Effect.map((read) => read ?? ""),
      Effect.catchTag("StateIo", () => Effect.succeed("")),
    )
    const models = new Set<string>()
    for (const line of text.split("\n")) {
      if (!line.includes('"model"')) continue
      const decoded = yield* decodeLine(line).pipe(Effect.option)
      const model = decoded._tag === "Some" ? decoded.value.message?.model : undefined
      if (model !== undefined && !model.startsWith("<")) models.add(model)
    }
    return [...models]
  })

type Status = "match" | "mismatch" | "unobserved"

const compare = (
  expected: string,
  observed: string | undefined,
  matches = (e: string, o: string) => e === o,
): Status =>
  observed === undefined ? "unobserved" : matches(expected, observed) ? "match" : "mismatch"

/**
 * Reports expected against observed model, effort and agent type for an Assignment's bound agent.
 * Expected comes from the route, or the per-call override recorded at bind. Observed agent type
 * comes from the SubagentStart hook, effort from PreToolUse or SubagentStop, and the transcript
 * path from SubagentStop or PreToolUse, combined per field with the newest record winning; the
 * observed model comes from that subagent transcript.
 */
export const verifyAssignment = (id: string) =>
  Effect.gen(function* () {
    const state = yield* loadStateFile
    const assignment = yield* findAssignment(state, id)
    const agentId = assignment.agent_id
    if (agentId === null) return yield* new NotBound({ id })
    const route = routeFor(assignment.role)
    const records = yield* readObservations()
    const override = latestOverride(records, id, agentId)
    const expected = {
      model: override?.model ?? route.model,
      effort: override?.effort ?? route.effort,
      agent_type: `${PLUGIN_NAME}:${assignment.role}`,
    }
    const seen = seenOf(records, agentId)
    const models = seen.transcript === undefined ? [] : yield* transcriptModels(seen.transcript)
    const observedModel = models.length === 0 ? undefined : models.join("|")
    const rows = [
      {
        field: "model",
        expected: expected.model,
        observed: observedModel ?? "unobserved",
        status: compare(expected.model, observedModel, (want, got) =>
          got.split("|").every((model) => model.toLowerCase().includes(want.toLowerCase())),
        ),
      },
      {
        field: "effort",
        expected: expected.effort,
        observed: seen.effort ?? "unobserved",
        status: compare(expected.effort, seen.effort),
      },
      {
        field: "agent_type",
        expected: expected.agent_type,
        observed: seen.agent_type ?? "unobserved",
        status: compare(
          expected.agent_type,
          seen.agent_type,
          (want, got) => got === want || got.endsWith(`:${assignment.role}`),
        ),
      },
    ]
    const verdict = rows.some((r) => r.status === "mismatch")
      ? "mismatch"
      : rows.some((r) => r.status === "unobserved")
        ? "incomplete"
        : "ok"
    return {
      value: {
        assignment: id,
        role: assignment.role,
        agent_id: agentId,
        expected_source: override === undefined ? "route" : "override",
        checks: rows,
        verdict,
      },
      code: verdict === "mismatch" ? 3 : 0,
    }
  })
