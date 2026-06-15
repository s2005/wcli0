import * as vscode from 'vscode';
import {
  CONFIG_SECTION,
  ConfigScope,
  explicitlySetArrayKeys,
  explicitlySetKeys,
  explicitlySetSelectKeys,
  OPTIONAL_STRING_KEYS,
  primaryWorkspaceFolder,
  readSettingsForScope,
} from './settings';

/** Keys where an explicit empty string is a meaningful override, not "clear". */
const OPTIONAL_STRING_KEY_SET = new Set<string>(OPTIONAL_STRING_KEYS);

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

  // `external` marks a reload triggered by a background configuration change (not
  // an explicit ready/scope-change). The webview ignores such a reload while the
  // form has unsaved edits so it doesn't silently overwrite the user's work.
  const post = (external = false) => {
    const scope = primaryWorkspaceFolder()?.uri;
    webview.postMessage({
      type: 'init',
      external,
      hasWorkspace: !!primaryWorkspaceFolder(),
      scope: currentScope,
      settings: readSettingsForScope(currentScope, scope),
      // Which optional-string keys are explicitly set at this scope, so the form
      // can distinguish an empty override from "Inherit" (both read as empty).
      setKeys: explicitlySetKeys(currentScope, scope),
      // Which inheritable enum/boolean keys are explicitly set at this scope, so the
      // form can show "Inherit" for an unset field instead of the schema default it
      // reads back (which would misreport e.g. an unset safetyMode as "safe").
      setSelectKeys: explicitlySetSelectKeys(currentScope, scope),
      // Which optional-array keys (allowedDirectories) are explicitly set at this
      // scope, so the form can show an explicit empty override as set rather than as
      // "Inherit" (both render an empty textarea otherwise — see P69).
      setArrayKeys: explicitlySetArrayKeys(currentScope, scope),
    });
  };

  webview.html = renderHtml(webview);
  const msgSub = webview.onDidReceiveMessage(async (msg: { type: string } & Partial<SavePayload>) => {
    if (msg.type === 'ready') {
      post();
    } else if (msg.type === 'scopeChange' && msg.target) {
      currentScope = msg.target;
      post();
    } else if (msg.type === 'scopeChangeRequest' && msg.target) {
      // The form has unsaved edits and the user switched the scope radio. Switching
      // reloads the other scope's values (a non-external init that bypasses the
      // dirty guard), which would silently discard those edits — so confirm first.
      // The webview already reverted the radio to the loaded scope; only on an
      // explicit confirmation do we switch and reload (window.confirm is unavailable
      // in a VS Code webview, so the host drives the modal). See P70.
      const choice = await vscode.window.showWarningMessage(
        `Discard unsaved changes and switch to ${msg.target === 'Global' ? 'User' : 'Workspace'} scope?`,
        { modal: true },
        'Discard changes',
      );
      if (choice === 'Discard changes') {
        currentScope = msg.target;
        post();
      }
    } else if (msg.type === 'save' && msg.values && msg.target) {
      await applySettings(msg as SavePayload);
      // Re-post the now-persisted settings before the saved indicator re-baselines.
      // A background configuration change that arrived while the form was dirty was
      // skipped (to protect unsaved edits) and never reconciled; without this refresh
      // the form would keep showing stale values for fields the user did not touch
      // (e.g. an external safetyMode -> unsafe). A save submits every changed field,
      // so re-posting cannot lose an edit but does pick up untouched external values.
      post();
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
        // Refresh from the persisted state (reconciling any deferred external change)
        // before re-baselining, matching the save path above.
        post();
        webview.postMessage({ type: 'saved' });
      }
      const command =
        msg.type === 'generateConfig'
          ? 'wcli0.generateConfigFile'
          : msg.type === 'writeMcpJson'
            ? 'wcli0.writeWorkspaceMcpJson'
            : 'wcli0.showLaunchCommand';
      // Pass the form's selected scope so the export reads exactly the values the
      // form shows (readSettingsForScope), not the merged effective settings —
      // otherwise a hidden override from the other scope (e.g. a workspace
      // safetyMode: unsafe) could leak into an export the form claims matches.
      await vscode.commands.executeCommand(command, currentScope);
    }
  });

  const cfgSub = vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration(CONFIG_SECTION)) {
      post(true);
    }
  });

  // Adding/removing the first workspace folder changes which scopes are
  // selectable and whether ${workspaceFolder} resolves. Re-post so the webview
  // re-renders its scope controls, normalizing currentScope to Global when no
  // folder remains (Workspace would otherwise point at a non-existent target).
  const wsSub = vscode.workspace.onDidChangeWorkspaceFolders(() => {
    if (!primaryWorkspaceFolder() && currentScope === 'Workspace') {
      currentScope = 'Global';
    }
    post(true);
  });

  return {
    dispose: () => {
      msgSub.dispose();
      cfgSub.dispose();
      wsSub.dispose();
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
    // For optional-string keys an explicit '' is a meaningful override (it masks a
    // non-empty value from the other scope), so only `null` (the form's Inherit)
    // clears them; '' is persisted as-is.
    if (value === null || (value === '' && !OPTIONAL_STRING_KEY_SET.has(key))) {
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
    <option value="">Inherit</option>
    <option value="npx">npx (published package)</option>
    <option value="node">node (local build)</option>
    <option value="custom">custom command</option>
  </select>
  <div id="npxRow"><label>Package spec</label><input type="text" id="launch.packageSpec" placeholder="wcli0@latest" /></div>
  <div id="nodeRow"><label>Path to dist/index.js</label><input type="text" id="launch.nodeScriptPath" placeholder="/path/to/wcli0/dist/index.js" /></div>
  <div id="customRow"><label>Custom command</label><input type="text" id="launch.customCommand" /></div>
  <label>Working directory <span class="hint">supports \${workspaceFolder}</span></label>
  <input type="text" id="launch.cwd" placeholder="\${workspaceFolder}" />
  <label class="checkbox optional-inherit"><input type="checkbox" id="launch.cwd-inherit" /> Inherit <span class="hint">no override; uncheck to set an explicit value (empty allowed)</span></label>
  <label>Config file <span class="hint">passed via --config; CLI settings override it</span></label>
  <input type="text" id="configFile" placeholder="\${workspaceFolder}/wcli0.config.json" />
  <label class="checkbox optional-inherit"><input type="checkbox" id="configFile-inherit" /> Inherit <span class="hint">no override; uncheck to set an explicit value (empty allowed)</span></label>
  </section>

  <section>
  <h2>Shells & Directories</h2>
  <div class="row">
    <div>
      <label>Shell</label>
      <select id="shell">
        <option value="">Inherit</option>
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
  <label class="checkbox optional-inherit"><input type="checkbox" id="allowedDirectories-inherit" /> Inherit <span class="hint">no override; uncheck and leave empty to set an explicit empty list that masks the other scope</span></label>
  <label>Initial directory</label>
  <input type="text" id="initialDir" />
  <label class="checkbox optional-inherit"><input type="checkbox" id="initialDir-inherit" /> Inherit <span class="hint">no override; uncheck to set an explicit value (empty allowed)</span></label>
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
        <option value="">Inherit</option>
        <option value="safe">safe (recommended)</option>
        <option value="yolo">yolo (keep dir restrictions)</option>
        <option value="unsafe">unsafe (no restrictions)</option>
      </select>
    </div>
    <div>
      <label>Truncation</label>
      <select id="enableTruncation"><option value="">Inherit</option><option value="default">default</option><option value="enabled">enabled</option><option value="disabled">disabled</option></select>
    </div>
    <div>
      <label>Log resources</label>
      <select id="enableLogResources"><option value="">Inherit</option><option value="default">default</option><option value="enabled">enabled</option><option value="disabled">disabled</option></select>
    </div>
  </div>
  <label>Log directory</label>
  <input type="text" id="logDirectory" />
  <label class="checkbox optional-inherit"><input type="checkbox" id="logDirectory-inherit" /> Inherit <span class="hint">no override; uncheck to set an explicit value (empty allowed)</span></label>
  <div class="row">
    <div><label>Allow all directories</label>${triSelect('allowAllDirs')}</div>
    <div><label>Debug logging</label>${triSelect('debug')}</div>
  </div>
  </section>

  <section>
  <h2>Transport</h2>
  <div class="row">
    <div>
      <label>Mode</label>
      <select id="transport.mode"><option value="">Inherit</option><option value="stdio">stdio</option><option value="http">http</option><option value="sse">sse</option></select>
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
  // Booleans rendered as tri-state selects (Inherit / enabled / disabled). Selecting
  // Inherit submits null, which applySettings maps to undefined -> clears the value
  // at the target scope so a previous override can be removed from the form.
  const triBoolFields = ['allowAllDirs','debug'];
  const arrayFields = ['allowedDirectories'];
  const stringFields = ['launch.packageSpec','launch.nodeScriptPath','launch.customCommand','launch.cwd','configFile','shell','wslMountPoint','initialDir','logDirectory','enableTruncation','enableLogResources','safetyMode','launch.method','transport.host','transport.mode'];
  // Optional string settings where an explicit empty value is a meaningful
  // override (it disables a non-empty value from the other scope). Each has an
  // Inherit checkbox: checked -> no override (collect emits null -> cleared);
  // unchecked -> the explicit text value, INCLUDING empty, is persisted. Mirrors
  // OPTIONAL_STRING_KEYS on the host.
  const optionalStringFields = ['launch.cwd','configFile','initialDir','logDirectory'];
  // Optional array settings where an explicit empty array is a meaningful override
  // (it masks a non-empty value from the other scope). Like optionalStringFields,
  // each has an Inherit checkbox: checked -> no override (collect emits null ->
  // cleared); unchecked + empty -> an explicit [] override. Mirrors
  // OPTIONAL_ARRAY_KEYS on the host.
  const optionalArrayFields = ['allowedDirectories'];
  const inheritCb = (f) => $(f + '-inherit');
  // Enum selects with an Inherit ("") option, and tri-bool selects whose Inherit is
  // 'default'. When a key is unset at the scope (not in setSelectKeys) the form forces
  // the control to Inherit so an unset value is not shown as an explicit default.
  // Mirrors INHERITABLE_SELECT_KEYS on the host.
  const inheritSelectFields = ['launch.method','shell','safetyMode','enableTruncation','enableLogResources','transport.mode'];
  const inheritTriFields = ['allowAllDirs','debug'];

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
      // A textarea can't distinguish "unset" from an explicit empty array, so
      // when it is empty keep [] only if the loaded config already had [];
      // a previously non-empty list the user cleared is treated as "remove the
      // override" so we don't silently replace the global blocklist/allowedPaths
      // with nothing (the server replaces those rather than appending).
      const arr = (id, loadedVal) => {
        const lines = linesOf(id);
        if (lines.length) return lines;
        return Array.isArray(loadedVal) && loadedVal.length === 0 ? [] : undefined;
      };
      // Executable args must round-trip losslessly, including an empty positional
      // arg (e.g. ['--flag','']) which the server passes verbatim to spawn. Unlike
      // path/restriction lists, do NOT drop empty lines. A custom command with a
      // wholly blank args textarea means "no args" (don't inherit defaults like
      // /c or -c which only make sense for the bundled shell binaries); without a
      // command, keep [] vs unset via the loaded value as before.
      const argLines = (id, loadedVal, hasCmd) => {
        const el = $(id);
        const raw = el ? el.value : '';
        if (raw.trim() === '') {
          if (hasCmd) return [];
          return Array.isArray(loadedVal) && loadedVal.length === 0 ? [] : undefined;
        }
        // Executable args are passed verbatim to spawn, so leading/trailing
        // whitespace and whitespace-only positional args (e.g. ['--flag','  '])
        // are meaningful. Do NOT trim each line: trimming would silently rewrite
        // the configured invocation the next time any per-shell field is saved.
        return raw.split('\\n');
      };
      const en = triToBool($('sh-' + n + '-enabled').value);
      if (en !== undefined) cfg.enabled = en;
      const cmd = $('sh-' + n + '-cmd').value.trim();
      const args = argLines('sh-' + n + '-args', lEx.args, !!cmd);
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
      if (d.wsl) {
        const wsl = c.wslConfig || {};
        $('sh-' + n + '-wsl-mount').value = wsl.mountPoint || '';
        $('sh-' + n + '-wsl-inherit').value = boolToTri(wsl.inheritGlobalPaths);
      }
    }
  }

  function setVal(s, setKeys, setSelectKeys, setArrayKeys) {
    setKeys = setKeys || [];
    setSelectKeys = setSelectKeys || [];
    setArrayKeys = setArrayKeys || [];
    for (const f of stringFields) if ($(f)) $(f).value = s[mapKey(f)] ?? '';
    for (const f of numberFields) if ($(f)) $(f).value = s[mapKey(f)] == null ? '' : s[mapKey(f)];
    for (const f of triBoolFields) if ($(f)) $(f).value = boolToTri(s[mapKey(f)]);
    for (const f of arrayFields) if ($(f)) $(f).value = (s[mapKey(f)] || []).join('\\n');
    setShellsVal(s.shells);
    // Optional string overrides: the "Inherit" checkbox reflects whether the key
    // is actually set at this scope (setKeys). The text value was set by the
    // generic stringFields loop above, so a stored value — or an explicit empty
    // override — round-trips unchanged.
    for (const f of optionalStringFields) {
      const cb = inheritCb(f);
      if (!cb || !$(f)) continue;
      cb.checked = setKeys.indexOf(f) === -1;
    }
    // Optional array overrides (allowedDirectories): the Inherit checkbox reflects
    // whether the key is actually set at this scope (setArrayKeys). The textarea was
    // populated by the arrayFields loop above, so a stored list — or an explicit
    // empty override (empty textarea, Inherit unchecked) — round-trips unchanged.
    for (const f of optionalArrayFields) {
      const cb = inheritCb(f);
      if (!cb || !$(f)) continue;
      cb.checked = setArrayKeys.indexOf(f) === -1;
    }
    // Inheritable enum/boolean selects: readSettingsForScope returned the schema
    // default for a value unset at this scope, which the loops above rendered as an
    // explicit override equal to that default. When the key is NOT in setSelectKeys
    // it is unset, so force the control to its Inherit state ('' for enum selects,
    // 'default' for the tri-bool selects) — otherwise an unset safetyMode would show
    // 'safe' while an effective override from the other scope is 'unsafe'.
    for (const f of inheritSelectFields) {
      if ($(f) && setSelectKeys.indexOf(f) === -1) $(f).value = '';
    }
    for (const f of inheritTriFields) {
      if ($(f) && setSelectKeys.indexOf(f) === -1) $(f).value = 'default';
    }
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
  // The scope ('Global'/'Workspace') whose values are currently loaded in the form.
  // Used to revert the scope radio when a switch is cancelled (see the radio
  // handler / P70). Set whenever the form is (re)populated from an init message.
  let formScope = null;

  function collect() {
    const values = {};
    for (const f of stringFields) if ($(f)) values[f] = $(f).value.trim();
    for (const f of numberFields) if ($(f)) values[f] = $(f).value === '' ? null : Number($(f).value);
    // Tri-state booleans: 'default' (Inherit) -> null so applySettings clears the
    // override; otherwise emit a real boolean.
    for (const f of triBoolFields) if ($(f)) values[f] = triToBool($(f).value) ?? null;
    for (const f of arrayFields) if ($(f)) values[f] = $(f).value.split('\\n').map(x=>x.trim()).filter(Boolean);
    // Optional string overrides override the generic stringFields value above. A
    // non-empty value is always an explicit override. When empty, the Inherit
    // checkbox decides: checked -> null (applySettings clears the scope override);
    // unchecked -> '' (an explicit empty override that masks the other scope).
    for (const f of optionalStringFields) {
      const cb = inheritCb(f);
      if (!cb || !$(f)) continue;
      const v = $(f).value.trim();
      values[f] = v ? v : (cb.checked ? null : '');
    }
    // Optional array overrides (allowedDirectories) override the generic arrayFields
    // value above. A non-empty list is always an explicit override. When empty, the
    // Inherit checkbox decides: checked -> null (applySettings clears the scope
    // override); unchecked -> [] (an explicit empty override that masks the other
    // scope).
    for (const f of optionalArrayFields) {
      const cb = inheritCb(f);
      if (!cb || !$(f)) continue;
      const lines = $(f).value.split('\\n').map((x) => x.trim()).filter(Boolean);
      values[f] = lines.length ? lines : (cb.checked ? null : []);
    }
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

  // Whether the form has unsaved edits (any field differs from the last loaded/
  // saved baseline). Used to avoid clobbering edits on an external reload.
  function isDirty() {
    return Object.keys(collectChanged()).length > 0;
  }

  function updateLaunchRows() {
    const m = $('launch.method').value;
    // '' is Inherit (no method chosen): hide all method-specific rows.
    $('npxRow').style.display = m === 'npx' ? '' : 'none';
    $('nodeRow').style.display = m === 'node' ? '' : 'none';
    $('customRow').style.display = m === 'custom' ? '' : 'none';
  }
  $('launch.method').addEventListener('change', updateLaunchRows);

  // Host/Port are only meaningful for networked transports; disable them under
  // stdio AND under Inherit (no mode chosen) so the form reflects what the
  // server actually uses.
  function updateTransportRows() {
    const m = $('transport.mode').value;
    const networked = m === 'http' || m === 'sse';
    $('transport.host').disabled = !networked;
    $('transport.port').disabled = !networked;
    $('transportHint').style.display = networked ? 'none' : '';
  }
  $('transport.mode').addEventListener('change', updateTransportRows);

  // Keep the Inherit checkbox and its text field consistent: checking Inherit
  // clears the field (so the inherited state is unambiguous), and typing a value
  // clears Inherit (the entry becomes an explicit override). An empty field with
  // Inherit unchecked is an explicit empty override.
  for (const f of optionalStringFields) {
    const cb = inheritCb(f);
    const el = $(f);
    if (!cb || !el) continue;
    cb.addEventListener('change', () => { if (cb.checked) el.value = ''; });
    el.addEventListener('input', () => { if (el.value.trim()) cb.checked = false; });
  }
  // Same Inherit <-> field coupling for the optional array textareas: checking
  // Inherit clears the list; typing any entry clears Inherit (explicit override).
  for (const f of optionalArrayFields) {
    const cb = inheritCb(f);
    const el = $(f);
    if (!cb || !el) continue;
    cb.addEventListener('change', () => { if (cb.checked) el.value = ''; });
    el.addEventListener('input', () => { if (el.value.trim()) cb.checked = false; });
  }

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
  // against (and save to) the selected scope only. With unsaved edits, reloading
  // would silently discard them (the host's reply is a non-external init that
  // bypasses the dirty guard), so revert the radio to the loaded scope and ask the
  // host to confirm before switching (P70). A clean form switches immediately.
  for (const radio of document.querySelectorAll('input[name=scope]')) {
    radio.addEventListener('change', () => {
      if (radio.value === formScope) return;
      if (isDirty()) {
        const prev = formScope && document.querySelector('input[name=scope][value=' + formScope + ']');
        if (prev) prev.checked = true;
        vscode.postMessage({ type: 'scopeChangeRequest', target: radio.value });
      } else {
        vscode.postMessage({ type: 'scopeChange', target: radio.value });
      }
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

  // Reflect whether a workspace folder is available: enable/disable the Workspace
  // scope radio and the workspace-only .vscode/mcp.json export, and show the
  // no-workspace hint. When the folder is gone, force the Global radio so the form
  // never keeps Workspace selected against a non-existent target.
  function applyWorkspaceAvailability(hasWorkspace) {
    const ws = document.querySelector('input[name=scope][value=Workspace]');
    const gl = document.querySelector('input[name=scope][value=Global]');
    if (hasWorkspace) {
      $('noWorkspace').style.display = 'none';
      if (ws) ws.disabled = false;
      $('writeMcp').disabled = false;
    } else {
      $('noWorkspace').style.display = 'block';
      if (ws) {
        ws.disabled = true;
        if (ws.checked && gl) gl.checked = true;
      }
      // .vscode/mcp.json is workspace-relative; nothing to write without a folder.
      $('writeMcp').disabled = true;
    }
  }

  window.addEventListener('message', (e) => {
    const msg = e.data;
    if (msg.type === 'saved') {
      showSaved();
      return;
    }
    if (msg.type === 'init') {
      // Scope availability/selection must track reality even when the field-value
      // refresh is skipped: a folder added later must re-enable the Workspace
      // controls, and a folder removed while the form is dirty must not leave
      // Workspace selected (Save would then target a non-existent scope). Apply
      // these before the dirty guard.
      applyWorkspaceAvailability(msg.hasWorkspace);
      if (msg.scope) {
        const r = document.querySelector('input[name=scope][value=' + msg.scope + ']');
        if (r && !r.disabled) r.checked = true;
      }
      // A background configuration change must not discard unsaved edits. Skip the
      // field-value refresh on an external reload while the form is dirty; explicit
      // ready/scope-change reloads (external falsy) always apply. A later save
      // re-baselines cleanly.
      if (msg.external && isDirty()) {
        return;
      }
      setVal(msg.settings, msg.setKeys, msg.setSelectKeys, msg.setArrayKeys);
      initial = collect();
      // Record the scope the form now reflects so a cancelled scope switch can
      // revert the radio to it (P70).
      formScope = msg.scope || formScope;
    }
  });
  vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
}
