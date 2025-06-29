# server/serverImplementation

- **pre-resolves enabled shell configurations** – ensures the server computes resolved settings for enabled shells at startup.
- **lists only enabled shells** – verifies that helper methods return the correct list of active shells.
- **uses initialDir from global config** – tests that a valid `initialDir` changes the server's starting working directory.
- **validates CWD against global allowed paths** – checks that starting in a disallowed directory leaves the active working directory undefined.
- **handles initializeWorkingDirectory with restrictWorkingDirectory** – confirms that invalid initial directories are ignored when restrictions are enabled.
