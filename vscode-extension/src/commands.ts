import * as vscode from 'vscode';
import { buildLaunchSpec, renderCommandLine, validateLaunchSpec } from './argsBuilder';
import { buildConfigFile } from './configFile';
import { primaryWorkspaceFolder, readSettings, resolveVariables } from './settings';
import { Wcli0McpProvider } from './mcpProvider';

/** Generate a wcli0 config.json from settings and offer to save it. */
export async function generateConfigFile(): Promise<void> {
  const scope = primaryWorkspaceFolder()?.uri;
  const settings = readSettings(scope);
  const config = buildConfigFile(settings);
  const content = JSON.stringify(config, null, 2) + '\n';

  const folder = primaryWorkspaceFolder();
  const defaultUri = folder
    ? vscode.Uri.joinPath(folder.uri, 'wcli0.config.json')
    : undefined;

  const target = await vscode.window.showSaveDialog({
    defaultUri,
    filters: { JSON: ['json'] },
    saveLabel: 'Save wcli0 config',
  });
  if (!target) {
    return;
  }
  await vscode.workspace.fs.writeFile(target, Buffer.from(content, 'utf8'));
  const doc = await vscode.workspace.openTextDocument(target);
  await vscode.window.showTextDocument(doc);

  const useIt = await vscode.window.showInformationMessage(
    'Config written. Reference it from settings via wcli0.configFile?',
    'Set wcli0.configFile',
    'Not now',
  );
  if (useIt === 'Set wcli0.configFile') {
    const cfgTarget = folder
      ? vscode.ConfigurationTarget.Workspace
      : vscode.ConfigurationTarget.Global;
    await vscode.workspace
      .getConfiguration('wcli0', scope ?? null)
      .update('configFile', target.fsPath, cfgTarget);
  }
}

/** Write a `.vscode/mcp.json` entry for the wcli0 server (for clients that read it). */
export async function writeWorkspaceMcpJson(): Promise<void> {
  const folder = primaryWorkspaceFolder();
  if (!folder) {
    void vscode.window.showErrorMessage('wcli0: open a workspace folder first.');
    return;
  }
  const settings = readSettings(folder.uri);
  const spec = buildLaunchSpec(settings);

  const entry: Record<string, unknown> =
    settings.transportMode === 'stdio'
      ? {
          type: 'stdio',
          command: spec.command,
          args: spec.args,
          ...(Object.keys(spec.env).length ? { env: spec.env } : {}),
        }
      : {
          type: settings.transportMode === 'http' ? 'http' : 'sse',
          url: `http://${settings.transportHost || '127.0.0.1'}:${settings.transportPort}${
            settings.transportMode === 'http' ? '/mcp' : '/sse'
          }`,
        };

  const mcpUri = vscode.Uri.joinPath(folder.uri, '.vscode', 'mcp.json');
  let existing: Record<string, unknown> = {};
  try {
    const raw = await vscode.workspace.fs.readFile(mcpUri);
    existing = JSON.parse(Buffer.from(raw).toString('utf8')) as Record<string, unknown>;
  } catch {
    // No existing file — start fresh.
  }
  const servers = (existing.servers as Record<string, unknown>) ?? {};
  servers.wcli0 = entry;
  existing.servers = servers;

  await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(folder.uri, '.vscode'));
  await vscode.workspace.fs.writeFile(
    mcpUri,
    Buffer.from(JSON.stringify(existing, null, 2) + '\n', 'utf8'),
  );
  const doc = await vscode.workspace.openTextDocument(mcpUri);
  await vscode.window.showTextDocument(doc);
}

/** Show the resolved launch command line and offer to copy it. */
export async function showLaunchCommand(output: vscode.OutputChannel): Promise<void> {
  const scope = primaryWorkspaceFolder()?.uri;
  const settings = readSettings(scope);
  const spec = buildLaunchSpec(settings);
  const line = renderCommandLine(spec);
  const problems = validateLaunchSpec(settings);

  output.clear();
  output.appendLine('Resolved wcli0 launch command:');
  output.appendLine('');
  output.appendLine(line);
  if (spec.cwd) {
    output.appendLine('');
    output.appendLine(`cwd: ${spec.cwd}`);
  }
  if (Object.keys(spec.env).length) {
    output.appendLine(`env: ${JSON.stringify(spec.env)}`);
  }
  if (problems.length) {
    output.appendLine('');
    output.appendLine('Notes:');
    for (const p of problems) {
      output.appendLine(`  - ${p}`);
    }
  }
  output.show(true);

  const pick = await vscode.window.showInformationMessage(
    'wcli0 launch command written to output.',
    'Copy command',
  );
  if (pick === 'Copy command') {
    await vscode.env.clipboard.writeText(line);
  }
}

/** Ask the MCP provider to re-read settings and restart the server. */
export async function restartServer(provider: Wcli0McpProvider): Promise<void> {
  provider.refresh();
  void vscode.window.showInformationMessage('wcli0: MCP server definitions refreshed.');
}

export { resolveVariables };
