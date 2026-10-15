import { describe, expect, test } from "bun:test"
import { isBuiltin } from "node:module"
import { dirname, join, relative, resolve } from "node:path"

// Guards three rules AGENTS.md states in prose: Bun APIs over `node:` unless Bun has none,
// no child processes outside the Bun Shell, and packages/core as the bottom layer.

/**
 * Module, then imported name, then why Bun's own API does not do the job. "*" is a namespace,
 * default or side-effect import.
 */
type Allowlist = Readonly<Record<string, Readonly<Record<string, string>>>>

const sourceAllowlist: Allowlist = {
  "node:path": {
    dirname: "no Bun equivalent: path handling",
    isAbsolute: "no Bun equivalent: path handling",
    join: "no Bun equivalent: path handling",
    relative: "no Bun equivalent: path handling",
    resolve: "no Bun equivalent: path handling",
    sep: "no Bun equivalent: path handling",
  },
  "node:os": {
    hostname: "no Bun equivalent: the lock owner names the machine that holds it",
  },
  "node:fs/promises": {
    appendFile: "no Bun equivalent: append without truncation (Bun.write replaces the file)",
    lstat: "no Bun equivalent: inspect a symlink without following it",
    mkdir: "no Bun equivalent: create a directory tree",
    open: "no Bun equivalent: exclusive create (wx) for the lock file",
    readdir: "no Bun equivalent: list a directory",
    realpath:
      "no Bun equivalent: resolve symbolic links so two spellings of one directory share a worktree key",
    rename: "no Bun equivalent: atomic replace of a written temporary file",
    rm: "no Bun equivalent: remove a file or directory tree",
    stat: "no Bun equivalent: file metadata without reading the file",
  },
}

const fixtureReason = "test fixture: temporary directory tree and files"
const migrateReason =
  "test fixture written before this guard; Bun.file or Bun.write fits, so migrate and drop the entry"

/** Test files add temporary directories, symlink fixtures and fixture I/O to what source may import. */
const testExtras: Allowlist = {
  "node:path": {
    delimiter: "no Bun equivalent: PATH separator for a wrapper fixture",
  },
  "node:module": {
    isBuiltin: "no Bun equivalent: ask whether a bare specifier names a Node builtin",
  },
  "node:os": {
    tmpdir: "no Bun equivalent: temporary directory root for fixtures",
  },
  "node:fs": {
    appendFileSync: fixtureReason,
    copyFileSync: fixtureReason,
    existsSync:
      "no Bun equivalent: synchronous existence check in test assertions, where Bun.file().exists() is async",
    mkdirSync: "no Bun equivalent: create a fixture directory tree",
    mkdtempSync: "no Bun equivalent: unique temporary directory",
    readFileSync: migrateReason,
    readdirSync: "no Bun equivalent: list a directory",
    rmSync: "no Bun equivalent: remove a fixture directory tree",
    symlinkSync: "no Bun equivalent: symlink fixtures for the path-safety tests",
    truncateSync: fixtureReason,
    writeFileSync: migrateReason,
  },
  "node:fs/promises": {
    "*": "spy on the module's exports to inject a rename failure (store.test.ts)",
    cp: fixtureReason,
    mkdtemp: "no Bun equivalent: unique temporary directory",
    readFile: migrateReason,
    symlink: "no Bun equivalent: symlink fixtures for the path-safety tests",
    writeFile: migrateReason,
  },
}

const mergeAllowlists = (base: Allowlist, extra: Allowlist): Allowlist =>
  Object.fromEntries(
    [...new Set([...Object.keys(base), ...Object.keys(extra)])].map((module) => [
      module,
      { ...base[module], ...extra[module] },
    ]),
  )

const testAllowlist = mergeAllowlists(sourceAllowlist, testExtras)

/**
 * Layers packages/core must not depend on: directory prefixes from the repository root, and package
 * names.
 */
const aboveCore = {
  directories: ["packages/cli", "plugin", "scripts"],
  packages: ["@holyclaude/cli", "@holyclaude/plugin"],
}

interface ImportRef {
  readonly specifier: string
  readonly names: readonly string[]
}

interface SourceFile {
  readonly path: string
  readonly text: string
  readonly imports: readonly ImportRef[]
}

const FROM_CLAUSE = /\b(?:import|export)\s+(?:type\s+)?([\w\s{},*$]*?)\s*from\s*["']([^"']+)["']/g
const SIDE_EFFECT_IMPORT = /\bimport\s*["']([^"']+)["']/g
const DYNAMIC_IMPORT = /\b(?:import|require)\s*\(\s*["']([^"']+)["']/g
// `[s]` keeps this file's own pattern text from matching the pattern.
const PROCESS_SPAWN = /(?:\bBun\s*\.\s*[s]pawn|\b[s]pawn(?:Sync)?\s*\()/

// Strings are matched and kept so that "//" inside one (a URL) does not start a comment.
const STRINGS_AND_COMMENTS =
  /("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|\/\/[^\n]*|\/\*[\s\S]*?\*\//g

const withoutComments = (text: string): string =>
  text.replace(STRINGS_AND_COMMENTS, (_match, string: string | undefined) => string ?? " ")

const importedNames = (clause: string): readonly string[] => {
  const braced = /\{([^}]*)\}/.exec(clause)?.[1] ?? ""
  const named = braced
    .split(",")
    .map((entry) =>
      (
        entry
          .trim()
          .replace(/^type\s+/, "")
          .split(/\s+as\s+/)[0] ?? ""
      ).trim(),
    )
    .filter((name) => name !== "")
  const outsideBraces = clause.replace(/\{[^}]*\}/, "").replace(/[,\s]/g, "")
  return outsideBraces === "" ? named : [...named, "*"]
}

/** Every import, re-export and `import()`/`require()` call in `text`, comments ignored. */
const importsOf = (text: string): readonly ImportRef[] => {
  const code = withoutComments(text)
  return [
    ...[...code.matchAll(FROM_CLAUSE)].map((match): ImportRef => ({
      specifier: match[2] ?? "",
      names: importedNames(match[1] ?? ""),
    })),
    ...[...code.matchAll(SIDE_EFFECT_IMPORT), ...code.matchAll(DYNAMIC_IMPORT)].map(
      (match): ImportRef => ({ specifier: match[1] ?? "", names: ["*"] }),
    ),
  ]
}

/**
 * The allowlist key for a Node builtin, with or without the `node:` prefix ("fs/promises" and
 * "node:fs/promises" are one module), or undefined for anything else. Bun answers `isBuiltin` for
 * its own `bun` and `bun:*` modules too, so those are excluded.
 */
const nodeModule = (specifier: string): string | undefined =>
  specifier === "bun" || specifier.startsWith("bun:") || !isBuiltin(specifier)
    ? undefined
    : `node:${specifier.replace(/^node:/, "")}`

const root = join(import.meta.dir, "..")

const transpiler = new Bun.Transpiler({ loader: "ts" })

// The glob matches source extensions only, so the generated plugin/scripts/holyclaude.js bundle is
// never scanned.
const loadTree = async (): Promise<readonly SourceFile[]> => {
  const paths = (
    await Array.fromAsync(
      new Bun.Glob("{packages,scripts,plugin}/**/*.{ts,mts,cts}").scan({ cwd: root }),
    )
  )
    .filter((path) => !path.split("/").includes("node_modules"))
    .toSorted()
  const files: SourceFile[] = []
  for (const path of paths) {
    const text = await Bun.file(join(root, path)).text()
    files.push({ path, text, imports: importsOf(text) })
  }
  return files
}

const tree = await loadTree()

const isTestFile = (path: string) => /\.test\.[mc]?ts$/.test(path)

const isChildProcess = (specifier: string) => nodeModule(specifier) === "node:child_process"

const allowlistViolations = (file: SourceFile): readonly string[] => {
  const allowlist = isTestFile(file.path) ? testAllowlist : sourceAllowlist
  return file.imports.flatMap(({ specifier, names }) => {
    const module = nodeModule(specifier)
    if (module === undefined || isChildProcess(specifier)) return []
    return names
      .filter((name) => !Object.hasOwn(allowlist[module] ?? {}, name))
      .map(
        (name) =>
          `${file.path}: imports ${name} from ${specifier}, which is not on the allowlist. ` +
          `Use the Bun API (Bun.file, Bun.write, Bun.Glob, the Bun Shell). Where Bun has none, ` +
          `add the import with its reason to the allowlist in scripts/architecture.test.ts.`,
      )
  })
}

const fixture = (path: string, ...lines: readonly string[]): SourceFile => {
  const text = lines.join("\n")
  return { path, text, imports: importsOf(text) }
}

describe("architecture", () => {
  test("the scan sees the tree", () => {
    const paths = tree.map((file) => file.path)
    expect(paths).toContain("scripts/architecture.test.ts")
    expect(paths.some((path) => path.startsWith("packages/core/src/"))).toBe(true)
    expect(paths.some((path) => path.startsWith("packages/cli/src/"))).toBe(true)
  })

  test("the parser finds every import the transpiler sees, in every file", () => {
    const missed = tree.flatMap((file) => {
      const parsed = new Set(file.imports.map(({ specifier }) => specifier))
      return transpiler
        .scanImports(file.text)
        .filter(({ path }) => !parsed.has(path))
        .map(({ path }) => `${file.path}: the scan missed the import of ${path}`)
    })
    expect(missed).toEqual([])
    expect(tree.flatMap((file) => file.imports).length).toBeGreaterThan(0)
  })

  test("the parser reads a multi-line import with comments inside the braces", () => {
    const file = fixture(
      "packages/core/src/example.ts",
      "// import { rmSync } from commented-out",
      "import {",
      "  // why this one",
      "  mkdirSync, /* and this */ rmSync as remove,",
      '} from "node:fs"',
    )
    expect(file.imports).toEqual([{ specifier: "node:fs", names: ["mkdirSync", "rmSync"] }])
    expect(allowlistViolations(file)).toHaveLength(2)
  })

  test("a bare builtin specifier is held to the same allowlist as its node: form", () => {
    for (const specifier of ["fs", "fs/promises", "path", "os", "node:fs"]) {
      const file = fixture("packages/core/src/example.ts", `import { x } from "${specifier}"`)
      expect(allowlistViolations(file)).toHaveLength(1)
    }
    const allowed = fixture("packages/core/src/example.ts", `import { join } from "${"path"}"`)
    expect(allowlistViolations(allowed)).toEqual([])
    const bun = fixture("packages/core/src/example.ts", `import { $ } from "${"bun"}"`)
    expect(allowlistViolations(bun)).toEqual([])
  })

  test("node: imports stay on the allowlist, each entry with the reason Bun has no equivalent", () => {
    const violations = tree.flatMap(allowlistViolations)
    expect(violations).toEqual([])
  })

  test("no child processes outside the Bun Shell", () => {
    const violations = tree.flatMap((file) => [
      ...file.imports
        .filter(({ specifier }) => isChildProcess(specifier))
        .map(
          ({ specifier }) =>
            `${file.path}: imports ${specifier}. Run the process with the Bun Shell \`$\` from "bun".`,
        ),
      ...file.imports
        .filter(({ names }) => names.some((name) => name === "spawn" || name === "spawnSync"))
        .map(
          ({ specifier }) =>
            `${file.path}: imports a spawn function from ${specifier}. Run the process with the Bun Shell \`$\` from "bun".`,
        ),
      ...(PROCESS_SPAWN.test(file.text)
        ? [`${file.path}: calls a spawn API. Run the process with the Bun Shell \`$\` from "bun".`]
        : []),
    ])
    expect(violations).toEqual([])
  })

  test("packages/core does not import from packages/cli, plugin or scripts", () => {
    const violations = tree
      .filter((file) => file.path.startsWith("packages/core/"))
      .flatMap((file) =>
        file.imports
          .filter(({ specifier }) => {
            if (specifier.startsWith(".")) {
              const target = relative(root, resolve(root, dirname(file.path), specifier))
              return aboveCore.directories.some(
                (directory) => target === directory || target.startsWith(`${directory}/`),
              )
            }
            return aboveCore.packages.some(
              (name) => specifier === name || specifier.startsWith(`${name}/`),
            )
          })
          .map(
            ({ specifier }) =>
              `${file.path}: imports ${specifier}, a layer above packages/core. ` +
              `Move the shared code into packages/core, or move this code to the layer that owns it.`,
          ),
      )
    expect(violations).toEqual([])
  })
})
