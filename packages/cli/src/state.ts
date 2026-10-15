import { loadState, loadStored, stateDirPath } from "@holyclaude/core"
import { Effect } from "effect"

/** Reads the project state for a command. A file that does not read as state fails as CorruptRecord. */
export const loadStateFile = Effect.suspend(() => loadState(stateDirPath()))

/** Reads the project state with the file of each record, for a command that prints where they sit. */
export const loadStoredFile = Effect.suspend(() => loadStored(stateDirPath()))
