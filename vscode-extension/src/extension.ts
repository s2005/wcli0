import * as fs from 'fs';
import * as vscode from 'vscode';
import { Wcli0McpProvider } from './mcpProvider';
import {
  generateConfigFile,
  refreshServerDefinition,
  showLaunchCommand,
  writeWorkspaceMcpJson,
} from './commands';
import { openConfigPanel, Wcli0ConfigViewProvider } from './webview';
import { CONFIG_SECTION } from './settings';

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('wcli0');
  context.subscriptions.push(output);

  // A private, extension-owned directory used as the server's cwd when launch.cwd
  // is unset, so it never auto-loads a config.json from the workspace or a shared
  // temp dir. Created best-effort; the provider falls back to a temp dir.
  let safeCwd: string | undefined = context.globalStorageUri.fsPath;
  try {
    fs.mkdirSync(safeCwd, { recursive: true });
  } catch {
    // Could not create the private dir (read-only/permission-restricted storage).
    // Drop it so the provider falls back to its own temp dir rather than launching
    // with an unusable, nonexistent cwd that would fail every server start.
    safeCwd = undefined;
  }
  // Workspace-scoped storage for the auto-managed per-shell config, so separate
  // windows (each with their own workspace settings) don't clobber each other's
  // file. Falls back to global storage when no workspace is open.
  let managedConfigDir: string | undefined =
    context.storageUri?.fsPath ?? context.globalStorageUri.fsPath;
  try {
    fs.mkdirSync(managedConfigDir, { recursive: true });
  } catch {
    // Could not create the managed-config dir; drop it so the provider falls back
    // to its private dir rather than always selecting this unusable path (which
    // would make every wcli0.shells configuration register no server).
    managedConfigDir = undefined;
  }
  const provider = new Wcli0McpProvider(
    (message) => output.appendLine(`[provider] ${message}`),
    safeCwd,
    managedConfigDir,
  );
  context.subscriptions.push(provider);

  // Register the MCP server definition so VS Code/Copilot can launch wcli0
  // directly from the user's settings — no hand-written mcp.json required. The
  // API is available on the declared engine (VS Code >= 1.101).
  context.subscriptions.push(
    vscode.lm.registerMcpServerDefinitionProvider('wcli0.serverProvider', provider),
  );

  // Re-publish the server definition whenever relevant settings change.
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(CONFIG_SECTION)) {
        provider.refresh();
      }
    }),
  );

  // The provider reads settings for, and resolves ${workspaceFolder} against, the
  // primary workspace folder. In a multi-root workspace that folder can change
  // (removed/reordered) without any wcli0 setting changing, so refresh here too;
  // otherwise the cached definition keeps using the old folder's paths/settings.
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      provider.refresh();
    }),
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('wcli0.configView', new Wcli0ConfigViewProvider(), {
      // Preserve unsaved form edits when the sidebar view is collapsed/hidden,
      // matching the panel's retainContextWhenHidden behavior.
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('wcli0.configure', () => openConfigPanel(context)),
    vscode.commands.registerCommand('wcli0.generateConfigFile', () => generateConfigFile()),
    vscode.commands.registerCommand('wcli0.writeWorkspaceMcpJson', () => writeWorkspaceMcpJson()),
    vscode.commands.registerCommand('wcli0.restartServer', () => refreshServerDefinition(provider)),
    vscode.commands.registerCommand('wcli0.showLaunchCommand', () =>
      showLaunchCommand(output, managedConfigDir),
    ),
  );
}

export function deactivate(): void {
  // Disposables are cleaned up via context.subscriptions.
}
