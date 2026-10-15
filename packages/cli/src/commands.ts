import {
  AcceptanceRecord,
  AssignmentDraft,
  AssignmentRef,
  AssignmentState,
  BindAgentInput,
  CancelInput,
  CloseIntentInput,
  CreateIntentInput,
  FinishInput,
  FollowUpInput,
  IntentState,
  ROUTES,
  ReserveInput,
  ResolveReconcileInput,
  SelectWorkerInput,
  Text,
  accept,
  bindAgent,
  cancel,
  closeIntent,
  createAssignment,
  createIntent,
  decodeJsonStrict,
  decodeStrict,
  finish,
  findAssignment,
  findIntent,
  followUp,
  isOpenAssignment,
  projectRoot,
  reconcile,
  readActiveIntent,
  readCloneId,
  refuseOtherClone,
  reopenIntent,
  requireOpen,
  reserve,
  resolveIntent,
  resolveReconcile,
  rollbackReservation,
  routeFor,
  selectWorker,
  sortedById,
  stateDirPath,
  updateIntent,
  updateState,
  type Assignment,
  type Intent,
  type State,
  type UpdateContext,
} from "@holyclaude/core"
import { Effect, Schema } from "effect"

import { booleanFlag, listFlag, stringFlag, type FlagSpec, type Parsed } from "./args.ts"
import { nowIso } from "./clock.ts"
import { StdinMissing, Usage } from "./errors.ts"
import { PLUGIN_NAME, rosterFingerprint } from "./fingerprint.ts"
import { postToolUse } from "./hook/post-tool-use.ts"
import { MAX_HOOK_BYTES, preToolUse } from "./hook/pre-tool-use.ts"
import { sessionStart } from "./hook/session-start.ts"
import { subagentStart, subagentStop } from "./hook/subagent.ts"
import { appendObservation, observationsPath } from "./observations.ts"
import { loadStateFile } from "./state.ts"
import { verifyAssignment } from "./verify.ts"

/** What a command produced: TOON for the model, or raw text for hooks, plus an exit code. */
export interface Outcome {
  readonly text?: string
  readonly value?: unknown
  readonly code?: number
}

/** One CLI command: its path, help and implementation. */
export interface Command {
  readonly path: ReadonlyArray<string>
  readonly usage: string
  readonly summary: string
  /** Shape of the JSON expected on stdin, when the command reads any. */
  readonly input?: string
  readonly root: boolean
  readonly flags: FlagSpec
  readonly positionals: number
  /** True when the last positional may be left out. */
  readonly optional?: true
  /** Hook commands read stdin themselves and must never fail loudly. */
  readonly hook?: boolean
  /**
   * The most bytes of stdin the command reads. Longer input is cut one byte past the limit, so the
   * command can tell it was longer without the rest being read.
   */
  readonly stdinLimit?: number
  readonly run: (
    args: Parsed,
    stdin: Effect.Effect<string, StdinMissing>,
  ) => Effect.Effect<Outcome, unknown>
}

const summaryRow = (assignment: Assignment) => ({
  id: assignment.id,
  role: assignment.role,
  state: assignment.state,
  rev: assignment.intent_revision,
  agent_id: assignment.agent_id,
  accepted: assignment.acceptance !== null,
  objective: assignment.objective.replace(/\s+/g, " "),
})

const intentRow = (intent: Intent, state: State) => ({
  id: intent.id,
  state: intent.state,
  revision: intent.revision,
  objective: intent.objective.replace(/\s+/g, " "),
  open_assignments: state.assignments.filter(
    (assignment) => assignment.intent_id === intent.id && isOpenAssignment(assignment),
  ).length,
})

const dispatchInfo = (assignment: Assignment) => {
  const route = routeFor(assignment.role)
  return {
    id: assignment.id,
    state: assignment.state,
    role: assignment.role,
    subagent_type: `${PLUGIN_NAME}:${assignment.role}`,
    model: route.model,
    effort: route.effort,
    rev: assignment.intent_revision,
  }
}

/**
 * The Intent a command acts on: the one named by `id`, else this clone's stored choice while it is
 * open, else the only open Intent.
 */
const activeIntent = (state: State, id: string | undefined) =>
  Effect.suspend(() => readActiveIntent(stateDirPath())).pipe(
    Effect.flatMap((stored) => resolveIntent(state, id, stored)),
  )

const INTENT_FLAG = { intent: "string" } as const

const read = <A, E>(use: (state: State) => Effect.Effect<A, E>) =>
  loadStateFile.pipe(Effect.flatMap(use))

const change = <A, E>(
  transition: (
    state: State,
    context: UpdateContext,
  ) => Effect.Effect<{ readonly state: State; readonly value: A }, E>,
) => Effect.suspend(() => updateState(stateDirPath(), transition))

/**
 * A change to an Assignment this clone must own: a Running row that another clone reserved is
 * refused, since its worker is that clone's to settle.
 */
const changeOwn = <A, E>(
  id: string,
  transition: (state: State) => Effect.Effect<{ readonly state: State; readonly value: A }, E>,
) =>
  change((state, { cloneId }) =>
    cloneId.pipe(
      Effect.flatMap((own) => refuseOtherClone(state, id, own)),
      Effect.andThen(transition(state)),
    ),
  )

const need = (stdin: Effect.Effect<string, StdinMissing>, command: string) =>
  stdin.pipe(
    Effect.flatMap((text) =>
      text.trim() === "" ? Effect.fail(new StdinMissing({ command })) : Effect.succeed(text),
    ),
  )

const fromStdin = <S extends Schema.Decoder<unknown>>(
  schema: S,
  stdin: Effect.Effect<string, StdinMissing>,
  command: string,
) => need(stdin, command).pipe(Effect.flatMap(decodeJsonStrict(schema)))

const IntentUpdateBody = Schema.Struct({
  id: Schema.optionalKey(Text),
  objective: Schema.optionalKey(Text),
  requirements: Schema.optionalKey(Schema.String),
})
const ResultBody = Schema.Struct({ result: Text })
const ModelFlag = Schema.Literals(["haiku", "sonnet", "opus", "fable"])
const EffortFlag = Schema.Literals(["low", "medium", "high", "xhigh", "max"])
const OUTCOMES = {
  success: "Success",
  failure: "Failure",
  errored: "Errored",
  interrupted: "Interrupted",
  stopped: "Stopped",
} as const

const usageError = (usage: string, message: string) =>
  new Usage({ message, hint: `Usage: holyclaude ${usage}` })

const flagValue = (parsed: Parsed, name: string, usage: string) => {
  const value = stringFlag(parsed, name)
  return value === undefined
    ? Effect.fail(usageError(usage, `Missing --${name}`))
    : Effect.succeed(value)
}

const optionalChoice = <S extends Schema.Decoder<string>>(schema: S, value: string | undefined) =>
  Effect.gen(function* () {
    if (value === undefined) return undefined
    const choice: string = yield* decodeStrict(schema)(value)
    return choice
  })

const withRef = (id: string | undefined) => decodeStrict(AssignmentRef)({ assignment_id: id })

const cmd = (command: Command): Command => command

const intentShow = cmd({
  path: ["intent", "show"],
  usage: "intent show [id | --intent <id>]",
  summary: "show the Intent in use, or the one named",
  root: false,
  flags: INTENT_FLAG,
  positionals: 1,
  optional: true,
  run: (args) =>
    read((state) => activeIntent(state, stringFlag(args, "intent") ?? args.positionals[0])).pipe(
      Effect.map((intent) => ({ value: intent })),
    ),
})

const INTENT_LIST_USAGE = `intent list [--state ${IntentState.literals.join("|")}]`

const intentList = cmd({
  path: ["intent", "list"],
  usage: INTENT_LIST_USAGE,
  summary: "list Intents with state, revision, objective and open Assignments",
  root: false,
  flags: { state: "string" },
  positionals: 0,
  run: (args) =>
    Effect.gen(function* () {
      const value = stringFlag(args, "state")
      const wanted = yield* optionalChoice(IntentState, value).pipe(
        Effect.mapError(() =>
          usageError(
            INTENT_LIST_USAGE,
            `State ${value} is not one of ${IntentState.literals.join("|")}`,
          ),
        ),
      )
      return yield* read((state) =>
        Effect.succeed({
          value: {
            intents: sortedById(state.intents)
              .filter((intent) => wanted === undefined || intent.state === wanted)
              .map((intent) => intentRow(intent, state)),
          },
        }),
      )
    }),
})

const intentUse = cmd({
  path: ["intent", "use"],
  usage: "intent use <id>",
  summary: "work on this Intent in this clone; the choice stays local",
  root: true,
  flags: {},
  positionals: 1,
  run: (args) =>
    change((state, { useIntent }) =>
      Effect.gen(function* () {
        const intent = yield* findIntent(state, args.positionals[0] ?? "")
        yield* requireOpen(intent)
        yield* useIntent(intent.id)
        return { state, value: intentRow(intent, state) }
      }),
    ).pipe(Effect.map((row) => ({ value: row }))),
})

const CLOSE_USAGE = "intent close [--intent <id>] --reason <text>"

const intentClose = cmd({
  path: ["intent", "close"],
  usage: CLOSE_USAGE,
  summary: "close the Intent with a reason; refused while its Assignments run",
  root: true,
  flags: { ...INTENT_FLAG, reason: "string" },
  positionals: 0,
  run: (args) =>
    Effect.gen(function* () {
      const reason = yield* flagValue(args, "reason", CLOSE_USAGE)
      const at = yield* nowIso
      const intent = yield* change((state) =>
        activeIntent(state, stringFlag(args, "intent")).pipe(
          Effect.flatMap((target) => decodeStrict(CloseIntentInput)({ id: target.id, reason, at })),
          Effect.flatMap((input) => closeIntent(state, input)),
        ),
      )
      return { value: intent }
    }),
})

const intentReopen = cmd({
  path: ["intent", "reopen"],
  usage: "intent reopen [--intent <id>]",
  summary: "open a closed Intent again; the revision bumps",
  root: true,
  flags: INTENT_FLAG,
  positionals: 0,
  run: (args) =>
    change((state) =>
      activeIntent(state, stringFlag(args, "intent")).pipe(
        Effect.flatMap((target) => reopenIntent(state, target.id)),
      ),
    ).pipe(Effect.map((intent) => ({ value: intent }))),
})

const intentCreate = cmd({
  path: ["intent", "create"],
  usage: "intent create",
  summary: "record a new Intent at revision 1",
  input: '{"objective":"...","requirements":"..."?}',
  root: true,
  flags: {},
  positionals: 0,
  run: (_args, stdin) =>
    fromStdin(CreateIntentInput, stdin, "intent create").pipe(
      Effect.flatMap((input) => change((state) => createIntent(state, input))),
      Effect.map((intent) => ({ value: intent })),
    ),
})

const intentUpdate = cmd({
  path: ["intent", "update"],
  usage: "intent update [--intent <id>] [--material]",
  summary: "edit the Intent; --material bumps the revision",
  input: '{"id":"..."?,"objective":"..."?,"requirements":"..."?}',
  root: true,
  flags: { ...INTENT_FLAG, material: "boolean" },
  positionals: 0,
  run: (args, stdin) =>
    fromStdin(IntentUpdateBody, stdin, "intent update").pipe(
      Effect.flatMap((body) =>
        change((state) =>
          activeIntent(state, body.id ?? stringFlag(args, "intent")).pipe(
            Effect.flatMap((intent) =>
              updateIntent(state, {
                ...body,
                id: intent.id,
                material: booleanFlag(args, "material"),
              }),
            ),
          ),
        ),
      ),
      Effect.map((intent) => ({ value: intent })),
    ),
})

const assignmentShow = cmd({
  path: ["assignment", "show"],
  usage: "assignment show <id>",
  summary: "show one Assignment in full",
  root: false,
  flags: {},
  positionals: 1,
  run: (args) =>
    withRef(args.positionals[0]).pipe(
      Effect.flatMap((ref) => read((state) => findAssignment(state, ref.assignment_id))),
      Effect.map((assignment) => ({ value: assignment })),
    ),
})

const LIST_USAGE = `assignment list [--state ${AssignmentState.literals.join("|")}] [--intent <id> | --all]`

/** The `--state` filter, or a usage error naming the states that exist. */
const stateFilter = (value: string | undefined) =>
  Effect.gen(function* () {
    if (value === undefined) return undefined
    return yield* decodeStrict(AssignmentState)(value).pipe(
      Effect.mapError(() =>
        usageError(
          LIST_USAGE,
          `State ${value} is not one of ${AssignmentState.literals.join("|")}`,
        ),
      ),
    )
  })

const assignmentList = cmd({
  path: ["assignment", "list"],
  usage: LIST_USAGE,
  summary: "list the Assignments of the Intent in use (--intent: another, --all: every one)",
  root: false,
  flags: { ...INTENT_FLAG, state: "string", all: "boolean" },
  positionals: 0,
  run: (args) =>
    Effect.gen(function* () {
      const wanted = yield* stateFilter(stringFlag(args, "state"))
      const everything = booleanFlag(args, "all")
      if (everything && stringFlag(args, "intent") !== undefined)
        return yield* usageError(LIST_USAGE, "Pick one of --intent <id> or --all")
      return yield* read((state) =>
        Effect.gen(function* () {
          const scope = everything
            ? undefined
            : (yield* activeIntent(state, stringFlag(args, "intent"))).id
          const rows = sortedById(state.assignments)
            .filter((assignment) => scope === undefined || assignment.intent_id === scope)
            .filter((assignment) => wanted === undefined || assignment.state === wanted)
            .map((assignment) =>
              everything
                ? { intent: assignment.intent_id, ...summaryRow(assignment) }
                : summaryRow(assignment),
            )
          return { value: { assignments: rows } }
        }),
      )
    }),
})

const assignmentCreate = cmd({
  path: ["assignment", "create"],
  usage: "assignment create",
  summary: "create a Ready Assignment",
  input:
    '{"intent_id","intent_revision","role","objective","scope":[],"constraints":[],"acceptance_criteria":[...],"required_evidence":[...],"mutability","metadata":{"ownership_paths":[],"symbols":[],"domains":[],"dependencies":[],"related_assignments":[],"independent_from":[]}?}',
  root: true,
  flags: {},
  positionals: 0,
  run: (_args, stdin) =>
    fromStdin(AssignmentDraft, stdin, "assignment create").pipe(
      Effect.flatMap((draft) => change((state) => createAssignment(state, draft))),
      Effect.map((assignment) => ({ value: dispatchInfo(assignment) })),
    ),
})

const assignmentReserve = cmd({
  path: ["assignment", "reserve"],
  usage: "assignment reserve <id> [--capabilities Write,Shell] [--root <dir>]...",
  summary: "revalidate and reserve (Ready to Running); prints the dispatch parameters",
  root: true,
  flags: { capabilities: "string", root: "list" },
  positionals: 1,
  run: (args) =>
    Effect.gen(function* () {
      const id = args.positionals[0]
      const given = stringFlag(args, "capabilities")
      const roots = listFlag(args, "root")
      const reserved = yield* change((state, { cloneId }) =>
        Effect.gen(function* () {
          // Read under the lock: two first-time reserves must not each find no clone id.
          const context = {
            projectRoot: projectRoot(),
            writableRoots: roots.length > 0 ? roots : [projectRoot()],
            cloneId: yield* cloneId,
          }
          const assignment = yield* findAssignment(state, id ?? "")
          const capabilities =
            given === undefined
              ? routeFor(assignment.role).capabilities
              : given.split(",").filter((item) => item !== "")
          const input = yield* decodeStrict(ReserveInput)({
            assignment_id: assignment.id,
            capabilities,
          })
          return yield* reserve(state, input, context)
        }),
      )
      return { value: dispatchInfo(reserved) }
    }),
})

const BIND_USAGE =
  "assignment bind <id> --agent <agentId> [--model haiku|sonnet|opus|fable] [--effort low..max] [--fingerprint <text>]"
const FINISH_USAGE = "assignment finish <id> --outcome success|failure|errored|interrupted|stopped"
const RESOLVE_USAGE = "reconcile resolve <id> --fail <reason> | --keep"

const assignmentBind = cmd({
  path: ["assignment", "bind"],
  usage: BIND_USAGE,
  summary: "attach the spawned agent; --model/--effort record a per-call override",
  root: true,
  flags: { agent: "string", model: "string", effort: "string", fingerprint: "string" },
  positionals: 1,
  run: (args) =>
    Effect.gen(function* () {
      const agent = yield* flagValue(args, "agent", BIND_USAGE)
      const model = yield* optionalChoice(ModelFlag, stringFlag(args, "model"))
      const effort = yield* optionalChoice(EffortFlag, stringFlag(args, "effort"))
      const fingerprint = stringFlag(args, "fingerprint") ?? (yield* rosterFingerprint)
      const input = yield* decodeStrict(BindAgentInput)({
        assignment_id: args.positionals[0],
        agent_id: agent,
        fingerprint,
      })
      const bound = yield* changeOwn(input.assignment_id, (state) => bindAgent(state, input))
      // The bind is committed and authoritative. The override is only a non-authoritative note
      // for verify, so a failed write is reported in the output and never fails the command.
      const missed =
        model === undefined && effort === undefined
          ? undefined
          : yield* appendObservation({
              kind: "override",
              assignment_id: bound.id,
              agent_id: agent,
              ...(model === undefined ? {} : { model }),
              ...(effort === undefined ? {} : { effort }),
              at: yield* nowIso,
            }).pipe(
              Effect.as(undefined),
              Effect.catch((error) =>
                Effect.succeed(`override not recorded in ${observationsPath()}: ${error.message}`),
              ),
            )
      return {
        value: { ...summaryRow(bound), ...(missed === undefined ? {} : { observation: missed }) },
      }
    }),
})

const assignmentRollback = cmd({
  path: ["assignment", "rollback"],
  usage: "assignment rollback <id>",
  summary: "return an unbound reservation to Ready after a failed spawn",
  root: true,
  flags: {},
  positionals: 1,
  run: (args) =>
    withRef(args.positionals[0]).pipe(
      Effect.flatMap((ref) =>
        changeOwn(ref.assignment_id, (state) => rollbackReservation(state, ref)),
      ),
      Effect.map((assignment) => ({ value: summaryRow(assignment) })),
    ),
})

const assignmentFinish = cmd({
  path: ["assignment", "finish"],
  usage: FINISH_USAGE,
  summary: "record the worker's execution outcome from its notification",
  input: '{"result":"the worker report"}',
  root: true,
  flags: { outcome: "string" },
  positionals: 1,
  run: (args, stdin) =>
    Effect.gen(function* () {
      const name = yield* flagValue(args, "outcome", FINISH_USAGE)
      const outcome = (OUTCOMES as Readonly<Record<string, string>>)[name]
      if (outcome === undefined)
        return yield* usageError(
          FINISH_USAGE,
          `Outcome ${name} is not one of ${Object.keys(OUTCOMES).join("|")}`,
        )
      const body = yield* fromStdin(ResultBody, stdin, "assignment finish")
      const input = yield* decodeStrict(FinishInput)({
        assignment_id: args.positionals[0],
        outcome,
        result: body.result,
      })
      const done = yield* changeOwn(input.assignment_id, (state) => finish(state, input))
      return { value: summaryRow(done) }
    }),
})

const assignmentCancel = cmd({
  path: ["assignment", "cancel"],
  usage: "assignment cancel <id> [--reason <text>]",
  summary: "record Cancelled once the stopped notification has arrived",
  root: true,
  flags: { reason: "string" },
  positionals: 1,
  run: (args) =>
    Effect.gen(function* () {
      const reason = stringFlag(args, "reason")
      const input = yield* decodeStrict(CancelInput)({
        assignment_id: args.positionals[0],
        notification: "stopped",
        ...(reason === undefined ? {} : { reason }),
      })
      const done = yield* changeOwn(input.assignment_id, (state) => cancel(state, input))
      return { value: summaryRow(done) }
    }),
})

const AcceptBody = AcceptanceRecord

const assignmentAccept = cmd({
  path: ["assignment", "accept"],
  usage: "assignment accept <id>",
  summary: "record the evidence review of a Succeeded Assignment",
  input:
    '{"intent_revision":N,"rationale":"...","criteria_evidence":{"<label>":"..."},"required_evidence":{"<label>":"..."}}',
  root: true,
  flags: {},
  positionals: 1,
  run: (args, stdin) =>
    Effect.gen(function* () {
      const acceptance = yield* fromStdin(AcceptBody, stdin, "assignment accept")
      const done = yield* change((state) =>
        accept(state, { assignment_id: args.positionals[0] ?? "", acceptance }),
      )
      return { value: summaryRow(done) }
    }),
})

const assignmentFollowUp = cmd({
  path: ["assignment", "follow-up"],
  usage: "assignment follow-up <id>",
  summary: "create an Assignment that continues a terminal one",
  input: "same JSON as assignment create",
  root: true,
  flags: {},
  positionals: 1,
  run: (args, stdin) =>
    Effect.gen(function* () {
      const draft = yield* fromStdin(AssignmentDraft, stdin, "assignment follow-up")
      const input = yield* decodeStrict(FollowUpInput)({
        predecessor_id: args.positionals[0],
        assignment: draft,
      })
      const created = yield* change((state) => followUp(state, input))
      return { value: dispatchInfo(created) }
    }),
})

const assignmentVerify = cmd({
  path: ["assignment", "verify"],
  usage: "assignment verify <id>",
  summary: "compare expected and observed model, effort and agent type",
  root: false,
  flags: {},
  positionals: 1,
  run: (args) => verifyAssignment(args.positionals[0] ?? ""),
})

const select = cmd({
  path: ["select"],
  usage: "select <id> [--fingerprint <text>]",
  summary: "choose a worker to reuse or spawn for a Ready Assignment",
  root: true,
  flags: { fingerprint: "string" },
  positionals: 1,
  run: (args) =>
    Effect.gen(function* () {
      const fingerprint = stringFlag(args, "fingerprint") ?? (yield* rosterFingerprint)
      const input = yield* decodeStrict(SelectWorkerInput)({
        assignment_id: args.positionals[0],
        fingerprint,
      })
      const state = yield* loadStateFile
      const selection = yield* selectWorker(state, input)
      const assignment = yield* findAssignment(state, input.assignment_id)
      const route = routeFor(assignment.role)
      return {
        value: {
          action: selection._tag === "Reuse" ? "reuse" : "spawn",
          ...(selection._tag === "Reuse"
            ? { agent_id: selection.agent_id, reason: selection.reason }
            : {}),
          subagent_type: `${PLUGIN_NAME}:${assignment.role}`,
          model: route.model,
          effort: route.effort,
        },
      }
    }),
})

const routes = cmd({
  path: ["routes"],
  usage: "routes",
  summary: "list the 18 specialists with their pinned model and effort",
  root: false,
  flags: {},
  positionals: 0,
  run: () =>
    Effect.succeed({
      value: {
        routes: ROUTES.map((route) => ({
          role: route.role,
          mutability: route.mutability,
          capabilities: route.capabilities.length === 0 ? "none" : route.capabilities.join("+"),
          independence: route.independence,
          model: route.model,
          effort: route.effort,
        })),
      },
    }),
})

const reconcileList = cmd({
  path: ["reconcile"],
  usage: "reconcile",
  summary: "list Running rows to confirm by agent id, and those running elsewhere",
  root: false,
  flags: {},
  positionals: 0,
  run: () =>
    read((state) =>
      Effect.suspend(() => readCloneId(stateDirPath())).pipe(
        Effect.map((cloneId) => {
          const { local, elsewhere } = reconcile(state, cloneId)
          return {
            value: {
              running: local.map(summaryRow),
              // Another clone reserved these; its root confirms them. Resolve one only by naming it.
              ...(elsewhere.length === 0
                ? {}
                : {
                    running_elsewhere: elsewhere.map((row) => ({
                      ...summaryRow(row),
                      clone: row.clone_id,
                    })),
                  }),
            },
          }
        }),
      ),
    ),
})

const reconcileResolve = cmd({
  path: ["reconcile", "resolve"],
  usage: RESOLVE_USAGE,
  summary: "fail a Running row with a reason, or keep it reserved",
  root: true,
  flags: { fail: "string", keep: "boolean" },
  positionals: 1,
  run: (args) =>
    Effect.gen(function* () {
      const reason = stringFlag(args, "fail")
      const keep = booleanFlag(args, "keep")
      if ((reason === undefined) === !keep)
        return yield* usageError(RESOLVE_USAGE, "Pick exactly one of --fail <reason> or --keep")
      const input = yield* decodeStrict(ResolveReconcileInput)(
        reason === undefined
          ? { _tag: "Keep", assignment_id: args.positionals[0] }
          : { _tag: "Fail", assignment_id: args.positionals[0], reason },
      )
      const done = yield* change((state) => resolveReconcile(state, input))
      return { value: summaryRow(done) }
    }),
})

const hookSessionStart = cmd({
  path: ["hook", "session-start"],
  usage: "hook session-start",
  summary:
    "SessionStart hook: core rules whole, plus a state summary that shrinks to fit, as additionalContext",
  input: "Claude Code hook JSON",
  root: false,
  hook: true,
  stdinLimit: MAX_HOOK_BYTES,
  flags: {},
  positionals: 0,
  // An unreadable stdin must not silence the hook: without the payload it injects the rules.
  run: (_args, stdin) =>
    stdin.pipe(
      Effect.orElseSucceed(() => ""),
      Effect.flatMap(sessionStart),
      Effect.map((text) => ({ text })),
    ),
})

const hookPreToolUse = cmd({
  path: ["hook", "pre-tool-use"],
  usage: "hook pre-tool-use",
  summary: "PreToolUse hook: effort observation, subagent VCS guard",
  input: "Claude Code hook JSON",
  root: false,
  hook: true,
  stdinLimit: MAX_HOOK_BYTES,
  flags: {},
  positionals: 0,
  run: (_args, stdin) =>
    stdin.pipe(
      Effect.flatMap(preToolUse),
      Effect.map((text) => ({ text })),
    ),
})

const hookSubagentStart = cmd({
  path: ["hook", "subagent-start"],
  usage: "hook subagent-start",
  summary: "SubagentStart hook: observe the agent type",
  input: "Claude Code hook JSON",
  root: false,
  hook: true,
  flags: {},
  positionals: 0,
  run: (_args, stdin) =>
    stdin.pipe(
      Effect.flatMap(subagentStart),
      Effect.map((text) => ({ text })),
    ),
})

const hookSubagentStop = cmd({
  path: ["hook", "subagent-stop"],
  usage: "hook subagent-stop",
  summary: "SubagentStop hook: observe the effort and transcript path, never block",
  input: "Claude Code hook JSON",
  root: false,
  hook: true,
  flags: {},
  positionals: 0,
  run: (_args, stdin) =>
    stdin.pipe(
      Effect.flatMap(subagentStop),
      Effect.map((text) => ({ text })),
    ),
})

const hookPostToolUse = cmd({
  path: ["hook", "post-tool-use"],
  usage: "hook post-tool-use",
  summary: "PostToolUse hook on the Agent tool: observe the model a specialist started on",
  input: "Claude Code hook JSON",
  root: false,
  hook: true,
  flags: {},
  positionals: 0,
  run: (_args, stdin) =>
    stdin.pipe(
      Effect.flatMap(postToolUse),
      Effect.map((text) => ({ text })),
    ),
})

/** Every command, longest paths first so `reconcile resolve` wins over `reconcile`. */
export const COMMANDS: ReadonlyArray<Command> = [
  intentShow,
  intentList,
  intentUse,
  intentClose,
  intentReopen,
  intentCreate,
  intentUpdate,
  assignmentShow,
  assignmentList,
  assignmentCreate,
  assignmentReserve,
  assignmentBind,
  assignmentRollback,
  assignmentFinish,
  assignmentCancel,
  assignmentAccept,
  assignmentFollowUp,
  assignmentVerify,
  select,
  routes,
  reconcileResolve,
  reconcileList,
  hookSessionStart,
  hookPreToolUse,
  hookSubagentStart,
  hookSubagentStop,
  hookPostToolUse,
].toSorted((a, b) => b.path.length - a.path.length)
