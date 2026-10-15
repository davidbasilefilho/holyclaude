# Hooks

`plugin/hooks/hooks.json` registers five hooks. Each runs in Claude Code's exec form, which spawns
`bun` directly with an argument list and no shell:

```json
{
  "type": "command",
  "command": "bun",
  "args": [
    "--no-env-file",
    "--config=${CLAUDE_PLUGIN_ROOT}/scripts/empty-bunfig.toml",
    "${CLAUDE_PLUGIN_ROOT}/scripts/holyclaude.js",
    "hook",
    "<name>"
  ],
  "timeout": 30
}
```

| Event           | Matcher                                                                  | `<name>`         | What it does                                                                                                                                                 |
| --------------- | ------------------------------------------------------------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SessionStart`  | `startup\|resume\|clear\|compact`                                        | `session-start`  | Injects the core rules and state as additional context.                                                                                                      |
| `PreToolUse`    | `Bash\|PowerShell\|Monitor\|Write\|Edit\|MultiEdit\|NotebookEdit\|Agent` | `pre-tool-use`   | Guards specialists' shell and file-write calls, also refuses a holyclaude root's subagent calls that are not holyclaude specialists, and records the effort. |
| `PostToolUse`   | `Agent`                                                                  | `post-tool-use`  | Records the model a launched specialist started on. It never blocks.                                                                                         |
| `SubagentStart` | none                                                                     | `subagent-start` | Records a specialist's agent type. It cannot block.                                                                                                          |
| `SubagentStop`  | none                                                                     | `subagent-stop`  | Records a specialist's effort and transcript. It never blocks.                                                                                               |

A tool the `PreToolUse` matcher does not list skips the hook entirely, so reads such as `Read`,
`Grep` and `Glob` cost no process. The matcher lists every tool the hook judges (the guard's shell and file-write tools, and `Agent` for the dispatch check),
and a test keeps the two in step.

The hooks record only holyclaude specialists, the agents whose `agent_type` is `holyclaude:<role-task>`,
because only they feed `assignment verify` and the independence rule. An agent with another type,
an empty one or none (Claude Code's own internal agents, built-in types, other plugins' agents)
leaves no trace: nothing is written, so a repository that loads holyclaude without using it gains
no `.holyclaude/` directory and no `.gitignore`. A payload without an agent type still counts when
the log already holds a holyclaude type for that agent id from its `SubagentStart`. `PostToolUse`
judges the launched agent by the call's `subagent_type` instead, so only `holyclaude:<role-task>`
launches are recorded there. The payload's type is checked before the log is read, so an agent with another type never causes a read, and the guard's verdict is printed first, then the process ends after the recording, which has its own short time bound.

`SessionStart` injects the core rules because the root may not run as the holyclaude agent: in
some environments the plugin's `agent` setting is not applied, and the injection is then the root's
only copy. When the payload's `agent_type` shows the main thread runs as that agent
(`holyclaude:holyclaude`, or `holyclaude`), its system prompt already carries the same rules, so the
hook leaves them out and injects only the state summary, which saves about 8,000 characters on every
start, resume, clear and compaction. A payload that cannot be read gets the rules.

The injected context is capped at 10,000 characters, and the rules are the part that must survive.
The state summary names every open Intent (id, revision, objective, open Assignments), marks the one
in use and shows its requirements, and lists each Assignment that needs attention. It shows the
objectives and any state error whole; only
when the rules and that summary do not fit together does the summary shrink to fit. The text of the
Intents and of every row is clipped step by step (to 2,000, 400, then 120 characters), so each row
keeps its id and agent id; only then does it show fewer rows (with a count of the rest), then no
text, then only the one-line pointer to `intent list` and `assignment list --all`. The rules are cut, from
their end with a marker, only when they alone do not fit beside that pointer. The hook reads each
state file up to 64 MiB, since a repository can commit files into the state directory; past that the
context carries the rules and a state error in place of the summary.

`PostToolUse` runs on the `Agent` tool (Claude Code's `Task` tool under its current name). Its
payload carries the call's `tool_input.subagent_type` and a `tool_response` with the launched
`agentId` and `resolvedModel`, the model the subagent started on, which may differ from the model
requested. A background launch (`status: "async_launched"`) and a foreground completion
(`status: "completed"`) both carry them, so the model is on record before the subagent writes a
transcript. Other fields in the payload are ignored.

`holyclaude assignment verify` combines the observation sources field by field, the newest
record winning: the agent type from `SubagentStart`, the effort from `PreToolUse` or `SubagentStop`,
and the model from `PostToolUse`. When no model was recorded, the model is read from the transcript
instead, whose path comes from `SubagentStop` or `PreToolUse`. The output's `model_source` says
which was used: `hook`, `transcript`, or `none` when the model is unobserved. The model from
`PostToolUse` is the one the agent started on, so a model change in the middle of a run shows only in
the transcript. The recorded model is
a full id such as `claude-sonnet-5-5`, which matches the expected alias (`sonnet`) by family name.
A read-only reviewer that never calls a guarded tool therefore verifies completely after it stops.
The observations log keeps its format: one JSON line per sighting, each with only the fields it saw.

`--no-env-file` and `--config` keep Bun from reading the project's `.env` and `bunfig.toml`, which
would otherwise let the project redirect the state file or preload code into every hook. The config
is an empty file shipped in the plugin, because `/dev/null` exists only under MSYS or Unix.

## On Windows

Exec form needs `command` to be a real `.exe`, and `bun` is one: Claude Code finds it on `PATH`
without Git Bash, so a hook costs one Bun process and no shell. Through a mise shim (a `bun.exe` in
`mise\shims`) it costs more, because the shim starts further processes before Bun runs; put the
real Bun directory on `PATH` for the cheapest hook. On the development machine, a `PreToolUse` call
took 13 processes and about 270 ms through Git Bash and the shell wrapper, 6 processes and 183 ms
in exec form through the mise shim, and 2 processes and 64 ms with the real `bun.exe`. Each figure is
the median of 30 calls.

The `holyclaude` command the root and workers run is the shell wrapper `plugin/scripts/holyclaude`.
It is not on `PATH`: Claude Code adds only a plugin's `bin/` there, and the plugin ships none ([why](DECISIONS.md#no-bin-in-the-plugin)). The agent and skill prompts name it as `"${CLAUDE_PLUGIN_ROOT}/scripts/holyclaude"`,
which Claude Code replaces with the installed path when it loads them, and the SessionStart hook
replaces it the same way in the core rules it injects. The wrapper's common path forks nothing (no
command substitution, only parameter expansion and the `command -v` builtin), which spares Git Bash
four processes per call. Only a symlinked wrapper forks, for `readlink`.

## Without Bun

Claude Code cannot start a hook whose `bun` is not on `PATH`. For each hook that is a non-blocking
error: the call, start or stop goes ahead and the transcript shows a hook error notice. So the guard
is off and nothing is observed until Bun is installed, and the notice repeats on every matched tool
call. A Bun in `~/.bun/bin` that is not on `PATH` is not found either; the wrapper falls back to it
for the `holyclaude` command, the hooks do not. The `holyclaude` command without Bun prints one TOON
error line and exits 127.
