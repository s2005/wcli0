# P107 - Avoid broadening invalid allowedShells to every shell

When a user hand-edits `wcli0.profiles` with only invalid `allowedShells` entries
(for example a typo like `['powershel']`), the filter in `buildProfiles` produces
an empty list and then omits the field. The server treats an omitted
`allowedShells` as unrestricted, so the generated managed config makes the profile
selectable from every shell instead of failing or preserving the intended
restriction. Reject/drop the profile (or surface a validation error) when
`allowedShells` was provided with entries but none of them are valid.

File: `vscode-extension/src/configFile.ts` (line 373)
