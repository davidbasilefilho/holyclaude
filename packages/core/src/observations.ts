import { Effect } from "effect"

import { OBSERVATIONS_ROTATE_BYTES } from "./codec.ts"
import { moveFile } from "./files.ts"
import { io } from "./io.ts"
import { observationsFile, previousObservationsFile } from "./layout.ts"
import { withStateLock } from "./lock.ts"
import { refuseSymlinks } from "./safety.ts"

/**
 * Keeps the observations log bounded. Once the log has outgrown {@link OBSERVATIONS_ROTATE_BYTES},
 * it replaces its previous generation under the state lock, so the next append starts a new log and
 * the newest records are never the ones dropped. The size is checked again under the lock, so two
 * appenders that both found the log full rotate it once. An appender that opened the log before the
 * rename finishes its write in the previous generation, which readers still read. Nothing is moved
 * through a symbolic link. Call it before each append.
 */
export const rotateObservations = (directory: string) => {
  const current = observationsFile(directory)
  const previous = previousObservationsFile(directory)
  // A missing file has size 0.
  const full = io(current, async () => Bun.file(current).size > OBSERVATIONS_ROTATE_BYTES)
  return refuseSymlinks(directory, current).pipe(
    Effect.andThen(refuseSymlinks(directory, previous)),
    Effect.andThen(full),
    Effect.flatMap((outgrown) =>
      outgrown
        ? withStateLock(directory, (lock) =>
            full.pipe(
              Effect.flatMap((still) => (still ? moveFile(current, previous, lock) : Effect.void)),
            ),
          )
        : Effect.void,
    ),
  )
}
