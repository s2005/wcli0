# Modular Shell System Integration Tests

These tests verify the end-to-end integration of the modular shell system, from build configuration to dynamic tool schema generation.

## Tests Summary

- **`Shell Loading Integration`**:
    - Verifies loading of specific shells based on build presets (e.g., `gitbash-only`, `windows`, `full`).
    - Ensures the `shellRegistry` correctly reflects the loaded shells.
    - Tests custom shell inclusion via the `INCLUDED_SHELLS` environment variable.
    - Verifies that the `BUILD_VERBOSE` flag correctly triggers detailed loading logs.
- **`Dynamic Tool Schema Integration`**:
    - Confirms that the `execute_command` tool schema dynamically updates its `shell` enum to match only the shells loaded in the registry.
- **`Registry and Configuration`**:
    - Verifies retrieval of shell plugins from the registry.
    - Ensures shell-specific validation logic (blocked commands/operators) is correctly applied via the registry plugins.
- **`Build Workflow`**:
    - Tests the complete sequence: Setting a preset -> Loading shells -> Verifying registry -> Generating dynamic schemas.
- **`Error Handling`**:
    - Handles empty shell lists and unknown shell types gracefully.
    - Verifies that the registry can be cleared and reloaded with different configurations.
