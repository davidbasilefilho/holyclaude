import { Effect } from "effect"

import { Usage } from "./errors.ts"

/** The kind of value a flag takes. `list` flags repeat and collect their values. */
export type FlagKind = "string" | "boolean" | "list"

/** Flags a command accepts, by name without the leading dashes. */
export type FlagSpec = Readonly<Record<string, FlagKind>>

/** Positional arguments and flag values of one command line. */
export interface Parsed {
  readonly positionals: ReadonlyArray<string>
  readonly flags: Readonly<Record<string, string | boolean | ReadonlyArray<string>>>
}

/** Reads one string flag. */
export const stringFlag = (parsed: Parsed, name: string): string | undefined => {
  const value = parsed.flags[name]
  return typeof value === "string" ? value : undefined
}

/** Reads one boolean flag, false when absent. */
export const booleanFlag = (parsed: Parsed, name: string): boolean => parsed.flags[name] === true

/** Reads a repeatable flag as a list. */
export const listFlag = (parsed: Parsed, name: string): ReadonlyArray<string> => {
  const value = parsed.flags[name]
  return Array.isArray(value) ? value : []
}

/** Splits arguments into positionals and flags, accepting `--name value` and `--name=value`. */
export const parseArgs = (args: ReadonlyArray<string>, spec: FlagSpec, usage: string) =>
  Effect.gen(function* () {
    const positionals: string[] = []
    const flags: Record<string, string | boolean | string[]> = {}
    for (let index = 0; index < args.length; index += 1) {
      const arg = args[index] ?? ""
      if (!arg.startsWith("--") || arg === "--") {
        positionals.push(arg)
        continue
      }
      const equals = arg.indexOf("=")
      const name = equals === -1 ? arg.slice(2) : arg.slice(2, equals)
      const kind = spec[name]
      if (kind === undefined)
        return yield* new Usage({
          message: `Unknown flag --${name}`,
          hint: `Usage: holyclaude ${usage}`,
        })
      if (kind === "boolean") {
        flags[name] = equals === -1 ? true : arg.slice(equals + 1) !== "false"
        continue
      }
      const value = equals === -1 ? args[++index] : arg.slice(equals + 1)
      if (value === undefined)
        return yield* new Usage({
          message: `Flag --${name} needs a value`,
          hint: `Usage: holyclaude ${usage}`,
        })
      if (kind === "list") {
        const existing = flags[name]
        flags[name] = [...(Array.isArray(existing) ? existing : []), value]
      } else flags[name] = value
    }
    const parsed: Parsed = { positionals, flags }
    return parsed
  })
