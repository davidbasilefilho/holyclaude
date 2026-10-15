# holyclaude

## What is holyclaude?

A Claude Code plugin that turns one long session into a managed team.

- **An Opus root that plans and decides.** It turns your request into an Intent with Assignments, then delegates the edits, runs, checks, review and research to 18 pinned Haiku and Sonnet specialists.
- **Independent review before anything merges.** Work that changes code, artifacts or behavior is reviewed by a specialist with no history on it, and work is accepted on evidence, not on a worker's say-so.
- **Model routing that keeps cost down.** Routine work runs on Haiku and Sonnet at each specialist's own effort, and a hook refuses forks and built-in agent types, which would bypass the pinned models.
- **State in git.** Intents and Assignments are plain files in `.holyclaude/`, committed with the work, so progress survives sessions, lost machines and fresh clones.

## Why holyclaude?

Each choice below is recorded in the repository; [docs/DECISIONS.md](docs/DECISIONS.md) keeps the standing decisions with their reasons.

- **A root that decides and specialists that work.** The root holds the user relationship, the plan and the acceptance, and delegates edits, runs, checks, review and research. Its context stays on decisions, and the work is split into Assignments that each end in a report with evidence.
- **Cost and model routing.** The 18 specialists are pinned to Haiku or Sonnet, each with its own effort, so routine work does not run on the root's Opus model. That is why the [defaults](#good-defaults) turn off fork mode and deny the built-in agent types, and why `holyclaude assignment verify` checks the model and effort a worker actually ran on against what was dispatched.
- **Independent review.** A re-review goes to a different reviewer than the one who found the problem.
- **The root owns the repository's history.** Specialists leave commits, pushes and pull requests to the root, and a guard hook refuses their git writes. It is a guardrail for well-meaning workers rather than a sandbox (see [hooks](docs/hooks.md) and [limits](docs/limits.md)).
- **State that survives.** Intents and Assignments are committed with the work, so a team or several clones share them ([why](docs/DECISIONS.md#holyclaude-state-is-versioned-in-git)).
- **Compact instructions.** The generated instructions stay short because every token is read on every turn, and the root asks the user only about choices that are theirs ([compact instructions](docs/DECISIONS.md#compact-generated-instructions-no-plan-feature), [grill-me](docs/DECISIONS.md#grill-me-only-for-material-choices)).
- **No MCP server and no `bin/`.** The plugin reaches its state through a command line tool it ships, and it ships no `bin/` directory so that it installs everywhere ([why](docs/DECISIONS.md#no-bin-in-the-plugin)).

## How does it work?

### Requirements

- Claude Code 2.1.293 or later.
- [Bun](https://bun.sh) on `PATH`, as a real `bun` executable that Claude Code can start without a
  shell. Without it the hooks do not start and the `holyclaude` command prints a one-line error; see
  [hooks](docs/hooks.md#without-bun).

### Install and quick start

Try it straight from a clone, without installing:

```sh
claude --plugin-dir <path-to-clone>/plugin
```

The plugin's `settings.json` sets `agent` to `holyclaude`, so a local session starts with the root
agent, as observed; a [cloud session](docs/cloud-sessions.md) did not. Check `/agents` for the `holyclaude:` specialists, and run
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
`claude plugin validate <path-to-clone>`. If the plugin does not load, or its `agent` setting does not take effect, see [the `.claude/` fallback](docs/claude-fallback.md).

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

- `"autoCompactWindow": 450000` (or `CLAUDE_CODE_AUTO_COMPACT_WINDOW=450000`): compacts the root and every specialist at 450,000 tokens.
- `"promptCacheTtl": "1h"`: keeps the root cached on API-key setups, where the default is five minutes; it carries a higher cache-write cost.
- `"env": { "CLAUDE_CODE_FORK_SUBAGENT": "0" }` and `"permissions": { "deny": ["Agent(fork)", "Agent(general-purpose)", "Agent(Explore)", "Agent(Plan)"] }`: a backstop to the `PreToolUse` hook, which already refuses these calls when the root is holyclaude. Forks inherit the Opus model and built-in agent types ignore the pinned specialists. Keep the deny entries out of sessions that use other agents.
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
