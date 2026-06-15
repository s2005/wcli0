# P76 - Resolve userHome with the platform home directory

`resolveVariables` in `vscode-extension/src/settings.ts` (line 114) resolves `${userHome}` from
`process.env.HOME ?? process.env.USERPROFILE`. On Windows where `HOME` is set by Git/Cygwin/other
Unix-like tools, this prefers a Unix-style directory (e.g. `/home/me`) over the real Windows user
home, so any cwd, config file, allowed directory, or per-shell executable using the token resolves
to the wrong path. Use the platform home resolution (`os.homedir()`) instead of preferring `HOME`.
