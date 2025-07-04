# initialDirCliOverride

- **overrides config initialDir and updates allowedPaths** – applying the CLI option replaces the configured `initialDir` with the provided path and adds it to `allowedPaths`.
- **invalid directory logs warning and does not override** – when the CLI path does not exist a warning is logged and the configuration remains unchanged.
