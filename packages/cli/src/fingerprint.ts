import { join } from "node:path"
import { Effect } from "effect"

/** The plugin name agents are addressed under: `holyclaude:<Role.task>`. */
export const PLUGIN_NAME = "holyclaude"

/** Plugin root candidates: the exported variable, the bundle's parent, the repository's plugin. */
const rootCandidates = (): ReadonlyArray<string> => [
  ...(process.env["CLAUDE_PLUGIN_ROOT"] ? [process.env["CLAUDE_PLUGIN_ROOT"]] : []),
  join(import.meta.dir, ".."),
  join(import.meta.dir, "..", "..", "..", "plugin"),
]

/** The first plugin root that holds an `agents` directory, if any. */
export const pluginRoot = Effect.gen(function* () {
  for (const root of rootCandidates()) {
    const found = yield* Effect.tryPromise(() =>
      Array.fromAsync(new Bun.Glob("*.md").scan({ cwd: join(root, "agents") })),
    ).pipe(Effect.orElseSucceed(() => [] as string[]))
    if (found.length > 0) return root
  }
  return undefined
})

/**
 * The fingerprint of the roster under a plugin root: a digest of every agent file. It changes when
 * a preset's prompt, model, effort or tools change, which is when a worker can no longer be reused.
 * Without a root there is nothing to digest, so the result is unique to each call: a constant would
 * make every unknown roster look unchanged and let a worker be reused across them.
 */
export const rosterFingerprintAt = (root: string | undefined) =>
  Effect.gen(function* () {
    if (root === undefined) return `roster:unknown:${crypto.randomUUID()}`
    const names = yield* Effect.tryPromise(() =>
      Array.fromAsync(new Bun.Glob("*.md").scan({ cwd: join(root, "agents") })),
    ).pipe(Effect.orElseSucceed(() => [] as string[]))
    const hasher = new Bun.CryptoHasher("sha256")
    for (const name of names.toSorted()) {
      const text = yield* Effect.tryPromise(() => Bun.file(join(root, "agents", name)).text()).pipe(
        Effect.orElseSucceed(() => ""),
      )
      hasher.update(`${name}\n${text}\n`)
    }
    return `roster:${hasher.digest("hex").slice(0, 16)}`
  })

/** The fingerprint of the installed roster and tools, found through {@link pluginRoot}. */
export const rosterFingerprint = pluginRoot.pipe(Effect.flatMap(rosterFingerprintAt))
