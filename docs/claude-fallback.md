# The `.claude/` fallback

If the plugin does not load, or its `agent` setting does not take effect, the same pieces can live in
`.claude/` for plain Claude Code. This route must not rely on the plugin's own SessionStart hook:

- the holyclaude root agent file in `~/.claude/agents/` or `.claude/agents/`;
- the user-level `settings.json` setting `agent` to it;
- the specialists and skills in `.claude/agents` and `.claude/skills`;
- the CLI on `PATH` through `bun link` in `packages/cli`, with
  `"${CLAUDE_PLUGIN_ROOT}/scripts/holyclaude"` in the copied agents and skills replaced by
  `holyclaude`, because Claude Code substitutes that variable only in a plugin's own files;
- the hooks in user or project settings, with `${CLAUDE_PLUGIN_ROOT}` in each copied command replaced
  by the absolute path of the clone's `plugin/` directory, because that variable is set only for
  plugins. For example, from `plugin/hooks/hooks.json`:

  ```json
  {
    "type": "command",
    "command": "bun",
    "args": [
      "--no-env-file",
      "--config=/abs/clone/plugin/scripts/empty-bunfig.toml",
      "/abs/clone/plugin/scripts/holyclaude.js",
      "hook",
      "pre-tool-use"
    ],
    "timeout": 30
  }
  ```

Copied agents and skills are named by their own `name:` (for example `worker-implementation`),
without the plugin's `holyclaude:` prefix: claude.ai accepts only letters, digits and hyphens in an
agent name, starting and ending with a letter or digit (`scripts/agent-names.test.ts`), and Claude
Code's loader for `.claude/` was not checked for prefixed names. In the copied files, replace each
`holyclaude:` agent or skill reference with the bare name: the root's `tools: Agent(...)`
allowlist and its spawn rule (`holyclaude:<role-task>`), the specialists' `skills:` lists and the
dispatch examples in the `assignments` skill, leaving the `holyclaude:core-rules` and
`holyclaude:writing-bar` comment markers as they are.

The root then dispatches bare names, dropping the prefix from the type that `holyclaude routes`,
`select`, `assignment create` and `assignment reserve` print. The PreToolUse dispatch guard admits
only `holyclaude:` types, so it would refuse those dispatches, and the copied PreToolUse matcher
must drop `Agent`. Without the guard, the root's `tools: Agent(...)` allowlist and its instructions
keep it to its specialists, and the `permissions.deny` entries in [settings](settings.md) back them
up for the built-in types and forks. Because this route skips the recording hooks, which record
only `holyclaude:` agent types anyway (see below), `holyclaude assignment verify` stays
`incomplete` for every copied worker: model and effort stay unverified, and the root should not
wait for the re-check the `assignments` skill asks for after the notification, since it cannot
clear here.

From `plugin/hooks/hooks.json`, copy only the `PreToolUse` entry, with matcher
`Bash|PowerShell|Monitor|Write|Edit|MultiEdit|NotebookEdit`. Skip `SessionStart`, which this route
does not rely on (see the opening paragraph), and `PostToolUse`, `SubagentStart` and
`SubagentStop`, which record only `holyclaude:` specialists.

If the main thread stays on the default agent even so, a SessionStart hook in user or project
settings could inject the root rules, and the root's restraint would depend on its instructions
alone.
