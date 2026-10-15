# Development

How to build, check and release holyclaude. The [README](../README.md#development) has the short version.

## Tasks

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
