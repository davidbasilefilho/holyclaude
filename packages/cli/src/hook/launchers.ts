import { scanScript, type Simple, type Word } from "./shell.ts"

/** A reason to deny, or undefined when the command may run. */
type Verdict = string | undefined

/**
 * The work one judgement may do, in words read and half-characters scanned. Readings that look
 * twice (a joined line, a window title, a parameter that may take a value) can multiply the work of
 * a command made of nested launchers, so a command that needs more than this is denied as
 * unreadable: a hook that runs out of time lets the call through. A real command stays far below
 * it.
 */
export const WORK_LIMIT = 8_000_000

/** The work a judgement has left. The policy creates one per command and passes it down. */
export interface Budget {
  left: number
}

/** A budget with all of {@link WORK_LIMIT} left. */
export const newBudget = (): Budget => ({ left: WORK_LIMIT })

/** Spends `units` of the budget and tells whether that overspent it. */
export const overBudget = (budget: Budget, units: number): boolean => {
  budget.left -= units
  return budget.left < 0
}

/** Why a command is denied when reading it needs more work than the budget allows. */
export const TOO_LARGE_WHY = "it is too large to read"

/** What the launchers need of the policy that calls them: judging words, a script or a command. */
export interface Judge {
  /** The deepest nesting of commands the policy reads. */
  readonly maxDepth: number
  /** The reason given for a command that cannot be verified. */
  readonly unsure: (why: string) => string
  /** Judges the words of one command. */
  readonly words: (words: ReadonlyArray<Word>, depth: number, budget: Budget) => Verdict
  /** Judges the text of a script, every command in it. */
  readonly script: (source: string, depth: number, budget: Budget) => Verdict
  /** Judges one command with the targets of its output redirections. */
  readonly simple: (simple: Simple, depth: number, budget: Budget) => Verdict
  /** Words the program runs as one command line, as `cmd /c` does. */
  readonly line: (words: ReadonlyArray<Word>, depth: number, budget: Budget) => Verdict
}

/**
 * Judges the command of a program that launches another one. The words are the whole command, the
 * launcher's own name first.
 */
export type Launcher = (
  judge: Judge,
  words: ReadonlyArray<Word>,
  depth: number,
  budget: Budget,
) => Verdict

// What a command cut short by `(` leaves of what follows: the scanner reads the parenthesis as a
// subshell, so the operands after it are gone from the words and only a computed word remains.
const CUT_SHORT: Word = { text: "$(...)", dynamic: true }

// A computed word that also marks the command as cut short.
const CUT_OPEN: Word = { ...CUT_SHORT, open: true }

/** Whether a `(` cut the command short, so that operands it has are not among its words. */
const isCut = (words: ReadonlyArray<Word>): boolean => words[words.length - 1]?.open === true

// Start-Process parameters besides -FilePath and -ArgumentList. Which of them take a value decides
// which word is the program. The short names are aliases: -ea is -ErrorAction.
const START_VALUED = [
  "workingdirectory",
  "verb",
  "windowstyle",
  "credential",
  "environment",
  "redirectstandardinput",
  "erroraction",
  "ea",
  "warningaction",
  "wa",
  "informationaction",
  "infa",
  "errorvariable",
  "ev",
  "warningvariable",
  "wv",
  "informationvariable",
  "iv",
  "outvariable",
  "ov",
  "outbuffer",
  "ob",
  "pipelinevariable",
  "pv",
  "progressaction",
]
// The parameters whose value is a file the program writes, which the policy judges like the target
// of a `>`.
const START_OUTPUTS = ["redirectstandardoutput", "redirectstandarderror"]
const START_SWITCHES = ["wait", "nonewwindow", "passthru", "loaduserprofile", "usenewenvironment"]
// What cmd's `start` takes before the program: switches, some with a value, and a window title.
const CMD_START_SWITCH =
  /^\/(\?|b|i|min|max|wait|separate|shared|low|normal|high|realtime|abovenormal|belownormal)$/i
const CMD_START_VALUED = /^\/(d|node|affinity|machine)$/i
const START_WORD: Word = { text: "start", dynamic: false }
// -FilePath and -ArgumentList: before the program, one letter is enough for them, as in PowerShell.
const FILE_FLAGS = ["filepath"]
const FILE_FLAGS_FIRST = ["filepath", "f"]
const LIST_FLAGS = ["argumentlist", "args"]
const LIST_FLAGS_FIRST = ["argumentlist", "args", "a"]
const NO_ARGUMENTS: Simple = { words: [], outputs: [] }

/**
 * Whether `text` is one of the Start-Process parameters `names`, spelled in full or as a start of
 * the name of two letters or more (a name given in `names` also counts when it is shorter). A
 * one-letter word belongs to the program, so `start git -c k=v` does not read git's `-c` as
 * -Credential.
 */
const isStartFlag = (text: string, names: ReadonlyArray<string>): boolean => {
  if (text.charCodeAt(0) !== 45 || !/^-[A-Za-z]+$/.test(text)) return false
  const spelled = text.slice(1).toLowerCase()
  return names.some((full) => full.startsWith(spelled) && (spelled.length > 1 || spelled === full))
}

/** A parameter written `-Name:value` carries its value in the same word. */
const attachedValue = (word: Word): readonly [string, Word | undefined] => {
  const colon = word.text.startsWith("-") ? word.text.indexOf(":") : -1
  if (colon <= 1) return [word.text, undefined]
  // The parameter's name has no backslash, so its colon is the first one in both readings.
  const literal = word.literal?.slice(word.literal.indexOf(":") + 1)
  return [
    word.text.slice(0, colon),
    {
      text: word.text.slice(colon + 1),
      dynamic: word.dynamic,
      ...(literal === undefined ? {} : { literal }),
    },
  ]
}

/**
 * The elements of an argument list that starts with `first`, when the parameter carried it, and
 * goes on from `from`. A comma ending one word or starting the next joins them, as in `'commit',
 * '-m', 'x'`, so no element is taken for a parameter.
 */
const listFrom = (words: ReadonlyArray<Word>, from: number, first?: Word): ReadonlyArray<Word> => {
  const list: Word[] = first === undefined ? [] : [first]
  for (let index = from; index < words.length; index += 1) {
    const word = words[index]
    if (word === undefined) break
    const previous = list[list.length - 1]
    if (previous !== undefined && !previous.text.endsWith(",") && !word.text.startsWith(",")) break
    list.push(word)
  }
  return list
}

/**
 * The text of the command line an argument list makes: the program receives its elements joined by
 * spaces, so commas separate elements. The placeholders the scanner leaves for a substitution
 * (`$(...)`) become a variable, so that reading the text again finds one computed word and not a
 * command inside it.
 */
const argumentText = (elements: ReadonlyArray<Word>): string =>
  elements
    .map((element) => {
      if (element.dynamic) return element.text
      // PowerShell keeps the backslashes of an unquoted path, so the text is read back as it has them.
      const text = element.literal ?? element.text
      return text === "@" ? CUT_SHORT.text : text.replaceAll(",", " ")
    })
    .join(" ")
    .replaceAll(/\$\(\.\.\.\)|\$\{\.\.\.\}|`\.\.\.`/g, "$_")

/**
 * The commands that text makes when read as a script: an element such as `"commit -m x"` is split
 * again, and a separator in it (`/c git status && git push`) starts a command of its own. Text that
 * cannot be scanned, an odd quote for one, is cut at its spaces.
 */
const argumentCommands = (text: string): ReadonlyArray<Simple> => {
  const scan = scanScript(text)
  if (scan.ok) return scan.commands
  const words = text.split(/\s+/).filter((part) => part !== "")
  return [{ words: words.map((part) => ({ text: part, dynamic: false })), outputs: [] }]
}

/**
 * A parameter whose value starts with `@{` takes a hashtable, which spreads over several words, and
 * the quotes that would show where it ends are gone. Each word holding a `}` from `valueAt` on is
 * tried as its end, and the command that follows it is judged without the parameter at `flagAt`: a
 * `}` inside a quote cannot hide the program behind it.
 */
const afterHashtable = (
  judge: Judge,
  words: ReadonlyArray<Word>,
  flagAt: number,
  valueAt: number,
  depth: number,
  budget: Budget,
): Verdict => {
  const before = words.slice(0, flagAt)
  const readings: ReadonlyArray<Word>[] = []
  for (let end = valueAt; end < words.length; end += 1)
    if (words[end]?.text.includes("}") === true) readings.push(words.slice(end + 1))
  // With no `}` at all, a `;` of the hashtable ended the command.
  if (readings.length === 0) readings.push([])
  for (const after of readings) {
    // A `;` in the hashtable ends the command, and the rest is in the next one: when nothing follows
    // the `}` the command may go on, so it is cut short.
    const verdict = judge.words(
      [...before, ...(after.length === 0 ? [CUT_OPEN] : after)],
      depth + 1,
      budget,
    )
    if (verdict !== undefined) return verdict
  }
  return undefined
}

/**
 * `Start-Process git -ArgumentList 'commit'` runs the program it names with the arguments it lists,
 * so the program and its arguments are judged as the command they make. The program is the
 * -FilePath value or the first operand; the arguments are the -ArgumentList value and the operands
 * after the program, as `start git commit` passes them. The files named by -RedirectStandardOutput
 * and -RedirectStandardError are the targets of the command's output. The `start` of cmd is read
 * the same way, past its switches and its window title. `speculative` marks a reading that is a
 * guess beside the main one, which has no program to judge where the main one is wrong.
 */
const classifyStartProcess = (
  judge: Judge,
  words: ReadonlyArray<Word>,
  depth: number,
  budget: Budget,
  speculative = false,
): Verdict => {
  if (depth > judge.maxDepth) return judge.unsure("commands nested too deeply")
  if (overBudget(budget, words.length)) return judge.unsure(TOO_LARGE_WHY)
  const head = words[0] ?? START_WORD
  let file: Word | undefined
  let fileAt = -1
  const elements: Word[] = []
  const written: string[] = []
  for (let index = 1; index < words.length; index += 1) {
    const word = words[index]
    if (word === undefined) break
    const [name, inline] = attachedValue(word)
    if (word.text.charCodeAt(0) === 64 && /^@[A-Za-z_]\w*$/.test(word.text)) {
      // A splatted hashtable may hold the program or its arguments, so neither can be read. After a
      // dropped title it is only an argument: cmd's `start` does not splat.
      if (file === undefined && !speculative) file = CUT_SHORT
      else elements.push(CUT_SHORT)
    } else if (isStartFlag(name, file === undefined ? FILE_FLAGS_FIRST : FILE_FLAGS)) {
      file = inline ?? words[index + 1] ?? CUT_SHORT
      fileAt = -1
      if (inline === undefined) index += 1
    } else if (isStartFlag(name, file === undefined ? LIST_FLAGS_FIRST : LIST_FLAGS)) {
      const list = listFrom(words, index + 1, inline)
      elements.push(...(list.length === 0 ? [CUT_SHORT] : list))
      index += list.length - (inline === undefined ? 0 : 1)
    } else if (isStartFlag(name, START_OUTPUTS)) {
      const target = inline ?? words[index + 1]
      if (target !== undefined)
        written.push(target.text, ...(target.literal ? [target.literal] : []))
      if (inline === undefined) index += 1
    } else if (isStartFlag(name, START_VALUED)) {
      const valueAt = inline === undefined ? index + 1 : index
      if ((inline ?? words[index + 1])?.text.startsWith("@{") === true)
        return afterHashtable(judge, words, index, valueAt, depth, budget)
      if (inline === undefined) index += 1
    } else if (isStartFlag(name, START_SWITCHES)) continue
    else if (file === undefined) {
      if (CMD_START_VALUED.test(word.text)) index += 1
      else if (word.text.startsWith("-")) {
        // A parameter this list does not know takes a value or it does not, so both readings are
        // judged: the program is the next word, or the one after it.
        const without = (count: number) => [...words.slice(0, index), ...words.slice(index + count)]
        return (
          classifyStartProcess(judge, without(1), depth + 1, budget, speculative) ??
          classifyStartProcess(judge, without(2), depth + 1, budget, true)
        )
      } else if (!CMD_START_SWITCH.test(word.text)) {
        file = word
        fileAt = index
      }
    } else {
      const list = listFrom(words, index + 1, word)
      elements.push(...list)
      index += list.length - 1
    }
  }
  if (isCut(words)) {
    // A `(` ended the command: the program, or the arguments not given yet, follow in an expression.
    if (file === undefined) file = speculative ? undefined : CUT_SHORT
    else if (elements.length === 0 || elements[elements.length - 1]?.open === true)
      elements.push(CUT_SHORT)
  }
  if (file === undefined) return undefined
  const text = argumentText(elements)
  if (overBudget(budget, text.length >> 1)) return judge.unsure(TOO_LARGE_WHY)
  const [first = NO_ARGUMENTS, ...others] = argumentCommands(text)
  const launched: Simple = {
    words: [file, ...first.words],
    outputs: [...first.outputs, ...written],
  }
  let verdict = judge.simple(launched, depth + 1, budget)
  for (const other of others) verdict ??= judge.simple(other, depth + 1, budget)
  // In cmd, `start "title" git push` takes its first operand for a window title, and a title is
  // not told from a program by its look: the words after the first operand are judged as a start
  // of their own too.
  if (verdict !== undefined || speculative || fileAt === -1) return verdict
  return classifyStartProcess(judge, [head, ...words.slice(fileAt + 1)], depth + 1, budget, true)
}

/** A program that runs the command after its options: which options take a value, and which not. */
interface Host {
  readonly valued: ReadonlyArray<string>
  readonly switches: ReadonlyArray<string>
}

const HOSTS: Readonly<Record<string, Host>> = {
  wsl: {
    valued: ["-d", "--distribution", "--distribution-id", "-u", "--user", "--cd", "--shell-type"],
    switches: ["-e", "--exec", "--system"],
  },
  conhost: { valued: ["--width", "--height", "--signal", "--server"], switches: ["--headless"] },
  wt: {
    valued: [
      "-w",
      "--window",
      "-d",
      "--startingDirectory",
      "-p",
      "--profile",
      "--title",
      "--tabColor",
      "--colorScheme",
      "--pos",
      "--size",
      "-s",
    ],
    switches: [
      "-M",
      "--maximized",
      "-F",
      "--fullscreen",
      "-f",
      "--focus",
      "-H",
      "-V",
      "-D",
      "--duplicate",
      "--suppressApplicationTitle",
    ],
  },
}
const NO_HOST: Host = { valued: [], switches: [] }
// Windows Terminal takes a subcommand, with options of its own, before the command.
const TERMINAL_SUBCOMMANDS = new Set(["new-tab", "nt", "split-pane", "sp"])

/** Splits Windows Terminal's arguments at its `;`, alone or ending a word, into commands. */
const terminalCommands = (words: ReadonlyArray<Word>): ReadonlyArray<ReadonlyArray<Word>> => {
  let current: Word[] = []
  const commands = [current]
  for (const word of words) {
    if (word.dynamic || !word.text.endsWith(";")) current.push(word)
    else {
      if (word.text !== ";")
        current.push({
          ...word,
          text: word.text.slice(0, -1),
          ...(word.literal === undefined ? {} : { literal: word.literal.slice(0, -1) }),
        })
      current = []
      commands.push(current)
    }
  }
  return commands
}

/** A first word that is not the command: `wsl ~` for the home directory, a terminal subcommand. */
const isHostLeader = (name: string, text: string): boolean =>
  name === "wsl" ? text === "~" : name === "wt" && TERMINAL_SUBCOMMANDS.has(text.toLowerCase())

/**
 * Reads the options of `command` from `from`: where the command starts, and, when an option is not
 * among the host's, its index, because it may take the next word as its value or not.
 */
const readOptions = (
  host: Host,
  command: ReadonlyArray<Word>,
  from: number,
): { readonly start: number; readonly unknown?: number } => {
  for (let index = from; index < command.length; index += 1) {
    const text = command[index]?.text ?? ""
    if (text === "--") return { start: index + 1 }
    if (!text.startsWith("-") || text === "-") return { start: index }
    if (host.valued.includes(text)) index += 1
    else if (!host.switches.includes(text)) return { start: index, unknown: index }
  }
  return { start: command.length }
}

/** Judges one command of a host, the words after its options, and the cut that may follow them. */
const hostedCommand = (
  judge: Judge,
  name: string,
  head: Word,
  command: ReadonlyArray<Word>,
  cut: boolean,
  depth: number,
  budget: Budget,
): Verdict => {
  const host = HOSTS[name] ?? NO_HOST
  let options = readOptions(host, command, 0)
  if (options.unknown === undefined && isHostLeader(name, command[options.start]?.text ?? ""))
    options = readOptions(host, command, options.start + 1)
  if (options.unknown !== undefined) {
    // An option that is not known takes a value or it does not, so both readings are judged.
    const at = options.unknown
    const without = (count: number) => [head, ...command.slice(0, at), ...command.slice(at + count)]
    return judge.words(without(1), depth + 1, budget) ?? judge.words(without(2), depth + 1, budget)
  }
  const inner = command.slice(options.start)
  const run = cut ? [...inner, CUT_SHORT] : inner
  if (run.length > 1) return judge.line(run, depth, budget)
  return judge.words(run, depth + 1, budget) ?? judge.line(run, depth, budget)
}

/**
 * `wsl git push`, `conhost git push` and `wt git push` run the words after their options, as any
 * wrapper does, and take them as a command line too, so a quoted `&&` between the words, or the
 * whole line quoted as in `wsl "git add . && git push"`, is read as a script. Windows Terminal runs
 * several commands separated by `;`, each with a subcommand and options of its own. An option the
 * host is not known to have is read both as taking a value and as not.
 */
const hosted =
  (name: string): Launcher =>
  (judge, words, depth, budget) => {
    if (overBudget(budget, words.length)) return judge.unsure(TOO_LARGE_WHY)
    const head = words[0] ?? { text: name, dynamic: false }
    const rest = words.slice(1)
    const commands = name === "wt" ? terminalCommands(rest) : [rest]
    for (const [position, command] of commands.entries()) {
      const cut = isCut(words) && position === commands.length - 1
      const verdict = hostedCommand(judge, name, head, command, cut, depth, budget)
      if (verdict !== undefined) return verdict
    }
    return undefined
  }

// Words that would read differently without their quotes: whitespace, quotes, operators, comments,
// expansions and globs.
const NEEDS_QUOTES = /[\s'"\\$`;&|<>()#*?[]/

/**
 * A word of a script-block call, written back so that reading the call again as a script sees what
 * the shell saw. A word that had quotes keeps them, so a `'#'` or `'a; b'` does not start a comment
 * or a command, and a word with a computed part is double-quoted when it holds a space or a `#`.
 * Every other `{` and `}` becomes a `;`: the quotes that would tell a brace of the script from a
 * brace in a string are gone, so every brace separates statements and a string cannot hide a
 * write.
 */
const blockWord = (word: Word): string => {
  // PowerShell keeps the backslashes of an unquoted path, and the quotes written here keep them too.
  const text = word.literal ?? word.text
  if (word.dynamic && /[\s#]/.test(text))
    return `"${text.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`
  if (!word.dynamic && (text === "" || NEEDS_QUOTES.test(text)))
    return `'${text.replaceAll("'", "'\\''")}'`
  return text.replaceAll(/[{}]/g, ";")
}

/**
 * `Invoke-Command -ScriptBlock { git push }` and `Start-Job { git push }` run the braces as a
 * script. The call is judged as a script in which each brace ends a statement, so the statements of
 * every block are judged, whatever sits in the call around them. A block held in a variable or a
 * file is out of reach, as any script is.
 */
const classifyScriptBlock: Launcher = (judge, words, depth, budget) =>
  judge.script(`: ${words.slice(1).map(blockWord).join(" ")}`, depth + 1, budget)

const startProcess: Launcher = (judge, words, depth, budget) =>
  classifyStartProcess(judge, words, depth, budget)

const launchersNamed = (names: ReadonlyArray<string>, launcher: Launcher) =>
  names.map((name) => [name, launcher] as const)

/**
 * The launchers by the lower-case name of the program: `start` and `saps` are PowerShell's aliases
 * of Start-Process, `icm` and `sajb` of Invoke-Command and Start-Job.
 */
export const LAUNCHERS: Readonly<Record<string, Launcher>> = Object.fromEntries([
  ...launchersNamed(["start-process", "saps", "start"], startProcess),
  ...["wsl", "conhost", "wt"].map((name) => [name, hosted(name)] as const),
  ...launchersNamed(
    ["invoke-command", "icm", "start-job", "sajb", "start-threadjob"],
    classifyScriptBlock,
  ),
])
