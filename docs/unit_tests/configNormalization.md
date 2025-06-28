# configNormalization

- **loadConfig lower-cases and normalizes allowedPaths** – tests that loading configuration normalizes path casing and formats allowed paths consistently.
- **loadConfig fills missing security settings with defaults** – verifies that any security settings not supplied in the config file are populated with default values.
- **includeDefaultWSL setting is ignored (deprecated)** – ensures deprecated `includeDefaultWSL` in the security section does not enable WSL.
