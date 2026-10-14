import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { Effect } from "effect"

import { observationsPath, readObservations } from "../observations.ts"
import { preToolUse } from "./pre-tool-use.ts"

type Caller = "subagent" | "main"
type Decision = "allow" | "deny"

const call = (tool: string, input: unknown, caller: Caller, extra: object = {}) =>
  JSON.stringify({
    tool_name: tool,
    tool_input: input,
    ...(caller === "subagent" ? { agent_id: "agent-1" } : {}),
    ...extra,
  })

/** Runs the hook on a payload and reports its decision, checking that a deny is well formed. */
const decide = async (stdin: string): Promise<Decision> => {
  const out = await Effect.runPromise(preToolUse(stdin))
  if (out === "") return "allow"
  const parsed = JSON.parse(out)
  expect(Object.keys(parsed)).toEqual(["hookSpecificOutput"])
  expect(parsed.hookSpecificOutput.hookEventName).toBe("PreToolUse")
  expect(parsed.hookSpecificOutput.permissionDecision).toBe("deny")
  expect(parsed.hookSpecificOutput.permissionDecisionReason.length).toBeGreaterThan(0)
  return "deny"
}

/** One policy row: the tool, its command, who calls it and the decision the hook must give. */
type Row = readonly [tool: string, command: string, caller: Caller, expected: Decision]

const rows = (
  tool: string,
  caller: Caller,
  expected: Decision,
  commands: ReadonlyArray<string>,
): ReadonlyArray<Row> => commands.map((command) => [tool, command, caller, expected])
const allowed = (...commands: string[]) => rows("Bash", "subagent", "allow", commands)
const denied = (...commands: string[]) => rows("Bash", "subagent", "deny", commands)

const TABLE: ReadonlyArray<Row> = [
  // Reads stay open, writes are denied: the baseline the rewrite must keep.
  ...allowed(
    "git status",
    "git diff --stat HEAD~1",
    "git log --oneline -n 20",
    "git log --grep='git push' --oneline",
    "git show HEAD:packages/cli/src/main.ts",
    "git fetch origin",
    "git branch",
    "git branch -a",
    "git branch --list 'release/*'",
    "git tag -l 'v*'",
    "git remote -v",
    "git stash list",
    "git config --get user.name",
    "git -C packages/cli status",
    "git -c color.ui=never diff",
    "git -c core.quotepath=false status",
    "git --no-pager log -3",
    "git diff | grep commit",
    "git diff --name-only HEAD~1 | xargs wc -l",
    "cd packages/cli && git status",
    "FOO=bar git status",
    "echo 'git commit is root only'",
    "cat <<'EOF'\ngit commit -m x\nEOF",
    "echo $((1+2))",
    "gh pr view 12 --json state,title",
    "gh pr checks 12",
    "gh run list --limit 5",
    "gh api repos/o/r/pulls/3/comments --paginate",
    "gh api repos/o/r --jq .name",
    "holyclaude intent show",
    "holyclaude assignment list --state Running",
    "holyclaude reconcile",
    "bun plugin/scripts/holyclaude.js intent show",
    "bun test",
    "bun run lint:readonly",
    "bun test packages/cli/src/commands.test.ts",
    "timeout 60 bun test",
    "time timeout 60 nice -n 5 env FOO=1 git status",
    "sh -c 'git status'",
    "cat .holyclaude/state.json",
  ),
  ...denied(
    "git commit -m x",
    "git add .",
    "git push origin HEAD",
    "git pull",
    "git rebase main",
    "git reset --hard HEAD~1",
    "git checkout -b feature",
    "git switch main",
    "git stash",
    "git stash pop",
    "git tag v1.0.0",
    "git tag -a v1.0.0 -m rel",
    "git tag -d v1",
    "git tag -i v1",
    "git branch newbranch",
    "git branch -D old",
    "git branch -m old new",
    "git branch -avD old",
    "git remote add x url",
    "git remote set-url origin url",
    "git fetch origin main:main",
    "git config user.name foo",
    "git status; git commit -m x",
    "git status && git push",
    "(git commit -m x)",
    "echo $(git push)",
    "git status\ngit commit -m x",
    "for f in a b; do git add $f; done",
    "env git commit -m x",
    "sudo git push",
    "timeout 10 git push",
    "bash -c 'git push'",
    "echo 'git push' | sh",
    "eval 'git push'",
    "find . -maxdepth 1 -exec git add {} \\;",
    'g"i"t commit -m x',
    "$GIT push",
    "git ${SUB:-push}",
    "gh pr create --title t --body b",
    "gh pr comment 3 --body hi",
    "gh pr merge 3 --squash",
    "gh api -X POST repos/o/r/issues",
    "gh api repos/o/r/issues -f title=t",
    "gh api repos/o/r/issues --input body.json",
    "holyclaude intent create",
    "holyclaude assignment finish A1 --outcome success",
    "holyclaude reconcile resolve A1 --keep",
    "holyclaude hook pre-tool-use",
    "bun plugin/scripts/holyclaude.js intent create",
    "bun run packages/cli/src/main.ts intent create",
    "bun --cwd x run plugin/scripts/holyclaude.js intent create",
    "bunx holyclaude intent create",
    "bun x holyclaude intent create",
    "sh plugin/scripts/holyclaude assignment accept A1",
    "echo '{}' > .holyclaude/state.json",
    "rm -rf .holyclaude",
    "cat x | tee .holyclaude/state.json",
  ),

  // Executable names are normalized: Windows spellings, case and paths.
  ...denied(
    "git.exe commit -m x",
    "git.exe push",
    "GIT.EXE commit -m x",
    "Git push",
    "gh.exe pr create --title t",
    "gh.EXE pr create",
    "git.exe branch -D x",
    "env git.exe push",
    "sudo git.exe push",
    '"C:\\Program Files\\Git\\cmd\\git.exe" commit -m x',
    "/c/Program\\ Files/Git/cmd/git.exe commit -m x",
    "'C:/Program Files/Git/cmd/git.exe' push",
    "bun.exe plugin/scripts/holyclaude.js intent create",
    "node.exe plugin/scripts/holyclaude.js intent create",
    'bun "C:\\Users\\x\\plugin\\scripts\\holyclaude.js" intent create',
    "bun 'plugin\\scripts\\holyclaude.js' assignment accept A1",
    'bun "packages\\cli\\src\\main.ts" intent create',
    '"C:\\Users\\x\\plugin\\scripts\\holyclaude" intent create',
    "sh 'plugin\\scripts\\holyclaude' intent create",
    "holyclaude.cmd intent create",
  ),
  ...allowed(
    "git.exe status",
    "git.exe log --oneline -3",
    "Git status",
    '"C:\\Program Files\\Git\\cmd\\git.exe" status',
    "bun.exe test",
    "bun.exe plugin/scripts/holyclaude.js intent show",
  ),

  // Every tool that carries a shell command gets the same policy, and the Windows shells are
  // read through to the command they run.
  ...rows("PowerShell", "subagent", "deny", [
    "git commit -m x",
    "git push origin HEAD",
    "gh pr create --title t",
    "holyclaude intent create",
    "git status; git commit -m x",
    "& git push",
    '& "C:\\Program Files\\Git\\cmd\\git.exe" commit -m x',
    'iex "git push"',
    "Invoke-Expression 'git push'",
    "Remove-Item .holyclaude\\state.json",
    "Set-Content .holyclaude/state.json '{}'",
    "'{}' | Out-File .holyclaude\\state.json",
    "git status > .holyclaude\\state.json",
  ]),
  ...rows("PowerShell", "subagent", "allow", [
    "git status",
    "git diff --stat",
    "bun test",
    "Get-Content .holyclaude\\state.json",
    "Get-ChildItem packages",
  ]),
  ...rows("Monitor", "subagent", "deny", ["git push", "tail -f log | git commit -F -"]),
  ...rows("Monitor", "subagent", "allow", ["git log -1", "tail -f build.log"]),
  ...rows("PowerShell", "main", "allow", ["git push", "Remove-Item .holyclaude\\state.json"]),
  ...rows("Monitor", "main", "allow", ["git push"]),
  ...rows("mcp__other__tool", "subagent", "allow", ["git push"]),
  ...denied(
    'powershell -Command "git commit -m x"',
    "pwsh -c 'git push'",
    "pwsh -Command git push",
    "pwsh -com 'git push'",
    "powershell.exe -NoProfile -Command 'git push'",
    'powershell -ExecutionPolicy Bypass -Command "gh pr create"',
    "powershell git push",
    "powershell -EncodedCommand ZwBpAHQAIABwAHUAcwBoAA==",
    "cmd /c git push",
    "cmd.exe /c 'git push'",
    "cmd /c git status & git push",
    'cmd /c "git commit -m x"',
    "echo hi | powershell -Command 'git push'",
  ),
  ...allowed(
    'powershell -Command "git status"',
    "pwsh -c 'git log -1'",
    "cmd /c git status",
    "powershell -File script.ps1",
    "powershell -NoProfile",
    "cmd /c dir",
  ),

  // Wrappers that carry their command as text.
  ...denied(
    "flock /tmp/l -c 'git commit -m x'",
    "flock -n /tmp/l --command 'git push'",
    "flock /tmp/l -c'git push'",
    "watch 'git commit -m x'",
    "watch -n 5 'git push'",
    "watch git push",
    "env -S'git push'",
    "env -S 'git push'",
    "env --split-string='git push'",
    "env -i -S 'git push'",
  ),
  ...allowed(
    "flock /tmp/l -c 'git status'",
    "flock /tmp/l git log -1",
    "watch 'git status'",
    "watch -n 5 git diff --stat",
    "env -S 'git status'",
    "env --split-string='git log -1'",
  ),

  // Arithmetic does not swallow the lines after it as a heredoc.
  ...denied(
    "x=$((1<<2))\ngit commit -m foo",
    "echo $((1<<2))\ngit push",
    "(( x = 1 << 3 ))\ngit push",
    "if (( n << 1 )); then\ngit push\nfi",
    "echo $(( $(git push) + 1 ))",
    "for ((i=0;i<(1<<3);i++)); do git add .; done",
  ),
  ...allowed(
    "x=$((1<<2))\ngit status",
    "(( x = 1 << 3 ))\ngit log -1",
    "cat <<EOF\n$((1<<2))\nEOF",
  ),

  // Function bodies are commands too.
  ...denied(
    "function f { git push; }; f",
    "function f() { git commit -m x; }; f",
    "f() { git push; }; f",
    "function f { echo hi; git add .; }; f",
  ),
  ...allowed("function f { git status; }; f", "f() { git log -1; }; f"),

  // `git -c` accepts display settings only: the other keys can run programs.
  ...denied(
    "git -c diff.external=./evil.sh diff",
    "git -c core.pager=./evil log",
    "git -c core.sshCommand=./evil fetch",
    "git -c alias.l='!git push' l",
    "git -c difftool.x.cmd=./evil diff",
    "git -c merge.x.driver=./evil log",
    "git -c credential.helper=./evil fetch",
    "git -c remote.origin.vcs=evil fetch",
    "git --config-env=diff.external=EVIL diff",
    "git -c",
  ),
  ...allowed(
    "git -c color.ui=always --no-pager log -1",
    "git -c diff.renames=true diff",
    "git -c core.quotepath=false -c color.ui=never diff",
    "git --config-env=color.ui=UI diff",
  ),

  // xargs appends arguments the command line does not show.
  ...denied(
    "echo v1 | xargs git tag",
    "echo newbranch | xargs git branch",
    "printf 'a\\nb\\n' | xargs -n1 git tag",
    "echo 'a:b' | xargs git fetch origin",
    "echo 'add x url' | xargs git remote",
    "ls | xargs -a names git tag",
    "echo 'user.name x' | xargs git config",
    "cat names | xargs -I{} git tag {}",
  ),
  ...allowed(
    "git ls-files | xargs grep -n TODO",
    "echo a | xargs git show",
    "echo x | xargs git tag -l",
    "echo x | xargs -I{} git log -1 {}",
    "git diff --name-only | xargs bunx oxlint",
  ),

  // Normal work that must not be denied.
  ...allowed(
    "gh -R owner/repo pr view 12",
    "gh --repo owner/repo pr list",
    "gh --repo=owner/repo issue view 4",
    "gh -Rowner/repo pr checks 3",
    "bunx oxlint packages/cli/src/main.ts packages/cli/src/commands.ts",
    "bunx oxfmt --check packages/cli/src/main.ts packages/cli/src/args.ts",
    "bun build packages/cli/src/main.ts --target bun --outfile /tmp/hc.js",
    "bun build src/main.ts --target bun --outfile ../../plugin/scripts/holyclaude.js",
    "node --check packages/cli/src/main.js x",
    "node --check plugin/scripts/holyclaude.js",
    "git branch -av",
    "git branch -rv",
    "git branch -avv",
    "git branch -vl 'x*'",
    "git branch -a --list 'release/*'",
    "git branch -r --merged main",
    "git branch --sort=-committerdate -v",
    "git tag -ln",
    "git tag -ln5",
    "git tag -l -n",
    "git tag --list 'v*' --sort=-v:refname",
    "git remote -vv",
    "git remote get-url --push origin",
    "git remote show -n origin",
    "git stash list --stat",
    "git stash show -p",
    "gh api graphql -f query='{viewer{login}}'",
    "gh api graphql -f query='query($o:String!){repository(owner:$o,name:\"x\"){id}}' -F o=owner",
    "gh api --method GET repos/o/r",
    "gh api -X GET search/issues -f q=repo:o/r",
    "gh api -XGET search/issues -f q=x",
    "${CLAUDE_PLUGIN_ROOT}/scripts/holyclaude intent show",
    "$CLAUDE_PLUGIN_ROOT/scripts/holyclaude assignment list",
    '"$CLAUDE_PLUGIN_ROOT/scripts/holyclaude" routes',
    "${CLAUDE_PLUGIN_ROOT}/scripts/holyclaude assignment show A1",
    "$HOME/.bun/bin/bun test",
    '"$(git rev-parse --show-toplevel)/scripts/run.sh"',
    "holyclaude help",
  ),
  ...denied(
    "gh -R owner/repo pr create",
    "gh --repo owner/repo pr merge 3",
    "gh api graphql -f query='mutation { addStar(input:{starrableId:\"x\"}) { clientMutationId } }'",
    "gh api graphql -f query='query { viewer { login } }' -f query='mutation { x }'",
    "gh api graphql -F query=@query.graphql",
    "gh api graphql --input query.json",
    "gh api -X POST graphql -f query='mutation { x }'",
    "gh api -X DELETE repos/o/r/git/refs/heads/x -f x=y",
    "gh api -XPOST repos/o/r/issues",
    "${CLAUDE_PLUGIN_ROOT}/scripts/holyclaude intent create",
    "$CLAUDE_PLUGIN_ROOT/scripts/holyclaude assignment cancel A1",
    "$CLAUDE_PLUGIN_ROOT/scripts/holyclaude assignment accept A1",
    "$HOME/bin/git commit -m x",
    "$HOME/.bun/bin/bun plugin/scripts/holyclaude.js intent create",
    "node plugin/scripts/holyclaude.js intent create -c",
    "node --require ./x.js plugin/scripts/holyclaude.js intent create",
  ),

  // Unrelated: bun x and bunx run the program they name.
  ...denied("bun x git push", "bunx git commit -m x", "pnpm dlx gh pr create"),

  // The main thread is never judged.
  ...rows("Bash", "main", "allow", [
    "git commit -m x",
    "git push",
    "gh pr create --title t",
    "holyclaude intent create",
    "bun plugin/scripts/holyclaude.js assignment accept A1",
    "echo '{}' > .holyclaude/state.json",
    "git.exe push",
    "function f { git push; }; f",
  ]),
]

/** A file tool call: the tool, the path it writes and who calls it. */
type FileRow = readonly [tool: string, path: string, caller: Caller, expected: Decision]

const FILE_TABLE: ReadonlyArray<FileRow> = [
  ["Write", ".holyclaude/state.json", "subagent", "deny"],
  ["Write", "C:\\proj\\.holyclaude\\state.json", "subagent", "deny"],
  ["Write", "/home/me/proj/.holyclaude/state.observations.jsonl", "subagent", "deny"],
  ["Write", "/home/me/proj/.HolyClaude/state.json", "subagent", "deny"],
  ["Edit", ".holyclaude/state.json", "subagent", "deny"],
  ["MultiEdit", ".holyclaude/state.json", "subagent", "deny"],
  ["Write", "packages/cli/src/main.ts", "subagent", "allow"],
  ["Edit", "docs/notes.md", "subagent", "allow"],
  ["Write", ".holyclaude/state.json", "main", "allow"],
]

describe("hook policy table (tool, command, caller, expected decision)", () => {
  for (const [tool, command, caller, expected] of TABLE) {
    test(`${expected}: ${caller} ${tool} ${JSON.stringify(command)}`, async () => {
      expect(await decide(call(tool, { command }, caller))).toBe(expected)
    })
  }
})

describe("file tools and the state directory", () => {
  for (const [tool, path, caller, expected] of FILE_TABLE) {
    test(`${expected}: ${caller} ${tool} ${path}`, async () => {
      expect(await decide(call(tool, { file_path: path, content: "x" }, caller))).toBe(expected)
    })
  }

  test("a notebook edit of the state directory is denied", async () => {
    expect(
      await decide(call("NotebookEdit", { notebook_path: ".holyclaude/n.ipynb" }, "subagent")),
    ).toBe("deny")
  })
})

describe("the decision reads only the fields it needs", () => {
  let directory = ""
  let stateFile = ""
  const previous = process.env["HOLYCLAUDE_STATE_FILE"]

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "holyclaude-hook-"))
    stateFile = join(directory, "state.json")
    process.env["HOLYCLAUDE_STATE_FILE"] = stateFile
  })

  afterEach(() => {
    if (previous === undefined) delete process.env["HOLYCLAUDE_STATE_FILE"]
    else process.env["HOLYCLAUDE_STATE_FILE"] = previous
    rmSync(directory, { recursive: true, force: true })
  })

  const drift: ReadonlyArray<readonly [string, object]> = [
    ["effort null", { effort: null }],
    ["effort number", { effort: 3 }],
    ["effort level null", { effort: { level: null } }],
    ["transcript_path null", { transcript_path: null }],
    ["transcript_path number", { transcript_path: 7 }],
    ["session_id null", { session_id: null }],
    ["agent_type null", { agent_type: null }],
    ["agent_type object", { agent_type: { name: "x" } }],
    ["every observation field wrong", { effort: 1, transcript_path: 2, agent_type: 3 }],
  ]

  for (const [name, extra] of drift) {
    test(`${name}: a write is still denied and a read still allowed`, async () => {
      expect(await decide(call("Bash", { command: "git commit -m x" }, "subagent", extra))).toBe(
        "deny",
      )
      expect(await decide(call("Bash", { command: "git status" }, "subagent", extra))).toBe("allow")
    })
  }

  for (const [name, input] of [
    ["null", null],
    ["an array", ["git commit"]],
    ["a string", "git commit"],
    ["missing", undefined],
    ["a number command", { command: 5 }],
    ["an array command", { command: ["git", "commit"] }],
  ] as const) {
    test(`tool_input ${name}: a Bash call with no command text is denied`, async () => {
      expect(await decide(call("Bash", input, "subagent"))).toBe("deny")
    })
  }

  test("a main-thread call with drifted fields passes through", async () => {
    expect(
      await decide(call("Bash", { command: "git push" }, "main", { effort: null, agent_type: 1 })),
    ).toBe("allow")
  })

  test("the observation keeps what it can read when another field is wrong", async () => {
    await decide(
      call("Bash", { command: "git status" }, "subagent", {
        agent_type: "holyclaude:Worker.implementation",
        effort: null,
      }),
    )
    const records = await Effect.runPromise(readObservations(observationsPath(stateFile)))
    expect(records).toMatchObject([
      { kind: "observed", agent_id: "agent-1", agent_type: "holyclaude:Worker.implementation" },
    ])
  })

  test("a command too deeply nested to read is denied, not waved through", async () => {
    const nested = `echo ${"$(".repeat(20_000)}git push${")".repeat(20_000)}`
    expect(await decide(call("Bash", { command: nested }, "subagent"))).toBe("deny")
  })

  test("a 200 KB command is decided in well under a second", async () => {
    const command = `git status ${"a ".repeat(100_000)}; git push`
    expect(command.length).toBeGreaterThan(200_000)
    const started = performance.now()
    expect(await decide(call("Bash", { command }, "subagent"))).toBe("deny")
    expect(performance.now() - started).toBeLessThan(2000)
  })

  test("a 200 KB chain of wrappers is refused without being unrolled", async () => {
    const command = `${"env ".repeat(50_000)}git status`
    const started = performance.now()
    expect(await decide(call("Bash", { command }, "subagent"))).toBe("deny")
    expect(performance.now() - started).toBeLessThan(2000)
  })
})
