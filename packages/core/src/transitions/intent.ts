import { Effect, Schema } from "effect"

import { IntentBusy, InvalidRecord, UnacceptedAssignments } from "../errors.ts"
import { newId } from "../model/ids.ts"
import type { Intent } from "../model/intent.ts"
import { Id, Text } from "../model/primitives.ts"
import { findIntent, type Change, type State } from "../model/state.ts"

/** Input of createIntent. */
export const CreateIntentInput = Schema.Struct({
  objective: Text,
  requirements: Schema.String.pipe(Schema.withDecodingDefaultKey(Effect.succeed(""))),
})
/** Decoded input of createIntent. */
export type CreateIntentInput = typeof CreateIntentInput.Type

/** Input of updateIntent. `material` decides whether the revision bumps. */
export const UpdateIntentInput = Schema.Struct({
  id: Id,
  objective: Schema.optionalKey(Text),
  requirements: Schema.optionalKey(Schema.String),
  material: Schema.Boolean,
})
/** Decoded input of updateIntent. */
export type UpdateIntentInput = typeof UpdateIntentInput.Type

/**
 * Input of closeIntent: the Intent, why it closes, and when. `allow_unaccepted` is the reason to
 * close although Succeeded Assignments were never accepted.
 */
export const CloseIntentInput = Schema.Struct({
  id: Id,
  reason: Text,
  at: Text,
  allow_unaccepted: Schema.optionalKey(Text),
})
/** Decoded input of closeIntent. */
export type CloseIntentInput = typeof CloseIntentInput.Type

const replaceIntent = (state: State, next: Intent): Change<Intent> => ({
  state: { ...state, intents: state.intents.map((it) => (it.id === next.id ? next : it)) },
  value: next,
})

/** Records a new Intent at revision 1. */
export const createIntent = (
  state: State,
  input: CreateIntentInput,
): Effect.Effect<Change<Intent>> =>
  Effect.gen(function* () {
    const intent: Intent = { id: yield* newId("intent"), ...input, revision: 1, state: "open" }
    return { state: { ...state, intents: [...state.intents, intent] }, value: intent }
  })

/** Edits an Intent. The revision bumps only when the caller flags the change as material. */
export const updateIntent = (state: State, input: UpdateIntentInput) =>
  Effect.gen(function* () {
    const current = yield* findIntent(state, input.id)
    const next: Intent = {
      ...current,
      objective: input.objective ?? current.objective,
      requirements: input.requirements ?? current.requirements,
      revision: input.material ? current.revision + 1 : current.revision,
    }
    return replaceIntent(state, next)
  })

/**
 * Closes an open Intent with a reason and the time. Refused while any Assignment of the Intent is
 * Running, since its worker would be acting on work that no longer authorizes it. Also refused
 * while Succeeded Assignments of it are unaccepted, unless `allow_unaccepted` gives a reason, which
 * is kept in the close reason with the ids it overrode.
 */
export const closeIntent = (state: State, input: CloseIntentInput) =>
  Effect.gen(function* () {
    const current = yield* findIntent(state, input.id)
    if (current.state === "closed")
      return yield* new InvalidRecord({ message: `Intent ${current.id} is already closed` })
    const running = state.assignments
      .filter((row) => row.intent_id === current.id && row.state === "Running")
      .map((row) => row.id)
    if (running.length > 0) return yield* new IntentBusy({ intent_id: current.id, running })
    const unaccepted = state.assignments
      .filter(
        (row) =>
          row.intent_id === current.id && row.state === "Succeeded" && row.acceptance === null,
      )
      .map((row) => row.id)
    if (unaccepted.length > 0 && input.allow_unaccepted === undefined)
      return yield* new UnacceptedAssignments({ intent_id: current.id, unaccepted })
    return replaceIntent(state, {
      ...current,
      state: "closed",
      close_reason:
        unaccepted.length > 0
          ? `${input.reason} (unaccepted ${unaccepted.join(", ")} allowed: ${input.allow_unaccepted})`
          : input.reason,
      closed_at: input.at,
    })
  })

/**
 * Opens a closed Intent again and bumps its revision, so an acceptance recorded before the close
 * does not authorize new work.
 */
export const reopenIntent = (state: State, id: string) =>
  Effect.gen(function* () {
    const { close_reason: _reason, closed_at: _at, ...current } = yield* findIntent(state, id)
    if (current.state === "open")
      return yield* new InvalidRecord({ message: `Intent ${current.id} is already open` })
    return replaceIntent(state, { ...current, state: "open", revision: current.revision + 1 })
  })
