# Standing decisions

Decisions the project keeps across releases, each with its reason. Change one only on the maintainer's say-so.

## Compact generated instructions, no plan feature

The instructions holyclaude generates for the root and the specialists stay compact, because every token is read on every turn. Planning is the Intent and its Assignments; a separate plan feature would duplicate them.

## Grill-me only for material choices

The root asks the user questions only where a choice changes requirements, behavior, architecture, trust or other persistent contracts. Routine choices are made and reported, so the user is interrupted for decisions that are theirs.

## `.holyclaude` state is versioned in git

Intents and Assignments are committed, so a team or several clones share them through version control and a record survives a lost machine. What stays out of version control is listed in [the README's State section](../README.md#state).

## One shared version across packages

Every package and manifest carries the same version, so a single number leaves no question of which package matches which release, and it is the number Claude Code compares to see a plugin update. The version-string rule, the six places and the bump tasks are in [the README's Development section](../README.md#development).

## No `bin/` in the plugin

claude.ai and Cowork refuse to install a plugin that has a `bin/` directory, which is what would put a command on `PATH`. Without one the plugin installs everywhere. [The README](../README.md#on-windows) describes how the `holyclaude` command is reached instead.

## Nothing from audited third-party repositories

holyclaude is public. Code, paths, product names and quotes from any third-party repository that was audited do not go into code, tests, docs, commit messages or any other artifact, because they may be private or not ours to publish. Describe situations generically, such as "a deploy workflow" or "an application repository".

## `frontend-design` is vendored byte-identical

The vendored `frontend-design` skill stays a copy of the upstream skill, so a refresh from upstream replaces the directory cleanly. holyclaude-specific adjustments live in `interface-inspection` and in the visual agents, never in the vendored copy. The [README](../README.md#third-party-material) names the sources, paths and verified commits.
