import { describe, expect, test } from "bun:test"

import { denyReason } from "./policy.ts"

describe("a shell nested in cmd, PowerShell or watch keeps the quotes of its script", () => {
  test("a quoted script is judged, as it is without the outer program", () => {
    expect(denyReason('cmd /c bash -c "git commit -m x"')).toBeDefined()
    expect(denyReason("cmd.exe /c sh -c 'git push'")).toBeDefined()
    expect(denyReason('powershell -Command bash -c "git commit -m x"')).toBeDefined()
    expect(denyReason('pwsh -Command bash -c "git commit -m x"')).toBeDefined()
    expect(denyReason('pwsh -c bash -c "gh pr create"')).toBeDefined()
    expect(denyReason('watch bash -c "git commit -m x"')).toBeDefined()
    expect(denyReason("watch -n 5 sh -c 'holyclaude intent create'")).toBeDefined()
  })

  test("a computed script is denied, as it is without the outer program", () => {
    expect(denyReason('watch bash -c "git $sub"')).toBeDefined()
    expect(denyReason('cmd /c bash -c "git $sub"')).toBeDefined()
  })

  test("a read keeps running", () => {
    expect(denyReason('cmd /c bash -c "git status"')).toBeUndefined()
    expect(denyReason('powershell -Command bash -c "git status"')).toBeUndefined()
    expect(denyReason("watch bash -c 'git log -1'")).toBeUndefined()
  })

  test("a quoted separator is still read when the line is rebuilt from its words", () => {
    expect(denyReason("watch git status '&&' git push")).toBeDefined()
  })
})

describe("shells launched by name keep their verdict", () => {
  test("bash and sh -c, with or without .exe or a path", () => {
    expect(denyReason('bash -c "git commit -m x"')).toBeDefined()
    expect(denyReason('bash.exe -c "git commit -m x"')).toBeDefined()
    expect(denyReason("sh -c 'git push'")).toBeDefined()
    expect(denyReason('"C:\\Windows\\System32\\bash.exe" -lc "git push"')).toBeDefined()
    expect(denyReason("bash.exe -c 'git status'")).toBeUndefined()
  })
})
