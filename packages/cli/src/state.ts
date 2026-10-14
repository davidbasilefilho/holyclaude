import { Effect } from "effect"
import { loadState, stateFilePath } from "@holyclaude/core"
import { StateCorrupt } from "./errors.ts"

/**
 * Reads the state file for a command. A file that does not decode as State is reported as corrupt,
 * so the hint points at the file and not at the shape of the command's own input.
 */
export const loadStateFile = Effect.suspend(() => {
  const path = stateFilePath()
  return loadState(path).pipe(
    Effect.catchTag("SchemaError", (error) =>
      Effect.fail(new StateCorrupt({ path, detail: error.message })),
    ),
  )
})
