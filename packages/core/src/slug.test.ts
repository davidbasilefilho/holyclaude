import { describe, expect, test } from "bun:test"

import { slugOf } from "./slug.ts"

describe("slugOf", () => {
  test("lower-cases and joins words with single hyphens", () => {
    expect(slugOf("Share State  Between_Clones")).toBe("share-state-between-clones")
  })

  test("folds accents to ASCII, Portuguese included", () => {
    expect(slugOf("Ação de revisão: configuração rápida")).toBe(
      "acao-de-revisao-configuracao-rapida",
    )
    expect(slugOf("Crème brûlée à l'été")).toBe("creme-brulee-a-l-ete")
  })

  test("turns every run of other characters into one hyphen and trims the ends", () => {
    expect(slugOf('  --(fix) the "bug"!!  ')).toBe("fix-the-bug")
    expect(slugOf("a / b \\ c")).toBe("a-b-c")
  })

  test("keeps digits", () => {
    expect(slugOf("Release 0.2.0 on 2026-01-02")).toBe("release-0-2-0-on-2026-01-02")
  })

  test("is empty when nothing is a letter or digit", () => {
    for (const text of ["", "   ", "---", "...", "日本語", "🙂!?"]) expect(slugOf(text)).toBe("")
  })

  test("never holds a separator, a dot or a leading or trailing hyphen", () => {
    for (const text of [
      "../../etc/passwd",
      "..",
      "a/../b",
      "C:\\Windows\\System32",
      ".hidden",
      "x.",
    ]) {
      const slug = slugOf(text)
      expect(slug).toMatch(/^(?:[a-z0-9]+(?:-[a-z0-9]+)*)?$/)
    }
    expect(slugOf("../../etc/passwd")).toBe("etc-passwd")
  })

  test("is cut at a word boundary within 40 characters", () => {
    const slug = slugOf(
      "Make every record name tell a reviewer what the record is about at a glance",
    )
    expect(slug).toBe("make-every-record-name-tell-a-reviewer")
    expect(slug.length).toBeLessThanOrEqual(40)
  })

  test("keeps a text that is exactly 40 characters whole", () => {
    const text = `${"a".repeat(19)} ${"b".repeat(20)}`
    expect(text).toHaveLength(40)
    expect(slugOf(text)).toBe(`${"a".repeat(19)}-${"b".repeat(20)}`)
  })

  test("cuts a single word longer than 40 characters", () => {
    expect(slugOf("x".repeat(500))).toBe("x".repeat(40))
    expect(slugOf(`${"x".repeat(45)} tail`)).toBe("x".repeat(40))
  })

  test("folds the letters that Unicode does not decompose, in both cases", () => {
    expect(slugOf("Ørsted łódź Straße Ærø")).toBe("orsted-lodz-strasse-aero")
    expect(slugOf("Đorđe Œuvre Þór")).toBe("dorde-oeuvre-thor")
    expect(slugOf("ØŁẞÆĐŒÞ")).toBe("olssaedoeth")
    expect(slugOf("Işık Ħal İstanbul")).toBe("isik-hal-istanbul")
  })

  test("reads only the start of a very long text, whatever it holds", () => {
    const long = `${"word ".repeat(100)}${"x".repeat(1_000_000)}`
    expect(slugOf(long)).toBe(slugOf(long.slice(0, 512)))
    expect(slugOf(`${" ".repeat(600)}late words`)).toBe("")
  })
})
