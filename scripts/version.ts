import { Data, Effect } from "effect"

/** The positions a bump can advance. */
export type BumpKind = "minor" | "patch" | "hotfix"

/** A version `0.<minor>.<patch>` with an optional `-<hotfix>` suffix. The major is always 0. */
export interface Version {
  readonly minor: number
  readonly patch: number
  readonly hotfix?: number
}

/** A string is not a `0.X.Y` or `0.X.Y-Z` version. */
export class InvalidVersion extends Data.TaggedError("InvalidVersion")<{
  readonly input: string
}> {
  override get message() {
    return `Invalid version ${JSON.stringify(this.input)}; expected 0.X.Y or 0.X.Y-Z without leading zeros`
  }
}

const NUMBER = String.raw`(0|[1-9]\d*)`
const VERSION = new RegExp(String.raw`^0\.${NUMBER}\.${NUMBER}(?:-([1-9]\d*))?$`)

/** Parses `0.X.Y` or `0.X.Y-Z`, failing with InvalidVersion on anything else. */
export const parseVersion = (input: string): Effect.Effect<Version, InvalidVersion> => {
  const [, minor, patch, hotfix] = VERSION.exec(input) ?? []
  return minor === undefined || patch === undefined
    ? Effect.fail(new InvalidVersion({ input }))
    : Effect.succeed({
        minor: Number(minor),
        patch: Number(patch),
        ...(hotfix === undefined ? {} : { hotfix: Number(hotfix) }),
      })
}

/** Renders a version as `0.X.Y`, with `-Z` when it has a hotfix. */
export const formatVersion = ({ minor, patch, hotfix }: Version): string =>
  `0.${minor}.${patch}${hotfix === undefined ? "" : `-${hotfix}`}`

/**
 * Advances one position and resets the later ones: minor clears patch and hotfix, patch clears
 * hotfix.
 */
export const bumpVersion = (version: Version, kind: BumpKind): Version => {
  switch (kind) {
    case "minor":
      return { minor: version.minor + 1, patch: 0 }
    case "patch":
      return { minor: version.minor, patch: version.patch + 1 }
    case "hotfix":
      return { minor: version.minor, patch: version.patch, hotfix: (version.hotfix ?? 0) + 1 }
  }
}
