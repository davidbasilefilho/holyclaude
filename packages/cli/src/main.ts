import { Cause, Effect } from "effect"

import packageJson from "../package.json" with { type: "json" }
import { parseArgs } from "./args.ts"
import { COMMANDS, type Command, type Outcome } from "./commands.ts"
import { StdinMissing, Usage } from "./errors.ts"
import { toon } from "./toon.ts"

/** The CLI version, taken from package.json so a version bump needs no source edit. */
const { version: VERSION } = packageJson

const HINTS: Readonly<Record<string, string>> = {
  UnknownRecord: "List ids with `holyclaude assignment list` or `holyclaude intent show`.",
  InvalidRecord: "Adjust the input to satisfy the rule in the message, then rerun.",
  InvalidPath: "Use relative portable paths such as packages/cli/src.",
  StaleRevision:
    "Reread with `holyclaude intent show`, reassess the work at the live revision, then retry.",
  NoRevision: "Set a valid revision with `holyclaude intent update --material`.",
  InvalidTransition:
    "Check the state with `holyclaude assignment show <id>` and use the command that fits it.",
  DispatchRefused: "Fix the condition named in the message, then reserve again.",
  Conflict: "A different record is stored; compare with `holyclaude assignment show <id>`.",
  InsufficientEvidence:
    "Cover exactly the declared labels in criteria_evidence and required_evidence.",
  TooLarge:
    "Shorten the input to fit the limit, or move away or trim the oversized file the message names.",
  StateLocked:
    "Another process holds the state lock; retry in a moment, or delete the lock file named above if none is running.",
  LockLost: "The state was left untouched; rerun the command.",
  StateIo: "Check HOLYCLAUDE_STATE_DIR or CLAUDE_PROJECT_DIR and the file permissions.",
  SymlinkRefused:
    "Replace the symbolic link the message names with a real file or directory, or review why the repository has one; the state directory must hold none.",
  MigratedFileInTheWay:
    "Move the state.json.migrated the message names out of the folder (or delete it if you no longer need it), then rerun; the old state.json is still in place.",
  OwnedElsewhere:
    "Another clone reserved this Assignment. Settle it from there, or with `holyclaude reconcile resolve <id>` once you have evidence about its worker.",
  CorruptRecord:
    "Fix or delete the file the message names, or restore it from version control; a missing file reads as nothing, and a file under local/ can always be deleted.",
  SchemaError:
    "Send JSON that matches the command's input shape; see `holyclaude <command> --help`.",
  NoIntent: "Create one with `holyclaude intent create` (JSON on stdin).",
  NotBound:
    "Bind the spawned agent first with `holyclaude assignment bind <id> --agent <agentId>`.",
  StdinMissing: "Pipe the JSON in, for example: echo '{...}' | holyclaude <command>.",
}

const commandHelp = (command: Command): string =>
  [
    `${command.usage}  ${command.summary}${command.root ? " [root]" : ""}`,
    ...(command.input === undefined ? [] : [`stdin: ${command.input}`]),
  ].join("\n")

const topHelp = (): string =>
  [
    "holyclaude <command> [args]; JSON on stdin, TOON on stdout; [root] commands change state",
    ...COMMANDS.toSorted((a, b) => a.usage.localeCompare(b.usage)).map(
      (command) => `${command.usage}  ${command.summary}${command.root ? " [root]" : ""}`,
    ),
    "<command> --help shows its stdin shape",
  ].join("\n")

const errorFields = (error: unknown) => {
  const tag =
    typeof error === "object" && error !== null && "_tag" in error ? String(error._tag) : "Error"
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String(error.message)
      : String(error)
  const hint =
    error instanceof Usage
      ? error.hint
      : (HINTS[tag] ?? "Run `holyclaude --help` for the commands.")
  return { error: tag, message: message.split("\n").slice(0, 6).join("\n").slice(0, 600), hint }
}

/**
 * Reads stdin, or only its first `limit + 1` bytes when a limit is given: one byte over shows the
 * input was longer.
 */
const stdinOf = (limit: number | undefined) =>
  Effect.suspend(() =>
    process.stdin.isTTY
      ? Effect.fail(new StdinMissing({ command: "this command" }))
      : Effect.tryPromise({
          try: () => (limit === undefined ? Bun.stdin : Bun.stdin.slice(0, limit + 1)).text(),
          catch: () => new StdinMissing({ command: "this command" }),
        }),
  )

const find = (argv: ReadonlyArray<string>) =>
  COMMANDS.find((command) => command.path.every((part, index) => argv[index] === part))

const run = (argv: ReadonlyArray<string>): Effect.Effect<Outcome, unknown> =>
  Effect.gen(function* () {
    if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h" || argv[0] === "help")
      return { text: `${topHelp()}\n` }
    if (argv[0] === "--version" || argv[0] === "-V") return { text: `${VERSION}\n` }
    const command = find(argv)
    if (command === undefined)
      return yield* new Usage({
        message: `Unknown command ${argv.slice(0, 2).join(" ")}`,
        hint: "Run `holyclaude --help` for the commands.",
      })
    const rest = argv.slice(command.path.length)
    if (rest.includes("--help") || rest.includes("-h")) return { text: `${commandHelp(command)}\n` }
    const parsed = yield* parseArgs(rest, command.flags, command.usage)
    const count = parsed.positionals.length
    if (count !== command.positionals && !(command.optional && count === command.positionals - 1))
      return yield* new Usage({
        message: `Expected ${command.positionals} argument(s), got ${parsed.positionals.length}`,
        hint: `Usage: holyclaude ${command.usage}`,
      })
    return yield* command.run(parsed, stdinOf(command.stdinLimit))
  })

const render = (outcome: Outcome): { readonly out: string; readonly code: number } => ({
  out: outcome.text ?? toon(outcome.value),
  code: outcome.code ?? 0,
})

const failure = (error: unknown) => ({
  out: toon(errorFields(error)),
  code: error instanceof Usage ? 2 : 1,
})

const program = (argv: ReadonlyArray<string>) => {
  const hook = argv[0] === "hook"
  const quiet = { out: "", code: 0 }
  return run(argv).pipe(
    Effect.map(render),
    Effect.catch((error) => Effect.succeed(hook ? quiet : failure(error))),
    Effect.catchCause((cause) =>
      Effect.succeed(hook ? quiet : failure({ _tag: "Defect", message: Cause.pretty(cause) })),
    ),
  )
}

const { out, code } = await Effect.runPromise(program(Bun.argv.slice(2)))
if (code === 0) process.stdout.write(out)
else process.stderr.write(out)
process.exitCode = code
