# handlers/resourceHandler

- **lists all resource types** – checks that the ListResources handler returns URIs for configuration and security information when multiple shells are enabled.
- **only lists enabled shells** – verifies that disabled shell entries are omitted from the list output.
- **returns full configuration** – ensures that reading the `cli://config` URI yields the entire server configuration object.
- **returns global configuration only** – confirms that requesting `cli://config/global` omits the per-shell section.
- **returns resolved shell configuration** – validates that a shell-specific URI combines global and override settings.
- **returns security information summary** – tests that `cli://info/security` summarizes enabled shells and key security settings.
- **returns error for unknown resource** – ensures an unknown URI is rejected with an error.
- **returns error for disabled shell resource** – verifies that requesting configuration for a disabled shell produces an error.
- **returns no resource templates by default** – checks that listing resource templates yields an empty array.
