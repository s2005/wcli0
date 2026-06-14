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
  'shells',
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
  const ctrl = setupWebview(current.webview);
  current.onDidDispose(() => {
    ctrl.dispose();
    panel = undefined;
  });
}

export class Wcli0ConfigViewProvider implements vscode.WebviewViewProvider {
  resolveWebviewView(view: vscode.WebviewView): void {
    view.webview.options = { enableScripts: true };
    const ctrl = setupWebview(view.webview);
    view.onDidDispose(() => ctrl.dispose());
  }
}

// Shared by the panel (openConfigPanel) and the sidebar view
// (Wcli0ConfigViewProvider): sets HTML, routes inbound messages, and re-posts
// settings when the configuration changes externally. Returns a Disposable
// that cleans up the message and config-change subscriptions.
function setupWebview(webview: vscode.Webview): vscode.Disposable {
  // The form edits one scope at a time; values shown are those stored at that
  // scope (not inherited), so saving never re-writes the other scope's values.
  let currentScope: ConfigScope = primaryWorkspaceFolder() ? 'Workspace' : 'Global';

  const post = () => {
    const scope = primaryWorkspaceFolder()?.uri;
    webview.postMessage({
      type: 'init',
      hasWorkspace: !!primaryWorkspaceFolder(),
      scope: currentScope,
      settings: readSettingsForScope(currentScope, scope),
    });
  };

  webview.html = renderHtml(webview);
  const msgSub = webview.onDidReceiveMessage(async (msg: { type: string } & Partial<SavePayload>) => {
    if (msg.type === 'ready') {
      post();
    } else if (msg.type === 'scopeChange' && msg.target) {
      currentScope = msg.target;
      post();
    } else if (msg.type === 'save' && msg.values && msg.target) {
      await applySettings(msg as SavePayload);
      webview.postMessage({ type: 'saved' });
      void vscode.window.showInformationMessage(
        `wcli0: settings saved to ${msg.target === 'Global' ? 'User' : 'Workspace'} scope.`,
      );
    } else if (
      msg.type === 'generateConfig' ||
      msg.type === 'writeMcpJson' ||
      msg.type === 'showCommand'
    ) {
      // Export actions operate on persisted settings. Persist the form's current
      // edits first so what the user sees in the form is what gets exported —
      // otherwise unsaved changes (e.g. Limits & Safety) would be silently
      // dropped from the generated config.json / mcp.json / launch command.
      if (msg.values && msg.target) {
        await applySettings(msg as SavePayload);
        webview.postMessage({ type: 'saved' });
      }
      const command =
        msg.type === 'generateConfig'
          ? 'wcli0.generateConfigFile'
          : msg.type === 'writeMcpJson'
            ? 'wcli0.writeWorkspaceMcpJson'
            : 'wcli0.showLaunchCommand';
      await vscode.commands.executeCommand(command);
    }
  });

  const cfgSub = vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration(CONFIG_SECTION)) {
      post();
    }
  });

  return {
    dispose: () => {
      msgSub.dispose();
      cfgSub.dispose();
    },
  };
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
    // An empty object (e.g. wcli0.shells with no configured shells) should clear
    // the setting rather than persist `{}`, so the CLI-flag launch path resumes.
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value).length === 0
    ) {
      value = undefined;
    }
    await config.update(key, value, target);
  }
}

/** Shells that can be configured individually, with display label and WSL flag. */
const PER_SHELL_DEFS: { name: string; label: string; wsl: boolean }[] = [
  { name: 'powershell', label: 'PowerShell', wsl: false },
  { name: 'cmd', label: 'cmd', wsl: false },
  { name: 'gitbash', label: 'Git Bash', wsl: false },
  { name: 'wsl', label: 'WSL', wsl: true },
  { name: 'bash', label: 'bash', wsl: true },
];

/** A tri-state select (default / enabled / disabled) used for optional booleans. */
function triSelect(id: string): string {
  return `<select id="${id}"><option value="default">default</option><option value="enabled">enabled</option><option value="disabled">disabled</option></select>`;
}

/** Render the collapsible per-shell configuration blocks. */
function renderShellBlocks(): string {
  return PER_SHELL_DEFS.map(
    (d) => /* html */ `
  <details class="shell-block">
    <summary>${d.label} <span class="hint">${d.name}</span></summary>
    <div class="row">
      <div><label>Enabled</label>${triSelect(`sh-${d.name}-enabled`)}</div>
      <div><label>Executable command</label><input type="text" id="sh-${d.name}-cmd" /></div>
    </div>
    <label>Executable args <span class="hint">one per line</span></label>
    <textarea id="sh-${d.name}-args"></textarea>
    <details class="overrides">
      <summary>Overrides <span class="hint">leave blank to inherit global settings</span></summary>
      <div class="row">
        <div><label>Max command length</label><input type="number" id="sh-${d.name}-sec-maxlen" min="1" /></div>
        <div><label>Command timeout (s)</label><input type="number" id="sh-${d.name}-sec-timeout" min="1" /></div>
      </div>
      <div class="row">
        <div><label>Injection protection</label>${triSelect(`sh-${d.name}-sec-inject`)}</div>
        <div><label>Restrict working dir</label>${triSelect(`sh-${d.name}-sec-restrict`)}</div>
      </div>
      <label>Blocked commands <span class="hint">one per line; replaces this shell's default blocklist</span></label>
      <textarea id="sh-${d.name}-block-cmd"></textarea>
      <label>Blocked arguments <span class="hint">one per line</span></label>
      <textarea id="sh-${d.name}-block-arg"></textarea>
      <label>Blocked operators <span class="hint">one per line</span></label>
      <textarea id="sh-${d.name}-block-op"></textarea>
      <label>Allowed paths <span class="hint">one per line; supports \${workspaceFolder}</span></label>
      <textarea id="sh-${d.name}-paths"></textarea>
      <label>Initial directory</label>
      <input type="text" id="sh-${d.name}-initdir" />
    </details>
    ${
      d.wsl
        ? `<div class="row">
      <div><label>WSL mount point</label><input type="text" id="sh-${d.name}-wsl-mount" placeholder="/mnt/" /></div>
      <div><label>Inherit global paths</label>${triSelect(`sh-${d.name}-wsl-inherit`)}</div>
    </div>`
        : ''
    }
  </details>`,
  ).join('');
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
  body {
    font-family: var(--vscode-font-family); color: var(--vscode-foreground);
    padding: 0 18px 32px; font-size: var(--vscode-font-size, 13px); line-height: 1.4;
    max-width: 820px;
  }
  h2 {
    margin: 0 0 14px; font-size: 1.05em; font-weight: 600;
    color: var(--vscode-foreground); letter-spacing: 0.02em;
  }
  section {
    margin-top: 18px; padding: 16px 18px; border-radius: 6px;
    background: var(--vscode-editorWidget-background, transparent);
    border: 1px solid var(--vscode-panel-border, var(--vscode-editorWidget-border, transparent));
  }
  label { display: block; margin: 12px 0 4px; font-weight: 600; font-size: 0.92em; }
  section > label:first-of-type, .row label { margin-top: 0; }
  .hint { font-weight: 400; opacity: 0.7; font-size: 0.85em; }
  input[type=text], input[type=number], select, textarea {
    width: 100%; box-sizing: border-box; padding: 6px 8px; font-family: inherit; font-size: inherit;
    background: var(--vscode-input-background); color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, var(--vscode-contrastBorder, transparent));
    border-radius: 4px;
  }
  input:focus, select:focus, textarea:focus {
    outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px;
  }
  input:disabled, select:disabled, textarea:disabled { opacity: 0.45; cursor: not-allowed; }
  textarea { min-height: 60px; font-family: var(--vscode-editor-font-family); resize: vertical; }
  .row { display: flex; gap: 16px; flex-wrap: wrap; }
  .row > div { flex: 1; min-width: 170px; }
  .checkbox { display: flex; align-items: center; gap: 8px; margin-top: 12px; }
  .checkbox input { width: auto; }
  .checkbox label { margin: 0; font-weight: 400; }
  .scopebar {
    position: sticky; top: 0; z-index: 2; padding: 12px 18px 10px; margin-bottom: 4px;
    background: var(--vscode-editor-background);
    border-bottom: 1px solid var(--vscode-panel-border, transparent);
  }
  .savebar { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .saveactions { display: inline-flex; align-items: center; gap: 10px; }
  #save { margin: 0; }
  .saved-msg { color: var(--vscode-charts-green, var(--vscode-terminal-ansiGreen, #3fb950)); font-size: 0.88em; }
  .export-actions { display: flex; flex-wrap: wrap; gap: 8px; }
  .export-actions button { margin: 0; }
  button {
    margin: 4px 8px 0 0; padding: 6px 14px; cursor: pointer; font-family: inherit; font-size: inherit;
    background: var(--vscode-button-background); color: var(--vscode-button-foreground);
    border: 1px solid var(--vscode-button-border, transparent); border-radius: 4px;
  }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
  .scope-radio { display: inline-flex; gap: 14px; align-items: center; flex-wrap: wrap; }
  .scope-radio > span { font-weight: 600; }
  .scope-radio label { display: inline-flex; align-items: center; gap: 5px; font-weight: 400; margin: 0; }
  details.shell-block {
    margin-top: 10px; padding: 10px 12px; border-radius: 5px;
    border: 1px solid var(--vscode-panel-border, var(--vscode-editorWidget-border, transparent));
    background: var(--vscode-editor-background);
  }
  details.shell-block > summary {
    cursor: pointer; font-weight: 600; padding: 2px 0;
  }
  details.overrides { margin-top: 10px; }
  details.overrides > summary { cursor: pointer; font-weight: 600; font-size: 0.9em; opacity: 0.85; padding: 2px 0; }
</style>
</head>
<body>
  <div class="scopebar">
    <div class="savebar">
      <div class="scope-radio">
        <span>Save to:</span>
        <label><input type="radio" name="scope" value="Workspace" checked /> Workspace</label>
        <label><input type="radio" name="scope" value="Global" /> User</label>
      </div>
      <div class="saveactions">
        <span id="savedMsg" class="saved-msg" style="display:none">Saved &#10003;</span>
        <button id="save">Save settings</button>
      </div>
    </div>
    <div class="hint" style="margin-top:6px">
      Workspace: this project's .vscode/settings.json &middot; User: your global settings.
    </div>
    <div id="noWorkspace" class="hint" style="display:none;color:var(--vscode-errorForeground)">
      No workspace folder open — only User scope is available.
    </div>
  </div>

  <section>
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
  </section>

  <section>
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
  </section>

  <section>
  <h2>Per-Shell Configuration</h2>
  <div class="hint" style="margin-bottom:4px">
    Configure each shell individually. When any shell is set here, these values take
    precedence over the single <strong>Shell</strong> dropdown and the global limit/restriction
    fields: the extension writes an auto-managed config file and launches the server with
    <code>--config</code>. Restart the MCP server to apply changes.
  </div>
  ${renderShellBlocks()}
  </section>

  <section>
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
  </section>

  <section>
  <h2>Transport</h2>
  <div class="row">
    <div>
      <label>Mode</label>
      <select id="transport.mode"><option value="stdio">stdio</option><option value="http">http</option><option value="sse">sse</option></select>
    </div>
    <div><label>Host</label><input type="text" id="transport.host" placeholder="127.0.0.1" /></div>
    <div><label>Port</label><input type="number" id="transport.port" placeholder="9444" min="1" max="65535" step="1" /></div>
  </div>
  <div id="transportHint" class="hint" style="margin-top:6px">Host and Port apply to http/sse transport only.</div>
  </section>

  <section>
  <h2>Generate &amp; Export</h2>
  <div class="hint" style="margin-bottom:10px">Export the configuration as a runnable command or file. Your current changes in this form are saved to the selected scope first, so the output always matches what you see.</div>
  <div class="export-actions">
    <button class="secondary" id="showCommand">Show launch command</button>
    <button class="secondary" id="genConfig">Generate config.json</button>
    <button class="secondary" id="writeMcp">Write .vscode/mcp.json</button>
  </div>
  </section>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const $ = (id) => document.getElementById(id);
  const numberFields = ['commandTimeout','maxCommandLength','maxOutputLines','transport.port'];
  const boolFields = ['allowAllDirs','debug'];
  const arrayFields = ['allowedDirectories'];
  const stringFields = ['launch.packageSpec','launch.nodeScriptPath','launch.customCommand','launch.cwd','configFile','shell','wslMountPoint','initialDir','logDirectory','enableTruncation','enableLogResources','safetyMode','launch.method','transport.host','transport.mode'];

  // Per-shell configuration (wcli0.shells). Mirrors PER_SHELL_DEFS on the host.
  const SHELL_DEFS = [
    { name: 'powershell', wsl: false }, { name: 'cmd', wsl: false }, { name: 'gitbash', wsl: false },
    { name: 'wsl', wsl: true }, { name: 'bash', wsl: true },
  ];
  const triToBool = (v) => (v === 'enabled' ? true : v === 'disabled' ? false : undefined);
  const boolToTri = (b) => (b === true ? 'enabled' : b === false ? 'disabled' : 'default');
  const linesOf = (id) => ($(id) ? $(id).value.split('\\n').map((x) => x.trim()).filter(Boolean) : []);
  const numOf = (id) => (!$(id) || $(id).value === '' ? null : Number($(id).value));

  // Build the wcli0.shells object from the form, keeping only non-empty fields so
  // a shell left untouched is omitted (and the whole setting cleared when empty).
  function collectShells() {
    const out = {};
    for (const d of SHELL_DEFS) {
      const n = d.name; const cfg = {};
      const loaded = loadedShells[n] || {};
      const lEx = loaded.executable || {};
      const lOv = loaded.overrides || {};
      const lRest = lOv.restrictions || {};
      const lPaths = lOv.paths || {};
      // A textarea can't distinguish "unset" from an explicit empty array, so when
      // it is empty keep [] only if the loaded config had [] there; otherwise omit.
      const arr = (id, loadedVal) => {
        const lines = linesOf(id);
        if (lines.length) return lines;
        return Array.isArray(loadedVal) ? [] : undefined;
      };
      const en = triToBool($('sh-' + n + '-enabled').value);
      if (en !== undefined) cfg.enabled = en;
      const cmd = $('sh-' + n + '-cmd').value.trim();
      const args = arr('sh-' + n + '-args', lEx.args);
      if (cmd || args !== undefined) {
        cfg.executable = {};
        if (cmd) cfg.executable.command = cmd;
        if (args !== undefined) cfg.executable.args = args;
      }
      const overrides = {};
      const sec = {};
      const maxlen = numOf('sh-' + n + '-sec-maxlen'); if (maxlen != null) sec.maxCommandLength = maxlen;
      const timeout = numOf('sh-' + n + '-sec-timeout'); if (timeout != null) sec.commandTimeout = timeout;
      const inject = triToBool($('sh-' + n + '-sec-inject').value); if (inject !== undefined) sec.enableInjectionProtection = inject;
      const restrict = triToBool($('sh-' + n + '-sec-restrict').value); if (restrict !== undefined) sec.restrictWorkingDirectory = restrict;
      if (Object.keys(sec).length) overrides.security = sec;
      const rest = {};
      const bc = arr('sh-' + n + '-block-cmd', lRest.blockedCommands); if (bc !== undefined) rest.blockedCommands = bc;
      const ba = arr('sh-' + n + '-block-arg', lRest.blockedArguments); if (ba !== undefined) rest.blockedArguments = ba;
      const bo = arr('sh-' + n + '-block-op', lRest.blockedOperators); if (bo !== undefined) rest.blockedOperators = bo;
      if (Object.keys(rest).length) overrides.restrictions = rest;
      const paths = {};
      const ap = arr('sh-' + n + '-paths', lPaths.allowedPaths); if (ap !== undefined) paths.allowedPaths = ap;
      const idir = $('sh-' + n + '-initdir').value.trim(); if (idir) paths.initialDir = idir;
      if (Object.keys(paths).length) overrides.paths = paths;
      if (Object.keys(overrides).length) cfg.overrides = overrides;
      if (d.wsl) {
        const wsl = {};
        const mount = $('sh-' + n + '-wsl-mount').value.trim(); if (mount) wsl.mountPoint = mount;
        const inherit = triToBool($('sh-' + n + '-wsl-inherit').value); if (inherit !== undefined) wsl.inheritGlobalPaths = inherit;
        if (Object.keys(wsl).length) cfg.wslConfig = wsl;
      }
      if (Object.keys(cfg).length) out[n] = cfg;
    }
    return out;
  }

  function setShellsVal(shells) {
    shells = shells || {};
    // Remember the loaded per-shell config so collectShells can distinguish an
    // explicitly-empty array (which a textarea renders identically to "unset").
    loadedShells = shells;
    for (const d of SHELL_DEFS) {
      const n = d.name; const c = shells[n] || {};
      const ex = c.executable || {}; const ov = c.overrides || {};
      const sec = ov.security || {}; const rest = ov.restrictions || {}; const paths = ov.paths || {};
      $('sh-' + n + '-enabled').value = boolToTri(c.enabled);
      $('sh-' + n + '-cmd').value = ex.command || '';
      $('sh-' + n + '-args').value = (ex.args || []).join('\\n');
      $('sh-' + n + '-sec-maxlen').value = sec.maxCommandLength == null ? '' : sec.maxCommandLength;
      $('sh-' + n + '-sec-timeout').value = sec.commandTimeout == null ? '' : sec.commandTimeout;
      $('sh-' + n + '-sec-inject').value = boolToTri(sec.enableInjectionProtection);
      $('sh-' + n + '-sec-restrict').value = boolToTri(sec.restrictWorkingDirectory);
      $('sh-' + n + '-block-cmd').value = (rest.blockedCommands || []).join('\\n');
      $('sh-' + n + '-block-arg').value = (rest.blockedArguments || []).join('\\n');
      $('sh-' + n + '-block-op').value = (rest.blockedOperators || []).join('\\n');
      $('sh-' + n + '-paths').value = (paths.allowedPaths || []).join('\\n');
      $('sh-' + n + '-initdir').value = paths.initialDir || '';
      if (d.wsl) {
        const wsl = c.wslConfig || {};
        $('sh-' + n + '-wsl-mount').value = wsl.mountPoint || '';
        $('sh-' + n + '-wsl-inherit').value = boolToTri(wsl.inheritGlobalPaths);
      }
    }
  }

  function setVal(s) {
    for (const f of stringFields) if ($(f)) $(f).value = s[mapKey(f)] ?? '';
    for (const f of numberFields) if ($(f)) $(f).value = s[mapKey(f)] == null ? '' : s[mapKey(f)];
    for (const f of boolFields) if ($(f)) $(f).checked = !!s[mapKey(f)];
    for (const f of arrayFields) if ($(f)) $(f).value = (s[mapKey(f)] || []).join('\\n');
    setShellsVal(s.shells);
    updateLaunchRows();
    updateTransportRows();
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
  let loadedShells = {};

  function collect() {
    const values = {};
    for (const f of stringFields) if ($(f)) values[f] = $(f).value.trim();
    for (const f of numberFields) if ($(f)) values[f] = $(f).value === '' ? null : Number($(f).value);
    for (const f of boolFields) if ($(f)) values[f] = $(f).checked;
    for (const f of arrayFields) if ($(f)) values[f] = $(f).value.split('\\n').map(x=>x.trim()).filter(Boolean);
    values['shells'] = collectShells();
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

  // Host/Port are only meaningful for networked transports; disable them under
  // stdio so the form reflects what the server actually uses.
  function updateTransportRows() {
    const networked = $('transport.mode').value !== 'stdio';
    $('transport.host').disabled = !networked;
    $('transport.port').disabled = !networked;
    $('transportHint').style.display = networked ? 'none' : '';
  }
  $('transport.mode').addEventListener('change', updateTransportRows);

  $('save').addEventListener('click', () => {
    // Block out-of-range ports (the contributed setting is 1..65535) before
    // saving; an invalid port makes the provider register no server in http mode.
    const portEl = $('transport.port');
    if (portEl && portEl.value !== '' && !portEl.checkValidity()) {
      portEl.reportValidity();
      return;
    }
    const target = document.querySelector('input[name=scope]:checked').value;
    vscode.postMessage({ type: 'save', target, values: collectChanged() });
  });
  // Export actions carry the current form state so the host can persist unsaved
  // edits before generating, keeping the output in sync with what is on screen.
  function exportAction(type) {
    const target = document.querySelector('input[name=scope]:checked').value;
    vscode.postMessage({ type, target, values: collectChanged() });
  }
  $('genConfig').addEventListener('click', () => exportAction('generateConfig'));
  $('writeMcp').addEventListener('click', () => exportAction('writeMcpJson'));
  $('showCommand').addEventListener('click', () => exportAction('showCommand'));

  // Switching scope reloads the values stored at that scope so edits compare
  // against (and save to) the selected scope only.
  for (const radio of document.querySelectorAll('input[name=scope]')) {
    radio.addEventListener('change', () => {
      vscode.postMessage({ type: 'scopeChange', target: radio.value });
    });
  }

  let savedTimer;
  function showSaved() {
    const el = $('savedMsg');
    if (!el) return;
    // Re-baseline so the indicator clears once further edits are made.
    initial = collect();
    el.style.display = '';
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => { el.style.display = 'none'; }, 2500);
  }

  window.addEventListener('message', (e) => {
    const msg = e.data;
    if (msg.type === 'saved') {
      showSaved();
      return;
    }
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
        // .vscode/mcp.json is workspace-relative; nothing to write without a folder.
        $('writeMcp').disabled = true;
      }
    }
  });
  vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
}
