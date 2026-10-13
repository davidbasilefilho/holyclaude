import { Data } from "effect"

/** The command line does not match the command's usage. */
export class Usage extends Data.TaggedError("Usage")<{
  readonly message: string
  readonly hint: string
}> {}

/** There is no Intent yet, so the operation has nothing to act on. */
export class NoIntent extends Data.TaggedError("NoIntent")<{ readonly message: string }> {}

/** The Assignment has no bound agent yet, so there is nothing to verify. */
export class NotBound extends Data.TaggedError("NotBound")<{ readonly id: string }> {
  override get message() {
    return `Assignment ${this.id} has no bound agent`
  }
}

/** Reading standard input failed or standard input is a terminal. */
export class StdinMissing extends Data.TaggedError("StdinMissing")<{
  readonly command: string
}> {
  override get message() {
    return `${this.command} reads JSON from stdin and none was provided`
  }
}
