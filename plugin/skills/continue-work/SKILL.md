---
name: continue-work
description: Use when the user asks to continue earlier holyclaude work that has unresolved Assignments, after a resume, a compaction or a new session. Restores the Intent, ownership, constraints and latest evidence from CLI state and the repository, then resumes the unfinished authorized work as the same Intent.
---

# Continue work

Treat the continuation as the same Intent, and start a new one only when the user changes the requirements.

1. Run `"${CLAUDE_PLUGIN_ROOT}/scripts/holyclaude" reconcile` first; the `holyclaude` commands below run through the same path, since `holyclaude` is not on `PATH`. A session that was resumed or compacted has lost its pending notifications, so state may hold Running rows with no live worker, and the list tells you which rows to confirm. Rows under `running_elsewhere` belong to another clone of the project and are not yours to settle.
2. Restore the rest of the state. Run `holyclaude intent show` for the objective, requirements and live revision, `holyclaude assignment list` for every Assignment and its status, and `holyclaude assignment show <id>` for the criteria, evidence labels, ownership paths, constraints and results of any Assignment that matters. Read the repository's current state with read-only git commands, or have a worker check it, so changes the CLI does not know about come to light.
3. Settle each Running row by evidence. Confirm the worker's state by its agent id, for example by resuming it with SendMessage or reading its transcript, then record what you found. Run `holyclaude reconcile resolve <id> --fail "<reason>"` when you have evidence it stopped, and `holyclaude reconcile resolve <id> --keep` when it may still be running or you have no evidence either way. An exited parent session is not evidence that a worker stopped, so an active Assignment stays reserved until the evidence says otherwise.
4. Resume the unresolved authorized work. Keep accepted results and verified evidence, and leave unrelated changes as they are. Reuse completed work unless a specific evidence gap or a later mutation made that evidence stale. Where the Intent revision moved since an Assignment was accepted, revalidate with a bounded validation Assignment instead of re-accepting.
5. Continue through the normal launch order: create, select, reserve, spawn, bind. The `assignments` skill has the commands.

If the objective, ownership or constraints cannot be recovered from state and the repository, ask the user one focused question so the work rests on what the user wants.
