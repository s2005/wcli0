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

    const blocking = validateLaunchSpec(settings).filter((p) => p.blocking);
    if (blocking.length > 0) {
      // Misconfigured launch: surface the issue rather than register a broken server.
      void vscode.window.showWarningMessage(`wcli0: ${blocking.map((p) => p.message).join(' ')}`);
      return [];
    }

    if (settings.transportMode === 'sse') {
      // McpHttpServerDefinition represents the modern Streamable HTTP transport,
      // not legacy SSE, so it can't drive an SSE server. Don't auto-register;
      // users can still write a `.vscode/mcp.json` SSE entry via the command.
      void vscode.window.showWarningMessage(
        'wcli0: legacy "sse" transport cannot be auto-registered. Use "http" or run the server and add an SSE entry to .vscode/mcp.json.',
      );
      return [];
    }

    if (settings.transportMode === 'http') {
      // The server speaks HTTP; assume the user runs it out-of-band and point
      // VS Code at the listening endpoint (translating wildcard binds to loopback).
      const uri = vscode.Uri.parse(
        `http://${clientHost(settings.transportHost)}:${settings.transportPort}/mcp`,
      );
      return [new vscode.McpHttpServerDefinition(SERVER_LABEL, uri)];
    }

    const spec = buildLaunchSpec(settings);
    const def = new vscode.McpStdioServerDefinition(
      SERVER_LABEL,
      spec.command,
      spec.args,
      spec.env,
    );
    // Default the process cwd to the primary workspace folder so relative paths
    // resolve as the setting descriptions promise.
    const cwd = spec.cwd ?? primaryWorkspaceFolder()?.uri.fsPath;
    if (cwd) {
      def.cwd = vscode.Uri.file(cwd);
    }
    return [def];
  }
}

/**
 * Turn a server *bind* host into a host a client can connect to. Wildcard binds
 * (`0.0.0.0`, `::`) are not routable destinations, so map them to loopback;
 * literal IPv6 addresses are wrapped in brackets for use in a URL authority.
 */
export function clientHost(bindHost: string): string {
  const host = (bindHost || '127.0.0.1').trim();
  if (host === '0.0.0.0' || host === '::' || host === '[::]') {
    return host === '0.0.0.0' ? '127.0.0.1' : '[::1]';
  }
  // Bracket bare IPv6 literals (contain ':' and aren't already bracketed).
  if (host.includes(':') && !host.startsWith('[')) {
    return `[${host}]`;
  }
  return host;
}
