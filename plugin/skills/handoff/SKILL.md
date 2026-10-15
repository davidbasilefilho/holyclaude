---
name: handoff
description: Use when the current holyclaude work must be resumed in another session or exported for someone else. Writes one compact Markdown handoff in the host temporary directory with the Intent and Assignment status, evidence, blockers, remaining risk and the exact next action, and returns its path.
---

# Handoff

The CLI state stays authoritative; the handoff is a readable projection of it for a reader who has none of this conversation.

1. Gather state with the CLI, `"${CLAUDE_PLUGIN_ROOT}/scripts/holyclaude"` (not on `PATH`), and read-only git: its `intent list`, `intent show`, `assignment list`, `reconcile`, and `assignment show <id>` where a result matters. `intent show` and `assignment list` act on the Intent in use, so when several are open, pick the one being handed off with `--intent <id>`, and name the other open Intents in the handoff. Note the branch, the latest commit and anything uncommitted, including records under `.holyclaude/`, which are part of the state and travel with the branch.
2. Write one compact Markdown file. Include: the Intent (objective, requirements, revision); each Assignment with role, status, ownership paths and whether it is accepted; the evidence that backs acceptance, by label; open blockers and questions for the user; remaining risk; and the exact next action. Keep it to facts a reader needs: secrets, raw prompts, transcripts and narration stay out.
3. Write the file in the host temporary directory without hard-coded paths. Resolve the directory from the environment, for example `dir="$(mktemp -d "${TMPDIR:-${TMP:-${TEMP:-/tmp}}}/holyclaude-handoff.XXXXXX")"`, then write `handoff.md` there with a Bash heredoc. This one file is the only thing this skill writes, and it lives outside the project.
4. Check that the file has enough context for a cold start: a new session reading only it can name the objective, the state of each Assignment and the next action.
5. Return the file's path in a Markdown code block and say which environment variable named the directory. Let the user decide how to use it. Leave starting a new thread to the user.
