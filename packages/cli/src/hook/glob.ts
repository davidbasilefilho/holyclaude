/**
 * Whether a path pattern can name a protected directory once the shell expands it. A write target
 * such as `.gi?/config`, `.g*t/hooks/x` or `{.git,x}/hooks/x` is not `.git` as written, but bash
 * and PowerShell expand its wildcards and brace lists into a path that is. The pattern is run
 * against a small automaton that recognizes the paths with a part that is the directory's name, as
 * Windows reads it too (trailing dots and spaces, an alternate data stream), so every expansion is
 * covered without listing one, in time linear in the pattern's length.
 */

// The characters that end a path part: both separators, and the `=` of `dd of=PATH`.
const SEPARATORS = "/\\="
// The body of a brace range, `{a..z}` or `{1..9..2}`, which produces letters, digits and `-`.
const RANGE = /^(-?\d+\.\.-?\d+|[a-z]\.\.[a-z])(\.\.-?\d+)?$/
// Brace lists nested deeper than this are taken to produce anything.
const MAX_BRACE_DEPTH = 32

/** The step tables of the automaton for one name, each indexed by state and holding a state mask. */
interface Automaton {
  readonly states: number
  readonly accepting: number
  /** The characters the automaton tells apart; `x` stands for every other one. */
  readonly representatives: ReadonlyArray<string>
  readonly literal: ReadonlyMap<string, ReadonlyArray<number>>
  /** One character a wildcard produces, by the character. */
  readonly wild: ReadonlyMap<string, ReadonlyArray<number>>
  readonly one: ReadonlyArray<number>
  readonly star: ReadonlyArray<number>
  readonly range: ReadonlyArray<number>
  readonly any: ReadonlyArray<number>
}

const bit = (state: number) => 1 << state

/** The union of `steps`' entries for every state in `mask`. */
const through = (mask: number, steps: ReadonlyArray<number>): number => {
  let out = 0
  for (let state = 0; mask >> state !== 0; state += 1)
    if ((mask & bit(state)) !== 0) out |= steps[state] ?? 0
  return out
}

/** The states reachable from `mask` in any number of steps, none included. */
const closure = (mask: number, steps: ReadonlyArray<number>): number => {
  let reached = mask
  for (;;) {
    const grown = reached | through(reached, steps)
    if (grown === reached) return reached
    reached = grown
  }
}

// The states: 0 is the start of a part, 1 a part that is not the name, 2 a path that names the
// directory, and 3 + n a part that holds the name's first n characters; n past the name's length
// stands for its tail of dots and spaces.
const START = 0
const OTHER = 1
const NAMED = 2

/** Builds the automaton that recognizes a path with a part that is `name`, lower-case. */
const automaton = (name: string): Automaton => {
  // The three fixed states, then one for each count of characters read from 1 to one past the name.
  const states = 3 + name.length + 1 + 1
  const next = (state: number, char: string): number => {
    if (state === NAMED) return NAMED
    const separator = SEPARATORS.includes(char)
    if (state === START || state === OTHER) {
      if (separator) return START
      return state === START && char === name[0] ? 3 + 1 : OTHER
    }
    const read = state - 3
    if (read >= name.length) {
      if (separator || char === ":") return NAMED
      return char === "." || char === " " ? 3 + name.length + 1 : OTHER
    }
    if (separator) return START
    return char === name[read] ? state + 1 : OTHER
  }
  const all = Array.from({ length: states }, (_, state) => state)
  const representatives = [
    ...new Set([...name.split(""), ".", " ", ":", ...SEPARATORS.split(""), "-", "0", "x"]),
  ]
  // A wildcard produces no separator, and no `.` that starts a part: bash's globbing, and
  // PowerShell's, which leaves out hidden files, keep `*` from naming `.git`.
  const wildChars = representatives.filter((char) => !SEPARATORS.includes(char))
  const table = (chars: ReadonlyArray<string>, wildcard: boolean) =>
    all.map((state) =>
      chars
        .filter((char) => !wildcard || state !== START || char !== ".")
        .reduce((mask, char) => mask | bit(next(state, char)), 0),
    )
  const one = table(wildChars, true)
  return {
    states,
    accepting: all
      .filter((state) => state === NAMED || state - 3 >= name.length)
      .reduce((mask, state) => mask | bit(state), 0),
    representatives,
    literal: new Map(representatives.map((char) => [char, table([char], false)])),
    wild: new Map(wildChars.map((char) => [char, table([char], true)])),
    one,
    star: all.map((state) => closure(bit(state), one)),
    range: table(
      wildChars.filter((char) => /[a-z0-9-]/.test(char)),
      true,
    ),
    any: table(representatives, false),
  }
}

const PROTECTED = [".git", ".holyclaude"].map((name) => [name, automaton(name)] as const)

/** The states after one character of a bracket expression, `body` being what its brackets hold. */
const classStep = (machine: Automaton, mask: number, body: string): number => {
  const negated = body.startsWith("!") || body.startsWith("^")
  const listed = negated ? body.slice(1) : body
  const ranges = [...listed.matchAll(/(.)-(.)/g)]
  const holds = (char: string) =>
    negated ||
    listed.includes("[:") ||
    listed.includes(char) ||
    ranges.some(([, low = "", high = ""]) => low <= char && char <= high)
  let out = 0
  for (const [char, steps] of machine.wild) if (holds(char)) out |= through(mask, steps)
  return out
}

/** Where each `{` of a pattern closes, the top-level commas of its list, and whether it nests one. */
interface Braces {
  readonly close: Map<number, number>
  readonly commas: Map<number, ReadonlyArray<number>>
  readonly nesting: Set<number>
}

const bracesOf = (pattern: string): Braces => {
  const braces: Braces = { close: new Map(), commas: new Map(), nesting: new Set() }
  const open: { readonly at: number; readonly commas: number[] }[] = []
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index]
    if (char === "{") {
      const parent = open[open.length - 1]
      if (parent !== undefined) braces.nesting.add(parent.at)
      open.push({ at: index, commas: [] })
    } else if (char === ",") open[open.length - 1]?.commas.push(index)
    else if (char === "}") {
      const group = open.pop()
      if (group !== undefined) {
        braces.close.set(group.at, index)
        braces.commas.set(group.at, group.commas)
      }
    }
  }
  return braces
}

/** For each index of `text`, the first `]` at or after it, or -1. */
const bracketsOf = (text: string): Int32Array => {
  const found = new Int32Array(text.length + 1).fill(-1)
  for (let index = text.length - 1; index >= 0; index -= 1)
    found[index] = text[index] === "]" ? index : (found[index + 1] ?? -1)
  return found
}

/** Whether the lower-case `pattern` can expand to a path that `machine` recognizes. */
const canName = (machine: Automaton, pattern: string, braces: Braces, brackets: Int32Array) => {
  const run = (from: number, to: number, start: number, depth: number): number => {
    let mask = start
    let index = from
    while (index < to && mask !== 0) {
      const char = pattern[index] ?? ""
      const end = char === "{" ? (braces.close.get(index) ?? -1) : -1
      const commas = end !== -1 && end < to ? (braces.commas.get(index) ?? []) : []
      // `[]...]` holds a `]`, so the bracket that ends it is searched from the character after.
      const closing = char === "[" ? (brackets[index + 2] ?? -1) : -1
      if (char === "*") mask = through(mask, machine.star)
      else if (char === "?") mask = through(mask, machine.one)
      else if (closing !== -1 && closing < to) {
        mask = classStep(machine, mask, pattern.slice(index + 1, closing))
        index = closing
      } else if (commas.length > 0) {
        const bounds = [index, ...commas, end]
        let out = 0
        if (depth >= MAX_BRACE_DEPTH) out = closure(mask, machine.any)
        else
          for (let part = 0; part + 1 < bounds.length; part += 1)
            out |= run((bounds[part] ?? 0) + 1, bounds[part + 1] ?? 0, mask, depth + 1)
        mask = out
        index = end
      } else if (
        end !== -1 &&
        end < to &&
        !braces.nesting.has(index) &&
        RANGE.test(pattern.slice(index + 1, end))
      ) {
        mask = closure(through(mask, machine.range), machine.range)
        index = end
      } else {
        const key = machine.representatives.includes(char) ? char : "x"
        mask = through(mask, machine.literal.get(key) ?? [])
      }
      index += 1
    }
    return mask
  }
  return (run(0, pattern.length, bit(START), 0) & machine.accepting) !== 0
}

const NO_BRACES: Braces = { close: new Map(), commas: new Map(), nesting: new Set() }

/**
 * The protected directory, `.git` or `.holyclaude`, that `pattern` can name once expanded as bash
 * and PowerShell expand a path (`*`, `?`, `[...]`, `{a,b}` and `{a..z}`), or undefined when it can
 * name neither.
 */
export const protectedNameOf = (pattern: string): string | undefined => {
  const lower = pattern.toLowerCase()
  const braces = lower.includes("{") ? bracesOf(lower) : NO_BRACES
  const brackets = lower.includes("[") ? bracketsOf(lower) : new Int32Array(0)
  return PROTECTED.find(([, machine]) => canName(machine, lower, braces, brackets))?.[0]
}
