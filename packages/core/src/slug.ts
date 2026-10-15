/** Longest slug, in characters: a safe file name, not a limit on the objective itself. */
const SLUG_LENGTH = 40

/**
 * How much of the text is read, in code units. A slug of 40 characters needs only the first words,
 * and an objective is unbounded, so the rest is never normalized.
 */
const SLUG_SOURCE_LENGTH = 512

/** Letters that Unicode does not decompose into a base letter and a mark, as lower-case. */
const FOLDED: Readonly<Record<string, string>> = {
  ø: "o",
  ł: "l",
  ß: "ss",
  æ: "ae",
  đ: "d",
  œ: "oe",
  þ: "th",
  ı: "i",
  ħ: "h",
}

/**
 * A name for a record built from its objective, so a reviewer can tell from a path what the record
 * is about. Lower-case ASCII letters and digits joined by single hyphens: accents fold to their
 * base letter (`ação` is `acao`, `ø` is `o`, `ı` is `i`, `ß` is `ss`), every other run of
 * characters is a separator, and the result is cut at a word boundary within 40 characters (a
 * single longer word is cut mid-word). It holds no path separator and no dot, and is empty when the
 * text has no letter or digit to fold. Only the first 512 code units of the text are read.
 */
export const slugOf = (text: string): string => {
  const words = text
    .slice(0, SLUG_SOURCE_LENGTH)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[øłßæđœþıħ]/g, (letter) => FOLDED[letter] ?? letter)
    .split(/[^a-z0-9]+/)
    .filter((word) => word !== "")
  let slug = ""
  for (const word of words) {
    const next = slug === "" ? word : `${slug}-${word}`
    if (next.length > SLUG_LENGTH) break
    slug = next
  }
  return slug === "" ? (words[0] ?? "").slice(0, SLUG_LENGTH) : slug
}
