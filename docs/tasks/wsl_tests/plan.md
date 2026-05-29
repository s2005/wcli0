# MCP Testing in WSL2 — Plan

## Current State

**Environment**: WSL2 (kernel 5.15.167.4), Node v22.12.0 (via nvm), `wsl.exe` available.

**Test results**: 769/806 pass, 27 fail across 4 test suites:
- `tests/wsl.test.ts` — 6 failures
- `tests/asyncOperations.test.ts` — failures
- `tests/integration/perCommandOutputLimit.test.ts` — failures
- `tests/unit/perCommandOutputLimit.test.ts` — failures

**Root cause**: All failures show `spawn node ENOENT`. The `TestCLIServer` spawns `node` as a bare command (`TestCLIServer.ts:34`), but WSL2+nvm doesn't put `node` on the default `spawn` PATH. `spawn('node', ...)` without `{ shell: true }` fails to resolve it.

---

## Phase 1 — Fix the known `spawn node ENOENT` issue

| # | Task | Why |
|---|------|-----|
| 1.1 | In `TestCLIServer.ts:34`, resolve the full `node` path via `process.execPath` instead of bare `'node'` | Fixes all 27 failures that block the rest of testing |
| 1.2 | Run full suite and verify 0 failures | Confirms no regressions |

---

## Phase 2 — MCP stdio transport in WSL2

| # | Task | Why |
|---|------|-----|
| 2.1 | Build the project (`npm run build`) and test `node dist/index.js` as an MCP stdio server | Validates the actual MCP server starts and responds via stdio |
| 2.2 | Send JSON-RPC `initialize` + `tools/list` requests via stdin, parse stdout | Confirms the MCP protocol handshake works end-to-end in WSL2 |
| 2.3 | Send `tools/call` for `execute_command` with `bash` shell | Validates command execution through MCP in WSL2 |

---

## Phase 3 — WSL shell behavior

| # | Task | Why |
|---|------|-----|
| 3.1 | Test `execute_command` with shell=`bash` running real commands (`echo`, `pwd`, `uname -a`) | Native bash is the primary shell in WSL2 |
| 3.2 | Test `execute_command` with shell=`wsl` calling `wsl.exe -e` from inside WSL2 | Nested WSL-in-WSL — validates the wsl shell type works when server runs in WSL2 |
| 3.3 | Verify `wsl.exe` path conversion: `/mnt/c/...` stays as Linux path when spawning from WSL2 (not converted to `C:\...`) | The spawn cwd fix from Phase 1 prevents ENOENT for non-.exe executables |
| 3.4 | Test `execute_command` with shell=`cmd` calling `cmd.exe /c echo hello` | **DONE** — `tests/windows/shellExecution.test.ts` (Phase 3.4 describe block) |
| 3.5 | Test `execute_command` with shell=`powershell` calling `powershell.exe -Command "echo hello"` | **DONE** — `tests/windows/shellExecution.test.ts` (Phase 3.5 describe block) |

---

## Phase 4 — Path handling across WSL2 boundaries

| # | Task | Why |
|---|------|-----|
| 4.1 | Test `/mnt/c/...` to `C:\...` conversion when server runs in WSL2 — verify it's skipped for Linux executables | The server does WSL-to-Windows path conversion for `spawn` cwd; must not apply when spawning Linux binaries |
| 4.2 | Test `set_current_directory` with WSL paths (`/tmp`, `/mnt/d/...`) and verify round-trip | Mixed path formats in a WSL2 environment |
| 4.3 | Test `validate_directories` with cross-boundary paths (`/mnt/c/...`, `/home/...`) | Security validation across mount points |

---

## Phase 5 — WSL emulator accuracy validation

| # | Task | Why |
|---|------|-----|
| 5.1 | Compare `wsl-emulator.js` behavior with real `wsl.exe -e` output for basic commands | The emulator may drift from real WSL behavior |
| 5.2 | Test the full WSL test suite (`npm run test:wsl`) with `wsl.exe` instead of the emulator | Validates tests would pass against real WSL, not just the mock |

---

## Phase 6 — Windows shell testing (implemented on native Windows)

Tests are in `tests/windows/` and gated on `process.platform === 'win32'` (skipped on non-Windows).

| # | Task | Status |
|---|------|--------|
| 6.1 | Test `execute_command` with shell=`cmd` running real commands | **DONE** — `tests/windows/shellExecution.test.ts` (Phase 6.1) |
| 6.2 | Test `execute_command` with shell=`powershell` running real commands | **DONE** — `tests/windows/shellExecution.test.ts` (Phase 6.2) |
| 6.3 | Test `execute_command` with shell=`gitbash` running real commands | **DONE** — `tests/windows/shellExecution.test.ts` (Phase 6.3) |
| 6.4 | Test Windows path handling: `C:\...` paths, `\\server\share` UNC paths | **DONE** — `tests/windows/pathHandling.test.ts` |
