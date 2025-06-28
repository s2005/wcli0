# errorHandling

- **should handle malformed JSON-RPC requests** – invalid tool parameters result in an `InvalidParams` error.
- **should recover from shell crashes** – spawning a nonexistent shell command triggers an `InternalError` with details from the spawn failure.
- **should throw error on invalid configuration** – loading a config with invalid values raises an exception.
- **should fall back to defaults when config read fails** – if reading the config file throws, defaults are returned and an error is logged.
