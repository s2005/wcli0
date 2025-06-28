# initialDirConfig

- **valid initialDir with restriction adds to allowedPaths** – verifies that a provided initial directory is normalized and added to `allowedPaths` when `restrictWorkingDirectory` is true.
- **valid initialDir without restriction leaves allowedPaths unchanged** – ensures the path is normalized but not appended when restrictions are disabled.
- **invalid initialDir logs warning and is unset** – an invalid path triggers a warning and the setting becomes `undefined`.
- **initialDir omitted results in undefined** – confirms the default when no `initialDir` is specified.
- **non-string initialDir logs warning and is unset** – non-string values produce a warning and are ignored.
