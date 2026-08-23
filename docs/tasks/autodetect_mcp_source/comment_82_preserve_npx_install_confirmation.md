# P82 - Preserve npx's installation confirmation behavior

In `vscode-extension/src/configSource.ts:966` (`parseMcpEntry`), a valid hand-written entry such as
`command: "npx", args: ["wcli0@1.2.3"]` enters the npx fast path even though it omitted `-y`, but
`buildLaunchSpec` always rewrites npx launches as `npx -y ...`, so an unrelated Save turns a
potentially interactive installation into one that automatically accepts the download. The installed
npm documentation (`docs/content/commands/npx.md`) states that npx prompts before installing and that
`-y` suppresses this prompt, so the modeled fast path must only be used when `-y` was present, or its
absence must be preserved explicitly.
