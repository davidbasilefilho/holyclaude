import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { Effect } from "effect"

import { readObservations } from "../observations.ts"
import type { ToolInput } from "./input.ts"
import { denyToolReason, MAX_JUDGED_BYTES } from "./policy.ts"
import { MAX_HOOK_BYTES, preToolUse } from "./pre-tool-use.ts"

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

/** The reason the hook gives for a deny, or undefined when it allows. */
const reasonOf = async (stdin: string): Promise<string | undefined> => {
  const out = await Effect.runPromise(preToolUse(stdin))
  return out === "" ? undefined : JSON.parse(out).hookSpecificOutput.permissionDecisionReason
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
    "cat .holyclaude/intents/intent-0001/intent.json",
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
    // The record files, the folder's own .gitignore and the local files are the root's too.
    "echo '{}' > .holyclaude/intents/intent-0001/intent.json",
    "echo '{}' > .holyclaude/intents/intent-0001/assignments/assignment-0mg8k2x1a-7f3q.json",
    "cat x | tee .holyclaude/intents/intent-0001/intent.json",
    "echo '' > .holyclaude/.gitignore",
    "echo x > .holyclaude/local/workers.json",
    "echo x >> .holyclaude/local/observations.jsonl",
    "echo x > .holyclaude/local/agents.json",
    "rm .holyclaude/local/lock",
    "rm -rf .holyclaude/intents",
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
    "Set-Content .holyclaude\\intents\\intent-0001\\intent.json '{}'",
    "'x' | Out-File .holyclaude\\.gitignore",
    "Remove-Item .holyclaude\\local\\workers.json",
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

  // The environment reaches the same programs and settings as `git -c`, so it is judged alike.
  ...denied(
    "GIT_EXTERNAL_DIFF=/tmp/x git diff",
    "GIT_SSH_COMMAND='sh -c id' git ls-remote origin",
    "GIT_PAGER='sh -c id' git log",
    "GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=diff.external GIT_CONFIG_VALUE_0=./evil git diff",
    "GIT_CONFIG_PARAMETERS=\"'diff.external'='./evil'\" git diff",
    "git_pager='sh -c id' git log",
    "LANG=C GIT_PAGER=cat git log",
    "GIT_PAGER='sh -c id' bash -c 'git log'",
    "env GIT_PAGER='sh -c id' git log",
    "env -i GIT_ASKPASS=./evil git fetch",
    "env -S \"GIT_PAGER='sh -c id' git log\"",
    "export GIT_PAGER='sh -c id'; git log",
    "declare -x GIT_SSH_COMMAND='sh -c id'; git fetch",
    "cmd /c set GIT_PAGER=x && git log",
    "$env:GIT_PAGER='sh -c id'; git log",
  ),
  ...allowed(
    "LANG=C git log",
    "LC_ALL=C GIT_DIR=.git git log",
    "env LANG=C git diff",
    "env -S 'LANG=C git status'",
    "export LANG=C; git log",
    "GIT_CONFIG_NOSYSTEM=1 git status",
    "GIT_PAGER_IN_USE=1 git status",
    "echo GIT_PAGER=x",
    "grep 'GIT_PAGER=' README.md",
  ),

  // ANSI-C quoting names a program by its escapes, \x, \u and \U among them.
  ...denied(
    "$'\\U00000067it' commit",
    "$'\\U67it' commit",
    "$'g\\U00000069t' push",
    "$'\\u0067it' commit",
    "$'\\x67it' commit",
    "$'\\147it' commit",
    "$'gh' pr create",
    "$'\\U00000067\\U00000068' pr create",
    // \cJ is a newline, which ends a command in the text eval and bash -c read.
    "eval $'true\\cJgit commit -m x'",
    "eval $'true\\cjgit push'",
    "bash -c $'true\\cJgit push'",
    "eval $'true\\c\\\\\\cJgit push'",
  ),
  ...allowed(
    "$'\\U00000067it' status",
    "echo $'\\U0001F600'",
    "echo $'\\UFFFFFFFF'",
    "echo $'\\U'",
    "eval $'true\\cJgit status'",
    "eval $'git\\cIstatus'",
    "echo $'\\c'",
  ),

  // A Windows path keeps its backslashes in PowerShell and cmd and loses them in bash, so the
  // program is judged read both ways.
  ...denied(
    "C:\\Git\\cmd\\git.exe commit -m x",
    "C:\\Git\\cmd\\git commit -m x",
    "C:\\tools\\gh.exe pr create",
    "C:\\bin\\holyclaude.exe intent create",
    "cmd /c C:\\Git\\cmd\\git.exe commit -m x",
    'cmd /c "C:\\Git\\cmd\\git.exe commit -m x"',
    'powershell -Command "C:\\Git\\cmd\\git.exe push"',
    "env C:\\Git\\cmd\\git.exe push",
    "Invoke-Command { C:\\Git\\cmd\\git.exe commit }",
    "Start-Process C:\\Git\\cmd\\git.exe commit",
    "Start-Process -FilePath:C:\\Git\\cmd\\git.exe -ArgumentList push",
    "wsl C:\\Git\\cmd\\git.exe push",
    "git status && C:\\Git\\cmd\\git.exe push",
  ),
  ...allowed(
    "C:\\Git\\cmd\\git.exe status",
    'cmd /c "C:\\Git\\cmd\\git.exe status"',
    "C:\\Windows\\System32\\notepad.exe x",
    "C:\\tools\\holyclaude.exe intent show",
    "Start-Process C:\\Git\\cmd\\git.exe status",
  ),

  // The .git directory runs hooks and settings at the root's next commit, so it is guarded like
  // .holyclaude. Only a part that is .git counts, and reading stays open.
  ...denied(
    "echo x > .git/hooks/pre-commit",
    "echo x >> .git/config",
    "echo x > .git\\hooks\\pre-commit",
    "echo x > C:\\proj\\.git\\hooks\\pre-commit",
    "cp x .git/hooks/pre-commit",
    "mv x .GIT/config",
    "tee .git/config",
    "sed -i s/a/b/ .git/config",
    "perl -pi -e 's/a/b/' .git/config",
    "dd of=.git/config",
    "rm -rf .git",
    "rm -rf ./.git/",
    "Set-Content .git\\hooks\\pre-commit x",
    "Remove-Item -Recurse .\\.git",
    "Out-File -FilePath .git\\config",
    "New-Item .git\\hooks\\post-commit",
    "cmd /c del .git\\config",
    "cmd /c echo x > .git\\config",
    "Start-Process git -ArgumentList status -RedirectStandardOutput .git\\hooks\\x",
    "Start-Process git -ArgumentList status -RedirectStandardError:.git\\hooks\\x",
    "Start-Process git -ArgumentList status -RedirectStandardOutput .git/hooks/x",
    "Start-Process notepad -RedirectStandardOutput:.git/config",
    "Start-Process git -ArgumentList status -RedirectStandardOutput .holyclaude/x",
    "echo x > .git./config",
    "echo x > GIT~1/config",
    "echo x > HOLYCL~1/state.json",
    "echo x > .Git\\Hooks\\pre-commit",
    "echo x > C:/proj\\.HOLYCLAUDE/state.json",
    // The shell expands a pattern before it writes: wildcards, brackets, brace lists and ranges.
    "echo x > .gi?/config",
    "echo x > .g*t/hooks/pre-commit",
    "cp x .gi[t]/hooks/pre-commit",
    "touch .{git,x}/hooks/pre-commit",
    "touch {.git/hooks/x,y}",
    "echo x > .{g..g}it/config",
    "rm -rf .*",
    "echo x > .holy*/state.json",
    "Set-Content .gi?\\config x",
    // Downloads, archives, patches, links and permissions write the paths they are given, also
    // as the value of a flag.
    "curl -o .git/hooks/pre-commit https://example.com/x",
    "curl -o.git/hooks/pre-commit https://example.com/x",
    "curl --output=.git/hooks/pre-commit https://example.com/x",
    "wget -O .git/hooks/pre-commit https://example.com/x",
    "Invoke-WebRequest https://example.com/x -OutFile:.git\\hooks\\pre-commit",
    "iwr https://example.com/x -OutFile .holyclaude\\state.json",
    "tar -xf x.tar -C .git",
    "unzip x.zip -d .git",
    "patch .git/config < fix.patch",
    "mkdir .git/hooks",
    "chmod +x .git/hooks/pre-commit",
    "cmd /c mklink .git\\hooks\\pre-commit x",
  ),
  ...allowed(
    "cat .git/config",
    "ls .git/hooks",
    "Get-Content .git\\config",
    "git status > out.txt",
    "echo x > .gitignore",
    "echo x > .github/CODEOWNERS",
    "rm .gitattributes",
    "touch packages/foo.git",
    "cp x my.git/config",
    "Start-Process git -ArgumentList status -RedirectStandardOutput out.txt",
    "Start-Process git -ArgumentList status -RedirectStandardInput .git/config",
    "rm -rf *",
    "rm -rf ./*/",
    "cp a.ts {src,lib}/",
    "echo x > *.txt",
    "rm -f build/*.js dist/{a,b}.map",
    "echo x > .gitignore*",
    "rm .gitattrib*",
    "curl -o page.html https://example.com/repo.git",
    "mkdir -p .github/workflows",
    "chmod +x scripts/build.sh",
    "tar -czf out.tgz src",
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
    '"/home/u/.claude/plugins/cache/holyclaude/holyclaude/0.1.0/scripts/holyclaude" routes',
    '"C:\\Users\\u\\.claude\\plugins\\cache\\holyclaude\\scripts\\holyclaude" intent show',
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
    '"/home/u/.claude/plugins/cache/holyclaude/holyclaude/0.1.0/scripts/holyclaude" intent create',
    '"C:/Users/u/.claude/plugins/cache/holyclaude/scripts/holyclaude" assignment accept A1',
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
    "echo '{}' > .holyclaude/intents/intent-0001/intent.json",
    "echo x > .holyclaude/.gitignore",
    "echo x > .holyclaude/local/workers.json",
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
  ["Write", ".git/hooks/pre-commit", "subagent", "deny"],
  ["Write", ".git/config", "subagent", "deny"],
  ["Write", "C:\\proj\\.git\\hooks\\pre-commit", "subagent", "deny"],
  ["Write", "/home/me/proj/.GIT/config", "subagent", "deny"],
  ["Edit", ".git/config", "subagent", "deny"],
  ["MultiEdit", ".git/hooks/post-commit", "subagent", "deny"],
  ["Write", ".git/hooks/pre-commit", "main", "allow"],
  ["Write", ".gitignore", "subagent", "allow"],
  ["Write", ".github/workflows/ci.yml", "subagent", "allow"],
  ["Edit", "docs/my.git/notes.md", "subagent", "allow"],
  ["Write", "packages/cli/src/main.ts", "subagent", "allow"],
  ["Edit", "docs/notes.md", "subagent", "allow"],
  ["Write", ".holyclaude/state.json", "main", "allow"],
  ["Write", ".holyclaude/intents/intent-0001/intent.json", "subagent", "deny"],
  ["Edit", ".holyclaude/intents/intent-0001/assignments/assignment-0001.json", "subagent", "deny"],
  ["Write", "C:\\proj\\.holyclaude\\intents\\intent-0001\\intent.json", "subagent", "deny"],
  ["Write", ".holyclaude/.gitignore", "subagent", "deny"],
  ["Edit", "/home/me/proj/.holyclaude/.gitignore", "subagent", "deny"],
  ["Write", ".holyclaude/local/workers.json", "subagent", "deny"],
  ["Write", ".holyclaude/local/agents.json", "subagent", "deny"],
  ["Write", ".holyclaude/local/clone.json", "subagent", "deny"],
  ["Write", ".holyclaude/local/lock", "subagent", "deny"],
  ["MultiEdit", ".holyclaude/local/observations.jsonl", "subagent", "deny"],
  ["Write", ".holyclaude/intents/intent-0001/intent.json", "main", "allow"],
  ["Write", ".holyclaude/.gitignore", "main", "allow"],
  ["Write", ".holyclaude/local/workers.json", "main", "allow"],
  // Windows reads either separator, any case and the 8.3 short names.
  ["Write", ".holyclaude\\state.json", "subagent", "deny"],
  ["Write", "C:/proj\\.HOLYCLAUDE/state.json", "subagent", "deny"],
  ["Write", "C:\\proj\\HOLYCL~1\\state.json", "subagent", "deny"],
  ["Write", "C:\\proj\\GIT~1.\\config", "subagent", "deny"],
  ["Write", "C:/proj\\.Git/Hooks\\pre-commit", "subagent", "deny"],
  ["Write", "\\\\?\\C:\\proj\\.git\\config", "subagent", "deny"],
  ["Write", "C:\\proj\\.git.\\config", "subagent", "deny"],
  ["Write", "C:\\proj\\.git::$DATA", "subagent", "deny"],
  ["Write", "C:\\proj\\.github\\workflows\\ci.yml", "subagent", "allow"],
  ["Write", "C:\\proj\\holyclaude\\notes.md", "subagent", "allow"],
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

  test("a notebook edit in the git directory is denied, and its reason says why", async () => {
    const input = { notebook_path: ".git/n.ipynb" }
    expect(await decide(call("NotebookEdit", input, "subagent"))).toBe("deny")
    expect(await reasonOf(call("NotebookEdit", input, "subagent"))).toContain(
      "hooks and settings that run at the root's next commit",
    )
  })
})

describe("the decision reads only the fields it needs", () => {
  let directory = ""
  const previous = process.env["HOLYCLAUDE_STATE_DIR"]

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "holyclaude-hook-"))
    process.env["HOLYCLAUDE_STATE_DIR"] = directory
  })

  afterEach(() => {
    if (previous === undefined) delete process.env["HOLYCLAUDE_STATE_DIR"]
    else process.env["HOLYCLAUDE_STATE_DIR"] = previous
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
    const records = await Effect.runPromise(readObservations(directory))
    expect(records).toMatchObject([
      { kind: "observed", agent_id: "agent-1", agent_type: "holyclaude:Worker.implementation" },
    ])
  })

  test("a subagent call whose agent_id is not a string is judged but cannot be observed", async () => {
    const extra = { agent_id: 7, agent_type: "holyclaude:Worker.implementation" }
    expect(await decide(call("Bash", { command: "git commit -m x" }, "main", extra))).toBe("deny")
    expect(await Effect.runPromise(readObservations(directory))).toEqual([])
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

const LIMIT = MAX_JUDGED_BYTES
const filler = (bytes: number) => "x".repeat(bytes)

/** A read-only command of exactly `bytes` bytes: `git status` and then spaces. */
const readOfSize = (bytes: number) => `git status${" ".repeat(bytes - "git status".length)}`

/** A write command of exactly `bytes` bytes: `git commit` and then spaces. */
const writeOfSize = (bytes: number) => `git commit${" ".repeat(bytes - "git commit".length)}`

/** The policy's verdict on one tool call, without the payload around it. */
const judged = (tool: string, input: Partial<ToolInput>) =>
  denyToolReason(tool, {
    command: undefined,
    file_path: undefined,
    notebook_path: undefined,
    ...input,
  })

/** A payload of exactly `bytes` bytes: a read, padded outside its command. */
const payloadOfSize = (caller: Caller, bytes: number) => {
  const bare = call("Bash", { command: "git status" }, caller, { padding: "" })
  return call("Bash", { command: "git status" }, caller, {
    padding: filler(bytes - Buffer.byteLength(bare)),
  })
}

describe("the payload is limited as a whole, for every caller", () => {
  for (const caller of ["subagent", "main"] as const) {
    test(`${caller}: a payload of exactly the limit is judged, one byte more is denied`, async () => {
      expect(await decide(payloadOfSize(caller, MAX_HOOK_BYTES))).toBe("allow")
      const reason = await reasonOf(payloadOfSize(caller, MAX_HOOK_BYTES + 1))
      expect(reason).toContain(`payload is over ${MAX_HOOK_BYTES} bytes`)
      expect(reason).toContain("smaller calls")
    })

    test(`${caller}: a large write is denied for its size, whatever its path`, async () => {
      for (const file_path of ["packages/cli/src/big.ts", ".holyclaude/state.json"]) {
        const input = { file_path, content: filler(2 * LIMIT) }
        expect(await reasonOf(call("Write", input, caller))).toContain("payload is over")
      }
    })
  }

  test("the limit counts bytes, not characters", async () => {
    const accents = "é".repeat(MAX_HOOK_BYTES / 2)
    const input = { command: "git status", description: accents }
    expect(accents.length).toBeLessThan(MAX_HOOK_BYTES)
    expect(await reasonOf(call("Bash", input, "main"))).toContain("payload is over")
  })

  test("a payload over the limit is denied before it is read as JSON", async () => {
    for (const stdin of [
      "x".repeat(MAX_HOOK_BYTES + 1),
      `{"agent_id":"a"${" ".repeat(MAX_HOOK_BYTES)}}`,
    ])
      expect(await reasonOf(stdin)).toContain("payload is over")
  })

  test("a tool the guard does not judge passes within the limit and is denied past it", async () => {
    const small = { command: filler(LIMIT / 2) }
    expect(await decide(call("mcp__other__tool", small, "subagent"))).toBe("allow")
    expect(await decide(call("Write", { file_path: "a.ts", ...small }, "subagent"))).toBe("allow")
    expect(await decide(call("mcp__other__tool", { command: filler(2 * LIMIT) }, "main"))).toBe(
      "deny",
    )
  })
})

describe("only the judged fields are judged: padding elsewhere in the payload is neither a bypass nor a deny", () => {
  test("a large Write into an allowed path passes", async () => {
    const input = { file_path: "packages/cli/src/big.ts", content: filler(LIMIT / 2) }
    expect(await decide(call("Write", input, "subagent"))).toBe("allow")
  })

  test("a large Write into the state directory is denied for its path", async () => {
    const input = { file_path: ".holyclaude/state.json", content: filler(LIMIT / 2) }
    expect(await reasonOf(call("Write", input, "subagent"))).toContain("state files are written")
  })

  test("a read padded outside the command passes", async () => {
    const input = { command: "git status", description: filler(LIMIT / 2) }
    expect(await decide(call("Bash", input, "subagent"))).toBe("allow")
    expect(await decide(call("Bash", { command: "git status" }, "subagent", { x: input }))).toBe(
      "allow",
    )
  })

  test("a write padded outside the command is still judged and denied for what it is", async () => {
    const input = { command: "git commit -m x", description: filler(LIMIT / 2) }
    expect(await reasonOf(call("Bash", input, "subagent"))).toContain("git commit writes VCS state")
    expect(
      await reasonOf(
        call("Bash", { command: "git commit -m x" }, "subagent", { padding: filler(LIMIT / 2) }),
      ),
    ).toContain("git commit writes VCS state")
  })

  test("a main-thread payload within the limit is allowed", async () => {
    const write = { command: writeOfSize(LIMIT / 2) }
    expect(await decide(call("Bash", write, "main"))).toBe("allow")
    expect(await decide(call("Write", { content: filler(LIMIT / 2) }, "main"))).toBe("allow")
  })

  test("an empty agent_id is the main thread's", async () => {
    const input = { command: writeOfSize(LIMIT / 2) }
    expect(await decide(call("Bash", input, "main", { agent_id: "" }))).toBe("allow")
  })
})

describe("a command or path over the judged limit is denied unread", () => {
  for (const tool of ["Bash", "PowerShell", "Monitor"])
    test(`${tool}: a command over the limit is denied, a read as well as a write`, () => {
      for (const command of [readOfSize(LIMIT + 1), writeOfSize(LIMIT + 1)]) {
        const reason = judged(tool, { command })
        expect(reason).toContain(`command is ${LIMIT + 1} bytes`)
        expect(reason).toContain(`at most ${LIMIT}`)
        expect(reason).toContain("cannot be checked")
        expect(reason).toContain("smaller calls")
      }
    })

  test("a command of exactly the limit is judged by the policy", () => {
    expect(judged("Bash", { command: readOfSize(LIMIT) })).toBeUndefined()
    expect(judged("Bash", { command: writeOfSize(LIMIT) })).toContain("git commit writes VCS state")
  })

  test("the limit counts bytes, not characters", () => {
    const atLimit = `echo  ${"é".repeat((LIMIT - 6) / 2)}`
    expect(atLimit.length).toBeLessThan(LIMIT)
    expect(judged("Bash", { command: atLimit })).toBeUndefined()
    expect(judged("Bash", { command: `${atLimit}é` })).toBeDefined()
  })

  for (const [tool, key] of [
    ["Write", "file_path"],
    ["Edit", "file_path"],
    ["MultiEdit", "file_path"],
    ["NotebookEdit", "notebook_path"],
  ] as const)
    test(`${tool}: a ${key} over the limit is denied, one at the limit is judged`, () => {
      expect(judged(tool, { [key]: filler(LIMIT + 1) })).toContain(
        `file path is ${LIMIT + 1} bytes`,
      )
      expect(judged(tool, { [key]: filler(LIMIT) })).toBeUndefined()
    })
})

describe("who made the call is read from agent_id of any type", () => {
  const WRITE = { command: "git commit -m x" }
  const READ = { command: "git status" }

  for (const [name, agent_id] of [
    ["a number", 7],
    ["zero", 0],
    ["true", true],
    ["false", false],
    ["an object", { id: "agent-1" }],
    ["an array", ["agent-1"]],
  ] as const)
    test(`agent_id as ${name} is a subagent: a write is denied and a read allowed`, async () => {
      expect(await decide(call("Bash", WRITE, "main", { agent_id }))).toBe("deny")
      expect(await decide(call("Bash", READ, "main", { agent_id }))).toBe("allow")
    })

  test("a null, missing or empty agent_id is the main thread's", async () => {
    for (const extra of [{ agent_id: null }, {}, { agent_id: "" }])
      expect(await decide(call("Bash", WRITE, "main", extra))).toBe("allow")
  })

  test("a non-string agent_id with no tool name is denied", async () => {
    const payload = JSON.stringify({ agent_id: 7, tool_input: WRITE })
    expect(await reasonOf(payload)).toContain("names no tool")
  })
})

describe("the payload is read as JSON, not as text", () => {
  const body = '"tool_name":"Bash","tool_input":{"command":"git commit -m x"}'

  test("a \\u-escaped agent_id key is read", async () => {
    expect(await decide(`{"\\u0061gent_id":"agent-1",${body}}`)).toBe("deny")
    expect(await decide(`{"agent\\u005fid":"agent-1",${body}}`)).toBe("deny")
  })

  test("a \\u-escaped agent_id value is read", async () => {
    expect(await decide(`{"agent_id":"\\u0061gent-1",${body}}`)).toBe("deny")
  })

  test("a \\u-escaped empty or null agent_id still reads as the main thread", async () => {
    expect(await decide(`{"agent_id":"",${body}}`)).toBe("allow")
    expect(await decide(`{"\\u0061gent_id":null,${body}}`)).toBe("allow")
  })

  test("a \\u-escaped tool name and command are judged", async () => {
    const escaped = '"tool_name":"\\u0042ash","tool_input":{"command":"git \\u0063ommit -m x"}'
    expect(await decide(`{"agent_id":"agent-1",${escaped}}`)).toBe("deny")
  })

  test("a field that only mentions agent_id inside a string does not make a main-thread call a subagent's", async () => {
    const input = { command: "git commit -m x", description: '"agent_id":"agent-1"' }
    expect(await decide(call("Bash", input, "main"))).toBe("allow")
  })

  const nested = (command: string, depth: number) =>
    `{"agent_id":"agent-1","tool_name":"Bash","tool_input":{"command":"${command}","x":${"[".repeat(depth)}${"]".repeat(depth)}}}`

  test("deep nesting inside a subagent payload near the limit: a write is denied by the policy", async () => {
    const payload = nested("git commit -m x", 500_000)
    expect(payload.length).toBeGreaterThan(MAX_HOOK_BYTES / 2)
    expect(payload.length).toBeLessThan(MAX_HOOK_BYTES)
    expect(await reasonOf(payload)).toContain("git commit writes VCS state")
  })

  test("deep nesting inside a subagent payload near the limit: a read is allowed", async () => {
    const payload = nested("git status", 500_000)
    expect(payload.length).toBeLessThan(MAX_HOOK_BYTES)
    expect(await decide(payload)).toBe("allow")
  })

  test("deep nesting in a main-thread payload passes", async () => {
    const nest = `${"[".repeat(100_000)}${"]".repeat(100_000)}`
    const payload = `{"tool_name":"Bash","tool_input":{"command":"git commit -m x","x":${nest}}}`
    expect(await decide(payload)).toBe("allow")
  })
})

describe("a payload that is empty or not a JSON object is denied for every caller", () => {
  const unreadable: ReadonlyArray<readonly [string, string]> = [
    ["empty stdin", ""],
    ["blank stdin", " \n"],
    ["text that is not JSON", "git commit -m x"],
    ["JSON cut off after the agent_id", '{"agent_id":"agent-1","tool_name":"Bash","tool_in'],
    ["a JSON array", '[{"agent_id":"agent-1","tool_name":"Bash"}]'],
    ["a JSON string", '"agent_id"'],
    ["JSON null", "null"],
  ]

  for (const [name, stdin] of unreadable)
    test(`${name}`, async () => {
      expect(await reasonOf(stdin)).toContain("empty or not valid JSON")
    })

  test("a payload of the limit's size that is not JSON is denied as unreadable", async () => {
    expect(await reasonOf("x".repeat(MAX_HOOK_BYTES))).toContain("empty or not valid JSON")
  })
})

describe("a subagent payload that cannot be judged for another reason", () => {
  test("no tool name is denied", async () => {
    const payload = JSON.stringify({ agent_id: "agent-1", tool_input: { command: "git commit" } })
    expect(await reasonOf(payload)).toContain("names no tool")
  })

  test("a tool name of another type is denied", async () => {
    for (const tool_name of [null, 7, ["Bash"], { name: "Bash" }]) {
      const payload = JSON.stringify({
        agent_id: "agent-1",
        tool_name,
        tool_input: { command: "git commit" },
      })
      expect(await decide(payload)).toBe("deny")
    }
  })

  test("a main-thread call with no tool name passes through", async () => {
    expect(await decide(JSON.stringify({ tool_input: { command: "git commit" } }))).toBe("allow")
  })
})

describe("a file tool is judged by every path it names", () => {
  const paths: ReadonlyArray<readonly [string, object, Decision]> = [
    ["NotebookEdit", { file_path: "ok.ts", notebook_path: ".holyclaude/s.json" }, "deny"],
    ["NotebookEdit", { file_path: ".holyclaude/s.json", notebook_path: "ok.ipynb" }, "deny"],
    ["Write", { file_path: "ok.ts", notebook_path: ".holyclaude/s.json" }, "deny"],
    ["Edit", { file_path: "ok.ts", notebook_path: ".HolyClaude\\s.json" }, "deny"],
    ["NotebookEdit", { file_path: "ok.ts", notebook_path: "ok.ipynb" }, "allow"],
    ["Write", { file_path: "ok.ts", notebook_path: "ok.ipynb" }, "allow"],
  ]
  for (const [tool, input, expected] of paths)
    test(`${expected}: ${tool} ${JSON.stringify(input)}`, async () => {
      expect(await decide(call(tool, input, "subagent"))).toBe(expected)
    })

  test("a path over the limit is denied wherever it is, behind a harmless one", () => {
    for (const input of [
      { file_path: "ok.ts", notebook_path: filler(LIMIT + 1) },
      { file_path: filler(LIMIT + 1), notebook_path: "ok.ipynb" },
    ])
      expect(judged("NotebookEdit", input)).toContain("file path is")
  })

  for (const tool of ["Write", "Edit", "MultiEdit", "NotebookEdit"])
    test(`${tool}: a call with no readable path cannot be judged and is denied`, async () => {
      for (const input of [
        { content: "x" },
        {},
        null,
        undefined,
        { file_path: 5 },
        { file_path: [".holyclaude/s.json"] },
        { notebook_path: null },
      ])
        expect(await reasonOf(call(tool, input, "subagent"))).toContain("names no file path")
    })

  test("a main-thread file call with no path passes", async () => {
    expect(await decide(call("Write", { content: "x" }, "main"))).toBe("allow")
  })
})

describe("a flag cluster is read in linear time", () => {
  test("a long cluster that has no command flag is denied without backtracking", async () => {
    const started = performance.now()
    const reason = await reasonOf(
      call("Bash", { command: `bash -${"c".repeat(100_000)}!; git commit -m x` }, "subagent"),
    )
    expect(reason).toContain("a shell reading commands from input")
    expect(performance.now() - started).toBeLessThan(1000)
  })

  test("a cluster with the command flag anywhere in it still carries the script", async () => {
    for (const command of [
      "bash -xc 'git push'",
      "bash -cx 'git push'",
      "sh -ec 'git commit -m x'",
      "bash -lic 'git push'",
    ])
      expect(await decide(call("Bash", { command }, "subagent"))).toBe("deny")
    for (const command of ["bash -c 'git status'", "bash -x script.sh", "sh -e script.sh"])
      expect(await decide(call("Bash", { command }, "subagent"))).toBe("allow")
  })
})

describe("the worst command at the limit is decided in seconds, not minutes", () => {
  /**
   * `depth` heredocs that each hold a substitution opening the next, then `inner`, then padding
   * lines.
   */
  const heredocChain = (depth: number, padding: number, inner = "git status") =>
    `${Array.from({ length: depth }, (_, level) => `cat <<H${level}\n$(`).join("")}${inner}${"\n".repeat(padding)}`

  test("a heredoc chain deeper than the scanner follows is denied unread", async () => {
    const started = performance.now()
    const reason = await reasonOf(call("Bash", { command: heredocChain(50, 400_000) }, "subagent"))
    expect(reason).toContain("nested too deeply")
    expect(performance.now() - started).toBeLessThan(3000)
  })

  test("a heredoc chain filling the whole limit is denied in seconds", async () => {
    const command = heredocChain(50, 0)
    const padded = heredocChain(50, LIMIT - command.length)
    expect(Buffer.byteLength(padded)).toBe(LIMIT)
    const started = performance.now()
    expect(judged("Bash", { command: padded })).toContain("nested too deeply")
    expect(performance.now() - started).toBeLessThan(5000)
  })

  test("a chain within the depth is still judged to its innermost command", async () => {
    expect(await decide(call("Bash", { command: heredocChain(3, 10) }, "subagent"))).toBe("allow")
    expect(
      await decide(call("Bash", { command: heredocChain(3, 10, "git push") }, "subagent")),
    ).toBe("deny")
  })
})

describe("a deny reason does not echo the call's own text at length", () => {
  const long = "a".repeat(500_000)
  const echoing: ReadonlyArray<readonly [string, string]> = [
    ["a git subcommand", `git ${long}`],
    ["a git flag", `git -${long}`],
    ["a git -c key", `git -c ${long}=1 status`],
    ["a gh command group", `gh ${long} view`],
    ["a holyclaude subcommand", `holyclaude ${long}`],
  ]
  for (const [name, command] of echoing)
    test(`${name} is cut`, async () => {
      const reason = await reasonOf(call("Bash", { command }, "subagent"))
      expect(reason?.length).toBeLessThanOrEqual(1003)
      expect(reason?.endsWith("...")).toBe(true)
    })

  test("an ordinary reason is sent whole", async () => {
    const reason = await reasonOf(call("Bash", { command: "gh pr create --title t" }, "subagent"))
    expect(reason).toContain("Put the finding in your report")
    expect(reason?.endsWith("...")).toBe(false)
  })
})
