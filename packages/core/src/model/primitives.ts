import { Effect, Schema } from "effect"

/** Text with at least one non-whitespace character. */
export const Text = Schema.String.check(Schema.isPattern(/\S/))

/** Opaque identifier of an Intent, Assignment or agent. */
export const Id = Text

/** Non-empty list of non-blank labels. */
export const Labels = Schema.NonEmptyArray(Text)

/** A live Intent revision: the first revision is 1 and revision 0 is invalid. */
export const Revision = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))

/**
 * A revision as persisted. A missing key decodes as 0, which can never match a live revision, so
 * legacy records are readable but never authorize a dispatch.
 */
export const StoredRevision = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)).pipe(
  Schema.withDecodingDefaultKey(Effect.succeed(0)),
)

/** A list of non-blank strings that decodes as empty when its key is missing. */
export const TextList = Schema.Array(Text).pipe(Schema.withDecodingDefaultKey(Effect.succeed([])))
