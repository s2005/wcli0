# processManagement

- **should terminate process on timeout** – ensures that a long-running command is killed after exceeding the configured timeout.
- **should handle process spawn errors gracefully** – verifies that spawn failures throw a descriptive `McpError`.
- **should propagate shell process errors** – checks that errors emitted by the spawned process reject the command.
- **should clear timeout when process exits normally** – confirms that the timeout is cleared and the process is not killed when it finishes before the limit.
