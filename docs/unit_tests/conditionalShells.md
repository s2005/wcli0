# conditionalShells

- **WSL only included with explicit configuration** – ensures the WSL shell is available only when the `wsl` shell is specified in configuration.
- **backward compatibility with explicit shell list** – specifying all shells explicitly retains each shell entry in the loaded config.
- **assigns validatePath and blockedOperators for shells** – enabled shells have default path validators and blocked operator lists populated.
