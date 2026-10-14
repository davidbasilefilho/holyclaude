import { Effect, Schema } from "effect"
import { findAssignment, routeFor } from "@holyclaude/core"
import { NotBound } from "./errors.ts"
import { PLUGIN_NAME } from "./fingerprint.ts"
import { latestObserved, latestOverride, readObservations } from "./observations.ts"
import { loadStateFile } from "./state.ts"

const TranscriptLine = Schema.Struct({
  message: Schema.optionalKey(Schema.Struct({ model: Schema.optionalKey(Schema.String) })),
})
const decodeLine = Schema.decodeUnknownEffect(Schema.fromJsonString(TranscriptLine))

/** Every real model id the subagent transcript shows, in order of first appearance. */
const transcriptModels = (path: string) =>
  Effect.gen(function* () {
    const text = yield* Effect.tryPromise(() => Bun.file(path).text()).pipe(
      Effect.orElseSucceed(() => ""),
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
 * Expected comes from the route, or the per-call override recorded at bind. Observed effort and
 * agent type come from the PreToolUse hook; observed model comes from the subagent transcript.
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
    const seen = latestObserved(records, agentId)
    const models = seen?.transcript === undefined ? [] : yield* transcriptModels(seen.transcript)
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
        observed: seen?.effort ?? "unobserved",
        status: compare(expected.effort, seen?.effort),
      },
      {
        field: "agent_type",
        expected: expected.agent_type,
        observed: seen?.agent_type ?? "unobserved",
        status: compare(
          expected.agent_type,
          seen?.agent_type,
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
