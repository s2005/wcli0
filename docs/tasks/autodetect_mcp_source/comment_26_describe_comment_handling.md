# P26 - Describe the comment handling accurately

The README says comment-bearing `mcp.json` files are refused, but the writer only
refuses non-object/malformed files and instead prompts the user to continue before
rewriting a commented JSONC file as plain JSON. Users relying on this text may think
comments are always protected from removal, so it should say comments trigger a
warning/confirmation rather than being refused.
Reference: vscode-extension/README.md:49.
