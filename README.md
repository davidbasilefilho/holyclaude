# holyclaude

holyclaude is a Claude Code plugin that turns the main thread into a root agent. The root
plans work as an Intent with Assignments, dispatches pinned Haiku and Sonnet specialists,
judges their reports, and accepts work on evidence. State lives in the project's
`.holyclaude/` directory (see [State](#state)) and is reached through the `holyclaude` command line tool that the
plugin ships. There is no MCP server.

## State

State is kept as one JSON file per record in the project's `.holyclaude/` directory, and the directory is meant to be committed, so a team or several clones of a project share it through version control:

```text
.holyclaude/
  .gitignore                          committed; lists the local files below and an earlier version's
  intents/<intent-id>/intent.json
  intents/<intent-id>/assignments/<assignment-id>.json
  local/                              never committed
    lock, lock.breaking               the write lock and its guard
    workers.json                      the worker list: subagent ids, roster fingerprints, history
    agents.json                       the subagent id of each Assignment, keyed by Assignment id
    clone.json                        this clone's random id
    observations.jsonl                what the hooks saw of running subagents, with transcript paths
  state.json.migrated                 an earlier version's single state file, after migration
```

Two clones that create different records never write the same file, so merging their branches does not conflict. Ids are generated without a counter, as a kind, the creation time in base36 and a short random suffix (`intent-0mg8k2x1a-7f3q`). Among generated ids, plain text order is creation order. The ids of an earlier version (`intent-0001`, with any number of digits) are kept and sort before every generated id, in numeric order. The latest Intent is the last in that order, and `assignment list`, `reconcile` and the session summary use it too.

Each record's id must match its file or directory name; a file that does not is rejected as `CorruptRecord`, which names the file. Writes go through a temporary file and a rename under a local lock, and only the records a command changed are written. A committed record file over 256 KiB is refused. The local files have their own 4 MiB cap instead, because they are never merged and only grow (the agent id of a finished Assignment still feeds `verify`, and a worker's history feeds the independence rule), so their entries cannot be pruned safely.

Nothing under the state directory may be a symbolic link or, on Windows, a junction. A link committed to a repository could send a write, rename, remove or append outside the directory, or make a read return a file that is not state, so these are refused with `SymlinkRefused` before the path is touched: the directory itself, `intents/`, every `intents/<id>/` and `assignments/` folder (checked by name, since a directory glob would skip a link without a word), `local/`, each record file, each local file (`workers.json`, `agents.json`, `clone.json`), the lock file and its guard (before the lock is taken), the `.gitignore`, the observations log (which every specialist tool call and `assignment verify` read, and which is also refused over the 4 MiB local cap), and the old `state.json`, `state.json.migrated` and `state.observations.jsonl` that a migration reads, moves or removes. Reads and writes alike are covered. One read is not: `assignment verify` opens the transcript path that the observations log records, and that file lives outside the state directory, in Claude Code's own session store.

The `.gitignore` in `.holyclaude/` lists exactly these files: `/local/`, `*.tmp`, `/state.json.migrated`, `/state.json`, `/state.json.lock*` and `/state.observations.jsonl`. The first two cover what this version keeps out of the records; the rest are what an earlier version left beside them. So the records are committed and nothing machine-specific is. A subagent id means nothing on another machine, so `agent_id` is never written to a record: it is kept in `local/agents.json` and merged back when the state is read. The same goes for the worker list, the lock owner (process id and host name) and the transcript paths in the observations log.

The records do hold what you and your root write into them: the objective, requirements, scope, constraints, acceptance criteria, results and evidence of an Intent or Assignment are committed as free text. Keep absolute paths, user names and secrets out of them, because the repository may be public.

A record that arrives through a pull or a merge is unauthenticated input from whoever wrote it, like any other committed file. An objective, a constraint or a result is read by your root and by workers as instructions and evidence, so review changes under `.holyclaude/` as you would code before you rely on them.

The worker VCS guard recognizes the state directory by its name: it refuses a specialist's writes to any path that contains `.holyclaude`. A `HOLYCLAUDE_STATE_DIR` outside a folder with that name is therefore not protected from specialists, so keep it under a `.holyclaude` folder.

### Clones and reconcile

Each clone gets a random id in `local/clone.json` on first use. When an Assignment enters Running, the store stamps that id on it as `clone_id`. `holyclaude reconcile` lists the Running rows this clone reserved under `running` (rows without a stamp count as its own), and rows another clone reserved under `running_elsewhere`. It leaves the latter alone, since the other clone's root confirms them; `holyclaude reconcile resolve <id>` still settles one when you name it, while `assignment bind`, `rollback`, `cancel` and `finish` on such a row are refused as `OwnedElsewhere`, naming the clone, since its worker lives in that clone's session. Only this clone's Running writers (and unstamped ones) hold their ownership paths against a local `reserve`; a row another clone reserved does not, because git shows an overlap at merge. Deleting `.holyclaude/local/` gives the clone a new id, so its earlier Running rows then show as running elsewhere.

### Where state lives

The state directory is `$CLAUDE_PROJECT_DIR/.holyclaude`, or `.holyclaude` in the working directory when that variable is unset. `HOLYCLAUDE_STATE_DIR` overrides it with a directory of your choice. It replaces `HOLYCLAUDE_STATE_FILE`, which named the single state file and is no longer read.

### Migrating from the single file

The first time a command that changes state runs against the `.holyclaude/state.json` of an earlier version, the file becomes record files. Legacy ids are kept, agent ids and workers move to the local files, the observations log moves into `local/`, the old file is renamed `state.json.migrated`, and the old lock files (`state.json.lock` and `state.json.lock.breaking`) are deleted last, under the new lock. A `.holyclaude/.gitignore` that holds only the old `*` rule is replaced by the list above before the migration starts, and it already covers the old file, its lock files and its log, so nothing the migration has yet to move can be staged by accident. Any other `.gitignore` there is left as it is, so check that it covers the files in the list. A `state.json.migrated` that is already there is never overwritten: if it holds the same text as `state.json` (a migration that stopped before its last step), `state.json` is simply removed; if it differs, the migration stops with `MigratedFileInTheWay` before writing any record and keeps both files, and you move the old copy away (or delete it) and run the command again. It does not rename to a suffixed name, because such a name would not be covered by the `.gitignore` and could be committed. Record files already on disk, such as a teammate's, are kept; the ones the old file also has must agree with it, or the migration stops with `CorruptRecord`. An observations log already in `local/` gets the old lines in front of it. Read-only commands read an unmigrated file together with the record files. Commit `.holyclaude/` after the first migration. The repository's own `.gitignore` no longer lists `.holyclaude/`.

## Requirements

- Claude Code 2.1.293 or later.
- [Bun](https://bun.sh) on `PATH`. Without it the hooks exit quietly and the CLI prints a one-line
  error.

## Install and test in plain Claude Code

Try it straight from a clone, without installing:

```sh
claude --plugin-dir <path-to-clone>/plugin
```

The plugin's `settings.json` sets `agent` to `holyclaude`, so the session starts with the root
agent. Check `/agents` for the `holyclaude:` presets, and run `holyclaude routes` in a shell to see
each preset's model and effort.

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
confirm that the thread runs the `holyclaude` root and that `holyclaude:` presets can be dispatched.

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
- the presets and skills in `.claude/agents` and `.claude/skills`;
- the CLI on `PATH` through `bun link` in `packages/cli`, replacing `bin/`;
- the hooks in user or project settings.

If T3 Code ignores `agent` in user settings too, the main thread stays on the default agent. Then a
SessionStart hook in user or project settings can inject the root rules, and the root's restraint
depends on its instructions alone.

## Settings the plugin cannot ship

A plugin's `settings.json` honors only `agent` and `subagentStatusLine`, so everything below is
yours to set. Put each entry in the settings file for the scope where you run the holyclaude root.
The `permissions.deny` entries apply to sessions that run the holyclaude root, so keep them out of the
settings of sessions that use other agents.

| Setting                                                                                                                    | Why                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `"env": { "CLAUDE_CODE_FORK_SUBAGENT": "0" }`                                                                              | Turns off fork mode. A fork inherits the root's Opus model, which would bypass the pinned Haiku and Sonnet presets.                                                                                      |
| `"permissions": { "deny": ["Agent(fork)", "Agent(general-purpose)", "Agent(Explore)", "Agent(Plan)"] }`                    | Forks inherit the Opus model, and the built-in agent types ignore the pinned presets, so denying them keeps every dispatch on a holyclaude preset.                                                       |
| `"subagentPromptCacheTtl": "1h"`                                                                                           | Keeps resumed workers cached past the five-minute default, at a higher cache-write cost.                                                                                                                 |
| `"promptCacheTtl": "1h"`                                                                                                   | Keeps the root cached on API-key setups, where the default is five minutes. It carries the same higher write cost.                                                                                       |
| `"autoCompactWindow": 450000` or `CLAUDE_CODE_AUTO_COMPACT_WINDOW=450000`                                                  | Compacts the root and every subagent at 450,000 tokens. See below.                                                                                                                                       |
| `"permissions": { "allow": ["Bash(gh pr checks *)", "Bash(gh pr view *)", "Bash(gh run list *)", "Bash(gh run view *)"] }` | The root watches CI through Monitor with read-only `gh` commands, and Monitor commands pass through Bash permission rules. Allow the read commands you want it to run without a prompt.                  |
| `"deniedModels": ["fable"]` in managed settings                                                                            | Blocks Fable-class models so no session or per-call override reaches them. The key is managed-scope only and needs Claude Code 2.1.283 or later. Adjust the entry to the model family you want to block. |
| `CLAUDE_CODE_EFFORT_LEVEL` left unset                                                                                      | The variable overrides every preset's pinned effort, so leaving it unset lets each preset run at its own level.                                                                                          |
| `"env": { "CLAUDE_CODE_SUBAGENT_MODEL": "haiku" }` (optional)                                                              | A fallback default for definitions that lack a model. Leave `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` unset: it forces one model on every subagent and would block Sonnet.                                      |
| T3 Code Queue mode (Settings, General, Follow-up behavior)                                                                 | Messages sent mid-run wait for the turn to finish. Steer interrupts in-flight tools.                                                                                                                     |

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

## Skills

The plugin ships five skills. `assignments`, `continue-work`, `grill-me` and `handoff` serve the root.
`frontend-design` is preloaded by the visual presets. `/code-review` is Claude Code's built-in skill,
which review Assignments call; it is neither vendored nor wrapped.

## Limits

- The worker VCS-write hook is a guardrail for well-meaning workers, not a sandbox. Interpreters,
  scripts and PowerShell script blocks are out of its reach.
- Without Bun on `PATH` the hooks exit silently and the guard is off.
- The hook runs on every tool call and costs about 0.35 to 3.6 seconds per call, varying with load: one run on the Windows machine
  where it was measured gave a median of about 0.35 seconds and another gave 1.6 to 3.6 seconds.
- Installing the plugin makes holyclaude the default main-thread agent for sessions where it is enabled.
- Reviewer.code, Worker.validation and Reviewer.testing hold Bash under an instruction-only
  no-mutation boundary.

## Development

Tasks live in `mise.toml`, which pins Bun. Run them with `mise run <task>`; the root `bun run`
scripts (`fmt`, `fmt:readonly`, `lint`, `lint:readonly`, `typecheck`, `test`) and the CLI package's
`build` script call the matching task.

```sh
bun install
mise run fmt:readonly && mise run lint:readonly && mise run typecheck && mise run test
mise run build   # rebuilds plugin/bin/holyclaude.js after core or cli changes
```

| Task                                      | What it does                                                         |
| ----------------------------------------- | -------------------------------------------------------------------- |
| `fmt`, `fmt:readonly`                     | Format in place, or check formatting                                 |
| `lint`, `lint:readonly`                   | Lint with fixes, or lint without them                                |
| `typecheck`                               | Type-check the repository                                            |
| `test`                                    | Run the test suite                                                   |
| `build`                                   | Bundle the CLI into `plugin/bin/holyclaude.js`                       |
| `bump:minor`, `bump:patch`, `bump:hotfix` | Bump the version in all six places and print the old and new version |

Versions follow `0.X.Y-Z`: `X` is the minor, `Y` the patch and `Z` an optional hotfix. A bump
resets the later positions, so from `0.3.2-1` a minor bump gives `0.4.0`, a patch bump gives
`0.3.3` and a hotfix bump gives `0.3.2-2`. The version appears in the root, `packages/cli`,
`packages/core` and `plugin` `package.json` files, in `plugin/.claude-plugin/plugin.json` and in
`.claude-plugin/marketplace.json`, and the six stay identical. Claude Code only sees a plugin update when
the version string changes. The bump tasks refuse to run when the six disagree. After a successful bump they
run `build`, because the CLI reads its version from `packages/cli/package.json` at build time; commit the
rebuilt `plugin/bin/holyclaude.js` together with the version change.

## Third-party material

`plugin/skills/frontend-design` is vendored verbatim, with its `LICENSE.txt` (Apache-2.0), from
[anthropics/skills](https://github.com/anthropics/skills), path `skills/frontend-design`, at commit
`dbd4588f9e1033efb41dad4bef2f7947c8993d44`. It is excluded from formatting so it stays byte-identical.
