import * as vscode from 'vscode';
import { Wcli0McpProvider } from './mcpProvider';
import {
  generateConfigFile,
  refreshServerDefinition,
  showLaunchCommand,
  writeWorkspaceMcpJson,
} from './commands';
import { openConfigPanel } from './webview';
import { CONFIG_SECTION } from './settings';

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('wcli0');
  context.subscriptions.push(output);

  const provider = new Wcli0McpProvider((message) => output.appendLine(`[provider] ${message}`));
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

  context.subscriptions.push(
    vscode.commands.registerCommand('wcli0.configure', () => openConfigPanel(context)),
    vscode.commands.registerCommand('wcli0.generateConfigFile', () => generateConfigFile()),
    vscode.commands.registerCommand('wcli0.writeWorkspaceMcpJson', () => writeWorkspaceMcpJson()),
    vscode.commands.registerCommand('wcli0.restartServer', () => refreshServerDefinition(provider)),
    vscode.commands.registerCommand('wcli0.showLaunchCommand', () => showLaunchCommand(output)),
  );
}

export function deactivate(): void {
  // Disposables are cleaned up via context.subscriptions.
}
