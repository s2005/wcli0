# wsl

- **`should execute a simple command via WSL emulator`** – verifies basic command execution using the emulator and checks output.
- **`should handle commands that result in an error`** – ensures non‑zero exit codes are reported correctly.
- **`should capture stderr output`** – confirms that stderr from the executed command is returned.
- **`should block commands with prohibited shell operators`** – validates injection protection against operators like `;`.
- **WSL Working Directory Validation**
  - **`should execute command in valid WSL working directory when allowed`** – commands run when the workingDir matches an allowed WSL path.
  - **`should reject command in invalid WSL working directory (different root)`** – disallows execution from a path on an unapproved drive.
  - **`should reject command in invalid WSL working directory (disallowed suffix)`** – blocks paths not covered by any allowed entry.
