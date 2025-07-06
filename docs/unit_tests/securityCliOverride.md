# securityCliOverride

- **overrides security values with valid numbers** – valid `maxCommandLength` and `commandTimeout` values update the configuration when provided via CLI.
- **logs warning and ignores invalid values** – zero or negative numbers trigger a warning and leave the original security settings intact.
