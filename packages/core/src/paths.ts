import { isAbsolute, relative, resolve } from "node:path"
import { Effect } from "effect"
import { InvalidPath } from "./errors.ts"

const FORBIDDEN_CHARACTERS = /[:*?"<>|]/
const CONTROL_CHARACTERS = /\p{Cc}/u

const segmentProblem = (segment: string): string | undefined => {
  if (segment === "") return "empty segment"
  if (segment === "." || segment === "..") return `"${segment}" segment`
  if (segment.endsWith(".") || segment.endsWith(" ")) return "trailing dot or space"
  if (CONTROL_CHARACTERS.test(segment)) return "control character"
  if (FORBIDDEN_CHARACTERS.test(segment)) return 'one of : * ? " < > |'
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
 * path are resolved against the same base. The rules in {@link normalizePath} already forbid
 * escapes, so this guards against a rule regression.
 */
export const isInsideRoots = (
  path: string,
  roots: ReadonlyArray<string>,
  base: string,
): boolean => {
  const target = resolve(base, path)
  return roots.some((root) => {
    const inside = relative(resolve(base, root), target)
    return inside !== ".." && !inside.startsWith("../") && !isAbsolute(inside)
  })
}
