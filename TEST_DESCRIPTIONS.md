# Unit Test Descriptions

This document summarizes the purpose of each unit test in the project.

## tests/commandChain.test.ts

- **allows cd within allowed path** – verifies that chained commands containing a `cd` to a directory under the allowed paths list do not throw an error when validated.
- **rejects cd to disallowed path** – ensures that attempting to `cd` into a directory outside the allowed paths causes validation to throw.
- **rejects relative cd escaping allowed path** – checks that using a relative `cd ..` to leave the permitted directory is blocked.
- **rejects blocked commands and arguments in chain** – confirms that blocked commands or arguments in a chained command cause validation to fail.

## tests/commandSettings.test.ts

- **blocks dangerous operators when injection protection enabled** – ensures chained commands containing blocked shell operators are rejected when injection protection is active.
- **allows command chaining when injection protection disabled** – verifies that disabling injection protection permits safe chained commands.
- **allows changing directory outside allowed paths when restriction disabled** – confirms unrestricted working directory settings allow `cd` into disallowed paths.
- **rejects changing directory outside allowed paths when restriction enabled** – checks that enabling the restriction prevents `cd` to directories beyond the allowed list.

## tests/conditionalShells.test.ts

- **WSL only included with explicit configuration** – ensures the WSL shell is available only when the `wsl` shell is specified in configuration.
- **backward compatibility with explicit shell list** – specifying all shells explicitly retains each shell entry in the loaded config.
- **assigns validatePath and blockedOperators for shells** – enabled shells have default path validators and blocked operator lists populated.

## tests/configNormalization.test.ts

- **loadConfig lower-cases and normalizes allowedPaths** – tests that loading configuration normalizes path casing and formats allowed paths consistently.
- **loadConfig fills missing security settings with defaults** – verifies that any security settings not supplied in the config file are populated with default values.
- **includeDefaultWSL setting is ignored (deprecated)** – ensures deprecated `includeDefaultWSL` in the security section does not enable WSL.

## tests/directoryValidator.test.ts

- **should return valid for directories within allowed paths** – validates that directories contained in the allowed list are accepted.
- **should return invalid for directories outside allowed paths** – checks that directories outside the whitelist are reported as invalid.
- **should handle a mix of valid and invalid directories** – ensures that only the directories outside the allowed paths are listed as invalid.
- **should handle GitBash style paths** – confirms that Unix-style paths like `/c/Users/...` are normalized and validated correctly.
- **should consider invalid paths that throw during normalization** – tests that paths causing normalization errors are treated as invalid.
- **should not throw for valid directories** – verifies that the throwing validator passes silently when all directories are allowed.
- **should throw McpError for invalid directories** – checks that a custom error is thrown when invalid directories are found.
- **should include invalid directories in error message** – ensures the thrown error lists each offending directory and allowed paths for clarity.
- **should use singular wording for a single invalid directory** – tests that the error message uses singular phrasing when only one directory is invalid.
- **should handle empty directories array** – confirms that validating an empty list of directories succeeds.
- **should handle empty allowed paths array** – ensures that an empty allowed path configuration results in an error when validating directories.

## tests/getConfig.test.ts

- **createSerializableConfig returns structured configuration** – verifies that `createSerializableConfig` produces a plain object without functions and with the expected fields from the configuration.
- **createSerializableConfig returns consistent config structure** – checks that the structure of the serialized config always contains the necessary keys for security and shell settings.
- **get_config tool response format** – ensures the response format produced by the configuration tool is correctly shaped and contains the serialized config.

## tests/initialDirConfig.test.ts

- **valid initialDir with restriction adds to allowedPaths** – verifies that a provided initial directory is normalized and added to `allowedPaths` when `restrictWorkingDirectory` is true.
- **valid initialDir without restriction leaves allowedPaths unchanged** – ensures the path is normalized but not appended when restrictions are disabled.
- **invalid initialDir logs warning and is unset** – an invalid path triggers a warning and the setting becomes `undefined`.
- **initialDir omitted results in undefined** – confirms the default when no `initialDir` is specified.
- **non-string initialDir logs warning and is unset** – non-string values produce a warning and are ignored.

## tests/serverCwdInitialization.test.ts

- **launch outside allowed paths leaves cwd undefined** – starting the server in a disallowed directory results in no active working directory.
- **execute_command fails when cwd undefined** – commands without a workingDir return an error when no active directory is set.
- **set_current_directory sets active cwd** – using the tool successfully changes the active directory and calls `process.chdir`.
- **get_current_directory reports unset state** – retrieving the current directory before one is set returns a helpful message.
- **initialDir sets active cwd when valid** – a valid `initialDir` is used at startup and becomes the active directory.
- **initialDir chdir failure falls back to process.cwd()** – if changing to `initialDir` fails the server falls back to the process directory.
- **initialDir not in allowedPaths leaves active cwd undefined** – when restrictions prevent using the configured `initialDir`, the active directory remains unset.

## tests/toolDescription.test.ts

- **generates correct description with all shells enabled** – checks that the tool description lists every enabled shell and includes example blocks for each.
- **generates correct description with only cmd enabled** – verifies that the description includes only the CMD example when other shells are disabled.
- **generates correct description with powershell and gitbash enabled** – ensures that only the relevant examples for enabled shells are present.
- **handles empty allowed shells array** – confirms that an empty shell list results in a minimal description without examples.
- **handles unknown shell names** – tests that unrecognized shell names appear in the header but no examples are generated.

## tests/validation.test.ts

- **extractCommandName handles various formats** – covers numerous command string formats to make sure only the executable name is returned.
- **extractCommandName is case insensitive** – validates that command extraction works regardless of case.
- **isCommandBlocked identifies blocked commands** – ensures commands in the blocked list are detected even with paths or extensions.
- **isCommandBlocked is case insensitive** – checks detection of blocked commands independent of case.
- **isCommandBlocked handles different extensions** – tests blocked command detection across `.cmd`, `.bat`, and other extensions.
- **isArgumentBlocked identifies blocked arguments** – verifies arguments in the blocked list are found.
- **isArgumentBlocked is case insensitive for security** – ensures argument checks are case insensitive.
- **isArgumentBlocked handles multiple arguments** – confirms any blocked argument in a list triggers detection.
- **parseCommand handles basic commands** – parses simple commands and ensures arguments are split properly.
- **parseCommand handles quoted arguments** – supports arguments wrapped in quotes.
- **parseCommand handles paths with spaces** – validates parsing when the executable path contains spaces.
- **parseCommand handles empty input** – returns empty command and args when given whitespace.
- **parseCommand handles mixed quotes** – supports quotes with embedded spaces and key=value pairs.
- **normalizeWindowsPath handles various formats** – converts a mix of Windows, Unix, and UNC style paths into canonical Windows format.
- **normalizeWindowsPath removes redundant separators** – collapses duplicate slashes and backslashes.
- **normalizeWindowsPath resolves relative segments** – resolves `..` segments in Windows style paths.
- **normalizeWindowsPath resolves git bash style relative segments** – handles `/c/../` style paths used by Git Bash.
- **normalizeWindowsPath handles drive-relative paths** – normalizes paths like `C:folder/file`.
- **removes duplicates and normalizes paths** – ensures normalization removes duplicate allowed paths.
- **removes nested subpaths** – verifies that nested allowed paths are collapsed to the parent path.
- **keeps multiple top-level paths** – multiple unrelated allowed paths remain after normalization.
- **isPathAllowed validates paths correctly** – checks standard cases of allowed and disallowed path validation.
- **isPathAllowed handles trailing slashes correctly** – ensures trailing slashes in either path do not affect validation.
- **isPathAllowed is case insensitive** – path checking disregards letter case.
- **isPathAllowed supports UNC paths** – validates UNC network paths.
- **validateWorkingDirectory throws for invalid paths** – ensures relative or disallowed working directories are rejected.
- **validateShellOperators blocks dangerous operators** – verifies that blocked shell operators cause validation failure.
- **validateShellOperators allows safe operators when configured** – ensures allowed operators do not throw.
- **validateShellOperators respects shell config** – checks that shell-specific operator settings are honored.

## tests/wsl.test.ts

This file contains unit tests specifically for the Windows Subsystem for Linux (WSL) shell integration.
It utilizes a Node.js emulator script `scripts/wsl-emulator.js` to allow tests to run on non-Windows environments where `wsl.exe` is not available. The emulator mimics the basic command execution behavior of `wsl.exe -e <command>`.
The tests also cover the correct normalization and validation of WSL paths (e.g., `/mnt/c/...`) when used as working directories, particularly the fixes made in `normalizeWindowsPath`.

- **`should execute a simple command via WSL emulator`**: Verifies basic command execution (e.g., `echo`) using the `wsl` shell and checks for correct output.
- **`should handle commands that result in an error`**: Ensures that commands exiting with a non-zero status code are correctly reported as errors, with the appropriate exit code.
- **`should capture stderr output`**: Tests that stderr output from commands executed in WSL is captured and returned in the command result.
- **`should block commands with prohibited shell operators`**: Confirms that injection protection works for the WSL shell, blocking commands with operators like `;`.
- **`WSL Working Directory Validation`**: This suite of tests (5.1, 5.2, 5.3) validates the working directory functionality for WSL:
    - **`should execute command in valid WSL working directory when allowed` (Test 5.1)**: Verifies that a command can be executed when its `workingDir` is a valid WSL path (e.g., `/mnt/c/some_dir`) and this path is correctly normalized and listed in `allowedPaths`.
    - **`should reject command in invalid WSL working directory (different root)` (Test 5.2)**: Ensures commands are rejected if their `workingDir` is a WSL path on a different/disallowed root (e.g., `/mnt/d/...` when only `/mnt/c/...` is allowed).
    - **`should reject command in invalid WSL working directory (disallowed suffix)` (Test 5.3)**: Ensures commands are rejected if their `workingDir` is a WSL path that is not covered by any entry in `allowedPaths`.

## tests/wslEmulator.test.ts

- **emulator handles basic commands** – verifies that the Node-based WSL emulator executes simple commands like `echo`.
- **emulator propagates exit codes** – ensures exit codes from commands run through the emulator are returned.
- **pwd returns current directory** – checks that the emulator prints the working directory when running `pwd`.
- **ls /tmp returns simulated output** – confirms the emulator returns a stub directory listing for `ls /tmp`.

## tests/processManagement.test.ts

- **should terminate process on timeout** – ensures that a long-running command is killed after exceeding the configured timeout.
- **should handle process spawn errors gracefully** – verifies that spawn failures throw a descriptive `McpError`.
- **should propagate shell process errors** – checks that errors emitted by the spawned process reject the command.
- **should clear timeout when process exits normally** – confirms that the timeout is cleared and the process is not killed when it finishes before the limit.

## tests/testCleanup.test.ts

- **ensures no residual open handles between tests** – placeholder verification that global cleanup completes without warnings.

## tests/asyncOperations.test.ts

- **should handle concurrent command executions** – runs multiple commands in parallel and verifies that each completes successfully.
- **should queue commands when limit reached** – ensures additional commands wait when a concurrency limit is exceeded.
- **should handle concurrent errors independently** – confirms that failures in one command do not affect others running at the same time.

## tests/errorHandling.test.ts

- **should handle malformed JSON-RPC requests** – invalid tool parameters result in an `InvalidParams` error.
- **should recover from shell crashes** – spawning a nonexistent shell command triggers an `InternalError` with details from the spawn failure.
- **should throw error on invalid configuration** – loading a config with invalid values raises an exception.
- **should fall back to defaults when config read fails** – if reading the config file throws, defaults are returned and an error is logged.

## tests/wsl/pathConversion.test.ts

- **convertWindowsToWslPath handles standard and mixed separators** – converts typical Windows paths, forward slashes and mixed separators to `/mnt/<drive>/` form.
- **handles drive roots and trailing slashes** – correctly processes paths like `C:/` and `C:\\Users\\`.
- **supports custom mount points and paths with spaces** – allows overriding the mount root and preserves spaces during conversion.
- **returns non-Windows paths unchanged and rejects UNC paths** – Unix-style or relative paths pass through while UNC paths throw an error.

## tests/wsl/pathResolution.test.ts

- **resolves allowed paths based on global and WSL-specific settings** – merges and converts Windows paths, respecting the `inheritGlobalPaths` flag.
- **ensures unique results and warns about unsupported UNC paths** – duplicates are removed and a warning is logged when global paths cannot be converted.
- **honors custom `wslMountPoint` values** – converted paths reflect the configured mount prefix.

## tests/wsl/validateWslWorkingDirectory.test.ts

- **accepts valid WSL directories from global or shell-specific lists** – directories under resolved allowed paths are permitted.
- **rejects directories outside the allowed set or with invalid format** – errors are thrown for disallowed roots, relative paths or Windows-style paths.
- **supports custom mount points and ignores unsupported global UNC paths** – validation uses the configured mount prefix and logs warnings for skipped UNC paths.

## tests/wsl/isWslPathAllowed.test.ts

- **matches allowed and disallowed paths including `/mnt/<drive>` conversion** – parameterized cases verify path allowance and drive mount handling.

## tests/integration/endToEnd.test.ts

- **should execute shell command with proper isolation** – uses the helper server to run a command end‑to‑end and verifies the output and working directory metadata.

## tests/integration/mcpProtocol.test.ts

- **should return configuration via get_config tool** – parses the JSON response and ensures required keys are present.
- **should validate directories correctly** – calling the directory validation tool succeeds for allowed paths.

## tests/integration/shellExecution.test.ts

- **should reject commands with blocked operators** – executing a command containing `;` results in an `McpError`.
- **should enforce working directory restrictions** – commands fail when executed from disallowed directories.
- **should execute when working directory allowed** – succeeds when the directory is permitted by the configuration.

