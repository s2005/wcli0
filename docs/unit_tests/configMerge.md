# configMerge

- **handles user config enabling subset of shells** – merging honours explicit enable/disable flags while keeping defaults for others.
- **uses defaults when sections omitted** – missing global sections retain default values during merge.
- **omitted shells retain defaults** – unspecified shells are included with default configuration.
- **empty arrays override defaults** – specifying empty blocked lists results in no restrictions.
- **shell overrides without restrictions do not copy defaults** – default shell restrictions are ignored unless provided.
