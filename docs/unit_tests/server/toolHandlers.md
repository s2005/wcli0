# server/toolHandlers

- **returns configuration summary** – the get_config tool should provide the cleaned configuration structure.
- **supports shell-specific validation** – validate_directories must apply allowed path rules per-shell when a shell argument is provided.
- **validates against global allowed paths** – set_current_directory uses the global allowed list to decide if changing the active directory is permitted.
