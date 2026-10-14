import { Clock, Effect, Random, Schema } from "effect"

/** Base36 digits of the creation time in milliseconds. Nine digits last past the year 5000. */
const TIME_DIGITS = 9
/** Base36 digits of randomness, so two clones creating at the same millisecond rarely collide. */
const RANDOM_DIGITS = 4

const identifier = (kind: string) =>
  Schema.String.check(Schema.isPattern(new RegExp(`^${kind}-[a-z0-9]+(?:-[a-z0-9]+)*$`)))

/**
 * The id of an Intent. It names a directory in the store, so it is lower-case ASCII with hyphens
 * and nothing else, which no file system treats specially.
 */
export const IntentId = identifier("intent")

/** The id of an Assignment. It names a file in the store; the same character rules as an Intent. */
export const AssignmentId = identifier("assignment")

/** The random id of one clone of the project, kept in a local file and stamped on Running rows. */
export const CloneId = identifier("clone")

/** A kind of record that has a generated id. */
export type IdKind = "intent" | "assignment" | "clone"

const randomDigits = Effect.forEach(
  Array.from({ length: RANDOM_DIGITS }, (_, index) => index),
  () => Random.nextIntBetween(0, 35).pipe(Effect.map((digit) => digit.toString(36))),
).pipe(Effect.map((digits) => digits.join("")))

/**
 * A new id: the kind, the creation time as fixed-width base36 and a short random suffix, as in
 * `intent-0mg8k2x1a-7f3q`. Because the time comes first and has a fixed width, plain string order
 * among generated ids is creation order; {@link compareIds} puts legacy counter ids (`intent-0001`)
 * before every generated one. No counter is involved, so clones that create records independently
 * never pick the same id.
 */
export const newId = (kind: IdKind) =>
  Effect.gen(function* () {
    const time = (yield* Clock.currentTimeMillis).toString(36).padStart(TIME_DIGITS, "0")
    return `${kind}-${time}-${yield* randomDigits}`
  })

const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** The counter of a legacy id such as `intent-0001`, or undefined for a generated id. */
const legacyCounter = (id: string): bigint | undefined => {
  const digits = /^[a-z]+-(\d+)$/.exec(id)?.[1]
  return digits === undefined ? undefined : BigInt(digits)
}

/**
 * Orders ids oldest first. Every legacy counter id (`intent-0001`, with any number of digits) comes
 * before every generated one, in numeric order; generated ids follow in plain text order, which is
 * creation order. Use it wherever the order of records matters.
 */
export const compareIds = (a: string, b: string): number => {
  const first = legacyCounter(a)
  const second = legacyCounter(b)
  if (first !== undefined && second !== undefined)
    return first < second ? -1 : first > second ? 1 : compareText(a, b)
  if (first !== undefined) return -1
  if (second !== undefined) return 1
  return compareText(a, b)
}

/** The records ordered by id, oldest first. */
export const sortedById = <A extends { readonly id: string }>(
  records: ReadonlyArray<A>,
): ReadonlyArray<A> => records.toSorted((a, b) => compareIds(a.id, b.id))
