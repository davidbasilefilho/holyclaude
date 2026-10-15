import { join } from "node:path"

import { decodeJsonStrict, decodeStrict } from "@holyclaude/core"
import { Console, Data, Effect, Schema } from "effect"

import { bumpVersion, formatVersion, parseVersion, type InvalidVersion } from "./version.ts"

/** A version file or the lockfile could not be read, decoded or written. */
export class ManifestError extends Data.TaggedError("ManifestError")<{
  readonly file: string
  readonly cause: unknown
}> {
  override get message() {
    return `${this.file}: ${this.cause instanceof Error ? this.cause.message : String(this.cause)}`
  }
}

/** The version files do not all carry the same version, so there is no single version to bump. */
export class VersionMismatch extends Data.TaggedError("VersionMismatch")<{
  readonly versions: ReadonlyArray<{ readonly file: string; readonly version: string }>
}> {
  override get message() {
    const listed = this.versions.map(({ file, version }) => `${file} ${version}`).join(", ")
    return `Versions disagree: ${listed}`
  }
}

/** The command line arguments are not `<minor|patch|hotfix> [root]`. */
export class Usage extends Data.TaggedError("Usage")<{ readonly kind: string | undefined }> {
  override get message() {
    return `Expected minor, patch or hotfix and an optional root directory; got ${this.kind ?? "nothing"}`
  }
}

// These files carry many fields this program does not own, and a strict decode of a struct that
// names only the version would reject them as excess. So each file is first decoded as a record of
// unknown values, which has no excess properties and keeps every field in its order for the write.
// The version is then decoded from that record with a struct whose open rest is explicit.
const Manifest = Schema.Record(Schema.String, Schema.Unknown)
type Manifest = typeof Manifest.Type

const Versioned = Schema.StructWithRest(Schema.Struct({ version: Schema.String }), [Manifest])
const Marketplace = Schema.StructWithRest(
  Schema.Struct({ plugins: Schema.NonEmptyArray(Manifest) }),
  [Manifest],
)

interface Location {
  readonly file: string
  readonly read: (manifest: Manifest) => Effect.Effect<string, Schema.SchemaError>
  readonly write: (
    manifest: Manifest,
    version: string,
  ) => Effect.Effect<Manifest, Schema.SchemaError>
}

const topLevel = (file: string): Location => ({
  file,
  read: (manifest) => decodeStrict(Versioned)(manifest).pipe(Effect.map(({ version }) => version)),
  write: (manifest, version) => Effect.succeed({ ...manifest, version }),
})

const marketplace: Location = {
  file: ".claude-plugin/marketplace.json",
  read: (manifest) =>
    decodeStrict(Marketplace)(manifest).pipe(
      Effect.flatMap(({ plugins }) => decodeStrict(Versioned)(plugins[0])),
      Effect.map(({ version }) => version),
    ),
  write: (manifest, version) =>
    decodeStrict(Marketplace)(manifest).pipe(
      Effect.map(({ plugins: [first, ...rest] }) => ({
        ...manifest,
        plugins: [{ ...first, version }, ...rest],
      })),
    ),
}

/** The six files whose versions must stay identical, relative to the repository root. */
const LOCATIONS: ReadonlyArray<Location> = [
  topLevel("package.json"),
  topLevel("packages/cli/package.json"),
  topLevel("packages/core/package.json"),
  topLevel("plugin/package.json"),
  topLevel("plugin/.claude-plugin/plugin.json"),
  marketplace,
]

/** The lockfile of a Bun workspace repository, relative to the repository root. */
const LOCKFILE = "bun.lock"

// bun.lock is JSONC that Bun rewrites on install, so the version of each workspace is replaced in
// place and every other byte stays. A workspace entry is the only place a "name" line is directly
// followed by a "version" line; the root workspace carries no version and the package entries are
// arrays.
const WORKSPACE_VERSION = /("name": "[^"]+",\n\s+"version": ")[^"]*(")/g

const failWith = (file: string) =>
  Effect.mapError((cause: unknown) => new ManifestError({ file, cause }))

const load = (root: string, location: Location) => {
  const path = join(root, location.file)
  return Effect.gen(function* () {
    const text = yield* Effect.tryPromise(() => Bun.file(path).text())
    const manifest = yield* decodeJsonStrict(Manifest)(text)
    const version = yield* location.read(manifest)
    return { location, path, manifest, version }
  }).pipe(failWith(location.file))
}

const save = (path: string, manifest: Manifest) =>
  Effect.tryPromise(() => Bun.write(path, `${JSON.stringify(manifest, null, 2)}\n`))

const loadLockfile = (root: string) => {
  const path = join(root, LOCKFILE)
  return Effect.tryPromise(() => Bun.file(path).text()).pipe(
    Effect.map((text) => ({ path, text })),
    failWith(LOCKFILE),
  )
}

const lockfileWithVersion = (text: string, version: string) =>
  text.search(WORKSPACE_VERSION) < 0
    ? Effect.fail(new ManifestError({ file: LOCKFILE, cause: "no workspace version found" }))
    : Effect.succeed(
        text.replace(
          WORKSPACE_VERSION,
          (_entry, head: string, tail: string) => `${head}${version}${tail}`,
        ),
      )

const commonVersion = (loaded: ReadonlyArray<{ location: Location; version: string }>) => {
  const [first] = loaded
  return first !== undefined && loaded.every(({ version }) => version === first.version)
    ? Effect.succeed(first.version)
    : Effect.fail(
        new VersionMismatch({
          versions: loaded.map(({ location, version }) => ({ file: location.file, version })),
        }),
      )
}

const BumpKindArgument = Schema.Literals(["minor", "patch", "hotfix"])

/**
 * Reads the six version files and `bun.lock` under `root`, refuses when the six disagree, then
 * writes the bumped version to all six and to every workspace entry of `bun.lock`. Nothing is
 * written unless every file was read and the six agree. Returns the old and new version.
 */
export const bumpVersions = (
  root: string,
  kind: typeof BumpKindArgument.Type,
): Effect.Effect<
  { readonly from: string; readonly to: string },
  ManifestError | VersionMismatch | InvalidVersion
> =>
  Effect.gen(function* () {
    const loaded = yield* Effect.forEach(LOCATIONS, (location) => load(root, location))
    const from = yield* commonVersion(loaded)
    const to = formatVersion(bumpVersion(yield* parseVersion(from), kind))
    const lockfile = yield* loadLockfile(root)
    const lockText = yield* lockfileWithVersion(lockfile.text, to)
    yield* Effect.forEach(loaded, ({ location, path, manifest }) =>
      location.write(manifest, to).pipe(
        Effect.flatMap((updated) => save(path, updated)),
        failWith(location.file),
      ),
    )
    yield* Effect.tryPromise(() => Bun.write(lockfile.path, lockText)).pipe(failWith(LOCKFILE))
    return { from, to }
  })

/**
 * Runs `<minor|patch|hotfix> [root]`: bumps the versions under `root` (the repository root by
 * default), prints `old -> new`, or prints the failure and sets a failing exit code.
 */
export const main = (args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const [argument, root = join(import.meta.dir, "..")] = args
    const kind = yield* decodeStrict(BumpKindArgument)(argument).pipe(
      Effect.mapError(() => new Usage({ kind: argument })),
    )
    const { from, to } = yield* bumpVersions(root, kind)
    yield* Console.log(`${from} -> ${to}`)
  }).pipe(
    Effect.catch((error) =>
      Console.error(`error: ${error._tag}: ${error.message}`).pipe(
        Effect.andThen(
          Effect.sync(() => {
            process.exitCode = 1
          }),
        ),
      ),
    ),
  )

if (import.meta.main) await Effect.runPromise(main(Bun.argv.slice(2)))
