import { scanScript, type Simple, type Word } from "./shell.ts"

/** A reason to deny, or undefined when the command may run. */
type Verdict = string | undefined

const MAX_DEPTH = 6

const REASONS = {
  git: (sub: string) =>
    `git ${sub} writes VCS state, and VCS writes belong to the root. Describe the change in your report (files and intent) and the root commits it. git status, diff, log, show, blame and fetch are open to you.`,
  gh: (sub: string) =>
    `gh ${sub} is a write or an unlisted gh command, and gh writes belong to the root. Put the finding in your report. Open to you: gh pr view|checks|diff|list|status, run view|list, issue view|list, repo view, and gh api for plain reads.`,
  holyclaude: (sub: string) =>
    `holyclaude ${sub} changes Intent and Assignment state, which the root owns. Read it with holyclaude intent show, assignment show, assignment list, assignment verify, routes and reconcile.`,
  state: `The .holyclaude state files are written by the root through the holyclaude CLI. Describe the state you need in your report.`,
  unsure: (why: string) =>
    `This command cannot be verified (${why}). Write it as plain commands with literal program names, for example one git read per command, so it can run.`,
}

const GIT_READS = new Set([
  "status",
  "diff",
  "log",
  "show",
  "blame",
  "rev-parse",
  "ls-files",
  "grep",
  "cat-file",
  "describe",
  "archive",
  "ls-tree",
  "rev-list",
  "show-ref",
  "merge-base",
  "for-each-ref",
  "shortlog",
  "diff-tree",
  "name-rev",
  "ls-remote",
  "check-ignore",
  "version",
  "help",
])

const GIT_PATHLESS_GLOBALS = new Set([
  "-p",
  "--paginate",
  "-P",
  "--no-pager",
  "--bare",
  "--no-replace-objects",
  "--literal-pathspecs",
  "--glob-pathspecs",
  "--noglob-pathspecs",
  "--icase-pathspecs",
  "--no-optional-locks",
  "--no-lazy-fetch",
  "--no-advice",
])
const GIT_VALUE_GLOBALS = new Set([
  "-C",
  "--git-dir",
  "--work-tree",
  "--namespace",
  "--super-prefix",
])
const GIT_INLINE_GLOBALS = /^--(git-dir|work-tree|namespace|super-prefix|attr-source|config-env)=/
const GIT_INFO_GLOBALS = new Set(["--version", "--help", "-h", "--html-path", "--man-path"])
const GIT_EXEC_CONFIG =
  /^(alias\.|core\.(fsmonitor|pager|sshcommand|editor|hookspath|askpass|gitproxy)|credential\.|filter\.|diff\..*\.(command|textconv)|pager\.|include|url\.|sequence\.editor|gpg\.|uploadpack\.|receive\.|protocol\.ext)/i
const GIT_EXEC_FLAGS =
  /^--(upload-pack|receive-pack|exec|ext-diff|open-files-in-pager|config-env)(=|$)/

const BRANCH_FLAGS = new Set([
  "-l",
  "--list",
  "-a",
  "--all",
  "-r",
  "--remotes",
  "-v",
  "-vv",
  "--verbose",
  "--show-current",
  "-i",
  "--ignore-case",
  "--no-abbrev",
  "--column",
  "--no-column",
  "--color",
  "--no-color",
])
const BRANCH_VALUE_FLAGS = new Set([
  "--merged",
  "--no-merged",
  "--contains",
  "--no-contains",
  "--sort",
  "--format",
  "--points-at",
  "--abbrev",
])
const TAG_FLAGS = new Set([
  "-l",
  "--list",
  "-v",
  "--verify",
  "-i",
  "--ignore-case",
  "--column",
  "--no-column",
  "--color",
  "--no-color",
])
const CONFIG_READ_ACTIONS = new Set([
  "-l",
  "--list",
  "--get",
  "--get-all",
  "--get-regexp",
  "--get-urlmatch",
  "get",
  "list",
])
const CONFIG_NEUTRAL = new Set([
  "--global",
  "--local",
  "--system",
  "--worktree",
  "--show-origin",
  "--show-scope",
  "--name-only",
  "-z",
  "--null",
  "--includes",
  "--no-includes",
  "--bool",
  "--int",
  "--path",
  "--expiry-date",
  "--bool-or-int",
])

const WRAPPERS: Readonly<
  Record<string, { readonly values: ReadonlyArray<string>; readonly leading: number }>
> = {
  env: { values: ["-u", "-C", "--unset", "--chdir"], leading: 0 },
  command: { values: [], leading: 0 },
  exec: { values: ["-a"], leading: 0 },
  builtin: { values: [], leading: 0 },
  nohup: { values: [], leading: 0 },
  setsid: { values: [], leading: 0 },
  time: { values: ["-f", "-o", "--format", "--output"], leading: 0 },
  nice: { values: ["-n", "--adjustment"], leading: 0 },
  ionice: { values: ["-c", "-n", "-p", "-P", "-u"], leading: 0 },
  stdbuf: { values: ["-i", "-o", "-e"], leading: 0 },
  timeout: { values: ["-s", "-k", "--signal", "--kill-after"], leading: 1 },
  sudo: { values: ["-u", "-g", "-h", "-p", "-C", "-D", "-R", "-T", "-U", "-r", "-t"], leading: 0 },
  doas: { values: ["-u", "-C"], leading: 0 },
  xargs: {
    values: ["-I", "-n", "-P", "-d", "-L", "-s", "-E", "-a", "-l", "-i"],
    leading: 0,
  },
  watch: { values: ["-n", "-d", "--interval"], leading: 0 },
  unbuffer: { values: [], leading: 0 },
  chronic: { values: [], leading: 0 },
  taskset: { values: [], leading: 1 },
  flock: { values: ["-w", "-E", "-c"], leading: 1 },
  busybox: { values: [], leading: 0 },
}

const SHELLS = new Set(["sh", "bash", "zsh", "dash", "ksh", "ash", "fish", "csh", "tcsh"])
const RUNTIMES = new Set(["bun", "bunx", "node", "npx", "deno", "tsx", "ts-node", "pnpm", "yarn"])
const BREAKS = new Set(["for", "select", "case", "function", "fi", "done", "esac", "}", "[["])
const OPENERS = new Set(["if", "then", "elif", "else", "while", "until", "do", "!", "{", "coproc"])
const FILE_WRITERS = new Set([
  "rm",
  "mv",
  "cp",
  "tee",
  "dd",
  "truncate",
  "install",
  "ln",
  "rsync",
  "unlink",
  "shred",
  "touch",
])

const basename = (path: string) => path.slice(path.lastIndexOf("/") + 1)
const isAssignment = (text: string) => /^[A-Za-z_][A-Za-z0-9_]*\+?=/.test(text)
const texts = (words: ReadonlyArray<Word>) => words.map((word) => word.text)
const touchesState = (text: string) => text.includes(".holyclaude")

const classifyGitBranch = (args: ReadonlyArray<string>): boolean => {
  let listing = false
  const positionals: string[] = []
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? ""
    if (arg === "-l" || arg === "--list") listing = true
    if (BRANCH_FLAGS.has(arg)) continue
    if (BRANCH_VALUE_FLAGS.has(arg)) index += 1
    else if (/^--(merged|no-merged|contains|no-contains|sort|format|points-at|abbrev)=/.test(arg))
      continue
    else if (arg.startsWith("-")) return false
    else positionals.push(arg)
  }
  return positionals.length === 0 || listing
}

const classifyGitTag = (args: ReadonlyArray<string>): boolean => {
  let listing = false
  const positionals: string[] = []
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? ""
    if (arg === "-l" || arg === "--list" || arg === "-v" || arg === "--verify") listing = true
    if (TAG_FLAGS.has(arg) || /^-n\d*$/.test(arg)) {
      if (/^-n\d*$/.test(arg)) listing = true
      continue
    }
    if (
      [
        "--contains",
        "--no-contains",
        "--points-at",
        "--merged",
        "--no-merged",
        "--sort",
        "--format",
      ].includes(arg)
    )
      index += 1
    else if (/^--(contains|no-contains|points-at|merged|no-merged|sort|format)=/.test(arg)) continue
    else if (arg.startsWith("-")) return false
    else positionals.push(arg)
  }
  return positionals.length === 0 || listing
}

const classifyGitConfig = (args: ReadonlyArray<string>): boolean => {
  let reading = false
  const positionals: string[] = []
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? ""
    if (CONFIG_READ_ACTIONS.has(arg)) reading = true
    else if (CONFIG_NEUTRAL.has(arg)) continue
    else if (
      arg === "--file" ||
      arg === "-f" ||
      arg === "--blob" ||
      arg === "--type" ||
      arg === "-t"
    )
      index += 1
    else if (arg === "--default") index += 1
    else if (arg.startsWith("-")) return false
    else positionals.push(arg)
  }
  return reading || positionals.length === 1
}

const classifyGitFetch = (args: ReadonlyArray<string>): boolean => {
  const positionals = args.filter((arg) => !arg.startsWith("-"))
  const flagsOk = args.every(
    (arg) => !/^(-u|--update-head-ok|--refmap=.*)$/.test(arg) && !GIT_EXEC_FLAGS.test(arg),
  )
  return flagsOk && positionals.slice(1).every((spec) => !spec.includes(":"))
}

const classifyGitSub = (sub: string, rest: ReadonlyArray<Word>): Verdict => {
  const args = texts(rest)
  const deny = REASONS.git(sub)
  if (GIT_READS.has(sub)) {
    if (args.some((arg) => GIT_EXEC_FLAGS.test(arg))) return deny
    if (sub === "grep" && args.some((arg) => arg.startsWith("-O"))) return deny
    return undefined
  }
  switch (sub) {
    case "fetch":
      return classifyGitFetch(args) ? undefined : deny
    case "branch":
      return classifyGitBranch(args) ? undefined : deny
    case "tag":
      return classifyGitTag(args) ? undefined : deny
    case "config":
      return classifyGitConfig(args) ? undefined : deny
    case "remote": {
      const [first, ...others] = args.filter((arg) => arg !== "-v" && arg !== "--verbose")
      if (first === undefined) return undefined
      if (first === "show" || first === "get-url")
        return others.every((a) => !a.startsWith("-") || a === "-n") ? undefined : deny
      return deny
    }
    case "stash":
      return args[0] === "list" || args[0] === "show" ? undefined : deny
    case "worktree":
      return args[0] === "list" ? undefined : deny
    default:
      return deny
  }
}

const classifyGit = (args: ReadonlyArray<Word>): Verdict => {
  let index = 0
  while (index < args.length) {
    const word = args[index]
    if (word === undefined || !word.text.startsWith("-")) break
    const flag = word.text
    if (flag === "-c") {
      const setting = args[index + 1]
      if (setting === undefined) return REASONS.unsure("git -c without a value")
      if (GIT_EXEC_CONFIG.test(setting.text))
        return REASONS.unsure(`git -c ${setting.text.split("=")[0]} can run programs`)
      index += 2
    } else if (GIT_VALUE_GLOBALS.has(flag)) {
      if (args[index + 1] === undefined) return REASONS.unsure(`git ${flag} without a value`)
      index += 2
    } else if (GIT_INLINE_GLOBALS.test(flag) || GIT_PATHLESS_GLOBALS.has(flag)) index += 1
    else if (GIT_INFO_GLOBALS.has(flag) || flag === "--exec-path") return undefined
    else return REASONS.git(flag)
  }
  const sub = args[index]
  if (sub === undefined) return undefined
  if (sub.dynamic) return REASONS.unsure("the git subcommand is computed")
  return classifyGitSub(sub.text, args.slice(index + 1))
}

const GH_READS: Readonly<Record<string, ReadonlyArray<string>>> = {
  pr: ["view", "checks", "diff", "list", "status"],
  run: ["view", "list"],
  issue: ["view", "list", "status"],
  repo: ["view"],
}
const GH_API_WRITES = /^(-X|--method|-f|-F|--field|--raw-field|--input)(=|$)/
const GH_API_CLUSTER = /^-[A-Za-z]*[XfF]/

const classifyGh = (args: ReadonlyArray<Word>): Verdict => {
  const [group, action] = args
  if (group === undefined) return undefined
  if (group.dynamic || action?.dynamic === true)
    return REASONS.unsure("the gh subcommand is computed")
  if (["--version", "--help", "-h"].includes(group.text)) return undefined
  if (group.text === "api") {
    const flags = texts(args.slice(1)).filter((arg) => arg.startsWith("-"))
    const writes = flags.some(
      (arg) => GH_API_WRITES.test(arg) || (!arg.startsWith("--") && GH_API_CLUSTER.test(arg)),
    )
    return writes ? REASONS.gh("api with a write flag") : undefined
  }
  const allowed = GH_READS[group.text]
  if (allowed !== undefined && action !== undefined && allowed.includes(action.text))
    return undefined
  return REASONS.gh(
    args
      .slice(0, 2)
      .map((word) => word.text)
      .join(" "),
  )
}

const HOLYCLAUDE_READS = new Set([
  "intent show",
  "assignment show",
  "assignment list",
  "assignment verify",
  "routes",
])

const classifyHolyclaude = (args: ReadonlyArray<Word>): Verdict => {
  const [first, second] = texts(args)
  if (first === undefined) return undefined
  if (args.slice(0, 2).some((word) => word.dynamic))
    return REASONS.unsure("the holyclaude subcommand is computed")
  if (args.some((word) => word.text === "--help" || word.text === "-h")) return undefined
  if (first === "--version" || first === "-V") return undefined
  if (first === "reconcile" && (second === undefined || second.startsWith("-"))) return undefined
  if (first === "routes") return undefined
  return HOLYCLAUDE_READS.has(`${first} ${second ?? ""}`)
    ? undefined
    : REASONS.holyclaude(
        second === undefined || second.startsWith("-") ? first : `${first} ${second}`,
      )
}

const unwrap = (name: string, rest: ReadonlyArray<Word>): ReadonlyArray<Word> | string => {
  const wrapper = WRAPPERS[name]
  if (wrapper === undefined) return rest
  let index = 0
  let leading = 0
  while (index < rest.length) {
    const word = rest[index]
    if (word === undefined) break
    const text = word.text
    if (text === "--") {
      index += 1
      break
    }
    if (name === "command" && (text === "-v" || text === "-V")) return []
    if (name === "env" && (text === "-S" || text === "--split-string")) {
      const script = rest[index + 1]
      if (script === undefined || script.dynamic) return REASONS.unsure("env -S script is computed")
      const verdict = classifyScript(script.text, 1)
      if (verdict !== undefined) return verdict
      index += 2
      continue
    }
    if (text.startsWith("-") && text.length > 1) {
      index += wrapper.values.includes(text) ? 2 : 1
      continue
    }
    if (name === "env" && isAssignment(text)) {
      index += 1
      continue
    }
    if (leading < wrapper.leading) {
      leading += 1
      index += 1
      continue
    }
    break
  }
  return rest.slice(index)
}

const findAfter = (words: ReadonlyArray<Word>, markers: ReadonlyArray<string>) => {
  const start = words.findIndex((word) => markers.includes(word.text))
  if (start === -1) return undefined
  const tail = words.slice(start + 1)
  const end = tail.findIndex((word) => word.text === ";" || word.text === "+")
  return end === -1 ? tail : tail.slice(0, end)
}

const classifyShell = (rest: ReadonlyArray<Word>, depth: number): Verdict => {
  const flagged = rest.findIndex((word) => /^-[A-Za-z]*c[A-Za-z]*$/.test(word.text))
  if (flagged !== -1) {
    const script = rest.slice(flagged + 1).find((word) => !word.text.startsWith("-"))
    if (script === undefined) return undefined
    if (script.dynamic) return REASONS.unsure("the shell script text is computed")
    return classifyScript(script.text, depth + 1)
  }
  if (rest.some((word) => ["--version", "--help", "-V"].includes(word.text))) return undefined
  const file = rest.find((word) => !word.text.startsWith("-") || word.text === "-")
  if (file === undefined || file.text === "-" || rest.some((word) => word.text === "-s"))
    return REASONS.unsure("a shell reading commands from input")
  if (/^holyclaude(\.js)?$/.test(basename(file.text)))
    return classifyHolyclaude(rest.slice(rest.indexOf(file) + 1))
  return undefined
}

const classifyRuntime = (rest: ReadonlyArray<Word>): Verdict => {
  const entry = rest.findIndex(
    (word) =>
      /^holyclaude(\.js)?$/.test(basename(word.text)) ||
      /packages\/cli\/(src\/)?main\.(ts|js)$/.test(word.text),
  )
  return entry === -1 ? undefined : classifyHolyclaude(rest.slice(entry + 1))
}

const classifyWords = (input: ReadonlyArray<Word>, depth: number): Verdict => {
  let words = input
  for (;;) {
    const head = words[0]
    if (head === undefined) return undefined
    if (!head.dynamic && BREAKS.has(head.text)) return undefined
    if (!head.dynamic && OPENERS.has(head.text)) words = words.slice(1)
    else if (isAssignment(head.text)) words = words.slice(1)
    else break
  }
  const [head, ...rest] = words
  if (head === undefined) return undefined
  if (head.dynamic) return REASONS.unsure("the program name is computed")
  const name = basename(head.text)
  if (name === "git") return classifyGit(rest)
  if (name === "gh") return classifyGh(rest)
  if (/^holyclaude(\.js)?$/.test(name)) return classifyHolyclaude(rest)
  if (name in WRAPPERS) {
    const inner = unwrap(name, rest)
    return typeof inner === "string" ? inner : classifyWords(inner, depth)
  }
  if (SHELLS.has(name)) return classifyShell(rest, depth)
  if (name === "eval") {
    if (rest.some((word) => word.dynamic)) return REASONS.unsure("eval text is computed")
    return classifyScript(texts(rest).join(" "), depth + 1)
  }
  if (RUNTIMES.has(name)) return classifyRuntime(rest)
  if (name === "find") {
    const inner = findAfter(rest, ["-exec", "-execdir", "-ok", "-okdir"])
    if (inner !== undefined) return classifyWords(inner, depth)
  }
  if (name === "fd" || name === "fdfind") {
    const inner = findAfter(rest, ["-x", "-X", "--exec", "--exec-batch"])
    if (inner !== undefined) return classifyWords(inner, depth)
  }
  if (FILE_WRITERS.has(name) && rest.some((word) => touchesState(word.text))) return REASONS.state
  if (
    (name === "sed" || name === "perl") &&
    rest.some((word) => /^(-[A-Za-z]*i|--in-place)/.test(word.text)) &&
    rest.some((word) => touchesState(word.text))
  )
    return REASONS.state
  return undefined
}

const classifySimple = (simple: Simple, depth: number): Verdict => {
  if (simple.outputs.some(touchesState)) return REASONS.state
  return classifyWords(simple.words, depth)
}

const classifyScript = (source: string, depth: number): Verdict => {
  if (depth > MAX_DEPTH) return REASONS.unsure("commands nested too deeply")
  const scan = scanScript(source)
  if (!scan.ok) return REASONS.unsure(scan.reason)
  for (const simple of scan.commands) {
    const verdict = classifySimple(simple, depth)
    if (verdict !== undefined) return verdict
  }
  return undefined
}

/**
 * Judges a Bash command a subagent wants to run. Returns the reason to deny it, framed as the good
 * direction to take, or undefined when every simple command in it may run. When unsure it denies.
 */
export const denyReason = (command: string): string | undefined => classifyScript(command, 0)
