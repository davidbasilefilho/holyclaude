import { Data } from "effect"

/** A referenced Intent, Assignment or worker does not exist. */
export class UnknownRecord extends Data.TaggedError("UnknownRecord")<{
  readonly kind: "intent" | "assignment" | "worker"
  readonly id: string
}> {
  override get message() {
    return `Unknown ${this.kind} ${this.id}`
  }
}

/** A draft or state violates a domain rule that the schema cannot express. */
export class InvalidRecord extends Data.TaggedError("InvalidRecord")<{
  readonly message: string
}> {}

/** An ownership path breaks the portable path rules. */
export class InvalidPath extends Data.TaggedError("InvalidPath")<{
  readonly path: string
  readonly reason: string
}> {
  override get message() {
    return `Invalid path "${this.path}": ${this.reason}`
  }
}

/** A revision does not equal the live Intent revision. Reread the Intent and reassess. */
export class StaleRevision extends Data.TaggedError("StaleRevision")<{
  readonly given: number
  readonly live: number
}> {
  override get message() {
    return `Stale intent revision ${this.given}; the live revision is ${this.live}`
  }
}

/** An Intent has no valid revision (it reads as 0), so nothing can be dispatched or accepted. */
export class NoRevision extends Data.TaggedError("NoRevision")<{
  readonly intent_id: string
}> {
  override get message() {
    return `Intent ${this.intent_id} has no valid revision; update it with a material change first`
  }
}

/** The operation does not apply to the Assignment's current state. */
export class InvalidTransition extends Data.TaggedError("InvalidTransition")<{
  readonly id: string
  readonly state: string
  readonly action: string
}> {
  override get message() {
    return `Cannot ${this.action} ${this.id} while it is ${this.state}`
  }
}

/** A dispatch check failed, so nothing was reserved. */
export class DispatchRefused extends Data.TaggedError("DispatchRefused")<{
  readonly id: string
  readonly reason:
    | "MutabilityCeiling"
    | "MissingCapability"
    | "OutsideWritableRoots"
    | "DependencyNotAccepted"
    | "OwnershipConflict"
  readonly detail: string
}> {
  override get message() {
    return `Dispatch of ${this.id} refused (${this.reason}): ${this.detail}`
  }
}

/** A repeat of finish or accept carries different content than the recorded one. */
export class Conflict extends Data.TaggedError("Conflict")<{
  readonly id: string
  readonly what: "finish" | "acceptance"
}> {
  override get message() {
    return `${this.id} already has a different recorded ${this.what}`
  }
}

/** An acceptance record does not cover exactly the declared labels. */
export class InsufficientEvidence extends Data.TaggedError("InsufficientEvidence")<{
  readonly id: string
  readonly detail: string
}> {
  override get message() {
    return `Acceptance of ${this.id} rejected: ${this.detail}`
  }
}

/** The state file or an input exceeds its size cap. */
export class TooLarge extends Data.TaggedError("TooLarge")<{
  readonly subject: string
  readonly bytes: number
  readonly limit: number
}> {
  override get message() {
    return `${this.subject} is ${this.bytes} bytes; the limit is ${this.limit}`
  }
}

/** Another process holds the state lock and did not release it in time. */
export class StateLocked extends Data.TaggedError("StateLocked")<{
  readonly lockFile: string
}> {
  override get message() {
    return `State is locked by another process. If none is running, delete ${this.lockFile} (and ${this.lockFile}.breaking if it exists)`
  }
}

/** Reading or writing the state file failed. */
export class StateIo extends Data.TaggedError("StateIo")<{
  readonly path: string
  readonly cause: unknown
}> {
  override get message() {
    return `State I/O failed for ${this.path}: ${String(this.cause)}`
  }
}
