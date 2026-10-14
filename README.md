# holyclaude

holyclaude is a Claude Code plugin that turns the main thread into a root agent. The root
plans work as an Intent with Assignments, dispatches pinned Haiku and Sonnet specialists,
judges their reports, and accepts work on evidence. State lives in the project's
`.holyclaude/` directory and is reached through the `holyclaude` command line tool that the
plugin ships. There is no MCP server.

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
the version string changes. The bump tasks refuse to run when the six disagree.

## Third-party material

`plugin/skills/frontend-design` is vendored verbatim, with its `LICENSE.txt` (Apache-2.0), from
[anthropics/skills](https://github.com/anthropics/skills), path `skills/frontend-design`, at commit
`dbd4588f9e1033efb41dad4bef2f7947c8993d44`. It is excluded from formatting so it stays byte-identical.
