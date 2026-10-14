import { describe, expect, test } from "bun:test"

import { scanScript, type Simple } from "./shell.ts"

const commandsOf = (source: string): ReadonlyArray<Simple> => {
  const scan = scanScript(source)
  if (!scan.ok) throw new Error(scan.reason)
  return scan.commands
}
const lines = (source: string) =>
  commandsOf(source).map((simple) => simple.words.map((w) => w.text))

describe("arithmetic is not a heredoc", () => {
  test("a command after $((...)) on the next line is still scanned", () => {
    expect(lines("x=$((1<<2))\ngit commit -m foo")).toContainEqual(["git", "commit", "-m", "foo"])
  })

  test("a command after a (( )) command on the next line is still scanned", () => {
    expect(lines("(( x = 1 << 3 ))\ngit push")).toContainEqual(["git", "push"])
  })

  test("a real heredoc still hides its body", () => {
    expect(lines("cat <<'EOF'\ngit push\nEOF\ngit status")).toEqual([["cat"], ["git", "status"]])
    expect(lines("cat <<EOF\ngit push\nEOF")).toEqual([["cat"]])
  })

  test("a substitution inside arithmetic is still scanned", () => {
    expect(lines("echo $(( $(git push) + 1 ))")).toContainEqual(["git", "push"])
  })
})

describe("globs and brace lists make a word dynamic", () => {
  const dynamic = (source: string) => commandsOf(source)[0]?.words.map((word) => word.dynamic)
  test("brace lists, ranges and bracket classes are dynamic", () => {
    expect(dynamic("echo {a,b}")).toEqual([false, true])
    expect(dynamic("echo {1..3}")).toEqual([false, true])
    expect(dynamic("echo x{a,b}y")).toEqual([false, true])
    expect(dynamic("echo [a-z]")).toEqual([false, true])
    expect(dynamic("echo *.ts")).toEqual([false, true])
  })

  test("plain braces and brackets are not", () => {
    expect(dynamic("echo {a}")).toEqual([false, false])
    expect(dynamic("echo [x")).toEqual([false, false])
    expect(dynamic("echo {a b,c}")).toEqual([false, false, false])
  })
})

describe("scanning is linear in the length of the command", () => {
  const SIZE = 200_000
  const shapes: ReadonlyArray<readonly [string, string]> = [
    ["one long word", `echo ${"a".repeat(SIZE)}`],
    ["many short words", `echo ${"a ".repeat(SIZE / 2)}`],
    ["a run of open braces", `echo ${"{".repeat(SIZE)}`],
    ["a run of open brackets", `echo ${"[".repeat(SIZE)}`],
    ["many brace words", `echo ${"{a,b} ".repeat(SIZE / 6)}`],
    ["many lines", "git log -1\n".repeat(SIZE / 11)],
    ["a run of redirections", `echo ${">".repeat(SIZE)}`],
  ]
  for (const [name, source] of shapes) {
    test(`${name} is scanned in under a second`, () => {
      const started = performance.now()
      scanScript(source)
      expect(performance.now() - started).toBeLessThan(1000)
    })
  }
})

describe("text scanned again on its own is nested a bounded depth", () => {
  /**
   * `depth` heredocs whose bodies each open a substitution that holds the next, ending in `git
   * push`.
   */
  const chain = (depth: number) =>
    `${Array.from({ length: depth }, (_, level) => `cat <<H${level}\n$(`).join("")}git push`

  test("a chain up to the limit is followed to its innermost command", () => {
    expect(lines(chain(3))).toContainEqual(["git", "push"])
  })

  test("a deeper chain fails the scan instead of rescanning the script at every level", () => {
    const scan = scanScript(chain(4))
    expect(scan.ok).toBe(false)
    expect(scan.ok ? "" : scan.reason).toContain("nested too deeply")
  })

  test("a chain of 1000 levels over 300 000 lines is refused in well under a second", () => {
    const started = performance.now()
    expect(scanScript(`${chain(1000)}${"\n".repeat(300_000)}`).ok).toBe(false)
    expect(performance.now() - started).toBeLessThan(1000)
  })
})
