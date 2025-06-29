# serverCwdInitialization

- **launch outside allowed paths leaves cwd undefined** – starting the server in a disallowed directory results in no active working directory.
- **execute_command fails when cwd undefined** – commands without a workingDir return an error when no active directory is set.
- **set_current_directory sets active cwd** – using the tool successfully changes the active directory and calls `process.chdir`.
- **get_current_directory reports unset state** – retrieving the current directory before one is set returns a helpful message.
- **initialDir sets active cwd when valid** – a valid `initialDir` is used at startup and becomes the active directory.
- **initialDir chdir failure falls back to process.cwd()** – if changing to `initialDir` fails the server falls back to the process directory.
- **initialDir not in allowedPaths leaves active cwd undefined** – when restrictions prevent using the configured `initialDir`, the active directory remains unset.
