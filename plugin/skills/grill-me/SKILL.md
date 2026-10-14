---
name: grill-me
description: Use when a decision (a requirement, user-visible behavior, architecture, security, a persistent contract, a dependency, deployment or accepted work) materially changes the result and the repository, the documentation and the user's own words cannot settle it. Settles facts first, asks the user one decision at a time with options and a recommendation, and records each settled decision in the Intent.
---

# Grill me

Interview the user about the decisions only they can make, so the work rests on settled choices instead of guesses. A decision is material when it changes requirements, user-visible behavior, architecture, security, a persistent contract, a dependency, deployment or accepted work. A routine choice is safe, reversible and inside the Assignment, so make it yourself and move on; the interview stays short that way.

## Settle facts first

Before asking, check whether a source already answers the question. Dispatch a specialist through an Assignment to read the repository or the documentation, and reread what the user has said. Ask the user only what no source can answer, since a question the code could have answered costs their attention for nothing.

## Ask one decision at a time

- Order the open decisions so each builds on the earlier answers, and take them in that order. A later question then arrives with its context settled, and an answer that makes a later decision moot spares the user that question.
- Put one decision in each question: the options, what each leads to, and your recommended option with the reason. A recommendation gives the user something concrete to accept or correct.
- Use AskUserQuestion when it is available, with the recommended option first and marked as recommended. Otherwise ask a concise text question.
- Either way, wait for the answer while independent work continues, so the question delays only what depends on it.

## Record each decision

Record each settled decision in the Intent with `holyclaude intent update --material`, passing the revised `objective` or `requirements` as JSON on stdin. `--material` bumps the revision, and reserve refuses a stale one, so reassess the Assignments planned on the old revision against the new one before reserving them. Fold the decision into the existing requirements text, with its reason in a few words, so the Intent stays one readable statement.

## Stop

Stop when the decisions are settled or when the user says to. Then give a short summary of what was decided and continue the work against the new revision.
