import { describe, expect, test } from "bun:test"

import { newBudget, overBudget, WORK_LIMIT } from "./launchers.ts"
import { denyReason, denyToolReason } from "./policy.ts"

/** A program a subagent may only read with, as the argument words of a write and of a read. */
interface Program {
  readonly name: string
  readonly write: ReadonlyArray<string>
  readonly read: ReadonlyArray<string>
}

const PROGRAMS: ReadonlyArray<Program> = [
  { name: "git", write: ["commit", "-m", "x"], read: ["status"] },
  { name: "gh", write: ["pr", "create", "--title", "t"], read: ["pr", "view", "12"] },
  { name: "holyclaude", write: ["intent", "create"], read: ["intent", "show"] },
]

const single = (args: ReadonlyArray<string>) => args.map((arg) => `'${arg}'`)

/** The ways a launcher is written around a program and its arguments. */
type Forms = (name: string, args: ReadonlyArray<string>) => ReadonlyArray<string>

const startProcess =
  (cmdlet: string): Forms =>
  (name, args) => [
    `${cmdlet} ${name} -ArgumentList ${single(args).join(",")}`,
    `${cmdlet} -FilePath ${name} -ArgumentList ${single(args).join(", ")}`,
    `${cmdlet} ${name} ${single(args).join(",")}`,
    `${cmdlet} ${name} -ArgumentList "${args.join(" ")}"`,
    `${cmdlet} -NoNewWindow -Wait ${name} -ArgumentList ${args.join(",")} -PassThru`,
  ]

const LAUNCHERS: Readonly<Record<string, Forms>> = {
  "Start-Process": startProcess("Start-Process"),
  saps: startProcess("saps"),
  start: startProcess("start"),
  wsl: (name, args) => [
    `wsl ${name} ${args.join(" ")}`,
    `wsl -e ${name} ${args.join(" ")}`,
    `wsl --exec ${name} ${args.join(" ")}`,
    `wsl -d Ubuntu -u root --cd ~ -- ${name} ${args.join(" ")}`,
    `wsl "${name} ${args.join(" ")}"`,
    `wsl.exe bash -c "${name} ${args.join(" ")}"`,
  ],
  "cmd /c start": (name, args) => [
    `cmd /c start /b ${name} ${args.join(" ")}`,
    `cmd.exe /c start "" /wait ${name} ${args.join(" ")}`,
    `cmd /c start "My window" /min /d C:/repo /b ${name} ${args.join(" ")}`,
  ],
  conhost: (name, args) => [
    `conhost ${name} ${args.join(" ")}`,
    `conhost.exe --headless ${name} ${args.join(" ")}`,
    `conhost --width 80 --height 25 -- ${name} ${args.join(" ")}`,
    `conhost "${name} ${args.join(" ")}"`,
  ],
  wt: (name, args) => [
    `wt ${name} ${args.join(" ")}`,
    `wt.exe -d . ${name} ${args.join(" ")}`,
    `wt new-tab -p Ubuntu ${name} ${args.join(" ")}`,
    `wt nt --title x ${name} ${args.join(" ")}`,
    `wt -w 0 split-pane -H -s 0.5 ${name} ${args.join(" ")}`,
  ],
  "Invoke-Command": (name, args) => [
    `Invoke-Command -ScriptBlock { ${name} ${args.join(" ")} }`,
    `Invoke-Command { ${name} ${args.join(" ")} }`,
    `icm -ComputerName host -ScriptBlock {${name} ${args.join(" ")}} -ArgumentList 1`,
  ],
  "Start-Job": (name, args) => [
    `Start-Job -ScriptBlock { ${name} ${args.join(" ")} }`,
    `Start-Job { ${name} ${args.join(" ")} } | Wait-Job`,
    `sajb -Name x { ${name} ${args.join(" ")} }`,
    `Start-ThreadJob { ${name} ${args.join(" ")} }`,
  ],
}

describe("a launcher is judged as the command it launches", () => {
  for (const [launcher, forms] of Object.entries(LAUNCHERS)) {
    for (const { name, write, read } of PROGRAMS) {
      test(`${launcher} ${name}: a write is denied with the direct command's reason`, () => {
        const direct = denyReason([name, ...write].join(" "))
        expect(direct).toBeDefined()
        for (const form of forms(name, write))
          expect([form, denyReason(form)]).toEqual([form, direct])
      })

      test(`${launcher} ${name}: a read keeps the direct command's verdict`, () => {
        expect(denyReason([name, ...read].join(" "))).toBeUndefined()
        for (const form of forms(name, read))
          expect([form, denyReason(form)]).toEqual([form, undefined])
      })
    }
  }
})

describe("Bash and PowerShell calls get one verdict for every launcher of the same command", () => {
  const judged = (tool: string, command: string) =>
    denyToolReason(tool, { command, file_path: undefined, notebook_path: undefined })

  for (const tool of ["Bash", "PowerShell"]) {
    test(`${tool}: Start-Process and wsl are denied like cmd /c`, () => {
      expect(judged(tool, "cmd /c git commit")).toBeDefined()
      expect(judged(tool, "Start-Process git -ArgumentList 'commit','-m','x'")).toBeDefined()
      expect(judged(tool, "wsl git commit -m x")).toBeDefined()
    })
  }
})

describe("Start-Process", () => {
  test("names and parameters ignore case", () => {
    expect(denyReason("START-PROCESS GIT -ARGUMENTLIST 'COMMIT'")).toBeDefined()
    expect(denyReason("Saps Git.exe -args push")).toBeDefined()
    expect(denyReason("start-process -filepath git -arg commit")).toBeDefined()
    expect(denyReason("Start-Process git -ArgumentList 'log' -WAIT")).toBeUndefined()
  })

  test("the program may be a path with spaces", () => {
    const path = '"C:\\Program Files\\Git\\cmd\\git.exe"'
    expect(denyReason(`Start-Process ${path} -ArgumentList 'commit','-m','x'`)).toBeDefined()
    expect(denyReason(`Start-Process -FilePath ${path} -ArgumentList push`)).toBeDefined()
    expect(denyReason(`Start-Process ${path} -ArgumentList 'status'`)).toBeUndefined()
  })

  test("other parameters do not hide the program or its arguments", () => {
    expect(
      denyReason("Start-Process -WorkingDirectory C:\\repo git -ArgumentList commit"),
    ).toBeDefined()
    expect(denyReason("Start-Process -ErrorAction Stop git -ArgumentList commit")).toBeDefined()
    expect(denyReason("Start-Process -Verb RunAs -FilePath git -ArgumentList push")).toBeDefined()
    expect(denyReason("Start-Process git -ArgumentList push -ErrorAction Stop")).toBeDefined()
    expect(
      denyReason("Start-Process git -ArgumentList 'tag','-l' -NoNewWindow -Wait"),
    ).toBeUndefined()
    expect(denyReason("Start-Process git -ArgumentList 'remote', '-v' -PassThru")).toBeUndefined()
  })

  test("the arguments are read as the command line the program receives", () => {
    expect(denyReason("Start-Process git -ArgumentList 'log','--grep=a b'")).toBeUndefined()
    expect(denyReason("Start-Process git -ArgumentList \"log --format='%H,%s'\"")).toBeUndefined()
    expect(denyReason("Start-Process git -ArgumentList 'branch','-D','x'")).toBeDefined()
    expect(denyReason("Start-Process gh -ArgumentList 'api','repos/o/r','-X','POST'")).toBeDefined()
    expect(denyReason("Start-Process git -ArgumentList '-c','alias.x=!sh','status'")).toBeDefined()
  })

  test("a short flag after the program belongs to the program", () => {
    expect(denyReason("start git -c alias.x=y status")).toBeDefined()
    expect(denyReason("start git -c core.quotepath=false status")).toBeUndefined()
  })

  test("an argument list that cannot be read is denied for a program that needs one", () => {
    expect(denyReason("Start-Process git -ArgumentList $args")).toBeDefined()
    expect(denyReason("Start-Process git -ArgumentList $sub,'-m','x'")).toBeDefined()
    expect(denyReason("Start-Process git -ArgumentList (Get-Args)")).toBeDefined()
    expect(denyReason("Start-Process git -ArgumentList @('commit','-m','x')")).toBeDefined()
    expect(denyReason("Start-Process -FilePath (Get-Command git).Source")).toBeDefined()
    expect(denyReason("Start-Process $exe -ArgumentList 'status'")).toBeDefined()
  })

  test("other programs keep running, with or without computed arguments", () => {
    expect(denyReason("Start-Process notepad")).toBeUndefined()
    expect(denyReason("Start-Process notepad -ArgumentList 'file.txt'")).toBeUndefined()
    expect(denyReason("Start-Process notepad -ArgumentList @('a','b')")).toBeUndefined()
    expect(denyReason("Start-Process notepad -ArgumentList (Join-Path a b)")).toBeUndefined()
    expect(denyReason("Start-Process bun -ArgumentList 'test'")).toBeUndefined()
    expect(denyReason("Start-Process pwsh -ArgumentList '-File','x.ps1'")).toBeUndefined()
    expect(denyReason("Start-Process")).toBeUndefined()
  })

  test("a shell, cmd, wsl or PowerShell it starts is read through", () => {
    expect(denyReason("Start-Process cmd -ArgumentList '/c','git commit -m x'")).toBeDefined()
    expect(denyReason("Start-Process cmd -ArgumentList '/c git push'")).toBeDefined()
    expect(denyReason("Start-Process cmd -ArgumentList '/c git status'")).toBeUndefined()
    expect(denyReason("Start-Process powershell -ArgumentList '-Command','git push'")).toBeDefined()
    expect(denyReason("Start-Process wsl -ArgumentList '-e','git','push'")).toBeDefined()
    expect(denyReason("Start-Process bash -ArgumentList '-c','\"git commit -m x\"'")).toBeDefined()
    expect(
      denyReason("Start-Process bun -ArgumentList 'plugin/bin/holyclaude.js','intent','create'"),
    ).toBeDefined()
  })
})

describe("wsl", () => {
  test("its options are read past", () => {
    expect(denyReason("wsl --distribution Ubuntu --user root git push")).toBeDefined()
    expect(denyReason("wsl -d Ubuntu -- git push")).toBeDefined()
    expect(denyReason("wsl.exe git push")).toBeDefined()
    expect(denyReason("WSL -e git push")).toBeDefined()
    expect(denyReason("wsl -d Ubuntu git log -1")).toBeUndefined()
  })

  test("a shell it runs, or one quoted command line, is read through", () => {
    expect(denyReason("wsl bash -c 'git commit -m x'")).toBeDefined()
    expect(denyReason("wsl -e sh -c 'git push'")).toBeDefined()
    expect(denyReason('wsl "git add . && git push"')).toBeDefined()
    expect(denyReason('wsl "git status && git log -1"')).toBeUndefined()
    expect(denyReason("wsl bash -c 'git status'")).toBeUndefined()
  })

  test("commands that are not git, gh or holyclaude keep running", () => {
    expect(denyReason("wsl ls -la")).toBeUndefined()
    expect(denyReason("wsl --list")).toBeUndefined()
    expect(denyReason("wsl --shutdown")).toBeUndefined()
    expect(denyReason("wsl")).toBeUndefined()
  })

  test("a computed command is denied, as it is without wsl", () => {
    expect(denyReason("wsl $command")).toBeDefined()
  })
})

describe("script blocks", () => {
  test("braces without spaces are read", () => {
    expect(denyReason("Invoke-Command -ScriptBlock {git commit -m x}")).toBeDefined()
    expect(denyReason("Invoke-Command -ScriptBlock {git status}")).toBeUndefined()
  })

  test("what follows the block is not part of it", () => {
    expect(denyReason("Invoke-Command -ScriptBlock { git status } -ArgumentList 1")).toBeUndefined()
    expect(denyReason("Invoke-Command -ScriptBlock { git push } -ArgumentList 1")).toBeDefined()
  })

  test("a launcher inside a block is read through", () => {
    expect(denyReason("Invoke-Command -ScriptBlock { wsl git push }")).toBeDefined()
    expect(denyReason("Invoke-Command -ScriptBlock { cmd /c git push }")).toBeDefined()
    expect(
      denyReason("Start-Job -ScriptBlock { Start-Process git -ArgumentList push }"),
    ).toBeDefined()
  })

  test("a block that runs nothing of ours keeps running, and so does one that cannot be read", () => {
    expect(denyReason("Invoke-Command -ScriptBlock { Get-ChildItem }")).toBeUndefined()
    expect(denyReason("Start-Job -ScriptBlock { Get-Date }")).toBeUndefined()
    expect(denyReason("Invoke-Command -ScriptBlock $block")).toBeUndefined()
    expect(denyReason("Invoke-Command -FilePath script.ps1")).toBeUndefined()
  })
})

/** Asserts each command is denied, naming the command that was not. */
const expectDenied = (...commands: ReadonlyArray<string>) => {
  for (const command of commands)
    expect([command, denyReason(command) !== undefined]).toEqual([command, true])
}

/** Asserts each command is allowed, naming the command that was not. */
const expectAllowed = (...commands: ReadonlyArray<string>) => {
  for (const command of commands)
    expect([command, denyReason(command)]).toEqual([command, undefined])
}

describe("separators in a launcher's argument text start commands of their own", () => {
  test("cmd, wsl and PowerShell started by Start-Process read the text as a script", () => {
    expectDenied(
      "Start-Process cmd -ArgumentList '/c git status && git push'",
      "Start-Process cmd -ArgumentList '/c','git status','&','git push'",
      "Start-Process cmd -ArgumentList '/c git status | git push'",
      "Start-Process cmd -ArgumentList '/c git status || git push'",
      "Start-Process powershell -ArgumentList '-Command','git status; git push'",
      "Start-Process wsl -ArgumentList 'git status && git push'",
      "Start-Process git -ArgumentList 'status && git push'",
      "powershell -Command 'git status; git push'",
    )
  })

  test("reads joined by a separator keep running", () => {
    expectAllowed(
      "Start-Process cmd -ArgumentList '/c git status && git log -1'",
      "Start-Process cmd -ArgumentList '/c','git status','&','git log -1'",
      "Start-Process git -ArgumentList 'log','--format=%an <%ae>'",
      "Start-Process git -ArgumentList 'log','--grep=(fix)'",
      'Start-Process notepad -ArgumentList "it\'s"',
    )
  })

  test("text that cannot be scanned is still read at its spaces", () => {
    expectDenied('Start-Process cmd -ArgumentList "/c git push it\'s"')
  })
})

describe("a window title of one word", () => {
  test("is judged both as the program and as a title", () => {
    expectDenied(
      'cmd /c start "T" git push',
      'start "x" git push',
      'cmd /c start /min "Build" git push',
      'cmd /c start "" git push',
      'cmd /c start "T" /min git push',
      "Start-Process cmd -ArgumentList '/c','start','x','git','push'",
    )
  })

  test("leaves reads alone", () => {
    expectAllowed(
      'cmd /c start "T" git status',
      'start "x" git log -1',
      "Start-Process notepad notes.txt",
      "Start-Process git status",
    )
  })
})

describe("wt commands separated by ;", () => {
  test("each is judged", () => {
    expectDenied(
      "wt new-tab git status \\; split-pane git push",
      'wt nt git status ";" sp git push',
      "wt nt git status\\; sp git push",
      "wt nt git status \\; sp -H git push",
      "wt -w 0 nt git status \\; nt -p Ubuntu gh pr create",
    )
  })

  test("subcommands are known in any case", () => {
    expectDenied(
      "wt NT git push",
      "wt New-Tab git push",
      "wt SP git push",
      "wt -w 0 SPLIT-PANE git push",
    )
  })

  test("reads on every side keep running", () => {
    expectAllowed(
      "wt nt git status \\; sp git log -1",
      "wt NT git status",
      "wt new-tab -p Ubuntu git diff",
    )
  })
})

describe("Start-Process parameters in forms that are not -Name value", () => {
  test("a value attached with a colon is read", () => {
    expectDenied(
      "Start-Process -FilePath:git -ArgumentList:push",
      "Start-Process -FilePath:git -ArgumentList:'commit','-m','x'",
      "Start-Process -WorkingDirectory:. git -ArgumentList:commit",
      "Start-Process -Wait:$false git -ArgumentList push",
    )
    expectAllowed(
      "Start-Process -FilePath:git -ArgumentList:status -Wait:$false",
      "Start-Process -WorkingDirectory:. git -ArgumentList status",
    )
  })

  test("two-letter abbreviations, and -f and -a before the program, are read", () => {
    expectDenied(
      "Start-Process -Wo . git -ArgumentList push",
      "Start-Process -Ar commit git",
      "Start-Process -Ar commit -Fi git",
      "Start-Process -a commit git",
      "Start-Process -f git -a commit",
      "Start-Process -Wi Hidden -Ve RunAs git -Ar push",
    )
    expectAllowed("Start-Process -Wo . git -Ar status", "Start-Process -a status git")
  })

  test("common parameters that take a value do not hide the program", () => {
    expectDenied(
      "Start-Process -WarningAction SilentlyContinue git -ArgumentList push",
      "Start-Process -InformationAction Ignore git -ArgumentList push",
      "Start-Process -ev err -wa Stop git -ArgumentList push",
    )
    expectAllowed("Start-Process -WarningAction SilentlyContinue git -ArgumentList status")
  })

  test("a parameter that is not known may take the next word, so both readings are judged", () => {
    expectDenied(
      "Start-Process -Foo bar git -ArgumentList push",
      "Start-Process -Foo git -ArgumentList push",
      "Start-Process -Verbose git -ArgumentList push",
    )
    expectAllowed(
      "Start-Process -Verbose git -ArgumentList status",
      "Start-Process -Debug git status",
      "Start-Process -Foo bar notepad",
    )
  })

  test("a splatted hashtable may hold the program or its arguments", () => {
    expectDenied("Start-Process @h", "Start-Process git @h", "Start-Process -FilePath git @h")
    expectAllowed("Start-Process notepad @h")
  })

  test("an interpolated argument string is unreadable for a shell, readable for another program", () => {
    expectDenied(
      'Start-Process cmd -ArgumentList "/c $c"',
      'Start-Process cmd -ArgumentList "/c git $sub"',
      'Start-Process powershell -ArgumentList "-Command $c"',
    )
    expectAllowed(
      'Start-Process notepad -ArgumentList "$file"',
      "Start-Process cmd -ArgumentList '/c dir'",
    )
  })
})

describe("every script block of a call is judged", () => {
  test("a block after another block, and braces glued to the parameter", () => {
    expectDenied(
      "Start-Job -InitializationScript { 1 } -ScriptBlock { git push }",
      "Invoke-Command -ScriptBlock { 1 } -ScriptBlock { git push }",
      "Start-Job -ScriptBlock{ git push }",
      "Start-Job -ScriptBlock{git push}",
      "Start-Job -InitializationScript{git status} -ScriptBlock{gh pr create}",
    )
  })

  test("reads, hashtables and expansions are not writes", () => {
    expectAllowed(
      "Start-Job -InitializationScript { 1 } -ScriptBlock { git status }",
      "Start-Job -ArgumentList @{ a = 'git push' } -ScriptBlock { Get-Date }",
      "Start-Job -Name ${name} -ScriptBlock { Get-Date }",
    )
  })
})

describe("wsl in a command line", () => {
  test("a quoted separator is read as the separator it becomes in Linux", () => {
    expectDenied(
      'wsl git status "&&" git push',
      'wsl git status ";" git push',
      'wsl -e git status "|" git push',
      'wsl -d Ubuntu git status "&&" gh pr create',
    )
    expectAllowed('wsl git status "&&" git log -1', 'wsl ls "a b"')
  })

  test("~ for the home directory is read past", () => {
    expectDenied("wsl ~ git push", "wsl ~ -e git push", "wsl ~ -d Ubuntu git push")
    expectAllowed("wsl ~ git status", "wsl ~")
  })
})

describe("a judgement has a bound on its work", () => {
  const MIB = 1024 * 1024
  const fill = (unit: string, tail = "") =>
    unit.repeat(Math.floor((MIB - tail.length) / unit.length)) + tail
  const nested = (launcher: string) => launcher.repeat(6) + "'x y' " + fill("a ")
  const SHAPES: ReadonlyArray<readonly [string, string]> = [
    ["a chain of start", fill("start ", "git status")],
    ["cmd nested six deep, with a quoted word", nested("cmd /c ")],
    ["start nested six deep, with a quoted word", nested("start ")],
    ["wt nested six deep, with a quoted word", nested("wt nt ")],
    ["a title at every start", "cmd /c start t ".repeat(6) + fill("a ")],
    ["unknown parameters before the program", "Start-Process " + fill("-x y ", "git status")],
    [
      "a hashtable value of many }",
      fill("a} ", "").replace(/^/, "Start-Process notepad -WorkingDirectory @{").slice(0, MIB),
    ],
  ]
  for (const [name, command] of SHAPES) {
    test(`${name}, at 1 MiB, is decided in under three seconds`, () => {
      expect(command.length).toBeGreaterThan(MIB - 64)
      const started = performance.now()
      denyReason(command)
      expect(performance.now() - started).toBeLessThan(3000)
    })
  }

  test("a command that needs more work than the bound is denied as unreadable", () => {
    const reason = denyReason("cmd /c start t ".repeat(6) + fill("a ").slice(128))
    expect(reason).toContain("too large to read")
  })

  test("a large command that needs little work is still judged", () => {
    const large = fill("a ").slice(64)
    expect(denyReason(`git status ${large}`)).toBeUndefined()
    expect(denyReason(`git status ${large}; git push`)).toBeDefined()
    expect(denyReason(`cmd /c git status ${large}`)).toBeUndefined()
  })
})

describe("every text a launcher has read is held to the size limit of a command", () => {
  const MIB = 1024 * 1024

  test("a command over the limit is denied unread, a read as well as a write", () => {
    for (const command of [`git status ${"a".repeat(MIB)}`, `git push ${"a".repeat(MIB)}`])
      expect(denyReason(command)).toContain(`and the guard reads at most ${MIB}`)
  })

  test("a script block written back longer than the limit is denied unread", () => {
    const command = `Invoke-Command { echo "${"'".repeat(MIB - 40)}" }`
    expect(Buffer.byteLength(command)).toBeLessThanOrEqual(MIB)
    expect(denyReason(command)).toContain(`and the guard reads at most ${MIB}`)
  })

  test("a script block written back within the limit is judged", () => {
    const quotes = "'".repeat(1000)
    expect(denyReason(`Invoke-Command { echo "${quotes}" }`)).toBeUndefined()
    expect(denyReason(`Invoke-Command { echo "${quotes}"; git push }`)).toContain("git push")
  })
})

describe("Start-Process output redirections are judged like the target of a >", () => {
  test("a state file is refused, in every spelling of the parameter", () => {
    expectDenied(
      "Start-Process git -ArgumentList status -RedirectStandardOutput .holyclaude/x",
      "Start-Process git -ArgumentList status -RedirectStandardOutput:.holyclaude/x",
      "Start-Process git -ArgumentList status -RedirectStandardError .holyclaude\\x",
      "Start-Process git -ArgumentList status -RedirectStandardError:.holyclaude\\x",
      "Start-Process git -ArgumentList status -RedirectStandardO .holyclaude/x",
      "Start-Process -RedirectStandardOutput .holyclaude/x -FilePath git -ArgumentList status",
      "Start-Process notepad -RedirectStandardOutput .holyclaude/x",
      "start git status -RedirectStandardOutput .holyclaude/x",
    )
  })

  test("the same file as the target of a > is refused too", () => {
    expectDenied("git status > .holyclaude/x")
  })

  test("other files, and the file a command reads from, are not", () => {
    expectAllowed(
      "Start-Process git -ArgumentList status -RedirectStandardOutput out.txt",
      "Start-Process git -ArgumentList status -RedirectStandardError:err.txt",
      "Start-Process git -ArgumentList status -RedirectStandardInput .holyclaude/x",
      "git status < .holyclaude/x",
    )
  })

  test("the git directory is refused like the state files", () => {
    expectDenied(
      "Start-Process git -ArgumentList status -RedirectStandardOutput .git/hooks/x",
      "Start-Process git -ArgumentList status -RedirectStandardError:.git/hooks/x",
      "Start-Process git -ArgumentList status -RedirectStandardOutput .git\\hooks\\x",
      "Start-Process git -ArgumentList status -RedirectStandardError:.git\\config",
      "Start-Process notepad -RedirectStandardOutput .GIT\\config",
    )
    expectAllowed(
      "Start-Process git -ArgumentList status -RedirectStandardOutput .gitignore",
      "Start-Process git -ArgumentList status -RedirectStandardInput .git/config",
    )
  })

  test("a redirect does not hide the program or its arguments", () => {
    expectDenied(
      "Start-Process -RedirectStandardOutput out.txt git -ArgumentList push",
      "Start-Process -RedirectStandardError:err.txt git -ArgumentList push",
      "Start-Process -RedirectStandardInput in.txt git -ArgumentList push",
      "Start-Process -RedirectStandardInput:in.txt git -ArgumentList push",
      "Start-Process -RedirectStandardInput .holyclaude/x git -ArgumentList push",
    )
  })
})

describe("every brace of a script-block call is a statement separator", () => {
  test("a brace inside a quote cannot hide a write", () => {
    expectDenied(
      "Start-Job -InitializationScript { '{' } -ScriptBlock { git push }",
      "Start-Job -InitializationScript { '}' } -ScriptBlock { git push }",
      "Start-Job -ArgumentList @{a='{'} -ScriptBlock { git push }",
      "Start-Job -ArgumentList @{a='}'} -ScriptBlock { git push }",
      "Start-Job -ArgumentList '{' -ScriptBlock { git push }",
      "Invoke-Command -ArgumentList '{','{' -ScriptBlock { gh pr create }",
    )
  })

  test("a comment mark or a quote cannot hide a write", () => {
    expectDenied(
      "Start-Job -ArgumentList '#' -ScriptBlock { git push }",
      "Start-Job -ArgumentList 'a #b' -ScriptBlock { git push }",
      'Start-Job -ArgumentList "$x #" -ScriptBlock { git push }',
      'Start-Job -ArgumentList "#$x" -ScriptBlock { git push }',
      "Start-Job -ArgumentList '\"' -ScriptBlock { git push }",
      'Start-Job -ArgumentList "\'" -ScriptBlock { git push }',
    )
  })

  test("a string or a hashtable that holds a write is not one", () => {
    expectAllowed(
      "Start-Job -ArgumentList @{ a = 'git push' } -ScriptBlock { Get-Date }",
      "Start-Job -ArgumentList @{a='git push'} -ScriptBlock { Get-Date }",
      "Start-Job -ArgumentList 'git push; git commit' -ScriptBlock { Get-Date }",
      "Invoke-Command $session { git status }",
      "Invoke-Command -Session $session -ScriptBlock { git status }",
    )
  })
})

describe("a Start-Process value that is a hashtable", () => {
  test("is not taken for the program", () => {
    expectDenied(
      "Start-Process -Environment @{ A = 1 } git -ArgumentList push",
      "Start-Process -Environment @{A=1} git -ArgumentList push",
      "Start-Process -Environment:@{ A = 1 } git -ArgumentList push",
      "Start-Process git -Environment @{ A = 1 } -ArgumentList push",
      "Start-Process -Environment @{ A = 1; B = 2 } gh -ArgumentList 'pr','create'",
    )
    expectAllowed(
      "Start-Process -Environment @{ A = 1 } git -ArgumentList status",
      "Start-Process git -Environment @{ A = 1 } -ArgumentList status",
      "Start-Process -Environment @{ A = 1 } notepad",
    )
  })

  test("may hold a } in a quote without hiding the program", () => {
    expectDenied(
      "Start-Process -Environment @{ A = '}' } git -ArgumentList push",
      "Start-Process -Environment @{ A = '}'; B = '}' } git -ArgumentList push",
    )
  })
})

describe("a launcher cut short by a parenthesis", () => {
  test("hides its program or its arguments, so a git write is refused", () => {
    expectDenied(
      "Start-Process (Get-Command git).Source push",
      "start (Get-Command git).Source push",
      "saps -Wait (Get-Command git).Source push",
      "Start-Process -FilePath (Get-Command git).Source -ArgumentList push",
      "Start-Process git (Get-Args)",
      "Start-Process git -WorkingDirectory (pwd) -ArgumentList push",
      "Start-Process gh -Verb (Get-Verb) -ArgumentList 'pr','create'",
    )
  })

  test("leaves a program that is not ours, and a command that is complete, alone", () => {
    expectAllowed(
      "Start-Process notepad -WorkingDirectory (pwd)",
      "Start-Process git -ArgumentList status -WorkingDirectory (pwd)",
      "Start-Process git -ArgumentList 'log','-1' -Verb (Get-Verb)",
    )
  })
})

describe("options of a host that are not known", () => {
  test("may take the next word, so both readings are judged", () => {
    expectDenied(
      "conhost --workdir X git push",
      "wt --target 1 git push",
      "wsl --foo X git push",
      "wt nt --target 1 git push",
      "wt nt git status \\; sp --foo x git push",
      "wsl --foo git push",
    )
  })

  test("do not make a read a write, and listed ones keep their reading", () => {
    expectAllowed(
      "conhost --workdir X git status",
      "wt --target 1 git log -1",
      "wsl --foo X git status",
      "conhost --headless git status",
      "wt -w 0 --maximized git status",
      "wsl -e echo git push",
      "wsl --exec git status",
    )
  })

  test("a parenthesis after the options hides the command", () => {
    expectDenied("wsl (Get-Command git)", "conhost git (Get-Args)")
  })
})

describe("start /?", () => {
  test("is a request for help, not a program", () => {
    expectAllowed("start /?", "cmd /c start /?", "cmd.exe /c start /?")
  })

  test("does not make a command after it unreadable", () => {
    expectDenied("cmd /c start /? git push")
    expectAllowed("cmd /c start /? git status")
  })
})

describe("the work budget belongs to one judgement", () => {
  const MIB = 1024 * 1024
  const heavy = "cmd /c start t ".repeat(6) + "a ".repeat(MIB / 2 - 64)

  test("a command over the bound is denied, and the next command starts afresh", () => {
    expect(denyReason(heavy)).toContain("too large to read")
    expectAllowed("git status", "cmd /c git status", "Start-Process git -ArgumentList status")
    expect(denyReason(heavy)).toContain("too large to read")
    expectAllowed("git status")
  })

  test("a budget is spent only by the judgement that holds it", () => {
    const first = newBudget()
    const second = newBudget()
    expect(overBudget(first, WORK_LIMIT)).toBe(false)
    expect(overBudget(first, 1)).toBe(true)
    expect(second.left).toBe(WORK_LIMIT)
    expect(overBudget(second, 1)).toBe(false)
  })
})
