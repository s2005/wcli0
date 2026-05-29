# P1 - Preserve '/' when normalizing Unix allowed paths

When a user configures `/` as an allowed path for a Unix-style shell, the replacement at `src/utils/validation.ts:443` turns it into the empty string because `/` matches the trailing-separator regex. The normalized value no longer starts with `/`, so `validateUnixPath` rejects every absolute working directory even though root was explicitly allowed; the root path `/` should be preserved when trimming trailing separators.
