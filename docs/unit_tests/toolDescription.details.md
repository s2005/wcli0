# toolDescription.details

- **buildExecuteCommandDescription includes shell summaries and examples** – verifies that the detailed description lists each enabled shell with sample usage.
- **buildExecuteCommandDescription notes path formats for all shells** – ensures path format hints for Windows, mixed, and Unix shells appear.
- **buildValidateDirectoriesDescription describes shell specific mode** – confirms the shell-specific validation block is documented when enabled.
- **buildValidateDirectoriesDescription without shell specific mode** – checks the simpler description when shell-specific validation is disabled.
- **buildGetConfigDescription outlines return fields** – validates that the get_config tool documentation lists the configuration fields returned (`global` and `shells`).
