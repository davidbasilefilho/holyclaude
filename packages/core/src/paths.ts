import { isAbsolute, relative, resolve, sep } from "node:path"
import { Effect } from "effect"
import { InvalidPath } from "./errors.ts"

const FORBIDDEN_CHARACTERS = /[:*?"<>|]/
const CONTROL_CHARACTERS = /\p{Cc}/u

// Windows resolves these to devices whatever the case, the extension or the spaces before it
// ("NUL.txt" and "NUL .txt" are still NUL). COM and LPT also take the superscript digits Microsoft
// lists as reserved.
const RESERVED_DEVICE_NAME =
  /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³]|conin\$|conout\$) *(?:\..*)?$/i

const segmentProblem = (segment: string): string | undefined => {
  if (segment === "") return "empty segment"
  if (segment === "." || segment === "..") return `"${segment}" segment`
  if (segment.endsWith(".") || segment.endsWith(" ")) return "trailing dot or space"
  if (CONTROL_CHARACTERS.test(segment)) return "control character"
  if (FORBIDDEN_CHARACTERS.test(segment)) return 'one of : * ? " < > |'
  if (RESERVED_DEVICE_NAME.test(segment)) return "Windows reserved device name"
  return undefined
}

/**
 * Turns an ownership path into its portable form: `\` becomes `/`, and anything that is absolute,
 * empty, `.` or contains an unsafe segment is rejected. Case is preserved; comparison goes through
 * {@link pathsOverlap}.
 */
export const normalizePath = (raw: string) => {
  const path = raw.replaceAll("\\", "/")
  const problem = path.startsWith("/")
    ? "absolute path"
    : path
        .split("/")
        .map(segmentProblem)
        .find((found) => found !== undefined)
  return problem === undefined
    ? Effect.succeed(path)
    : Effect.fail(new InvalidPath({ path: raw, reason: problem }))
}

/** Normalizes every path and drops case-insensitive duplicates, keeping the first spelling. */
export const normalizePaths = (raw: ReadonlyArray<string>) =>
  Effect.forEach(raw, normalizePath).pipe(
    Effect.map((paths) =>
      paths.filter(
        (path, index) =>
          paths.findIndex((other) => other.toLowerCase() === path.toLowerCase()) === index,
      ),
    ),
  )

/** Two normalized paths overlap when they are equal ignoring case or one is a directory prefix. */
export const pathsOverlap = (a: string, b: string): boolean => {
  const left = a.toLowerCase()
  const right = b.toLowerCase()
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`)
}

/** True when any path of one list overlaps any path of the other. */
export const anyOverlap = (a: ReadonlyArray<string>, b: ReadonlyArray<string>): boolean =>
  a.some((left) => b.some((right) => pathsOverlap(left, right)))

/**
 * Lexical containment check of a normalized path against the writable roots. Relative roots and the
 * path are resolved against the same base. {@link normalizePath} only keeps a path from escaping the
 * project, so this is what keeps it inside the writable roots.
 */
export const isInsideRoots = (
  path: string,
  roots: ReadonlyArray<string>,
  base: string,
): boolean => {
  const target = resolve(base, path)
  return roots.some((root) => {
    const inside = relative(resolve(base, root), target)
    // `relative` joins with the platform separator (a backslash on Windows), so test the first
    // segment rather than a "../" prefix. A path on another drive comes back absolute.
    return inside.split(sep)[0] !== ".." && !isAbsolute(inside)
  })
}
