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

Copied specialists are named by their own `name:` (for example `worker-implementation`), without the
plugin's `holyclaude:` prefix. The root's dispatch check, the hooks' recording of specialists and
`assignment verify` all key on `holyclaude:<name>`, so they do not match copied specialists, and this
route cannot reproduce those checks.

If the main thread stays on the default agent even so, a SessionStart hook in user or project
settings could inject the root rules, and the root's restraint would depend on its instructions
alone.
