---
name: merge-ready-code
description: Use when you write code for an Assignment or judge whether written code and its tests are mergeable; the code-writing and code-reviewing specialists preload it. Holds the quality bar and the proportional testing rules that writers aim at and reviewers hold them to.
---

# Merge-ready code

## The bar

Code is merge-ready when the repository's maintainer would merge it. Four parts are required, and a blocker in any one fails the whole change: behavioral correctness, regression safety, build and style cleanliness, and the project's conventions.

Beyond them:

- simple, elegant code and the smallest complete change; small stays complete, and line count alone is no evidence of quality;
- good performance, self-documenting semantic names, and comments that explain why;
- reuse of existing abstractions, without duplication or speculative abstraction;
- dependencies only where they earn their place;
- tasteful separation into directories, files and symbols, between needless fragmentation and giant files built up by accumulation;
- a diff free of formatting churn and generated-file noise, so every changed line is one the change calls for.

Accidental complexity is a finding. A maintainability concern stays open after tests pass.

## Tests in proportion

- Where a regression check applies, every behavior change or bug fix gets a test that asserts the previously failing behavior: it fails on the base and passes after the change. A test that would pass without the change proves nothing and is a blocker; the finding states what behavior the test must assert.
- Where the repository has no runnable test seam, a report saying so and why is enough, which keeps the change free of invented test infrastructure.
- Good tests assert observable public behavior, a contract or a failure mode, not incidental counts, internal paths, call order, wording or one implementation strategy.
- Tests stay honest: fix the code rather than weaken, delete or tailor a test, and derive values from the behavior instead of hard-coding them to satisfy one. Weakened, deleted or tailored tests and hard-coded values are blockers. A test that is itself wrong goes to the root in the report.
- Before reporting done, a writer runs the project's real checks (tests, type-check, build, lint) that exercise the change, and names any check not run. Tests beyond the regression tests above stay out of the change.

## Findings

A reviewer reports each blocker with the affected behavior, the path and symbol, and the evidence, and lists optional style feedback separately, marked optional. A failure already on the base is a baseline, not a regression.
