import { protectedNameOf } from "./glob.ts"
import type { ToolInput } from "./input.ts"
import {
  LAUNCHERS,
  newBudget,
  overBudget,
  TOO_LARGE_WHY,
  type Budget,
  type Judge,
} from "./launchers.ts"
import { scanScript, type Simple, type Word } from "./shell.ts"

/** A reason to deny, or undefined when the command may run. */
type Verdict = string | undefined

const MAX_DEPTH = 6

/**
 * Largest command or file path the policy scans, in bytes. A longer one is denied unread, which
 * bounds the scan; the rest of a payload is never scanned, though the hook bounds the payload as a
 * whole.
 */
export const MAX_JUDGED_BYTES = 1024 * 1024

const REASONS = {
  git: (sub: string) =>
    `git ${sub} writes VCS state, and VCS writes belong to the root. Describe the change in your report (files and intent) and the root commits it. git status, diff, log, show, blame and fetch are open to you.`,
  gh: (sub: string) =>
    `gh ${sub} is a write or an unlisted gh command, and gh writes belong to the root. Put the finding in your report. Open to you: gh pr view|checks|diff|list|status, run view|list, issue view|list, repo view, and gh api for plain reads.`,
  holyclaude: (sub: string) =>
    `holyclaude ${sub} changes Intent and Assignment state, which the root owns. Read it with holyclaude intent show, assignment show, assignment list, assignment verify, routes and reconcile.`,
  state: `The .holyclaude state files are written by the root through the holyclaude CLI. Describe the state you need in your report.`,
  gitDir: `The .git directory holds the hooks and settings that run at the root's next commit, so only the root changes it. Reading it is open to you; describe the change you need in your report.`,
  config: (key: string) =>
    `git -c ${key} can run programs. A git read accepts display settings with -c (color.*, core.quotepath, diff.renames and similar); drop the setting or use one of those.`,
  env: (name: string) =>
    `${name} makes git run a program or read configuration the guard cannot check, as git -c does for most keys. Drop the variable; to change how a git read looks, use git -c with a display setting (color.*, core.quotepath, diff.renames and similar).`,
  unsure: (why: string) =>
    `This command cannot be verified (${why}). Write it as plain commands with literal program names, for example one git read per command, so it can run.`,
  oversized: (what: string, bytes: number) =>
    `This ${what} is ${bytes} bytes and the guard reads at most ${MAX_JUDGED_BYTES}, so it cannot be checked. Shorten it, or send the work in smaller calls, for example one shorter command at a time.`,
  noTool: `This tool call names no tool that can be read, so it cannot be checked. Retry the call, and report it to the root if it recurs.`,
  noPath: (tool: string) =>
    `This ${tool} call names no file path that can be read, so it cannot be checked. Send the path as a plain string.`,
}
const TOO_LARGE = REASONS.unsure(TOO_LARGE_WHY)

/**
 * The reason to deny when the text a rule must scan is over {@link MAX_JUDGED_BYTES}, or undefined
 * when it fits. A text of a third of the limit in UTF-16 units or less fits whatever it holds, so
 * only a longer one is measured.
 */
const oversize = (what: string, text: string): Verdict => {
  if (text.length * 3 <= MAX_JUDGED_BYTES) return undefined
  const bytes = Buffer.byteLength(text)
  return bytes > MAX_JUDGED_BYTES ? REASONS.oversized(what, bytes) : undefined
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
const GIT_INLINE_GLOBALS = /^--(git-dir|work-tree|namespace|super-prefix|attr-source)=/
const GIT_INFO_GLOBALS = new Set(["--version", "--help", "-h", "--html-path", "--man-path"])
/**
 * The `git -c` keys a read may set: they only change how output looks or compares. Git has many
 * keys that run a program (alias.<name>, diff.external, core.pager, credential.<name>, any key
 * ending in .cmd or .driver, and more), so every other key is refused instead of listing the
 * dangerous ones.
 */
const GIT_DISPLAY_CONFIG =
  /^(color\.|column\.|advice\.|core\.(quotepath|abbrev|whitespace|autocrlf|safecrlf|filemode|ignorecase|precomposeunicode|longpaths|symlinks)$|diff\.(algorithm|context|renames|colormoved|colormovedws|noprefix|mnemonicprefix|ignoresubmodules|interhunkcontext|wserrorhighlight)$|log\.(abbrevcommit|date|decorate|follow|showroot)$|status\.(short|branch|showuntrackedfiles|renames|aheadbehind)$)/
const GIT_EXEC_FLAGS =
  /^--(upload-pack|receive-pack|exec|ext-diff|open-files-in-pager|config-env)(=|$)/
/**
 * The environment variables that reach the same programs and settings as the `git -c` keys refused
 * above: git runs the program a variable names (GIT_EXTERNAL_DIFF, GIT_PAGER, GIT_SSH_COMMAND,
 * GIT_ASKPASS and the like) and reads settings from GIT_CONFIG_COUNT with its KEY_n and VALUE_n,
 * and from GIT_CONFIG_PARAMETERS, where `-c` itself puts them. Setting one of them is denied
 * wherever it is set and whatever command follows, because the children of that command inherit it.
 * Variables that only locate or shape a read (GIT_DIR, LANG) are not listed.
 */
const GIT_EXEC_ENV =
  /^(git_(external_diff|pager|ssh|ssh_command|askpass|proxy_command|exec_path|allow_protocol|config(_(count|parameters|global|system|(key|value)_\d+))?)|pager|ssh_askpass)$/i
/** Commands that set the environment of the shell or of later commands from their arguments. */
const ENV_SETTERS = new Set(["export", "declare", "typeset", "readonly", "local", "set"])
/** Commands that take a variable's name and its value as two words: csh's setenv, Windows' setx. */
const ENV_NAMERS = new Set(["setenv", "setx"])
/** PowerShell commands that write an item, which `env:NAME` makes an environment variable. */
const ITEM_WRITERS = new Set([
  "set-item",
  "si",
  "new-item",
  "ni",
  "copy-item",
  "cpi",
  "rename-item",
  "rni",
  "set-content",
  "sc",
  "add-content",
  "ac",
])

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

/** A program that runs the command following its own flags. */
interface Wrapper {
  /** Flags that take a value. */
  readonly values: ReadonlyArray<string>
  /** Operands before the command (flock's lock file). */
  readonly leading: number
  /** Flags whose value is command text to judge in turn: `env -S`, `flock -c`. */
  readonly script?: ReadonlyArray<string>
  /** The words that follow are one command line, as `watch` runs them through a shell. */
  readonly line?: true
}

const WRAPPERS: Readonly<Record<string, Wrapper>> = {
  env: { values: ["-u", "-C", "--unset", "--chdir"], leading: 0, script: ["-S", "--split-string"] },
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
  watch: { values: ["-n", "-d", "--interval"], leading: 0, line: true },
  unbuffer: { values: [], leading: 0 },
  chronic: { values: [], leading: 0 },
  taskset: { values: [], leading: 1 },
  flock: { values: ["-w", "-E"], leading: 1, script: ["-c", "--command"] },
  busybox: { values: [], leading: 0 },
  // cmd's `call`, and PowerShell's `.`, which runs a command in the current scope.
  call: { values: [], leading: 0 },
  ".": { values: [], leading: 0 },
}

// Under xargs the input appends arguments the command line does not show. Judging the command
// with two more words (one a refspec) makes `git tag`, `git branch` and `git fetch origin` count
// as the writes they become.
const XARGS_INPUT: ReadonlyArray<Word> = [
  { text: "x", dynamic: false },
  { text: "x:x", dynamic: false },
]

const PLAIN_WORD = /^[\w./:=@%+,-]+$/
const SHELLS = new Set(["sh", "bash", "zsh", "dash", "ksh", "ash", "fish", "csh", "tcsh"])
const RUNTIMES = new Set(["bun", "bunx", "node", "npx", "deno", "tsx", "ts-node", "pnpm", "yarn"])
const BREAKS = new Set(["for", "select", "case", "fi", "done", "esac", "}", "[["])
const OPENERS = new Set(["if", "then", "elif", "else", "while", "until", "do", "!", "{", "coproc"])
// The names are lower-case because PowerShell, and Windows paths, ignore case.
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
  "remove-item",
  "ri",
  "del",
  "erase",
  "rd",
  "rmdir",
  "move-item",
  "mi",
  "move",
  "copy-item",
  "copy",
  "cpi",
  "set-content",
  "sc",
  "add-content",
  "ac",
  "clear-content",
  "clc",
  "out-file",
  "new-item",
  "ni",
  "rename-item",
  "rni",
  "tee-object",
  // Programs that create, change or fill files and directories they are given: downloads,
  // archives, patches, links and permissions.
  "mkdir",
  "md",
  "chmod",
  "chown",
  "patch",
  "curl",
  "wget",
  "invoke-webrequest",
  "iwr",
  "invoke-restmethod",
  "irm",
  "tar",
  "unzip",
  "expand-archive",
  "mklink",
  "xcopy",
  "robocopy",
  "ren",
  "rename",
])
const HOLYCLAUDE = /^holyclaude(\.js)?$/
// Flags that take a value, between a runtime and the file or package it runs.
const RUNTIME_VALUE_FLAGS = new Set([
  "--cwd",
  "-c",
  "--config",
  "--env-file",
  "--preload",
  "-r",
  "--require",
  "--import",
  "--filter",
  "--port",
  "--tsconfig-override",
  "-d",
  "--define",
  "--conditions",
  "--loader",
])
const PACKAGE_RUNNERS = new Set(["bunx", "npx"])
const RUNNER_SUBCOMMANDS = new Set(["x", "dlx", "exec"])

const partStart = (path: string) => Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1
/** The program a path names: its last part, lower-cased, without a Windows executable suffix. */
const program = (path: string) =>
  path
    .slice(partStart(path))
    .toLowerCase()
    .replace(/\.(exe|cmd|bat)$/, "")
const isAssignment = (text: string) => /^[A-Za-z_][A-Za-z0-9_]*\+?=/.test(text)
/** The reason to deny when `text` is an assignment of a variable in {@link GIT_EXEC_ENV}. */
const classifyAssignment = (text: string): Verdict => {
  if (!isAssignment(text)) return undefined
  const name = text.slice(0, text.indexOf("=")).replace(/\+$/, "")
  return GIT_EXEC_ENV.test(name) ? REASONS.env(name) : undefined
}
const texts = (words: ReadonlyArray<Word>) => words.map((word) => word.text)
// A path part that is the git directory or the state directory's 8.3 short name, or one of the
// spellings Windows reads as the same name (trailing dots and spaces, an alternate data stream).
const GIT_DIR_PART = /^(\.git|git~\d+)[. ]*(:|$)/
const STATE_SHORT_PART = /^holycl~\d+[. ]*(:|$)/
// `=` splits `of=.git/config`, the form `dd` takes.
const PATH_PART_END = /[\\/=]/
// The characters with which a path is a pattern that bash and PowerShell expand.
const PATTERN = /[*?[{]/
/**
 * The reason to deny a write to `text` when it names the `.holyclaude` state, which the root writes
 * through the CLI, or the `.git` directory, whose hooks and settings run at the root's next commit.
 * A part is `.git` itself: `.gitignore` and `.github` are ordinary files. Either separator counts,
 * and case is ignored, as Windows reads a path.
 */
const protectedReason = (text: string): Verdict => {
  const lower = text.toLowerCase()
  if (lower.includes(".holyclaude")) return REASONS.state
  const parts = lower.split(PATH_PART_END)
  if (parts.some((part) => STATE_SHORT_PART.test(part))) return REASONS.state
  return parts.some((part) => GIT_DIR_PART.test(part)) ? REASONS.gitDir : undefined
}
/**
 * {@link protectedReason} for a path a shell command writes, which the shell expands first: a
 * pattern such as `.gi?/config` or `{.git,x}/hooks/x` that can name a protected directory is
 * refused like the name.
 */
const writtenReason = (text: string): Verdict => {
  const named = protectedReason(text)
  if (named !== undefined || !PATTERN.test(text)) return named
  const name = protectedNameOf(text)
  if (name === undefined) return undefined
  return name === ".git" ? REASONS.gitDir : REASONS.state
}
/** The first reason among `reasons`, or undefined when none denies. */
const firstReason = (reasons: ReadonlyArray<Verdict>): Verdict =>
  reasons.find((reason) => reason !== undefined)
/**
 * The paths a word of a writing command may name: the word, and the value of a flag that carries
 * it, as in `-o.git/x`, `-OutFile:.git\x` and `--output=.git/x`.
 */
const pathsOf = (text: string): ReadonlyArray<string> => {
  if (!text.startsWith("-")) return [text]
  const colon = text.indexOf(":")
  return [
    text,
    ...(text.startsWith("--") ? [] : [text.slice(2)]),
    ...(colon === -1 ? [] : [text.slice(colon + 1)]),
  ]
}
/**
 * {@link writtenReason} for a word of a writing command, read as the shell reads it and as Windows
 * reads its backslashes.
 */
const wordReason = (word: Word): Verdict =>
  firstReason(
    [word.text, ...(word.literal === undefined ? [] : [word.literal])]
      .flatMap(pathsOf)
      .map(writtenReason),
  )
const isHolyclaude = (path: string) => HOLYCLAUDE.test(program(path))
/** The bundle, the wrapper or the CLI source: whatever starts the holyclaude CLI. */
const isEntry = (path: string) =>
  isHolyclaude(path) ||
  /packages\/cli\/(src\/)?main\.(ts|js)$/.test(path.replaceAll("\\", "/").toLowerCase())
/** Whether `test` holds for a word as the shell reads it or as Windows reads its backslashes. */
const readsAs = (word: Word, test: (text: string) => boolean) =>
  test(word.text) || (word.literal !== undefined && test(word.literal))

/**
 * The program a word names, or undefined when the shell computes the name. A path that is computed
 * only in its directory (`${CLAUDE_PLUGIN_ROOT}/scripts/holyclaude`) still names its program.
 */
const programOf = (word: Word): string | undefined =>
  word.dynamic && /[$`*?[{]/.test(word.text.slice(partStart(word.text)))
    ? undefined
    : program(word.text)

const classifyGitBranch = (args: ReadonlyArray<string>): boolean => {
  let listing = false
  const positionals: string[] = []
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? ""
    if (arg === "-l" || arg === "--list") listing = true
    if (BRANCH_FLAGS.has(arg)) continue
    if (/^-[larvi]{2,}$/.test(arg)) {
      // Clustered listing flags such as -av and -rv.
      if (arg.includes("l")) listing = true
      continue
    }
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
    if (/^-(?:[liv]|n\d*){2,}$/.test(arg)) {
      // Clustered listing flags such as -ln and -ln5. Only -l, -v and -n list; -i alone does not.
      if (/[lvn]/.test(arg)) listing = true
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
      const [first, ...others] = args.filter((arg) => !/^-v+$/.test(arg) && arg !== "--verbose")
      if (first === undefined) return undefined
      if (first === "show" || first === "get-url")
        return others.every((a) => !a.startsWith("-") || ["-n", "--push", "--all"].includes(a))
          ? undefined
          : deny
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
    if (flag === "-c" || flag === "--config-env" || flag.startsWith("--config-env=")) {
      const attached = flag.startsWith("--config-env=")
        ? flag.slice("--config-env=".length)
        : undefined
      const setting = attached ?? args[index + 1]?.text
      if (setting === undefined) return REASONS.unsure(`git ${flag} without a value`)
      const key = setting.split("=")[0] ?? ""
      if (!GIT_DISPLAY_CONFIG.test(key.toLowerCase())) return REASONS.config(key)
      index += attached === undefined ? 2 : 1
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
const GH_API_FIELDS = new Set(["-f", "-F", "--field", "--raw-field"])
const GH_API_VALUE_FLAGS = new Set([
  "-H",
  "--header",
  "-q",
  "--jq",
  "-t",
  "--template",
  "--hostname",
  "--cache",
  "-p",
  "--preview",
])

/** Splits `--name=value` and `-Xvalue` into the flag and the value attached to it. */
const attached = (arg: string): readonly [string, string | undefined] => {
  if (arg.startsWith("--")) {
    const at = arg.indexOf("=")
    return at === -1 ? [arg, undefined] : [arg.slice(0, at), arg.slice(at + 1)]
  }
  return /^-[XfF]./.test(arg) ? [arg.slice(0, 2), arg.slice(2)] : [arg, undefined]
}

/**
 * Judges `gh api`. With fields or a body gh sends a POST, so those are writes, except when the
 * method is GET (the fields become the query string) and for a GraphQL query without `mutation`.
 */
const classifyGhApi = (args: ReadonlyArray<string>): Verdict => {
  const deny = REASONS.gh("api with a write method, fields, a body or a GraphQL mutation")
  let method = ""
  let endpoint: string | undefined
  let body = false
  const fields: string[] = []
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? ""
    const [flag, inline] = attached(arg)
    const isMethod = flag === "-X" || flag === "--method"
    const valued =
      isMethod || GH_API_FIELDS.has(flag) || flag === "--input" || GH_API_VALUE_FLAGS.has(flag)
    const value = valued ? (inline ?? args[++index] ?? "") : undefined
    if (isMethod) method = (value ?? "").toUpperCase()
    else if (GH_API_FIELDS.has(flag)) fields.push(value ?? "")
    else if (flag === "--input") body = true
    else if (!valued && /^-[A-Za-z]*[XfF]/.test(arg) && !arg.startsWith("--")) return deny
    else if (!valued && !arg.startsWith("-") && endpoint === undefined) endpoint = arg
  }
  if (body) return deny
  if (endpoint === "graphql") {
    // A query read from a file cannot be checked, so it is refused with the mutations.
    const queries = fields.filter((field) => field.startsWith("query="))
    const reads =
      queries.length > 0 &&
      queries.every((query) => !/mutation/i.test(query) && !query.startsWith("query=@"))
    return reads && ["", "GET", "POST"].includes(method) ? undefined : deny
  }
  if (method === "" ? fields.length > 0 : method !== "GET" && method !== "HEAD") return deny
  return undefined
}

const classifyGh = (input: ReadonlyArray<Word>): Verdict => {
  // `gh -R owner/repo pr view` names the repository before the command group.
  let from = 0
  for (;;) {
    const text = input[from]?.text ?? ""
    if (text === "-R" || text === "--repo") from += 2
    else if (text.startsWith("--repo=") || /^-R./.test(text)) from += 1
    else break
  }
  const args = input.slice(from)
  const [group, action] = args
  if (group === undefined) return undefined
  if (group.dynamic || action?.dynamic === true)
    return REASONS.unsure("the gh subcommand is computed")
  if (["--version", "--help", "-h"].includes(group.text)) return undefined
  if (group.text === "api") return classifyGhApi(texts(args.slice(1)))
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
  if (first === "--version" || first === "-V" || first === "help") return undefined
  if (first === "reconcile" && (second === undefined || second.startsWith("-"))) return undefined
  if (first === "routes") return undefined
  return HOLYCLAUDE_READS.has(`${first} ${second ?? ""}`)
    ? undefined
    : REASONS.holyclaude(
        second === undefined || second.startsWith("-") ? first : `${first} ${second}`,
      )
}

/**
 * Judges words the program runs as one command line, as `cmd /c`, `powershell -Command` and `watch`
 * do. Several words are read twice: as they are, which keeps the quotes the shell took off (`bash
 * -c "git commit"`), and joined by spaces, as a program that rebuilds the line sees them (`watch
 * git status "&&" git push`).
 */
const classifyLine = (words: ReadonlyArray<Word>, depth: number, budget: Budget): Verdict => {
  const [first] = words
  if (first === undefined) return undefined
  if (first.dynamic) return REASONS.unsure("the command text is computed")
  const asWords = words.length > 1 ? classifyWords(words, depth + 1, budget) : undefined
  // Words with no quoting or operator in them read the same joined, so the second read is skipped.
  if (words.length > 1 && words.every((word) => !word.dynamic && PLAIN_WORD.test(word.text)))
    return asWords
  const line = words.map((word) => word.literal ?? word.text).join(" ")
  return asWords ?? classifyScript(line, depth + 1, budget)
}

/** The command text a wrapper flag carries: `-c TEXT`, `-cTEXT`, `--flag TEXT` or `--flag=TEXT`. */
const carriedScript = (wrapper: Wrapper, rest: ReadonlyArray<Word>, index: number) => {
  const word = rest[index]
  if (word === undefined) return undefined
  for (const flag of wrapper.script ?? []) {
    if (word.text === flag) {
      const value = rest[index + 1]
      return { text: value?.text, dynamic: value?.dynamic ?? false, width: 2 }
    }
    const prefix = flag.startsWith("--") ? `${flag}=` : flag
    if (word.text.startsWith(prefix))
      return { text: word.text.slice(prefix.length), dynamic: word.dynamic, width: 1 }
  }
  return undefined
}

const unwrap = (
  name: string,
  rest: ReadonlyArray<Word>,
  depth: number,
  budget: Budget,
): ReadonlyArray<Word> | string => {
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
    const carried = carriedScript(wrapper, rest, index)
    if (carried !== undefined) {
      if (carried.text === undefined || carried.dynamic)
        return REASONS.unsure(`the ${name} command text is computed`)
      const verdict = classifyScript(carried.text, depth + 1, budget)
      if (verdict !== undefined) return verdict
      index += carried.width
      continue
    }
    if (text.startsWith("-") && text.length > 1) {
      index += wrapper.values.includes(text) ? 2 : 1
      continue
    }
    if (name === "env" && isAssignment(text)) {
      const verdict = classifyAssignment(text)
      if (verdict !== undefined) return verdict
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
  const tail = rest.slice(index)
  return wrapper.line === true ? (classifyLine(tail, depth, budget) ?? []) : tail
}

const findAfter = (words: ReadonlyArray<Word>, markers: ReadonlyArray<string>) => {
  const start = words.findIndex((word) => markers.includes(word.text))
  if (start === -1) return undefined
  const tail = words.slice(start + 1)
  const end = tail.findIndex((word) => word.text === ";" || word.text === "+")
  return end === -1 ? tail : tail.slice(0, end)
}

// A single class per regex, so a long flag cluster is read in linear time: `-[A-Za-z]*c[A-Za-z]*`
// would backtrack quadratically on a cluster that does not match.
const isCommandFlag = (text: string) => /^-[A-Za-z]+$/.test(text) && text.includes("c")

const classifyShell = (rest: ReadonlyArray<Word>, depth: number, budget: Budget): Verdict => {
  const flagged = rest.findIndex((word) => isCommandFlag(word.text))
  if (flagged !== -1) {
    const script = rest.slice(flagged + 1).find((word) => !word.text.startsWith("-"))
    if (script === undefined) return undefined
    if (script.dynamic) return REASONS.unsure("the shell script text is computed")
    return classifyScript(script.text, depth + 1, budget)
  }
  if (rest.some((word) => ["--version", "--help", "-V"].includes(word.text))) return undefined
  const file = rest.find((word) => !word.text.startsWith("-") || word.text === "-")
  if (file === undefined || file.text === "-" || rest.some((word) => word.text === "-s"))
    return REASONS.unsure("a shell reading commands from input")
  if (readsAs(file, isHolyclaude)) return classifyHolyclaude(rest.slice(rest.indexOf(file) + 1))
  return undefined
}

/** Whether `text` is a PowerShell flag spelled `full` or any start of it (-c, -com, -Command). */
const isFlagFor = (text: string, full: string) =>
  /^[-/][A-Za-z]+$/.test(text) && full.startsWith(text.slice(1).toLowerCase())

// The parameters of powershell and pwsh that come before the command: switches, and those that take
// a value. Either may be written as any start of its name.
const POWERSHELL_SWITCHES = [
  "noprofile",
  "nologo",
  "noninteractive",
  "noexit",
  "sta",
  "mta",
  "login",
  "interactive",
]
const POWERSHELL_VALUED = [
  "executionpolicy",
  "ep",
  "windowstyle",
  "outputformat",
  "inputformat",
  "version",
  "psconsolefile",
  "configurationname",
  "workingdirectory",
  "wd",
  "custompipename",
  "settingsfile",
]
// Parameters whose value is not the command line: an encoded command and a script file.
const POWERSHELL_OTHER = ["encodedcommand", "file"]

/**
 * `powershell -Command TEXT` and `pwsh -c TEXT` run the rest of the line. Without a command flag
 * the first operand starts the command, as in `powershell git push`, past the parameters before it
 * and their values (`-ExecutionPolicy Bypass`). A parameter that is not known may take a value or
 * not, so both readings are judged.
 */
const classifyPowerShell = (rest: ReadonlyArray<Word>, depth: number, budget: Budget): Verdict => {
  if (depth > MAX_DEPTH) return REASONS.unsure("commands nested too deeply")
  if (overBudget(budget, rest.length)) return TOO_LARGE
  const flagged = rest.findIndex((word) => isFlagFor(word.text, "command"))
  let start = flagged === -1 ? -1 : flagged + 1
  for (let index = 0; flagged === -1 && index < rest.length; index += 1) {
    const text = rest[index]?.text ?? ""
    const named = (names: ReadonlyArray<string>) => names.some((full) => isFlagFor(text, full))
    if (!text.startsWith("-")) {
      start = index
      break
    }
    if (named(POWERSHELL_VALUED)) index += 1
    else if (!named(POWERSHELL_SWITCHES) && !named(POWERSHELL_OTHER)) {
      const without = (count: number) => [...rest.slice(0, index), ...rest.slice(index + count)]
      return (
        classifyPowerShell(without(1), depth + 1, budget) ??
        classifyPowerShell(without(2), depth + 1, budget)
      )
    }
  }
  const flags = start === -1 ? rest : rest.slice(0, start)
  if (flags.some((word) => isFlagFor(word.text, "encodedcommand")))
    return REASONS.unsure("an encoded PowerShell command")
  // A script file is out of reach, like any script.
  if (start === -1 || flags.some((word) => isFlagFor(word.text, "file"))) return undefined
  return classifyLine(rest.slice(start), depth, budget)
}

// cmd's switches up to the one that runs a command (/c, /k or /r), which takes the rest of the line.
// Switches may be glued together (`/q/c`), and to the command (`/cgit push`); `//c` is how MSYS
// bash passes `/c` to a Windows program.
const CMD_RUN = /^(?:\/+(?:[adqsuxy]|[eftv]:\w*))*\/+[ckr]|^-[ckr]$/i

/** `cmd /c TEXT` runs the rest of the line. */
const classifyCmd = (rest: ReadonlyArray<Word>, depth: number, budget: Budget): Verdict => {
  for (const [index, word] of rest.entries()) {
    const run = CMD_RUN.exec(word.text)?.[0]
    if (run === undefined) continue
    // A switch holds no backslash, so it is as long in both readings of the word.
    const glued = word.text.slice(run.length)
    const literal = word.literal?.slice(run.length)
    const line =
      glued === ""
        ? []
        : [{ text: glued, dynamic: word.dynamic, ...(literal === undefined ? {} : { literal }) }]
    return classifyLine([...line, ...rest.slice(index + 1)], depth, budget)
  }
  return undefined
}

/** The index of the first word from `from` that is neither a flag nor a flag's value. */
const operandFrom = (rest: ReadonlyArray<Word>, from: number) => {
  let index = from
  for (;;) {
    const text = rest[index]?.text ?? ""
    if (!text.startsWith("-") || text === "-") return index
    index += RUNTIME_VALUE_FLAGS.has(text) ? 2 : 1
  }
}

/**
 * A runtime runs the CLI only when the CLI is the file or package it is told to run: the first
 * operand, after an optional `run` or `x`. The CLI's path as an argument of a tool (`bunx oxlint
 * packages/cli/src/main.ts`, `bun build packages/cli/src/main.ts`) is not a run. A package runner
 * (`bunx`, `bun x`) runs whatever program it names, so that program is judged too.
 */
const classifyRuntime = (
  name: string,
  rest: ReadonlyArray<Word>,
  depth: number,
  budget: Budget,
): Verdict => {
  let at = operandFrom(rest, 0)
  // `node --check FILE` only parses the file. The flag counts before the file, not after it.
  if (name === "node" && rest.slice(0, at).some((word) => word.text === "--check")) return undefined
  const subcommand = rest[at]?.text ?? ""
  const runner = PACKAGE_RUNNERS.has(name) || RUNNER_SUBCOMMANDS.has(subcommand)
  if (subcommand === "run" || RUNNER_SUBCOMMANDS.has(subcommand)) at = operandFrom(rest, at + 1)
  const operand = rest[at]
  if (operand === undefined) return undefined
  if (readsAs(operand, isEntry)) return classifyHolyclaude(rest.slice(at + 1))
  return runner ? classifyWords(rest.slice(at), depth + 1, budget) : undefined
}

/**
 * The reason to deny a command that sets a variable of {@link GIT_EXEC_ENV}: `export NAME=value`,
 * `setenv NAME value`, `setx NAME value`, or a PowerShell item at `env:NAME`.
 */
const environmentReason = (name: string, rest: ReadonlyArray<Word>): Verdict => {
  for (const word of rest) {
    const text = word.text
    const at = ITEM_WRITERS.has(name) ? text.toLowerCase().lastIndexOf("env:") : -1
    const variable = at === -1 ? text : text.slice(at + "env:".length).replace(/^[\\/]/, "")
    if (ENV_SETTERS.has(name)) {
      const verdict = classifyAssignment(text)
      if (verdict !== undefined) return verdict
    } else if ((ENV_NAMERS.has(name) || at !== -1) && GIT_EXEC_ENV.test(variable))
      return REASONS.env(variable)
  }
  return undefined
}

const classifyWords = (input: ReadonlyArray<Word>, depth: number, budget: Budget): Verdict => {
  // Wrappers, find -exec and package runners nest like scripts do, and no real command needs more.
  if (depth > MAX_DEPTH) return REASONS.unsure("commands nested too deeply")
  if (overBudget(budget, input.length)) return TOO_LARGE
  let start = 0
  for (;;) {
    const head = input[start]
    if (head === undefined) return undefined
    if (!head.dynamic && BREAKS.has(head.text)) return undefined
    // `function NAME { ... }`: what follows the name is the body.
    if (!head.dynamic && head.text === "function") start += 2
    else if (!head.dynamic && OPENERS.has(head.text)) start += 1
    else if (isAssignment(head.text)) {
      const verdict = classifyAssignment(head.text)
      if (verdict !== undefined) return verdict
      start += 1
    } else break
  }
  const [head, ...rest] = input.slice(start)
  if (head === undefined) return undefined
  if (head.literal !== undefined) {
    // PowerShell and cmd keep the backslashes of `C:\Git\cmd\git.exe` where bash drops them, so the
    // program is judged read both ways.
    const windows = { text: head.literal, dynamic: head.dynamic }
    const verdict = classifyWords([windows, ...rest], depth, budget)
    if (verdict !== undefined) return verdict
  }
  // A script block run where it stands: `.{ git push }`, `&{git push}`, `{git push}`.
  if (!head.dynamic && /^[.&]?\{/.test(head.text)) {
    const block = { text: head.text.replace(/^[.&]/, ""), dynamic: false }
    return LAUNCHERS["invoke-command"]?.(judge, [head, block, ...rest], depth, budget)
  }
  const name = programOf(head)
  if (name === undefined) return REASONS.unsure("the program name is computed")
  const variable = environmentReason(name, rest)
  if (variable !== undefined) return variable
  if (name === "git") return classifyGit(rest)
  // `git-commit` is the program git runs for `git commit`.
  if (name.startsWith("git-")) return classifyGitSub(name.slice(4), rest)
  if (name === "gh") return classifyGh(rest)
  if (HOLYCLAUDE.test(name)) return classifyHolyclaude(rest)
  const launcher = Object.hasOwn(LAUNCHERS, name) ? LAUNCHERS[name] : undefined
  if (launcher !== undefined) return launcher(judge, [head, ...rest], depth, budget)
  if (Object.hasOwn(WRAPPERS, name)) {
    const inner = unwrap(name, rest, depth, budget)
    if (typeof inner === "string") return inner
    return classifyWords(name === "xargs" ? [...inner, ...XARGS_INPUT] : inner, depth + 1, budget)
  }
  if (SHELLS.has(name)) return classifyShell(rest, depth, budget)
  if (name === "powershell" || name === "pwsh") return classifyPowerShell(rest, depth, budget)
  if (name === "cmd") return classifyCmd(rest, depth, budget)
  if (name === "eval" || name === "iex" || name === "invoke-expression") {
    if (rest.some((word) => word.dynamic)) return REASONS.unsure(`${name} text is computed`)
    return classifyScript(texts(rest).join(" "), depth + 1, budget)
  }
  if (RUNTIMES.has(name)) return classifyRuntime(name, rest, depth, budget)
  if (name === "find") {
    const inner = findAfter(rest, ["-exec", "-execdir", "-ok", "-okdir"])
    if (inner !== undefined) return classifyWords(inner, depth + 1, budget)
  }
  if (name === "fd" || name === "fdfind") {
    const inner = findAfter(rest, ["-x", "-X", "--exec", "--exec-batch"])
    if (inner !== undefined) return classifyWords(inner, depth + 1, budget)
  }
  const writesInPlace =
    FILE_WRITERS.has(name) ||
    ((name === "sed" || name === "perl") &&
      rest.some((word) => /^(-[A-Za-z]*i|--in-place)/.test(word.text)))
  return writesInPlace ? firstReason(rest.map(wordReason)) : undefined
}

const classifySimple = (simple: Simple, depth: number, budget: Budget): Verdict => {
  const written = firstReason(simple.outputs.map(writtenReason))
  return written ?? classifyWords(simple.words, depth, budget)
}

/**
 * Judges every command of a script. Every text scanned, at any depth, is held to
 * {@link MAX_JUDGED_BYTES}: the script of a nested shell, a line rebuilt from a launcher's
 * arguments or a script block written back can be longer than the command it came from.
 */
const classifyScript = (source: string, depth: number, budget: Budget): Verdict => {
  if (depth > MAX_DEPTH) return REASONS.unsure("commands nested too deeply")
  const large = oversize("command", source)
  if (large !== undefined) return large
  if (overBudget(budget, source.length >> 1)) return TOO_LARGE
  const scan = scanScript(source)
  if (!scan.ok) return REASONS.unsure(scan.reason)
  for (const simple of scan.commands) {
    const verdict = classifySimple(simple, depth, budget)
    if (verdict !== undefined) return verdict
  }
  return undefined
}

/** What the launchers call back to judge the commands they launch. */
const judge: Judge = {
  maxDepth: MAX_DEPTH,
  unsure: REASONS.unsure,
  oversize: (text) => oversize("command", text),
  variable: (name) => (GIT_EXEC_ENV.test(name) ? REASONS.env(name) : undefined),
  words: classifyWords,
  script: classifyScript,
  simple: classifySimple,
  line: classifyLine,
}

/**
 * Judges a shell command a subagent wants to run. Returns the reason to deny it, framed as the good
 * direction to take, or undefined when every simple command in it may run. When unsure it denies,
 * and a command over {@link MAX_JUDGED_BYTES}, or a text read out of it that is, is denied unread.
 */
export const denyReason = (command: string): string | undefined =>
  classifyScript(command, 0, newBudget())

/** The reason given when the policy itself fails on a command: what cannot be judged is denied. */
export const UNREADABLE = REASONS.unsure("it is nested too deeply to read")

const SHELL_TOOLS = new Set(["Bash", "PowerShell", "Monitor"])
const FILE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"])

/**
 * The tools the guard judges. The plugin's hooks.json matcher must list all of them, since a tool
 * the matcher leaves out never reaches the guard.
 */
export const JUDGED_TOOLS: ReadonlySet<string> = new Set([...SHELL_TOOLS, ...FILE_TOOLS])

/**
 * Judges one tool call of a subagent. Tools that carry a shell command (Bash, PowerShell, Monitor)
 * are judged by {@link denyReason}; file tools are refused on the `.holyclaude` state directory,
 * which only the root changes, through the CLI, and on the `.git` directory, whose hooks and
 * settings run at the root's next commit, whichever of `file_path` and `notebook_path` it names.
 * Only the command and the paths are read, and one over {@link MAX_JUDGED_BYTES} is denied unread;
 * the rest of the input, such as the content of a write, is not scanned. A call that names no tool,
 * or a file tool that names no path, cannot be judged and is denied. Returns the reason to deny, or
 * undefined to allow.
 */
export const denyToolReason = (
  toolName: string | undefined,
  input: ToolInput | undefined,
): string | undefined => {
  if (toolName === undefined) return REASONS.noTool
  if (SHELL_TOOLS.has(toolName)) {
    const command = input?.command
    return command === undefined
      ? `This ${toolName} call carries no command text that can be checked. Send the command as a plain string.`
      : (oversize("command", command) ?? denyReason(command))
  }
  if (FILE_TOOLS.has(toolName)) {
    const targets = [input?.file_path, input?.notebook_path].filter((path) => path !== undefined)
    if (targets.length === 0) return REASONS.noPath(toolName)
    for (const target of targets) {
      const verdict = oversize("file path", target) ?? protectedReason(target)
      if (verdict !== undefined) return verdict
    }
    return undefined
  }
  return undefined
}
