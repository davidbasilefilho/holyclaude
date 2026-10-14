import { Effect, Schema } from "effect"

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

/** Records a new Intent at revision 1. */
export const createIntent = (
  state: State,
  input: CreateIntentInput,
): Effect.Effect<Change<Intent>> =>
  Effect.gen(function* () {
    const intent: Intent = { id: yield* newId("intent"), ...input, revision: 1 }
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
    return {
      state: { ...state, intents: state.intents.map((it) => (it.id === next.id ? next : it)) },
      value: next,
    }
  })
