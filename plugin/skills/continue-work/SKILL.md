---
name: continue-work
description: Use when the user asks to continue earlier holyclaude work that has unresolved Assignments, after a resume, a compaction or a new session. Restores the Intent, ownership, constraints and latest evidence from CLI state and the repository, then resumes the unfinished authorized work.
---

# Continue work

Treat the continuation as the same Intent, and start a new one only when the user changes the requirements.

1. Restore state. Run `holyclaude intent show` for the objective, requirements and live revision, `holyclaude assignment list` for every Assignment and its status, and `holyclaude reconcile` to list Running rows. Add `holyclaude assignment show <id>` for the criteria, evidence labels and results of any Assignment that matters. Have a worker check the repository for changes the CLI does not know about, or use read-only git commands.
2. Settle Running rows by evidence. A session that was resumed or compacted has lost its pending notifications, so a Running row may have no live worker. Confirm each worker's state by its agent id, then fail the row with `holyclaude reconcile resolve <id> --fail "<reason>"` when you have evidence it stopped, or keep it reserved with `--keep`. An exited parent is not evidence that the worker stopped.
3. Resume the unresolved authorized work. Keep accepted results and verified evidence, and leave unrelated changes as they are. Reuse completed work unless a specific evidence gap or a later mutation made that evidence stale. Where the Intent revision moved since an Assignment was accepted, revalidate with a bounded validation Assignment instead of re-accepting.
4. Continue through the normal launch order: create, select, reserve, spawn, bind. The `assignments` skill has the commands.

If the objective, ownership or constraints cannot be recovered from state and the repository, ask the user one focused question so the work rests on what the user wants.
