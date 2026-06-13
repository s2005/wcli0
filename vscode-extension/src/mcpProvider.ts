import * as vscode from 'vscode';
import { buildLaunchSpec, validateLaunchSpec } from './argsBuilder';
import { primaryWorkspaceFolder, readSettings } from './settings';

const SERVER_LABEL = 'wcli0 Windows CLI';

/**
 * Provides the wcli0 MCP server definition to VS Code based on the current
 * `wcli0.*` settings. Settings are read for the primary workspace folder so
 * that workspace-scoped overrides win over user-scoped values, exactly as
 * VS Code's settings resolution dictates.
 */
export class Wcli0McpProvider implements vscode.McpServerDefinitionProvider {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeMcpServerDefinitions = this._onDidChange.event;

  /** Notify VS Code that definitions may have changed (re-reads settings). */
  refresh(): void {
    this._onDidChange.fire();
  }

  dispose(): void {
    this._onDidChange.dispose();
  }

  provideMcpServerDefinitions(): vscode.ProviderResult<vscode.McpServerDefinition[]> {
    const scope = primaryWorkspaceFolder()?.uri;
    const settings = readSettings(scope);

    const problems = validateLaunchSpec(settings);
    const blocking = problems.filter((p) => p.startsWith('Launch method'));
    if (blocking.length > 0) {
      // Misconfigured launch: surface the issue rather than register a broken server.
      void vscode.window.showWarningMessage(`wcli0: ${blocking.join(' ')}`);
      return [];
    }

    const spec = buildLaunchSpec(settings);

    if (settings.transportMode !== 'stdio') {
      // The server speaks HTTP/SSE; assume the user runs it out-of-band and
      // point VS Code at the listening endpoint.
      const path = settings.transportMode === 'http' ? '/mcp' : '/sse';
      const uri = vscode.Uri.parse(
        `http://${settings.transportHost || '127.0.0.1'}:${settings.transportPort}${path}`,
      );
      return [new vscode.McpHttpServerDefinition(SERVER_LABEL, uri)];
    }

    const def = new vscode.McpStdioServerDefinition(
      SERVER_LABEL,
      spec.command,
      spec.args,
      spec.env,
    );
    if (spec.cwd) {
      def.cwd = vscode.Uri.file(spec.cwd);
    }
    return [def];
  }
}
