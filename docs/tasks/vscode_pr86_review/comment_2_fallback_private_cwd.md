# P2 - Fall back when the private cwd cannot be created

If creating `context.globalStorageUri` fails (read-only or permission-restricted
extension storage), the catch in `activate` continues and still passes the
unusable `safeCwd` to the provider. The provider's fallback
(`spec.cwd ?? this.safeCwd ?? os.tmpdir()`) only triggers when `safeCwd` is
empty, so it sets the nonexistent directory as the stdio process cwd and every
default launch fails. Clear `safeCwd` in the failure path so the provider's
temp-dir fallback applies. Source: `vscode-extension/src/extension.ts:25`.
