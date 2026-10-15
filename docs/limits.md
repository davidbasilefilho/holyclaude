# Limits

- holyclaude puts no word, character or byte limit on content: the text of an Intent, an Assignment,
  a result, a list row, a hook's deny reason or a command's error is kept and shown whole. The
  bounds that remain only guard the reading of external or untrusted input: the stdin of the guard
  hook (1 MiB), the tail read of the observations log (4 MiB per generation), the state files that
  SessionStart reads (64 MiB each), the lock, guard and `.gitignore` files, a legacy `state.json`, a
  subagent transcript, and the guard's own analysis work. The CLI's own stdin has no bound. The only
  fixed budget is the 10,000 characters of `SessionStart` context, which Claude Code itself caps.
- The worker VCS-write hook is a guardrail for well-meaning workers, not a sandbox. Interpreters,
  scripts and PowerShell script blocks other than those run in place (`& { }`, `. { }`) or given to
  Invoke-Command (icm), Start-Job (sajb) and Start-ThreadJob are out of its reach. Writes into `.holyclaude` and `.git` are refused
  by the path a command names, either separator and any case, and by every path a wildcard or brace
  list in it can expand to; a path computed at run time (a variable, a substitution) or reached by
  a relative path after `cd` is out of its reach.
- The hook reads at most 1 MiB of stdin, and a payload over that, an empty one or one that is not a
  JSON object is denied for every caller, the main thread included: it cannot be attributed, and
  Claude Code sends no such payload. A main-thread Write of more than about 1 MiB is refused for
  that reason, and so is any Agent call, since the hook judges those too.
- Within that limit the guard treats a call as a specialist's when its payload carries an
  `agent_id` that is not null, absent or empty, whatever the type of the value; every other call is
  the main thread's and passes untouched. It denies a specialist call it cannot judge: a command or
  file path over 1 MiB, or a text the guard reads out of a command (a nested shell's script, a
  launcher's argument line, a script block written back) that is, a file tool that names no path,
  a call that names no tool, or one its policy cannot read. A file tool is judged by every path it
  names. Only the command and the paths are judged, so padding elsewhere in the payload neither
  hides a call nor changes its verdict.
- The guard fails open only when the hook cannot run: stdin cannot be read, or the hook crashes or
  runs past its 30 second timeout. The content of a specialist's call is not expected to cause
  that. The payload and each judged text are capped at 1 MiB, and the shell scanner's nesting and
  the work of one judgement are bounded; the slowest input found at the cap took about 3.3 seconds
  on the development machine, so a machine about nine times slower would still lose the guard on
  it.
- Without Bun on `PATH` the hooks do not start, Claude Code reports a hook error and goes on, and
  the guard is off.
- The `PreToolUse` hook runs only for the tools its matcher lists. Per call it costs about 64 ms with
  the real `bun.exe` on the Windows development machine, and more through a shim or under load; see
  [On Windows](hooks.md#on-windows).
- Installing the plugin makes holyclaude the default main-thread agent for sessions where it is enabled, as observed in local sessions; a cloud session did not (see [Cloud sessions](cloud-sessions.md)).
- Reviewer.code, Worker.validation and Reviewer.testing hold Bash under an instruction-only
  no-mutation boundary.
