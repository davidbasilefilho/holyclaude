import { describe, expect, test } from "bun:test"
import { join } from "node:path"

const root = join(import.meta.dir, "..")

const readJson = async (file: string) => Bun.file(join(root, file)).json()

describe("bun.lock", () => {
  test("every workspace version equals the version in that workspace's package.json", async () => {
    // Bun rewrites the lockfile on install but never on a manifest edit, so a version bump that
    // misses the lockfile leaves it stale until the next install.
    const lock = Bun.JSONC.parse(await Bun.file(join(root, "bun.lock")).text()) as {
      workspaces: Record<string, { name: string; version?: string }>
    }
    const versioned = Object.entries(lock.workspaces).filter(
      ([, { version }]) => version !== undefined,
    )
    expect(versioned.length).toBeGreaterThan(0)
    for (const [path, entry] of versioned) {
      const manifest = await readJson(join(path, "package.json"))
      expect({ path, name: entry.name, version: entry.version }).toEqual({
        path,
        name: manifest.name,
        version: manifest.version,
      })
    }
  })
})
