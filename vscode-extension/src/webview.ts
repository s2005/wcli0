import * as vscode from 'vscode';
import {
  CONFIG_SECTION,
  ConfigScope,
  primaryWorkspaceFolder,
  readSettingsForScope,
} from './settings';

/** Settings keys editable from the form, with their value types. */
const FIELD_KEYS = [
  'launch.method',
  'launch.packageSpec',
  'launch.nodeScriptPath',
  'launch.customCommand',
  'launch.cwd',
  'configFile',
  'shell',
  'allowedDirectories',
  'initialDir',
  'commandTimeout',
  'maxCommandLength',
  'wslMountPoint',
  'maxOutputLines',
  'enableTruncation',
  'enableLogResources',
  'logDirectory',
  'allowAllDirs',
  'safetyMode',
  'debug',
  'transport.mode',
  'transport.host',
  'transport.port',
] as const;

interface SavePayload {
  target: 'Global' | 'Workspace';
  values: Record<string, unknown>;
}

let panel: vscode.WebviewPanel | undefined;

export function openConfigPanel(context: vscode.ExtensionContext): void {
  if (panel) {
    panel.reveal();
    return;
  }
  panel = vscode.window.createWebviewPanel(
    'wcli0.configure',
    'wcli0 Configuration',
    vscode.ViewColumn.Active,
    { enableScripts: true, retainContextWhenHidden: true },
  );
  const current = panel;
  current.onDidDispose(() => {
    panel = undefined;
  });

  // The form edits one scope at a time; values shown are those stored at that
  // scope (not inherited), so saving never re-writes the other scope's values.
  let currentScope: ConfigScope = primaryWorkspaceFolder() ? 'Workspace' : 'Global';

  const post = () => {
    const scope = primaryWorkspaceFolder()?.uri;
    current.webview.postMessage({
      type: 'init',
      hasWorkspace: !!primaryWorkspaceFolder(),
      scope: currentScope,
      settings: readSettingsForScope(currentScope, scope),
    });
  };

  current.webview.html = renderHtml(current.webview);
  current.webview.onDidReceiveMessage(async (msg: { type: string } & Partial<SavePayload>) => {
    if (msg.type === 'ready') {
      post();
    } else if (msg.type === 'scopeChange' && msg.target) {
      currentScope = msg.target;
      post();
    } else if (msg.type === 'save' && msg.values && msg.target) {
      await applySettings(msg as SavePayload);
      void vscode.window.showInformationMessage(
        `wcli0: settings saved to ${msg.target === 'Global' ? 'User' : 'Workspace'} scope.`,
      );
    } else if (msg.type === 'generateConfig') {
      await vscode.commands.executeCommand('wcli0.generateConfigFile');
    } else if (msg.type === 'writeMcpJson') {
      await vscode.commands.executeCommand('wcli0.writeWorkspaceMcpJson');
    } else if (msg.type === 'showCommand') {
      await vscode.commands.executeCommand('wcli0.showLaunchCommand');
    }
  });

  // Keep the form in sync if settings change elsewhere.
  const sub = vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration(CONFIG_SECTION)) {
      post();
    }
  });
  current.onDidDispose(() => sub.dispose());
}

async function applySettings(payload: SavePayload): Promise<void> {
  const target =
    payload.target === 'Workspace'
      ? vscode.ConfigurationTarget.Workspace
      : vscode.ConfigurationTarget.Global;
  const scope = payload.target === 'Workspace' ? primaryWorkspaceFolder()?.uri : undefined;
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION, scope ?? null);

  for (const key of FIELD_KEYS) {
    if (!(key in payload.values)) {
      continue;
    }
    let value = payload.values[key];
    // Normalize "empty" values back to undefined so the setting reverts to default.
    if (value === '' || value === null) {
      value = undefined;
    }
    await config.update(key, value, target);
  }
}

function renderHtml(webview: vscode.Webview): string {
  const nonce = String(Math.random()).slice(2);
  const csp = `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';`;
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 12px 18px; }
  h2 { margin-top: 22px; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 4px; }
  label { display: block; margin: 10px 0 3px; font-weight: 600; }
  .hint { font-weight: 400; opacity: 0.75; font-size: 0.85em; }
  input[type=text], input[type=number], select, textarea {
    width: 100%; box-sizing: border-box; padding: 5px 7px;
    background: var(--vscode-input-background); color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent); border-radius: 3px;
  }
  textarea { min-height: 60px; font-family: var(--vscode-editor-font-family); }
  .row { display: flex; gap: 16px; flex-wrap: wrap; }
  .row > div { flex: 1; min-width: 180px; }
  .checkbox { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
  .checkbox input { width: auto; }
  .scopebar { position: sticky; top: 0; background: var(--vscode-editor-background); padding: 10px 0; z-index: 2; }
  button {
    margin: 4px 8px 4px 0; padding: 6px 14px; cursor: pointer;
    background: var(--vscode-button-background); color: var(--vscode-button-foreground);
    border: none; border-radius: 3px;
  }
  button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  .scope-radio { display: inline-flex; gap: 14px; align-items: center; }
  .scope-radio label { display: inline; font-weight: 600; margin: 0; }
</style>
</head>
<body>
  <div class="scopebar">
    <div class="scope-radio">
      <span>Save to:</span>
      <label><input type="radio" name="scope" value="Workspace" checked /> Workspace</label>
      <label><input type="radio" name="scope" value="Global" /> User</label>
    </div>
    <div style="margin-top:8px">
      <button id="save">Save settings</button>
      <button class="secondary" id="showCommand">Show launch command</button>
      <button class="secondary" id="genConfig">Generate config.json</button>
      <button class="secondary" id="writeMcp">Write .vscode/mcp.json</button>
    </div>
    <div id="noWorkspace" class="hint" style="display:none;color:var(--vscode-errorForeground)">
      No workspace folder open — only User scope is available.
    </div>
  </div>

  <h2>Launch</h2>
  <label>Launch method <span class="hint">how the server process starts</span></label>
  <select id="launch.method">
    <option value="npx">npx (published package)</option>
    <option value="node">node (local build)</option>
    <option value="custom">custom command</option>
  </select>
  <div id="npxRow"><label>Package spec</label><input type="text" id="launch.packageSpec" placeholder="wcli0@latest" /></div>
  <div id="nodeRow"><label>Path to dist/index.js</label><input type="text" id="launch.nodeScriptPath" placeholder="/path/to/wcli0/dist/index.js" /></div>
  <div id="customRow"><label>Custom command</label><input type="text" id="launch.customCommand" /></div>
  <label>Working directory <span class="hint">supports \${workspaceFolder}</span></label>
  <input type="text" id="launch.cwd" placeholder="\${workspaceFolder}" />
  <label>Config file <span class="hint">passed via --config; CLI settings override it</span></label>
  <input type="text" id="configFile" placeholder="\${workspaceFolder}/wcli0.config.json" />

  <h2>Shells & Directories</h2>
  <div class="row">
    <div>
      <label>Shell</label>
      <select id="shell">
        <option value="all">all</option>
        <option value="cmd">cmd</option>
        <option value="powershell">powershell</option>
        <option value="gitbash">gitbash</option>
        <option value="wsl">wsl</option>
        <option value="bash">bash</option>
      </select>
    </div>
    <div>
      <label>WSL mount point</label>
      <input type="text" id="wslMountPoint" placeholder="/mnt/" />
    </div>
  </div>
  <label>Allowed directories <span class="hint">one per line; supports \${workspaceFolder}</span></label>
  <textarea id="allowedDirectories" placeholder="\${workspaceFolder}"></textarea>
  <label>Initial directory</label>
  <input type="text" id="initialDir" />

  <h2>Limits & Safety</h2>
  <div class="row">
    <div><label>Command timeout (s)</label><input type="number" id="commandTimeout" min="1" /></div>
    <div><label>Max command length</label><input type="number" id="maxCommandLength" min="1" /></div>
    <div><label>Max output lines</label><input type="number" id="maxOutputLines" min="1" /></div>
  </div>
  <div class="row">
    <div>
      <label>Safety mode</label>
      <select id="safetyMode">
        <option value="safe">safe (recommended)</option>
        <option value="yolo">yolo (keep dir restrictions)</option>
        <option value="unsafe">unsafe (no restrictions)</option>
      </select>
    </div>
    <div>
      <label>Truncation</label>
      <select id="enableTruncation"><option value="default">default</option><option value="enabled">enabled</option><option value="disabled">disabled</option></select>
    </div>
    <div>
      <label>Log resources</label>
      <select id="enableLogResources"><option value="default">default</option><option value="enabled">enabled</option><option value="disabled">disabled</option></select>
    </div>
  </div>
  <label>Log directory</label>
  <input type="text" id="logDirectory" />
  <div class="checkbox"><input type="checkbox" id="allowAllDirs" /><label>Allow all directories when none configured</label></div>
  <div class="checkbox"><input type="checkbox" id="debug" /><label>Enable debug logging</label></div>

  <h2>Transport</h2>
  <div class="row">
    <div>
      <label>Mode</label>
      <select id="transport.mode"><option value="stdio">stdio</option><option value="http">http</option><option value="sse">sse</option></select>
    </div>
    <div><label>Host</label><input type="text" id="transport.host" placeholder="127.0.0.1" /></div>
    <div><label>Port</label><input type="number" id="transport.port" placeholder="9444" /></div>
  </div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const $ = (id) => document.getElementById(id);
  const numberFields = ['commandTimeout','maxCommandLength','maxOutputLines','transport.port'];
  const boolFields = ['allowAllDirs','debug'];
  const arrayFields = ['allowedDirectories'];
  const stringFields = ['launch.packageSpec','launch.nodeScriptPath','launch.customCommand','launch.cwd','configFile','shell','wslMountPoint','initialDir','logDirectory','enableTruncation','enableLogResources','safetyMode','launch.method','transport.host','transport.mode'];

  function setVal(s) {
    for (const f of stringFields) if ($(f)) $(f).value = s[mapKey(f)] ?? '';
    for (const f of numberFields) if ($(f)) $(f).value = s[mapKey(f)] == null ? '' : s[mapKey(f)];
    for (const f of boolFields) if ($(f)) $(f).checked = !!s[mapKey(f)];
    for (const f of arrayFields) if ($(f)) $(f).value = (s[mapKey(f)] || []).join('\\n');
    updateLaunchRows();
  }

  // Map dotted setting key -> normalized settings property name.
  function mapKey(k) {
    const map = {
      'launch.method':'launchMethod','launch.packageSpec':'packageSpec','launch.nodeScriptPath':'nodeScriptPath',
      'launch.customCommand':'customCommand','launch.cwd':'cwd','transport.mode':'transportMode',
      'transport.host':'transportHost','transport.port':'transportPort'
    };
    return map[k] || k;
  }

  let initial = {};

  function collect() {
    const values = {};
    for (const f of stringFields) if ($(f)) values[f] = $(f).value.trim();
    for (const f of numberFields) if ($(f)) values[f] = $(f).value === '' ? null : Number($(f).value);
    for (const f of boolFields) if ($(f)) values[f] = $(f).checked;
    for (const f of arrayFields) if ($(f)) values[f] = $(f).value.split('\\n').map(x=>x.trim()).filter(Boolean);
    return values;
  }

  // Only submit fields the user actually changed. The form is populated from the
  // merged (effective) configuration; writing every field to a scope would copy
  // inherited values from the other scope (e.g. saving to User would persist
  // workspace-specific values globally).
  function collectChanged() {
    const all = collect();
    const changed = {};
    for (const k of Object.keys(all)) {
      if (JSON.stringify(all[k]) !== JSON.stringify(initial[k])) {
        changed[k] = all[k];
      }
    }
    return changed;
  }

  function updateLaunchRows() {
    const m = $('launch.method').value;
    $('npxRow').style.display = m === 'npx' ? '' : 'none';
    $('nodeRow').style.display = m === 'node' ? '' : 'none';
    $('customRow').style.display = m === 'custom' ? '' : 'none';
  }
  $('launch.method').addEventListener('change', updateLaunchRows);

  $('save').addEventListener('click', () => {
    const target = document.querySelector('input[name=scope]:checked').value;
    vscode.postMessage({ type: 'save', target, values: collectChanged() });
  });
  $('genConfig').addEventListener('click', () => vscode.postMessage({ type: 'generateConfig' }));
  $('writeMcp').addEventListener('click', () => vscode.postMessage({ type: 'writeMcpJson' }));
  $('showCommand').addEventListener('click', () => vscode.postMessage({ type: 'showCommand' }));

  // Switching scope reloads the values stored at that scope so edits compare
  // against (and save to) the selected scope only.
  for (const radio of document.querySelectorAll('input[name=scope]')) {
    radio.addEventListener('change', () => {
      vscode.postMessage({ type: 'scopeChange', target: radio.value });
    });
  }

  window.addEventListener('message', (e) => {
    const msg = e.data;
    if (msg.type === 'init') {
      if (msg.scope) {
        const r = document.querySelector('input[name=scope][value=' + msg.scope + ']');
        if (r) r.checked = true;
      }
      setVal(msg.settings);
      initial = collect();
      if (!msg.hasWorkspace) {
        $('noWorkspace').style.display = 'block';
        document.querySelector('input[name=scope][value=Workspace]').disabled = true;
        document.querySelector('input[name=scope][value=Global]').checked = true;
      }
    }
  });
  vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
}
