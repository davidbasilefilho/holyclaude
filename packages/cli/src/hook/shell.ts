/** One shell word after quote removal. `dynamic` marks text the shell computes at run time. */
export interface Word {
  readonly text: string
  readonly dynamic: boolean
}

/** One simple command: its words and the targets of its output redirections. */
export interface Simple {
  readonly words: ReadonlyArray<Word>
  readonly outputs: ReadonlyArray<string>
}

/** Every simple command found in a script, nested substitutions included, or why scanning failed. */
export type Scan =
  | { readonly ok: true; readonly commands: ReadonlyArray<Simple> }
  | { readonly ok: false; readonly reason: string }

interface Heredoc {
  readonly delimiter: string
  readonly strip: boolean
  readonly expand: boolean
}

const WORD_END = /[\s;&|()<>]/
const ANSI_ESCAPES: Readonly<Record<string, string>> = {
  n: "\n",
  t: "\t",
  r: "\r",
  a: "\u0007",
  b: "\b",
  e: "\u001b",
  f: "\f",
  v: "\v",
  "\\": "\\",
  "'": "'",
  '"': '"',
}

const decodeAnsi = (body: string): string =>
  body.replace(/\\(x[0-9a-fA-F]{1,2}|u[0-9a-fA-F]{1,4}|[0-7]{1,3}|.)/g, (_, code: string) =>
    code.length > 1 && code[0] === "x"
      ? String.fromCharCode(Number.parseInt(code.slice(1), 16))
      : code.length > 1 && code[0] === "u"
        ? String.fromCharCode(Number.parseInt(code.slice(1), 16))
        : /^[0-7]+$/.test(code)
          ? String.fromCharCode(Number.parseInt(code, 8))
          : (ANSI_ESCAPES[code] ?? `\\${code}`),
  )

/** Finds the `)` closing a `$(` that starts at `from`, ignoring quotes; -1 when unbalanced. */
const closingParen = (text: string, from: number): number => {
  let depth = 0
  for (let index = from; index < text.length; index += 1) {
    const char = text[index]
    if (char === "\\") index += 1
    else if (char === "(") depth += 1
    else if (char === ")") {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return -1
}

/** Scans the substitutions inside an unquoted heredoc body, which the shell expands. */
const bodySubstitutions = (body: string): ReadonlyArray<string> => {
  const found: string[] = []
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index]
    if (char === "\\") index += 1
    else if (char === "$" && body[index + 1] === "(") {
      const end = closingParen(body, index + 1)
      if (end === -1) return [...found, body.slice(index + 2)]
      found.push(body.slice(index + 2, end))
      index = end
    } else if (char === "`") {
      const end = body.indexOf("`", index + 1)
      if (end === -1) return [...found, body.slice(index + 1)]
      found.push(body.slice(index + 1, end))
      index = end
    }
  }
  return found
}

/**
 * Splits a shell script into its simple commands. Pipelines, lists, subshells, command and process
 * substitutions, backticks, heredocs and quoting are understood; every simple command found at any
 * nesting depth is returned, so a caller can judge each one. Anything unterminated fails the scan.
 */
export const scanScript = (source: string): Scan => {
  const commands: Simple[] = []
  const pending: Heredoc[] = []
  let failure: string | undefined
  let pos = 0
  // Where the word at `pos` ends and where its last `,`, `..` and `]` are. It is computed once per
  // word, on its first `{` or `[`, so a long word of braces is still read in linear time.
  let look = { end: -1, separator: -1, close: -1 }

  const lookahead = () => {
    if (pos < look.end) return look
    let end = pos
    let separator = -1
    let close = -1
    while (end < source.length && !WORD_END.test(source[end] ?? " ")) {
      if (source[end] === "," || (source[end] === "." && source[end + 1] === ".")) separator = end
      if (source[end] === "]") close = end
      end += 1
    }
    look = { end, separator, close }
    return look
  }

  const fail = (reason: string) => {
    failure ??= reason
  }

  const absorb = (script: string) => {
    const nested = scanScript(script)
    if (nested.ok) commands.push(...nested.commands)
    else fail(nested.reason)
  }

  const consumeHeredocs = () => {
    for (const heredoc of pending.splice(0)) {
      let body = ""
      while (pos < source.length) {
        const end = source.indexOf("\n", pos)
        const line = end === -1 ? source.slice(pos) : source.slice(pos, end)
        pos = end === -1 ? source.length : end + 1
        const compared = heredoc.strip ? line.replace(/^\t+/, "") : line
        if (compared === heredoc.delimiter) break
        body += `${line}\n`
      }
      if (heredoc.expand) for (const script of bodySubstitutions(body)) absorb(script)
    }
  }

  const readHeredocDelimiter = (): Heredoc => {
    const strip = source[pos] === "-"
    if (strip) pos += 1
    while (source[pos] === " " || source[pos] === "\t") pos += 1
    let delimiter = ""
    let expand = true
    while (pos < source.length && !WORD_END.test(source[pos] ?? " ")) {
      const char = source[pos] ?? ""
      if (char === "'" || char === '"') {
        expand = false
        const end = source.indexOf(char, pos + 1)
        if (end === -1) {
          fail("unterminated heredoc delimiter")
          break
        }
        delimiter += source.slice(pos + 1, end)
        pos = end + 1
      } else if (char === "\\") {
        expand = false
        delimiter += source[pos + 1] ?? ""
        pos += 2
      } else {
        delimiter += char
        pos += 1
      }
    }
    return { delimiter, strip, expand }
  }

  const skipBrace = () => {
    let depth = 1
    while (pos < source.length && failure === undefined) {
      const char = source[pos]
      if (char === "\\") pos += 2
      else if (char === "'" || char === '"') {
        const end = source.indexOf(char, pos + 1)
        if (end === -1) return fail("unterminated quote")
        pos = end + 1
      } else if (char === "$" && source[pos + 1] === "(") {
        pos += 2
        list(true)
      } else if (char === "$" && source[pos + 1] === "{") {
        depth += 1
        pos += 2
      } else if (char === "}") {
        depth -= 1
        pos += 1
        if (depth === 0) return
      } else pos += 1
    }
    fail("unterminated parameter expansion")
  }

  /**
   * Scans commands until the end of input or, when `nested`, the `)` that closes a `$(`. Inside
   * arithmetic (`$((`, or a `((` command) `<<` is a shift: read as a heredoc it would swallow the
   * lines that follow.
   */
  const list = (nested: boolean, arithmetic = false): void => {
    let words: Word[] = []
    let outputs: string[] = []
    let current: string | null = null
    let dynamic = false
    let redirect: "out" | "in" | null = null
    let parenDepth = 0
    // Paren depth outside the `((` command being read, or -1 when none is open.
    let arithmeticBase = -1
    let closed = false

    const endWord = () => {
      if (current === null) return
      const text = current
      current = null
      const isDynamic = dynamic
      dynamic = false
      if (redirect === "out") outputs.push(text)
      else if (redirect === null) words.push({ text, dynamic: isDynamic })
      redirect = null
    }
    const endCommand = () => {
      endWord()
      if (words.length > 0 || outputs.length > 0) commands.push({ words, outputs })
      words = []
      outputs = []
      redirect = null
    }
    const append = (text: string, computed = false) => {
      current = (current ?? "") + text
      if (computed) dynamic = true
    }

    const dollar = (quoted: boolean) => {
      const next = source[pos + 1]
      if (next === "(") {
        const shift = source[pos + 2] === "("
        pos += 2
        append("$(...)", true)
        list(true, shift)
      } else if (next === "{") {
        pos += 2
        append("${...}", true)
        skipBrace()
      } else if (next === "'" && !quoted) {
        let end = pos + 2
        while (end < source.length && source[end] !== "'") end += source[end] === "\\" ? 2 : 1
        if (end >= source.length) return fail("unterminated quote")
        append(decodeAnsi(source.slice(pos + 2, end)))
        pos = end + 1
      } else if (next === '"' && !quoted) {
        pos += 1
      } else if (next !== undefined && /[A-Za-z_]/.test(next)) {
        let end = pos + 1
        while (/[A-Za-z0-9_]/.test(source[end] ?? "")) end += 1
        append(source.slice(pos, end), true)
        pos = end
      } else if (next !== undefined && /[0-9@*#?$!-]/.test(next)) {
        append(source.slice(pos, pos + 2), true)
        pos += 2
      } else {
        append("$")
        pos += 1
      }
    }

    const backtick = () => {
      let end = pos + 1
      while (end < source.length && source[end] !== "`") end += source[end] === "\\" ? 2 : 1
      if (end >= source.length) return fail("unterminated backtick")
      absorb(source.slice(pos + 1, end).replace(/\\([`$\\])/g, "$1"))
      append("`...`", true)
      pos = end + 1
    }

    const doubleQuoted = () => {
      pos += 1
      append("")
      while (failure === undefined) {
        const char = source[pos]
        if (char === undefined) return fail("unterminated quote")
        if (char === '"') {
          pos += 1
          return
        }
        if (char === "\\") {
          const next = source[pos + 1]
          if (next !== undefined && '$`"\\\n'.includes(next)) {
            if (next !== "\n") append(next)
            pos += 2
          } else {
            append("\\")
            pos += 1
          }
        } else if (char === "$") dollar(true)
        else if (char === "`") backtick()
        else {
          append(char)
          pos += 1
        }
      }
    }

    const redirection = () => {
      const char = source[pos] ?? ""
      if (current !== null && /^\d+$/.test(current)) {
        current = null
        dynamic = false
      } else endWord()
      if (source[pos + 1] === "(") {
        pos += 2
        append("/dev/fd/0", true)
        list(true)
        endWord()
        return
      }
      if (char === "<" && source.startsWith("<<<", pos)) {
        pos += 3
        redirect = "in"
        return
      }
      if (char === "<" && source.startsWith("<<", pos) && !arithmetic && arithmeticBase === -1) {
        pos += 2
        pending.push(readHeredocDelimiter())
        return
      }
      const operator = /^(>>|>\||>&|<&|<>|>|<)/.exec(source.slice(pos))?.[0] ?? char
      pos += operator.length
      redirect = operator.startsWith(">") || operator === "<>" ? "out" : "in"
    }

    while (pos < source.length && failure === undefined && !closed) {
      const char = source[pos] ?? ""
      if (char === "\\") {
        const next = source[pos + 1]
        if (next !== undefined && next !== "\n") append(next)
        pos += 2
      } else if (char === "'") {
        const end = source.indexOf("'", pos + 1)
        if (end === -1) fail("unterminated quote")
        else {
          append(source.slice(pos + 1, end))
          pos = end + 1
        }
      } else if (char === '"') doubleQuoted()
      else if (char === "$") dollar(false)
      else if (char === "`") backtick()
      else if (char === " " || char === "\t") {
        endWord()
        pos += 1
      } else if (char === "\n") {
        endCommand()
        pos += 1
        if (pending.length > 0) consumeHeredocs()
      } else if (char === "#" && current === null) {
        const end = source.indexOf("\n", pos)
        pos = end === -1 ? source.length : end
      } else if (char === ";" || char === "|") {
        endCommand()
        pos += 1
      } else if (char === "&") {
        endCommand()
        pos += 1
      } else if (char === "<" || char === ">") redirection()
      else if (char === "(") {
        endCommand()
        const open = source[pos + 1] === "(" ? 2 : 1
        if (open === 2 && arithmeticBase === -1) arithmeticBase = parenDepth
        parenDepth += open
        pos += open
      } else if (char === ")") {
        endCommand()
        pos += 1
        if (parenDepth > 0) {
          parenDepth -= 1
          if (parenDepth <= arithmeticBase) arithmeticBase = -1
        } else if (nested) closed = true
      } else {
        const braceList = char === "{" && lookahead().separator > pos
        const bracket = char === "[" && lookahead().close > pos
        append(char, char === "*" || char === "?" || braceList || bracket)
        pos += 1
      }
    }
    if (nested && !closed && failure === undefined) fail("unterminated substitution")
    endCommand()
  }

  list(false)
  if (pending.length > 0) consumeHeredocs()
  return failure === undefined ? { ok: true, commands } : { ok: false, reason: failure }
}
