# Settings

A plugin's `settings.json` honors only `agent` and `subagentStatusLine`, and a hook cannot change the session's environment or settings, so the settings below are yours to set. The [README](../README.md#good-defaults) lists them in short; this page gives the reasons and the compaction mechanism.

Put each entry in the settings file for the scope where you run the holyclaude root. The `permissions.deny` entries apply to sessions that run the holyclaude root, so keep them out of the settings of sessions that use other agents.

Managed-only keys apply in any session, cloud or local. Documented: Claude Code reads `deniedModels` and `availableModelsMatch` only from managed settings (2.1.283 or later), so a committed `.claude/settings.json` or user settings does not apply them. Server-managed settings need Claude for Teams or Enterprise and are set by an Owner or Primary Owner.

| Setting                                                                                                 | Why                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `"autoCompactWindow": 450000` or `CLAUDE_CODE_AUTO_COMPACT_WINDOW=450000`                               | A recommended default: compacts the root and every specialist at 450,000 tokens. The plugin does not set it. See [the compaction threshold](#the-450k-compaction-threshold).                                                                                                                                                                                  |
| `"env": { "CLAUDE_CODE_FORK_SUBAGENT": "0" }`                                                           | Turns off fork mode. A fork inherits the root's Opus model, which would bypass the pinned Haiku and Sonnet specialists. A backstop: the `PreToolUse` hook already refuses a fork when the root is holyclaude.                                                                                                                                                 |
| `"permissions": { "deny": ["Agent(fork)", "Agent(general-purpose)", "Agent(Explore)", "Agent(Plan)"] }` | Forks inherit the Opus model, and the built-in agent types ignore the pinned specialists, so denying them keeps every dispatch on a holyclaude specialist. A backstop: the `PreToolUse` hook already refuses these calls when the root is holyclaude.                                                                                                         |
| `"permissions": { "allow": ["Bash(gh pr view *)", "Bash(gh run list *)", "Bash(gh run view *)"] }`      | The root watches CI through Monitor with read-only `gh` commands, and Monitor commands pass through Bash permission rules. Allow the read commands you want it to run without a prompt. The watch's `gh api` reads still prompt unless you write a rule you trust, because a prefix rule such as `Bash(gh api *)` also matches write forms (`-X POST`, `-f`). |
| `"deniedModels": ["fable"]` in managed settings (optional)                                              | Blocks Fable-class models so no session or per-call override reaches them. The key is managed-only (see the note above the table). Adjust the entry to the model family you want to block.                                                                                                                                                                    |
| `subagentPromptCacheTtl` left unset                                                                     | The Sonnet specialists, the only workers the root resumes, ask for a one-hour cache in their own frontmatter (`experimental.cacheTtl`), and this setting would override that choice for every subagent, Haiku included.                                                                                                                                       |
| `CLAUDE_CODE_EFFORT_LEVEL` left unset                                                                   | The variable overrides every specialist's pinned effort, so leaving it unset lets each specialist run at its own level.                                                                                                                                                                                                                                       |
| `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` left unset                                                           | It forces one model on every subagent and would block Sonnet.                                                                                                                                                                                                                                                                                                 |

`CLAUDE_CODE_SUBAGENT_MODEL` is not needed: every specialist pins its own model.

The built-in `/code-review` skill, which Reviewer.code uses, starts one general-purpose review subagent
of its own on the reviewer's model. A test run with `Agent(general-purpose)` denied still saw it start,
and how the deny list and that skill interact is not fully verified.

## The 450K compaction threshold

The plugin does not set the window. Set it yourself, in user, project or local settings:

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
- Subagents use the same logic, so one setting compacts the root and every specialist at the same threshold.
- A per-model `modelSettings.<model>.autoCompactWindow` saved by `/autocompact` beats the top-level
  key for that model. Check `/autocompact` if a model compacts at another size.
- Opus 5.5, Sonnet 5.5 and Haiku 5.5 each have a 1M window by default, so 450,000 sets a real,
  earlier threshold for each of them.
- `CLAUDE_CODE_DISABLE_1M_CONTEXT=1` holds those models to 200K. The value is then capped at the
  window and does nothing useful, so leave that variable unset.

This setup has not been observed taking effect in a live session. Watch for the first compaction near
450,000 tokens before relying on it.
