# P101 - Revalidate the file after save-time prompts

In `vscode-extension/src/commands.ts:529`, the single up-front snapshot is taken before several
awaited modal prompts, including the environment prompt and the JSONC-comment warning; if another
editor changes `.vscode/mcp.json` while one of those prompts is open, the eventual write still
serializes the old snapshot and silently discards that edit, including changes to unrelated servers.
The file must be re-read and compared immediately before writing, or a document/version-based atomic
update must be used.
