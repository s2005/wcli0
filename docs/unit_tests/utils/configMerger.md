# utils/configMerger

- **returns global config when no overrides** – verifies resolveShellConfiguration falls back to the global settings if a shell has none.
- **merges security overrides** – ensures shell specific security settings override the global values while preserving unspecified options.
- **appends blocked commands and arguments** – checks that extra blocked items are appended to the global lists.
- **replaces blocked operators** – confirms shell overrides completely replace the blocked operator list.
- **replaces paths config** – validates that path overrides substitute the global allowedPaths and initialDir.
- **includes WSL config for WSL shells** – tests that wslConfig is carried into the resolved configuration.
- **converts and merges Windows paths for WSL** – applyWslPathInheritance should convert global Windows paths to `/mnt/` form when inheritGlobalPaths is true.
- **does not convert paths when inheritance disabled** – ensures Windows paths are not added for WSL shells if inheritGlobalPaths is false.
- **uses specified mount point** – confirms that conversions honor a custom mountPoint.
