# Development

How to build, check and release holyclaude. The [README](../README.md#development) has the short version.

## Tasks

Tasks live in `mise.toml`, which pins Bun. Run them with `bun run <script>`: every mise task has a root
script of the same name that calls `mise run <task>`, and the CLI package's `build` script does the same.

```sh
mise trust
mise install
bun install
bun run --parallel check test
bun run build   # rebuilds plugin/scripts/holyclaude.js after core or cli changes
```

| Task / script                             | What it does                                                         |
| ----------------------------------------- | -------------------------------------------------------------------- |
| `fmt`, `fmt:readonly`                     | Format in place, or check formatting                                 |
| `lint`, `lint:readonly`                   | Lint with fixes, or lint without them                                |
| `typecheck`                               | Type-check the repository                                            |
| `check`                                   | Run `lint:readonly`, `fmt:readonly` and `typecheck`, writing nothing |
| `check:fix`                               | Run `lint`, `fmt` and `typecheck`, writing fixes                     |
| `test`                                    | Run the test suite                                                   |
| `build`                                   | Bundle the CLI into `plugin/scripts/holyclaude.js`                   |
| `bump:minor`, `bump:patch`, `bump:hotfix` | Bump the six version files and `bun.lock`, print old and new version |

## Run from a clone

Try the plugin from a checkout without installing it:

```sh
claude --plugin-dir <path-to-clone>/plugin
```

Run `<path-to-clone>/plugin/scripts/holyclaude routes` in a shell to see each specialist's model and effort. `/plugin marketplace add` also accepts a local path to the clone's root, and the same steps work from a shell as `claude plugin marketplace add <path>`. Check a checkout with `claude plugin validate <path-to-clone>/plugin` and `claude plugin validate <path-to-clone>`.

## Versions

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

`plugin/skills/frontend-design` is vendored byte-identical, with its `LICENSE.txt` (Apache-2.0), from [anthropics/skills](https://github.com/anthropics/skills), path `skills/frontend-design`, at commit `dbd4588f9e1033efb41dad4bef2f7947c8993d44`. The same skill is in [anthropics/claude-code](https://github.com/anthropics/claude-code) at `plugins/frontend-design/skills/frontend-design`: that repository's HEAD at verification on 2026-10-15 was `94506ff0d3bd9185f1752da36e968775021fb48f`, and the skill there matches the vendored copy. The directory is excluded from formatting so it stays byte-identical. [docs/DECISIONS.md](DECISIONS.md) records why.
