# asyncOperations

- **should handle concurrent command executions** – runs multiple commands in parallel and verifies that each completes successfully.
- **should queue commands when limit reached** – ensures additional commands wait when a concurrency limit is exceeded.
- **should handle concurrent errors independently** – confirms that failures in one command do not affect others running at the same time.
