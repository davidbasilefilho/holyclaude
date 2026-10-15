# holyclaude

holyclaude is a Claude Code plugin whose `agent` setting starts the main thread as a root agent, as
observed in local sessions and not in [cloud sessions](#cloud-sessions). The root
plans work as an Intent with Assignments, dispatches pinned Haiku and Sonnet specialists,
judges their reports, and accepts work on evidence. State lives in the project's
`.holyclaude/` directory (see [State](#state)) and is reached through the `holyclaude` command line tool that the
plugin ships. There is no MCP server.

## State

State is kept as one JSON file per record in the project's `.holyclaude/` directory, which is meant to be committed ([why](docs/DECISIONS.md#holyclaude-state-is-versioned-in-git)):

```text
.holyclaude/
  .gitignore                          committed; lists the local files below and an earlier version's
  intents/<intent-id>/intent.json
  intents/<intent-id>/assignments/<assignment-id>.json
  local/                              never committed
    .gitignore                        `*`, restored if it differs, so local files stay ignored whatever the folder's own list says
    lock, lock.breaking               the write lock and its guard
    workers.json                      the worker list: subagent ids, roster fingerprints, history
    agents.json                       the subagent id of each Assignment, keyed by Assignment id
    worktrees.json                    the worktree key of each Running writer, keyed by Assignment id
    clone.json                        this clone's random id
    active-intent.json                the Intent this clone works on, set by `intent use`
    observations.jsonl                what the hooks saw of running subagents, with transcript paths
    observations.1.jsonl              the previous generation of that log
  state.json.migrated                 an earlier version's single state file, after migration
```

Two clones that create different records never write the same file, so merging their branches does not conflict. Ids are generated without a counter, as a kind, the creation time in base36 and a short random suffix (`intent-0mg8k2x1a-7f3q`). Among generated ids, plain text order is creation order. The ids of an earlier version (`intent-0001`, with any number of digits) are kept and sort before every generated id, in numeric order. No command picks an Intent by its position in that order; see "Intents and collaborators" below.

Each record's id must match its file or directory name; a file that does not is rejected as `CorruptRecord`, which names the file. Writes go through a temporary file and a rename under a local lock, and only the records a command changed are written. Record files and local files have no size limit: holyclaude never refuses or shortens what you write into an Intent, an Assignment or a result. The local files are never merged. The worker list and the agent ids only grow (the agent id of a finished Assignment still feeds `verify`, and a worker's history feeds the independence rule), so their entries cannot be pruned safely; `clone.json` and `active-intent.json` each hold one value, and a new choice replaces the old. The observations log is the exception: it is only a note for `verify` and the hooks, so once it passes 1 MiB the next append moves it, under the lock, to `observations.1.jsonl` (replacing the generation before) and starts a new one. Readers read both generations, oldest first, so the log on disk stays at about two generations and the newest records are never the ones dropped. A repository can commit a log of any size, though, and every specialist tool call reads it, so a read takes only the last 4 MiB of each generation, from the first whole line on; a log that follows the rotation is near 1 MiB per generation and is read whole. The other bounds only guard the reading of input that holyclaude does not own, and a read past one fails as `TooLarge` rather than load the file: the lock and guard files are read only up to 4 KiB (a larger one counts as unreadable and is judged by its age), the `.gitignore` up to 256 KiB, `local/.gitignore` up to 16 bytes (anything else is rewritten to `*`), a legacy `state.json` up to 1 MiB, a subagent transcript that `assignment verify` opens up to 64 MiB, and each state file that the SessionStart hook reads up to 64 MiB. The CLI itself reads state files and the JSON on its stdin at any size, since both come from its user.

Nothing under the state directory may be a symbolic link or, on Windows, a junction. A link committed to a repository could send a write, rename, remove or append outside the directory, or make a read return a file that is not state, so these are refused with `SymlinkRefused` before the path is touched: the directory itself, `intents/`, every `intents/<id>/` and `assignments/` folder (checked by name, since a directory glob would skip a link without a word), `local/`, each record file, each local file (`workers.json`, `agents.json`, `worktrees.json`, `clone.json`, `active-intent.json`), the lock file and its guard (before the lock is taken), the `.gitignore`, both generations of the observations log (which every specialist tool call and `assignment verify` read), and the old `state.json`, `state.json.migrated` and `state.observations.jsonl` that a migration reads, moves or removes. Reads and writes alike are covered. One read is not: `assignment verify` opens the transcript path that the observations log records, and that file lives outside the state directory, in Claude Code's own session store; that read is size-capped instead. One read is lenient instead: a stored Intent choice (`local/active-intent.json`) that is a link or unreadable counts as no choice; writing it still refuses a link.

The `.gitignore` in `.holyclaude/` lists exactly these files: `/local/`, `*.tmp`, `/state.json.migrated`, `/state.json`, `/state.json.lock*` and `/state.observations.jsonl`. The first two cover what this version keeps out of the records; the rest are what an earlier version left beside them. So the records are committed and nothing machine-specific is. A subagent id means nothing on another machine, so `agent_id` is never written to a record: it is kept in `local/agents.json` and merged back when the state is read. Whenever the CLI creates `local/`, it also writes `local/.gitignore` containing `*`, so local files stay ignored even if a repository replaces `.holyclaude/.gitignore`. The same goes for the worker list, the lock owner (process id and host name) and the transcript paths in the observations log. The records are JSON that holyclaude writes, not formatted source, so a repository that runs its own formatter should exclude `.holyclaude/` from it (holyclaude's own `.oxfmtrc.json` does).

The records do hold what you and your root write into them: the objective, requirements, scope, constraints, acceptance criteria, results and evidence of an Intent or Assignment are committed as free text. Keep absolute paths, user names and secrets out of them, because the repository may be public.

A record that arrives through a pull or a merge is unauthenticated input from whoever wrote it, like any other committed file. An objective, a constraint or a result is read by your root and by workers as instructions and evidence, so review changes under `.holyclaude/` as you would code before you rely on them.

The worker VCS guard recognizes the state directory by its name: it refuses a specialist's writes to any path that contains `.holyclaude`. A `HOLYCLAUDE_STATE_DIR` outside a folder with that name is therefore not protected from specialists, so keep it under a `.holyclaude` folder.

### Clones and reconcile

Each clone gets a random id in `local/clone.json` on first use. When an Assignment enters Running, the store stamps that id on it as `clone_id`. `holyclaude reconcile` lists the Running rows this clone reserved under `running` (rows without a stamp count as its own), and rows another clone reserved under `running_elsewhere`. It leaves the latter alone, since the other clone's root confirms them; `holyclaude reconcile resolve <id>` still settles one when you name it, while `assignment bind`, `rollback`, `cancel` and `finish` on such a row are refused as `OwnedElsewhere`, naming the clone, since its worker lives in that clone's session. Only this clone's Running writers (and unstamped ones) hold their ownership paths against a local `reserve`; a row another clone reserved does not, because git shows an overlap at merge. Within a clone, `assignment reserve --worktree <dir>` makes an existing directory (another git worktree of the repository) the base that ownership paths and `--root` resolve against, and keys the reservation to it with a hash of the directory's real path, kept in `local/worktrees.json` (never in a record) until the row leaves Running. Writers hold paths against each other only within one key, so writers in different worktrees run in parallel; a reserve without `--worktree` keys to the project root, and a Running row with no key holds against everyone. `--root` still narrows the writable roots, relative to the worktree. Deleting `.holyclaude/local/` gives the clone a new id, so its earlier Running rows then show as running elsewhere.

### Intents and collaborators

An Intent is `open` or `closed`. A closed Intent carries `close_reason` and `closed_at`, and it authorizes no dispatch: `assignment create`, `assignment reserve` and `assignment follow-up` refuse it with `IntentClosed`. An open Intent is written without `state`, and a record with none reads as open, so Intents written before this version stay open until someone closes them and a clone from before this version still reads open ones.

| Command                                        | What it does                                                                                                                                                                               |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `intent list [--state open\|closed]`           | One row per Intent: id, state, revision, objective and the count of open Assignments (Ready, Running, or Succeeded and not yet accepted)                                                   |
| `intent create`                                | Records a new Intent from the JSON on stdin and puts it in use on this clone. The reply names it under `in_use` and the Intent it displaced under `replaced` (`null` when none was in use) |
| `intent use <id>`                              | Makes this clone work on that Intent. The choice is stored in `local/active-intent.json`, which is never committed, and a closed Intent is refused                                         |
| `intent close [--intent <id>] --reason <text>` | Closes the Intent; refused while any of its Assignments is Running                                                                                                                         |
| `intent reopen [--intent <id>]`                | Opens it again and bumps its revision, so an acceptance recorded before the close does not authorize new work; without `--intent` it reopens the only closed Intent                        |
| `assignment list [--intent <id> \| --all]`     | Lists the Assignments of the Intent in use; `--intent` selects another and `--all` shows every Intent                                                                                      |

A command that acts on an Intent (`intent show`, `intent update`, `intent close`, `intent reopen`, `assignment list`) finds it in this order: the `--intent <id>` flag, then the Intent stored by `intent use` while it is still open, then the only open Intent when exactly one is open. Otherwise (several open and none in use, or none open) it fails with `NoActiveIntent`, which lists the open Intents and says to run `intent use`, or to create or reopen one when none is open. A stored choice that cannot be read counts as none, and is not read at all when `--intent` is given. `intent show <id>` and a JSON `id` in `intent update` name an Intent too; one that differs from `--intent` is a usage error. The SessionStart summary names every open Intent and marks the one in use by the same rule.

Collaborators on one repository need the same holyclaude version. Only a closed Intent writes the new `state`, `close_reason` and `closed_at` fields, and an older version rejects a record that carries them as a corrupt record, so update every clone before anyone closes an Intent.

### Where state lives

The state directory is `$CLAUDE_PROJECT_DIR/.holyclaude`, or `.holyclaude` in the working directory when that variable is unset. `HOLYCLAUDE_STATE_DIR` overrides it with a directory of your choice. It replaces `HOLYCLAUDE_STATE_FILE`, which named the single state file and is no longer read.

### Migrating from the single file

The first time a command that changes state runs against the `.holyclaude/state.json` of an earlier version, the file becomes record files. Legacy ids are kept, agent ids and workers move to the local files, the observations log moves into `local/` as its previous generation, whole whatever its size (moved, or streamed in front of a previous generation, never loaded whole), the old file is renamed `state.json.migrated`, and the old lock files (`state.json.lock` and `state.json.lock.breaking`) are deleted last, under the new lock. A `.holyclaude/.gitignore` that holds only the old `*` rule is replaced by the list above before the migration starts, and it already covers the old file, its lock files and its log, so nothing the migration has yet to move can be staged by accident. Any other `.gitignore` there is left as it is, so check that it covers the files in the list. A `state.json.migrated` that is already there is never overwritten: if it holds the same text as `state.json` (a migration that stopped before its last step), `state.json` is simply removed; if it differs, the migration stops with `MigratedFileInTheWay` before writing any record and keeps both files, and you move the old copy away (or delete it) and run the command again. It does not rename to a suffixed name, because such a name would not be covered by the `.gitignore` and could be committed. Record files already on disk, such as a teammate's, are kept; the ones the old file also has must agree with it, or the migration stops with `CorruptRecord`. A previous generation already in `local/` gets the old lines in front of it; the log hooks append to is never rewritten. Read-only commands read an unmigrated file together with the record files. Commit `.holyclaude/` after the first migration. The repository's own `.gitignore` no longer lists `.holyclaude/`.

## Requirements

- Claude Code 2.1.293 or later.
- [Bun](https://bun.sh) on `PATH`, as a real `bun` executable that Claude Code can start without a
  shell. Without it the hooks do not start and the `holyclaude` command prints a one-line error; see
  [Hooks](#hooks).

## Install and test in plain Claude Code

Try it straight from a clone, without installing:

```sh
claude --plugin-dir <path-to-clone>/plugin
```

The plugin's `settings.json` sets `agent` to `holyclaude`, so a local session starts with the root
agent, as observed (a cloud session did not; see [Cloud sessions](#cloud-sessions)). Check `/agents` for the `holyclaude:` specialists, and run
`<path-to-clone>/plugin/scripts/holyclaude routes` in a shell to see each specialist's model and effort.

To install it through the marketplace route, add the marketplace and then install the plugin. In a
session:

```text
/plugin marketplace add davidbasilefilho/holyclaude
/plugin install holyclaude@holyclaude
```

`/plugin marketplace add` also accepts a local path to the clone's root. The same steps work from a
shell as `claude plugin marketplace add <source>` and `claude plugin install holyclaude@holyclaude`.
Check a checkout with `claude plugin validate <path-to-clone>/plugin` and
`claude plugin validate <path-to-clone>`.

## Install and test in T3 Code nightly

T3 Code drives Claude through the Agent SDK and loads the user, project and local settings, which
include `enabledPlugins` and `agent`. It does not pass a plugin directory, so `--plugin-dir` does
not apply there. Install through the marketplace route above, from a plain `claude` session on the
same machine, so the plugin is enabled in the settings T3 reads. Then start a thread in T3 Code and
confirm that the thread runs the `holyclaude` root and that `holyclaude:` specialists can be dispatched. In plain local `claude` sessions, the plugin's `agent` setting has been observed to start the session with the root; in T3 Code this is unverified. In a cloud session it did not start the root (see [Cloud sessions](#cloud-sessions)).

T3 Code's `$` skills picker lists only skills in the Claude config directory and the project's
`.claude/skills`, so the plugin's skills do not appear there. The root and the workers still load
them through the Skill tool.

This has not been observed live in T3 Code. If the plugin does not load, or the `agent` setting does
not take effect, use the fallback below.

### The `.claude/` fallback

T3 Code loads Claude's default settings sources, so the same pieces can live in `.claude/`. The
fallback must not rely on the plugin's own SessionStart hook:

- the holyclaude root agent file in `~/.claude/agents/` or `.claude/agents/`;
- the user-level `settings.json` setting `agent` to it;
- the specialists and skills in `.claude/agents` and `.claude/skills`;
- the CLI on `PATH` through `bun link` in `packages/cli`, with
  `"${CLAUDE_PLUGIN_ROOT}/scripts/holyclaude"` in the copied agents and skills replaced by
  `holyclaude`, because Claude Code substitutes that variable only in a plugin's own files;
- the hooks in user or project settings.

If T3 Code turns out to ignore `agent` in user settings too, the main thread would stay on the default
agent. Then a SessionStart hook in user or project settings could inject the root rules, and the
root's restraint would depend on its instructions alone.

## Cloud sessions

Cloud sessions (Claude Code on the web) differ from a local session in five ways that matter here. Each point is marked as documented (stated in the Claude Code documentation, checked 2026-10-15 for Claude Code 2.1.300) or observed (seen in two cloud sessions with holyclaude loaded, not documented).

- **Settings.** Documented: a cloud session does not read user settings (`~/.claude/settings.json`) or local settings. A single-repository session reads the repository's committed `.claude/settings.json`; a multi-repository session reads only `enabledPlugins` and `extraKnownMarketplaces` from it. Commit the keys you need, such as those in [Settings the plugin cannot ship](#settings-the-plugin-cannot-ship) except its managed-only keys, to `.claude/settings.json` of a single-repository project, or set them as environment variables on the cloud environment (in `.env` format).
- **The root agent.** Observed: the plugin's `agent` setting did not make the main thread the `holyclaude` agent. The main thread ran as the default agent, and the core rules that the SessionStart hook injects were the root's copy of its instructions.
- **Stop hooks.** Observed in two cloud sessions: the environment ran a stop hook that asked for uncommitted files to be committed, and it flagged the `.holyclaude/` state, which is meant to be committed with the work (see [State](#state)), so commit it together with the change.
- **GitHub GraphQL.** Observed: `gh pr view --json ...` and `gh api graphql` fail because GraphQL is blocked, while REST through `gh api` (for example `repos/<owner>/<repo>/pulls/<number>`) works. The root's CI watch reads REST and reports review threads, which only GraphQL exposes, as Unknown where GraphQL is blocked, review comments exist and no host GitHub tools can read them. `gh api --paginate` fails with 403 when a read needs a second page, so such a read counts as Unknown.
- **PR activity subscriptions.** Observed: a subscription to a PR's activity can stop delivering partway through a session, so the root falls back to polling with Monitor.

## Settings the plugin cannot ship

A plugin's `settings.json` honors only `agent` and `subagentStatusLine`, so everything below is
yours to set. Put each entry in the settings file for the scope where you run the holyclaude root.
The `permissions.deny` entries apply to sessions that run the holyclaude root, so keep them out of the
settings of sessions that use other agents.

Managed-only keys apply in any session, cloud or local. Documented: Claude Code reads `deniedModels` and `availableModelsMatch` only from managed settings (2.1.283 or later), so a committed `.claude/settings.json` or user settings does not apply them. Server-managed settings need Claude for Teams or Enterprise and are set by an Owner or Primary Owner.

| Setting                                                                                                 | Why                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `"env": { "CLAUDE_CODE_FORK_SUBAGENT": "0" }`                                                           | Turns off fork mode. A fork inherits the root's Opus model, which would bypass the pinned Haiku and Sonnet specialists.                                                                                                                                                                                                                                       |
| `"permissions": { "deny": ["Agent(fork)", "Agent(general-purpose)", "Agent(Explore)", "Agent(Plan)"] }` | Forks inherit the Opus model, and the built-in agent types ignore the pinned specialists, so denying them keeps every dispatch on a holyclaude specialist.                                                                                                                                                                                                    |
| `"subagentPromptCacheTtl": "1h"`                                                                        | Leave it unset. The Sonnet specialists, the only workers the root resumes, ask for a one-hour cache in their own frontmatter (`experimental.cacheTtl`), and this setting would override that choice for every subagent, Haiku included.                                                                                                                       |
| `"promptCacheTtl": "1h"`                                                                                | Keeps the root cached on API-key setups, where the default is five minutes; frontmatter `cacheTtl` applies only to subagents, so the root needs this setting. It carries a higher cache-write cost.                                                                                                                                                           |
| `"autoCompactWindow": 450000` or `CLAUDE_CODE_AUTO_COMPACT_WINDOW=450000`                               | Compacts the root and every subagent at 450,000 tokens. See below.                                                                                                                                                                                                                                                                                            |
| `"permissions": { "allow": ["Bash(gh pr view *)", "Bash(gh run list *)", "Bash(gh run view *)"] }`      | The root watches CI through Monitor with read-only `gh` commands, and Monitor commands pass through Bash permission rules. Allow the read commands you want it to run without a prompt. The watch's `gh api` reads still prompt unless you write a rule you trust, because a prefix rule such as `Bash(gh api *)` also matches write forms (`-X POST`, `-f`). |
| `"deniedModels": ["fable"]` in managed settings                                                         | Blocks Fable-class models so no session or per-call override reaches them. The key is managed-only (see the note above the table). Adjust the entry to the model family you want to block.                                                                                                                                                                    |
| `CLAUDE_CODE_EFFORT_LEVEL` left unset                                                                   | The variable overrides every specialist's pinned effort, so leaving it unset lets each specialist run at its own level.                                                                                                                                                                                                                                       |
| `"env": { "CLAUDE_CODE_SUBAGENT_MODEL": "haiku" }` (optional)                                           | A fallback default for definitions that lack a model. Leave `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` unset: it forces one model on every subagent and would block Sonnet.                                                                                                                                                                                           |
| T3 Code Queue mode (Settings, General, Follow-up behavior)                                              | Messages sent mid-run wait for the turn to finish. Steer interrupts in-flight tools.                                                                                                                                                                                                                                                                          |

The built-in `/code-review` skill, which Reviewer.code uses, starts one general-purpose review subagent
of its own on the reviewer's model. A test run with `Agent(general-purpose)` denied still saw it start,
and how the deny list and that skill interact is not fully verified.

### The 450K compaction threshold

Settings key, in user, project or local settings:

```json
{ "autoCompactWindow": 450000 }
```

Or the environment variable, which takes a plain integer only (`450k` would read as 450 and clamp to
100,000):

```sh
CLAUDE_CODE_AUTO_COMPACT_WINDOW=450000
```

What the mechanism does, read from the Claude Code documentation and source:

- The value is an integer number of tokens from 100,000 to 1,000,000, capped at the model's context
  window. The environment variable beats the settings key.
- Subagents use the same logic, so the root and every worker compact at the same threshold.
- Since 2.1.288, a per-model `modelSettings.<model>.autoCompactWindow` saved by `/autocompact` beats
  the top-level key for that model. Check `/autocompact` if a model compacts at another size.
- Opus 5.5, Sonnet 5.5 and Haiku 5.5 each have a 1M window by default, so 450,000 sets a real,
  earlier threshold for each of them.
- `CLAUDE_CODE_DISABLE_1M_CONTEXT=1` holds those models to 200K. The value is then capped at the
  window and does nothing useful, so leave that variable unset.
- In T3 Code, the Claude provider setting "Auto-compact after" passes its value
  inline and overrides `settings.json`. Enter `450000` there as well.

This setup has not been observed taking effect in a live session. Watch for the first compaction near
450,000 tokens before relying on it.

## Hooks

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

| Event           | Matcher                                                           | `<name>`         | What it does                                                            |
| --------------- | ----------------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------- |
| `SessionStart`  | `startup\|resume\|clear\|compact`                                 | `session-start`  | Injects the core rules and state as additional context.                 |
| `PreToolUse`    | `Bash\|PowerShell\|Monitor\|Write\|Edit\|MultiEdit\|NotebookEdit` | `pre-tool-use`   | Guards specialists' shell and file-write calls, and records the effort. |
| `PostToolUse`   | `Agent`                                                           | `post-tool-use`  | Records the model a launched specialist started on. It never blocks.    |
| `SubagentStart` | none                                                              | `subagent-start` | Records a specialist's agent type. It cannot block.                     |
| `SubagentStop`  | none                                                              | `subagent-stop`  | Records a specialist's effort and transcript. It never blocks.          |

A tool the `PreToolUse` matcher does not list skips the hook entirely, so reads such as `Read`,
`Grep` and `Glob` cost no process. The matcher lists every tool the guard judges, and a test keeps
the two in step.

The hooks record only holyclaude specialists, the agents whose `agent_type` is `holyclaude:<Role.task>`,
because only they feed `assignment verify` and the independence rule. An agent with another type,
an empty one or none (Claude Code's own internal agents, built-in types, other plugins' agents)
leaves no trace: nothing is written, so a repository that loads holyclaude without using it gains
no `.holyclaude/` directory and no `.gitignore`. A payload without an agent type still counts when
the log already holds a holyclaude type for that agent id from its `SubagentStart`. `PostToolUse`
judges the launched agent by the call's `subagent_type` instead, so only `holyclaude:<Role.task>`
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

### On Windows

Exec form needs `command` to be a real `.exe`, and `bun` is one: Claude Code finds it on `PATH`
without Git Bash, so a hook costs one Bun process and no shell. Through a mise shim (a `bun.exe` in
`mise\shims`) it costs more, because the shim starts further processes before Bun runs; put the
real Bun directory on `PATH` for the cheapest hook. On the development machine, a `PreToolUse` call
took 13 processes and about 270 ms through Git Bash and the shell wrapper, 6 processes and 183 ms
in exec form through the mise shim, and 2 processes and 64 ms with the real `bun.exe`. Each figure is
the median of 30 calls.

The `holyclaude` command the root and workers run is the shell wrapper `plugin/scripts/holyclaude`.
It is not on `PATH`: Claude Code adds only a plugin's `bin/` there, and the plugin ships none ([why](docs/DECISIONS.md#no-bin-in-the-plugin)). The agent and skill prompts name it as `"${CLAUDE_PLUGIN_ROOT}/scripts/holyclaude"`,
which Claude Code replaces with the installed path when it loads them, and the SessionStart hook
replaces it the same way in the core rules it injects. The wrapper's common path forks nothing (no
command substitution, only parameter expansion and the `command -v` builtin), which spares Git Bash
four processes per call. Only a symlinked wrapper forks, for `readlink`.

### Without Bun

Claude Code cannot start a hook whose `bun` is not on `PATH`. For each hook that is a non-blocking
error: the call, start or stop goes ahead and the transcript shows a hook error notice. So the guard
is off and nothing is observed until Bun is installed, and the notice repeats on every matched tool
call. A Bun in `~/.bun/bin` that is not on `PATH` is not found either; the wrapper falls back to it
for the `holyclaude` command, the hooks do not. The `holyclaude` command without Bun prints one TOON
error line and exits 127.

## Skills

The plugin ships eight skills. `assignments`, `continue-work`, `grill-me` and `handoff` serve the root.
The specialists preload the rest through their `skills` frontmatter: `specialist-conduct` (every
specialist), `merge-ready-code` (the code writers, Reviewer.code and Reviewer.testing), and
`interface-inspection` with the vendored `frontend-design` (Worker.visual and Reviewer.visual). `/code-review` is Claude Code's built-in skill,
which review Assignments call; it is neither vendored nor wrapped.

## Limits

- holyclaude puts no word, character or byte limit on content: the text of an Intent, an Assignment,
  a result, a list row, a hook's deny reason or a command's error is kept and shown whole. The
  bounds that remain only guard the reading of external or untrusted input: the stdin of the guard
  hook (1 MiB), the tail read of the observations log (4 MiB per generation), the state files that
  SessionStart reads (64 MiB each), the lock, guard and `.gitignore` files, a legacy `state.json`, a
  subagent transcript, and the guard's own analysis work. The CLI's own stdin has no bound. The only
  fixed budget is the 10,000 characters of `SessionStart` context, which Claude Code itself caps.
- The worker VCS-write hook is a guardrail for well-meaning workers, not a sandbox. Interpreters,
  scripts and PowerShell script blocks other than those run in place (`& { }`, `. { }`) or given to
  Invoke-Command (icm), Start-Job (sajb) and Start-ThreadJob are out of its reach. Writes into `.holyclaude` and `.git` are refused
  by the path a command names, either separator and any case, and by every path a wildcard or brace
  list in it can expand to; a path computed at run time (a variable, a substitution) or reached by
  a relative path after `cd` is out of its reach.
- The hook reads at most 1 MiB of stdin, and a payload over that, an empty one or one that is not a
  JSON object is denied for every caller, the main thread included: it cannot be attributed, and
  Claude Code sends no such payload. A main-thread Write of more than about 1 MiB is refused for
  that reason.
- Within that limit the guard treats a call as a specialist's when its payload carries an
  `agent_id` that is not null, absent or empty, whatever the type of the value; every other call is
  the main thread's and passes untouched. It denies a specialist call it cannot judge: a command or
  file path over 1 MiB, or a text the guard reads out of a command (a nested shell's script, a
  launcher's argument line, a script block written back) that is, a file tool that names no path,
  a call that names no tool, or one its policy cannot read. A file tool is judged by every path it
  names. Only the command and the paths are judged, so padding elsewhere in the payload neither
  hides a call nor changes its verdict.
- The guard fails open only when the hook cannot run: stdin cannot be read, or the hook crashes or
  runs past its 30 second timeout. The content of a specialist's call is not expected to cause
  that. The payload and each judged text are capped at 1 MiB, and the shell scanner's nesting and
  the work of one judgement are bounded; the slowest input found at the cap took about 3.3 seconds
  on the development machine, so a machine about nine times slower would still lose the guard on
  it.
- Without Bun on `PATH` the hooks do not start, Claude Code reports a hook error and goes on, and
  the guard is off.
- The `PreToolUse` hook runs only for the tools its matcher lists. Per call it costs about 64 ms with
  the real `bun.exe` on the Windows development machine, and more through a shim or under load; see
  [On Windows](#on-windows).
- Installing the plugin makes holyclaude the default main-thread agent for sessions where it is enabled, as observed in local sessions; a cloud session did not (see [Cloud sessions](#cloud-sessions)).
- Reviewer.code, Worker.validation and Reviewer.testing hold Bash under an instruction-only
  no-mutation boundary.

## Development

Tasks live in `mise.toml`, which pins Bun. Run them with `mise run <task>`; the root `bun run`
scripts (`fmt`, `fmt:readonly`, `lint`, `lint:readonly`, `typecheck`, `test`) and the CLI package's
`build` script call the matching task.

```sh
bun install
mise run fmt:readonly && mise run lint:readonly && mise run typecheck && mise run test
mise run build   # rebuilds plugin/scripts/holyclaude.js after core or cli changes
```

| Task                                      | What it does                                                         |
| ----------------------------------------- | -------------------------------------------------------------------- |
| `fmt`, `fmt:readonly`                     | Format in place, or check formatting                                 |
| `lint`, `lint:readonly`                   | Lint with fixes, or lint without them                                |
| `typecheck`                               | Type-check the repository                                            |
| `test`                                    | Run the test suite                                                   |
| `build`                                   | Bundle the CLI into `plugin/scripts/holyclaude.js`                   |
| `bump:minor`, `bump:patch`, `bump:hotfix` | Bump the six version files and `bun.lock`, print old and new version |

Versions follow `0.X.Y-Z`: `X` is the minor, `Y` the patch and `Z` an optional hotfix. A bump
resets the later positions, so from `0.3.2-1` a minor bump gives `0.4.0`, a patch bump gives
`0.3.3` and a hotfix bump gives `0.3.2-2`. The version appears in the root, `packages/cli`,
`packages/core` and `plugin` `package.json` files, in `plugin/.claude-plugin/plugin.json` and in
`.claude-plugin/marketplace.json`, and the six stay identical. Claude Code only sees a plugin update when
the version string changes. The bump tasks refuse to run, writing nothing, when the six disagree or when
`bun.lock` is missing or has no workspace version. After a successful bump they run `build`, because the
CLI reads its version from `packages/cli/package.json` at build time; commit the rebuilt
`plugin/scripts/holyclaude.js` together with the version change.

## Third-party material

`plugin/skills/frontend-design` is vendored byte-identical, with its `LICENSE.txt` (Apache-2.0), from [anthropics/skills](https://github.com/anthropics/skills), path `skills/frontend-design`, at commit `dbd4588f9e1033efb41dad4bef2f7947c8993d44`. The same skill is in [anthropics/claude-code](https://github.com/anthropics/claude-code) at `plugins/frontend-design/skills/frontend-design`: that repository's HEAD at verification on 2026-10-15 was `94506ff0d3bd9185f1752da36e968775021fb48f`, and the skill there matches the vendored copy. The directory is excluded from formatting so it stays byte-identical. [docs/DECISIONS.md](docs/DECISIONS.md) records why.
