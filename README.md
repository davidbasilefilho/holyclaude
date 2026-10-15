# holyclaude

## What is holyclaude?

A Claude Code plugin where you describe the work and an Opus root plans it, hands it to cheaper Haiku and Sonnet specialists, reviews what comes back, and brings you pull requests that are ready to merge.

The plan and its progress live in git, so the work carries on across sessions and machines.

## Why holyclaude?

- **Long sessions stay cheap.** Opus only plans, decides and accepts, while the 18 specialists run on Haiku or Sonnet at pinned effort. Prompt caching and [compaction](#good-defaults) keep long sessions affordable, and `holyclaude assignment verify` proves each worker ran on the model you paid for.
- **PRs that are ready to merge.** Every change is reviewed by a specialist with no history on it, and CI is watched on the exact head commit. A PR counts as merge-ready only when the review has no open blockers and the CI gate passed, and repairs get narrow re-reviews so review loops close.
- **Quality you can check.** Code goes through `/code-review` plus a reviewer, security-sensitive changes get a security review, fixes come with regression tests, and reports carry evidence instead of claims.
- **Work that survives.** Intents and Assignments live in git, so work outlasts compaction, restarts and new sessions, and collaborators and clones share it.
- **Your history stays yours.** Specialists cannot commit, push or merge (a guard hook refuses their git writes; see [limits](docs/limits.md)). The root owns the history, and merging waits for your approval.

The design reasons are in [docs/DECISIONS.md](docs/DECISIONS.md).

## How does it work?

### Requirements

- Claude Code 2.1.293 or later.
- [Bun](https://bun.sh) on `PATH`, as a real `bun` executable that Claude Code can start without a
  shell. Without it the hooks do not start and the `holyclaude` command prints a one-line error; see
  [hooks](docs/hooks.md#without-bun).

### Install and quick start

Install it from the marketplace, in a session:

```text
/plugin marketplace add davidbasilefilho/holyclaude
/plugin install holyclaude@holyclaude
```

or from a shell: `claude plugin marketplace add davidbasilefilho/holyclaude` and `claude plugin install holyclaude@holyclaude`.

The plugin's `settings.json` sets `agent` to `holyclaude`, so a local session starts with the root
agent, as observed; a [cloud session](docs/cloud-sessions.md) did not. Check `/agents` for the `holyclaude:` specialists. If the plugin does not load, or its `agent` setting does not take effect, see [the `.claude/` fallback](docs/claude-fallback.md). To try it from a clone without installing, see [Run from a clone](docs/development.md#run-from-a-clone).

Then describe a task. The root plans it as an Intent with Assignments, dispatches specialists, and accepts their work on evidence.

### Core concepts

- **Root.** The Opus main-thread agent. It plans, dispatches, judges reports, accepts work and performs git and `gh` writes itself.
- **Intent and Assignments.** An Intent is the goal with its requirements; Assignments are the bounded pieces of work dispatched to specialists, each ending in a report with evidence.
- **Specialists.** Eighteen pinned Haiku and Sonnet agents: explorers, librarians, workers and reviewers, each with its own model and effort. They leave git writes to the root.
- **State.** One JSON file per record in `.holyclaude/`, reached through the `holyclaude` command line tool the plugin ships. See [state](docs/state.md) for the layout, clones, collaborators and migration.
- **Hooks.** Five hooks guard specialists' shell and file writes, check the root's dispatches, record what ran and inject the core rules and state summary at session start. See [hooks](docs/hooks.md), including Windows and no-Bun notes.
- **Skills.** Eight: `assignments`, `continue-work`, `grill-me` and `handoff` serve the root. The specialists preload the rest through their `skills` frontmatter: `specialist-conduct` (every specialist), `merge-ready-code` (the code writers, Reviewer.code and Reviewer.testing), and `interface-inspection` with the vendored `frontend-design` (Worker.visual and Reviewer.visual). `/code-review` is Claude Code's built-in skill, which review Assignments call; it is neither vendored nor wrapped.

More: [state](docs/state.md), [hooks](docs/hooks.md), [settings](docs/settings.md), [cloud sessions](docs/cloud-sessions.md), [limits](docs/limits.md), [decisions](docs/DECISIONS.md).

### Good defaults

A plugin's `settings.json` honors only `agent` and `subagentStatusLine`, and a hook cannot change the session's environment or settings, so these are yours to set in the scope where you run the root. The reasons and the compaction mechanism are in [settings](docs/settings.md).

If you want these defaults, paste this prompt into Claude Code after installing the plugin.

```text
Read https://raw.githubusercontent.com/davidbasilefilho/holyclaude/main/README.md and apply its "Good defaults" section to my Claude Code environment. Put each setting in the settings scope where I run the holyclaude root, keep the permission deny entries out of settings that other agents use, skip managed-only keys unless I manage this organization, and show me every change before you write it.
```

- `"autoCompactWindow": 450000` (or `CLAUDE_CODE_AUTO_COMPACT_WINDOW=450000`): compacts the root and every specialist at 450,000 tokens.
- `"promptCacheTtl": "1h"`: keeps the root cached on API-key setups, where the default is five minutes; it carries a higher cache-write cost.
- `"env": { "CLAUDE_CODE_FORK_SUBAGENT": "0" }` and `"permissions": { "deny": ["Agent(fork)", "Agent(general-purpose)", "Agent(Explore)", "Agent(Plan)"] }`: a backstop to the `PreToolUse` hook, which already refuses these calls when the root is holyclaude. Forks inherit the Opus model and built-in agent types ignore the pinned specialists. Keep the deny entries out of sessions that use other agents. The built-in `/code-review` skill still started a general-purpose subagent in a test with `Agent(general-purpose)` denied; see [settings](docs/settings.md).
- `"permissions": { "allow": ["Bash(gh pr view *)", "Bash(gh run list *)", "Bash(gh run view *)"] }` (optional): lets the root watch CI with read-only `gh` commands without a prompt.
- `"deniedModels": ["fable"]` in managed settings (optional): blocks Fable-class models; the key is managed-only.
- Leave `CLAUDE_CODE_EFFORT_LEVEL` unset, because it overrides every specialist's pinned effort, and `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` unset, because it forces one model on every subagent and would block Sonnet.

## Development

Tasks live in `mise.toml`, which pins Bun. Run them with `mise run <task>`; the root `bun run` scripts call the matching task.

```sh
bun install
mise run fmt:readonly && mise run lint:readonly && mise run typecheck && mise run test
mise run build   # rebuilds plugin/scripts/holyclaude.js after core or cli changes
```

The task table, the version rules (`0.X.Y-Z`, six version files that stay identical) and the vendored `frontend-design` sources are in [docs/development.md](docs/development.md).

## Special thanks!

- The [Claude Code](https://github.com/anthropics/claude-code) team, for the plugin system that holyclaude is built on.
- The [T3](https://github.com/pingdotgg/t3code) team: T3 Code works great with holyclaude.
- The [oh-my-opencode](https://github.com/code-yeongyu/oh-my-opencode) team, for the work that came before.
- The [OpenCode](https://github.com/anomalyco/opencode) team, for their open-source agent.
- [HolyCodex](https://github.com/davidbasilefilho/holycodex), the Codex plugin that holyclaude was adapted from.

## License

holyclaude is licensed under Apache-2.0. See [LICENSE](LICENSE).
