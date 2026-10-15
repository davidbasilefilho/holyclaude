# Contributing rules

These rules apply to everyone and every agent working on this codebase.

- Use Effect for effects and errors. Model failures as tagged errors. Do not write try/catch, handwritten Promise orchestration or manual validation. Call `Effect.runPromise` only at integration boundaries.
- Use Effect Schema (`import { Schema } from "effect"`) at every data boundary. Decode first with `onExcessProperty: "error"`, then validate domain rules.
- Prefer Bun APIs over Node equivalents; where Bun has none (path handling, rename, mkdir, readdir, lstat, stat, exclusive open, append, rm, hostname), use `node:` and keep `scripts/architecture.test.ts` in step.
- Use the Bun Shell `$` from "bun" wherever a process would be spawned. Do not use spawn, spawnSync or child_process.
- Add no tool that overlaps Bun's own or the chosen toolchain: no Jest, Vitest, Zod, extra bundler or extra linter. The toolchain is Bun, oxlint with oxlint-tsgolint, oxfmt and TypeScript.
- Write JSDoc on every exported or public function, type, type alias and interface.
- Skill descriptions state the situation first, then what the skill does.
- Change this file only with the user's permission.
- Done means the three gates pass: `bun run fmt:readonly`, `bun run lint:readonly` and `bun run typecheck`.
