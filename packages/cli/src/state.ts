import { loadState, stateDirPath } from "@holyclaude/core"
import { Effect } from "effect"

/** Reads the project state for a command. A file that does not read as state fails as CorruptRecord. */
export const loadStateFile = Effect.suspend(() => loadState(stateDirPath()))
