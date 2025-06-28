# validation/shellSpecific

- **blocks operators based on shell context** – verifies that dangerous shell operators like `&` or `;` are rejected when blocked for that shell.
- **allows all operators if none are blocked** – ensures commands are accepted when the blocked list is empty.
- **blocks commands based on shell context** – tests that listed command names are correctly detected and rejected per shell.
- **normalizes command names for validation** – confirms that file extensions or paths do not bypass blocked command checks.
- **blocks arguments based on shell context** – ensures that prohibited arguments are found regardless of position.
- **handles simple argument patterns** – checks that only exact argument matches are blocked, not substrings.
