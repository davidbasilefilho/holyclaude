---
name: assignments
description: Use when you are about to create, launch, finish, accept, follow up on or reconcile an Assignment, or to change the Intent. Gives the exact `holyclaude` CLI command, flags and stdin shape for each step of the protocol, in launch order.
---

# Assignments through the CLI

The `holyclaude` CLI is the interface to Intent and Assignment state, and it keeps the state file consistent for you. Output is TOON, which is compact and readable as it is. Structured input is JSON on stdin, and `holyclaude <command> --help` prints a command's stdin shape. Input with an unknown field is rejected and the error names the field, so a rejection tells you exactly what to adjust; read its message and hint, fix the input, and rerun.

Read-only commands are open to every agent: `holyclaude intent show`, `holyclaude assignment show <id>`, `holyclaude assignment list [--state Ready|Running|Succeeded|Failed|Cancelled]`, `holyclaude assignment verify <id>`, `holyclaude routes` and `holyclaude reconcile`. The commands that change state are yours as the root, and workers leave them to you.

## 1. Intent

- `holyclaude routes` lists the 18 presets with mutability, capabilities, independence rule, model and effort.
- `holyclaude intent show` prints the active Intent and its revision. Read it before the first dispatch and before follow-up work.
- `holyclaude intent create` takes `{"objective": "...", "requirements": "..."}` on stdin and starts at revision 1. `requirements` is optional text.
- `holyclaude intent update` takes any of `{"id", "objective", "requirements"}`. Add `--material` when the change alters requirements, user-visible behavior, architecture, trust boundaries, security, persistent contracts, dependencies, toolchain, deployment or ownership, or invalidates accepted work; `--material` bumps the revision. A routine clarification leaves the revision where it is, so omit the flag.
- A `StaleRevision` error means the Intent moved. Run `holyclaude intent show`, reassess the work at the live revision, then continue.

## 2. Create

```
holyclaude assignment create <<'JSON'
{
  "intent_id": "intent-0001",
  "intent_revision": 1,
  "role": "Worker.implementation",
  "objective": "…",
  "scope": ["…"],
  "constraints": ["…"],
  "acceptance_criteria": ["…"],
  "required_evidence": ["checks-run", "changed-paths", "diff-file"],
  "mutability": "ScopedWrite",
  "metadata": {
    "ownership_paths": ["src/feature"],
    "symbols": [],
    "domains": [],
    "dependencies": [],
    "related_assignments": [],
    "independent_from": []
  }
}
JSON
```

The reply prints the new `id` in state Ready with the `subagent_type`, `model`, `effort` and `rev`. `metadata` and each of its lists are optional. Mutability is `ReadOnly` or `ScopedWrite`, and it stays within the preset's own (a reviewer is dispatched as ReadOnly). The CLI checks that:
- `intent_revision` equals the live revision, and acceptance criteria and required-evidence labels are non-empty with no blank label;
- a ScopedWrite Assignment names at least one ownership path. Paths are relative and portable: each segment is non-empty, and the path avoids absolute forms, `..`, `.`, a trailing dot or space, control characters and any of `:*?"<>|`. `\` becomes `/` and comparison ignores case. Two paths overlap when equal or when one is a directory prefix of the other. Worker.operations names its specific paths, and a dependency install owns the root package.json, the lockfile and node_modules;
- a writer's paths do not overlap a Running writer; dispatch is refused with `OwnershipConflict`, so serialize those Assignments yourself;
- every dependency is Succeeded, accepted, in the same Intent and accepted at the same revision;
- a review Assignment lists the work it must be independent from in `independent_from`.

Writers keep the reviewers' needs in mind: add `diff-file` to a writer's required evidence and ask it to save `git diff` of its change to a file in the session temp area outside the repository and to list the path. The review Assignment then names that diff file, the changed paths and the base, because reviewers read files and have no shell. Librarian.research has no file access, so paste any CLAUDE.md or AGENTS.md rules it needs into its Assignment.

## 3. Select

`holyclaude select <id>` prints `action: spawn` or `action: reuse` (with `agent_id` and `reason`), plus `subagent_type`, `model` and `effort`. Reuse candidates are idle workers of the same preset whose last Assignment is terminal, with an unchanged roster fingerprint and, for review work, a history independent of the work under review. It prefers retained context (a related Assignment, overlapping paths, shared symbols or domains), then the smallest id.

## 4. Reserve

`holyclaude assignment reserve <id>` revalidates the revision, live state and ownership right now, moves the Assignment Ready to Running, and prints the dispatch parameters. Spawn after it succeeds. Its optional `--capabilities` and `--root <dir>` default to the preset's capabilities and the project root.

## 5. Spawn or resume

- Spawn with the Agent tool: `subagent_type` from the reply (`holyclaude:<Role.task>`), the `model` and `effort` printed, `run_in_background: true`, and a prompt that carries the Assignment id, objective, scope, constraints, ownership paths, acceptance criteria and required-evidence labels, with the task specifics last.
- For a reuse, call SendMessage to the `agent_id` from `select` with the new Assignment's text. A reuse is a follow-up and is its own Assignment.

## 6. Bind or roll back

- `holyclaude assignment bind <id> --agent <agentId>` records the agent id from the spawn result and attaches the worker to the Running Assignment. When you escalated with a per-call override, add `--model haiku|sonnet|opus|fable` and `--effort low..max` with the values you passed, so `verify` expects them. `--fingerprint` defaults to the live roster, so omit it.
- If the spawn or resume failed, `holyclaude assignment rollback <id>` returns the unbound reservation to Ready. Fix the cause or report the blocker. A bound Assignment moves on by finish.
- `holyclaude assignment verify <id>` compares expected and observed model, effort and agent type. The verdict is `match`, `mismatch` (exit code 3) or `incomplete`, and the PreToolUse hook supplies the observations once the worker makes tool calls. A mismatch is a failed dispatch to redo with the right model and effort.

Run steps 3 to 6 for every ready independent Assignment in one message, then end the turn.

## 7. Finish from the notification

When a completion notification arrives, run `holyclaude assignment finish <id> --outcome <outcome>` with `{"result": "<the worker's report>"}` on stdin:
- `success` when the report states success and `failure` when it states failure;
- `errored`, `interrupted` or `stopped` when the notification says so, and these record failure.

Finish takes a non-empty result, and finishing again with different content is rejected. A finished worker keeps its ownership paths until its notification has been observed. Finish records that the worker is done; acceptance is your next step.

## 8. Accept

After you have judged the evidence, `holyclaude assignment accept <id>` takes on stdin:

```
{
  "intent_revision": 1,
  "rationale": "…",
  "criteria_evidence": { "<each acceptance criterion, verbatim>": "<what supports it>" },
  "required_evidence": { "<each required-evidence label>": "<what supports it>" }
}
```

Both maps cover exactly the declared labels, each with non-blank support, and the revision equals the Assignment's and the live one. Only a Succeeded Assignment can be accepted. The CLI checks coverage and you judge truth, so write the rationale from the evidence you reviewed. An `InsufficientEvidence` error lists the missing and unknown labels.

## 9. Follow up

`holyclaude assignment follow-up <id>` takes the same JSON as create and makes a new Assignment that continues the terminal predecessor `<id>`, with its own criteria, evidence labels and revision. Then run select, reserve, spawn or resume, and bind again. Acceptance is per Assignment.

## 10. Cancel and stop

Running workers finish on their own. If the user stops one, wait for the stopped notification, then run `holyclaude assignment cancel <id> [--reason <text>]`; the ownership paths stay reserved until then. When the user changes the Intent while workers run, let them finish and revalidate their work at the new revision.

## 11. Reconcile after a restart

A resumed or compacted session loses pending notifications. `holyclaude reconcile` lists Running rows. Confirm each worker's state by its agent id, then run `holyclaude reconcile resolve <id> --fail "<reason>"` when there is evidence the worker stopped, or `holyclaude reconcile resolve <id> --keep` to leave it reserved. Choose exactly one of the two flags.
