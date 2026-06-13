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

  const provider = new Wcli0McpProvider();
  context.subscriptions.push(provider);

  // Register the MCP server definition so VS Code/Copilot can launch wcli0
  // directly from the user's settings — no hand-written mcp.json required.
  const lm = vscode.lm as typeof vscode.lm & {
    registerMcpServerDefinitionProvider?: (
      id: string,
      provider: vscode.McpServerDefinitionProvider,
    ) => vscode.Disposable;
  };
  if (typeof lm.registerMcpServerDefinitionProvider === 'function') {
    context.subscriptions.push(
      lm.registerMcpServerDefinitionProvider('wcli0.serverProvider', provider),
    );
  } else {
    output.appendLine(
      'This VS Code version lacks the MCP server definition provider API (needs 1.101+). ' +
        'Use "wcli0: Write .vscode/mcp.json" instead.',
    );
  }

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
