# P85 - Require a nonempty package for the npx fast path

In `vscode-extension/src/configSource.ts:981` (`parseMcpEntry`), an entry with `command: "npx"` and
`args: ["-y"]` (or `args: ["-y", ""]`) still selects the modeled npx launch even though no package was
authored; the installed `npx --help` requires a package or an explicit call, while `buildLaunchSpec`
substitutes an empty `packageSpec` with `wcli0@latest`, so a no-op Save changes the original
incomplete npx invocation into an automatic installation and execution of wcli0. Missing or empty
package tokens must be treated as a custom launch, or the save must be refused, instead of applying
the settings-only fallback.
