# The `.claude/` fallback

If the plugin does not load, or its `agent` setting does not take effect, the same pieces can live in
`.claude/` for plain Claude Code. This route must not rely on the plugin's own SessionStart hook:

- the holyclaude root agent file in `~/.claude/agents/` or `.claude/agents/`;
- the user-level `settings.json` setting `agent` to it;
- the specialists and skills in `.claude/agents` and `.claude/skills`;
- the CLI on `PATH` through `bun link` in `packages/cli`, with
  `"${CLAUDE_PLUGIN_ROOT}/scripts/holyclaude"` in the copied agents and skills replaced by
  `holyclaude`, because Claude Code substitutes that variable only in a plugin's own files;
- the hooks in user or project settings.

If the main thread stays on the default agent even so, a SessionStart hook in user or project
settings could inject the root rules, and the root's restraint would depend on its instructions
alone.
