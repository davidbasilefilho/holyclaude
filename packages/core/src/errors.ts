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

/** The worktree given to reserve is not an existing directory. */
export class InvalidWorktree extends Data.TaggedError("InvalidWorktree")<{
  readonly path: string
  readonly reason: string
}> {
  override get message() {
    return `Invalid worktree "${this.path}": ${this.reason}`
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

/** The Intent is closed, so it authorizes no dispatch and cannot be the one in use. */
export class IntentClosed extends Data.TaggedError("IntentClosed")<{
  readonly intent_id: string
}> {
  override get message() {
    return `Intent ${this.intent_id} is closed; \`holyclaude intent reopen --intent ${this.intent_id}\` opens it again`
  }
}

/** The Intent cannot close while Assignments of it are Running. */
export class IntentBusy extends Data.TaggedError("IntentBusy")<{
  readonly intent_id: string
  readonly running: ReadonlyArray<string>
}> {
  override get message() {
    return `Intent ${this.intent_id} has Running Assignments (${this.running.join(", ")}); settle them before closing it`
  }
}

/** No Intent was named, none is in use, and the open ones are not exactly one. */
export class NoActiveIntent extends Data.TaggedError("NoActiveIntent")<{
  readonly open: ReadonlyArray<{ readonly id: string; readonly objective: string }>
}> {
  override get message() {
    return this.open.length === 0
      ? "No Intent is open; create one with `holyclaude intent create`, or reopen one with `holyclaude intent reopen --intent <id>`"
      : `Several Intents are open and none is in use; run \`holyclaude intent use <id>\` or pass --intent <id>. Open Intents: ${this.open
          .map((intent) => `${intent.id} (${intent.objective.replace(/\s+/g, " ")})`)
          .join("; ")}`
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

/** A file read or an input exceeds its size bound. */
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

/** The state lock stopped being this writer's before the commit, so the write was abandoned. */
export class LockLost extends Data.TaggedError("LockLost")<{
  readonly lockFile: string
}> {
  override get message() {
    return `Lock ${this.lockFile} was taken over before the write was committed; nothing was written. Retry the operation`
  }
}

/** A file under the state directory is unreadable, malformed or disagrees with where it lives. */
export class CorruptRecord extends Data.TaggedError("CorruptRecord")<{
  readonly path: string
  readonly reason: string
}> {
  override get message() {
    return `${this.path} is not a valid state file: ${this.reason}`
  }
}

/** A path under the state directory is a symbolic link, so a write through it could land elsewhere. */
export class SymlinkRefused extends Data.TaggedError("SymlinkRefused")<{
  readonly path: string
}> {
  override get message() {
    return `${this.path} is a symbolic link; nothing under the state directory may be one`
  }
}

/**
 * An earlier version's state file waits to be migrated, but a different file already sits where the
 * migrated copy goes, so renaming would destroy it.
 */
export class MigratedFileInTheWay extends Data.TaggedError("MigratedFileInTheWay")<{
  readonly path: string
}> {
  override get message() {
    return `${this.path} already exists and differs from the state file waiting to be migrated; nothing was migrated. Move ${this.path} away, then rerun`
  }
}

/** The Assignment is Running for another clone, whose own root settles it. */
export class OwnedElsewhere extends Data.TaggedError("OwnedElsewhere")<{
  readonly id: string
  readonly clone_id: string
}> {
  override get message() {
    return `${this.id} is running for clone ${this.clone_id}, not this one; its own root settles it. Use \`holyclaude reconcile resolve ${this.id}\` to settle it from here`
  }
}

/** Reading or writing a state file failed. */
export class StateIo extends Data.TaggedError("StateIo")<{
  readonly path: string
  readonly cause: unknown
}> {
  override get message() {
    return `State I/O failed for ${this.path}: ${String(this.cause)}`
  }
}
