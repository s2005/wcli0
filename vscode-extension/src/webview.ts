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
  'ignoreInheritedShells',
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
      // A refused save (e.g. Workspace target with no folder open, P89) leaves the
      // form untouched: skip the re-post, saved indicator and success toast.
      if (!(await applySettings(msg as SavePayload))) {
        return;
      }
      // Align the host scope with the form's retained scope before re-posting. The
      // two can diverge: when the last workspace folder was removed, wsSub forced
      // currentScope to Global while a dirty Workspace form kept its scope and radio
      // (P89). Without this, the post() below would reload Global settings over the
      // just-saved Workspace values (P96). msg.target is the scope applySettings wrote.
      currentScope = msg.target;
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
        // A refused save (Workspace target with no folder open, P89) must abort the
        // export too: it would otherwise operate on unsaved/stale persisted settings.
        if (!(await applySettings(msg as SavePayload))) {
          return;
        }
        // Align the host scope with the form's retained scope (see the save path /
        // P96) so both the refresh below AND the export command run against the scope
        // the form shows, not a stale currentScope forced to Global by wsSub (P89).
        currentScope = msg.target;
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

async function applySettings(payload: SavePayload): Promise<boolean> {
  const target =
    payload.target === 'Workspace'
      ? vscode.ConfigurationTarget.Workspace
      : vscode.ConfigurationTarget.Global;
  const scope = payload.target === 'Workspace' ? primaryWorkspaceFolder()?.uri : undefined;
  // Refuse a Workspace save when no workspace folder is open. This happens when the
  // last folder is removed while a dirty Workspace-scoped form keeps targeting its
  // loaded scope (P89): VS Code cannot write workspace settings without a folder, and
  // the values must NOT be silently retargeted to User. Report and skip instead.
  if (target === vscode.ConfigurationTarget.Workspace && !scope) {
    void vscode.window.showErrorMessage(
      'wcli0: cannot save Workspace settings because no workspace folder is open. Reopen the folder, or switch the form to User scope.',
    );
    return false;
  }
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
  return true;
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

/** Render the "Enabled shells" summary chips (one per shell; updated by the script). */
function renderShellSummary(): string {
  return PER_SHELL_DEFS.map(
    (d) => `<span class="stchip def" id="sum-${d.name}">${d.label}: default</span>`,
  ).join('');
}

/** Render the per-shell configuration cards (Design 5). */
function renderShellBlocks(): string {
  return PER_SHELL_DEFS.map(
    (d) => /* html */ `
  <details class="shell-block scard" id="scard-${d.name}">
    <summary>${d.label} <span class="hint">${d.name}${d.wsl ? ' &middot; WSL family' : ''}</span><span class="sstate" id="sstate-${d.name}">inherit (default)</span></summary>
    <label>Enabled</label>
    <div class="seg" id="seg-${d.name}">
      <button type="button" class="segbtn" id="seg-${d.name}-default">Default</button>
      <button type="button" class="segbtn" id="seg-${d.name}-on">On</button>
      <button type="button" class="segbtn" id="seg-${d.name}-off">Off</button>
    </div>
    <select id="sh-${d.name}-enabled" class="hidden-enable" aria-hidden="true"><option value="default">default</option><option value="enabled">enabled</option><option value="disabled">disabled</option></select>
    <label>Executable command</label>
    <input type="text" id="sh-${d.name}-cmd" />
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
        ? `<div class="wsl-box">
      <div class="wsl-h">WSL settings <span class="hint">only for WSL-family shells</span></div>
      <div class="row">
        <div><label>WSL mount point</label><input type="text" id="sh-${d.name}-wsl-mount" placeholder="/mnt/" /></div>
        <div><label>Inherit global paths</label>${triSelect(`sh-${d.name}-wsl-inherit`)}</div>
      </div>
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
  .row { display: flex; gap: 16px; flex-wrap: wrap; align-items: stretch; }
  /* Make each cell a column so a label that wraps to two lines grows to fill the
     extra height, keeping the inputs below sibling labels aligned on one line. */
  .row > div { flex: 1; min-width: 170px; display: flex; flex-direction: column; }
  .row > div > label { flex: 1 0 auto; }
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
  /* Tabbed navigation (Design 5) */
  .tabnav { display: flex; flex-wrap: wrap; gap: 2px; margin-top: 10px;
    border-bottom: 1px solid var(--vscode-panel-border, transparent); }
  .tabnav button.tab {
    margin: 0; padding: 7px 13px; background: transparent; color: var(--vscode-foreground);
    opacity: 0.65; border: none; border-bottom: 2px solid transparent; border-radius: 0;
  }
  .tabnav button.tab:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground, transparent); }
  .tabnav button.tab.active { opacity: 1; font-weight: 600; border-bottom-color: var(--vscode-focusBorder); }
  .tabpanel { display: none; }
  .tabpanel.active { display: block; }
  /* Isolation status chip in the sticky header */
  .statuschip { display: inline-flex; align-items: center; padding: 3px 10px; border-radius: 12px;
    font-size: 0.82em; font-weight: 600; white-space: nowrap; }
  .statuschip.sc-ok { background: transparent;
    color: var(--vscode-charts-green, #3fb950); border: 1px solid var(--vscode-charts-green, #3fb950); }
  .statuschip.sc-warn { background: transparent; color: var(--vscode-charts-yellow, #d7a930);
    border: 1px solid var(--vscode-charts-yellow, #d7a930); }
  /* Per-shell cards + segmented enable toggle */
  .shell-summary { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 4px 0 14px; }
  .shell-summary .lbl { font-size: 0.85em; opacity: 0.7; }
  .stchip { font-size: 0.76em; padding: 2px 9px; border-radius: 11px;
    border: 1px solid var(--vscode-panel-border, transparent); }
  .stchip.on { color: var(--vscode-charts-green, #3fb950); }
  .stchip.off { color: var(--vscode-charts-red, #f48771); }
  .stchip.def { opacity: 0.6; }
  details.scard > summary .sstate { font-size: 0.8em; opacity: 0.7; margin-left: 8px; font-weight: 400; }
  .seg { display: inline-flex; border: 1px solid var(--vscode-input-border, var(--vscode-panel-border, transparent));
    border-radius: 5px; overflow: hidden; margin: 8px 0; }
  .seg button.segbtn {
    margin: 0; padding: 4px 13px; border: none; border-radius: 0;
    border-left: 1px solid var(--vscode-panel-border, transparent); font-size: 0.85em;
    background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground);
  }
  .seg button.segbtn:first-child { border-left: none; }
  .seg button.segbtn:hover { background: var(--vscode-button-secondaryHoverBackground); }
  .seg button.segbtn.sel { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  .modeseg { margin: 4px 0 6px; }
  .modeseg button.segbtn { padding: 6px 16px; }
  .hidden-enable { display: none; }
  .wsl-box { margin-top: 12px; padding: 10px 12px; border-radius: 5px;
    border: 1px solid var(--vscode-panel-border, transparent);
    border-left: 3px solid var(--vscode-charts-blue, #6fb3e0);
    background: var(--vscode-editor-background); }
  .wsl-box .wsl-h { font-weight: 600; font-size: 0.9em; margin-bottom: 2px; }
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
        <span id="isolationChip" class="statuschip sc-warn" title="Whether an implicit config.json could override these settings. Open the Config source tab.">Overridable</span>
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
    <div class="tabnav" id="tabnav">
      <button type="button" class="tab active" data-tab="config">Config source</button>
      <button type="button" class="tab" data-tab="launch">Launch</button>
      <button type="button" class="tab" data-tab="shells">Shells</button>
      <button type="button" class="tab" data-tab="safety">Limits &amp; Safety</button>
      <button type="button" class="tab" data-tab="transport">Transport</button>
      <button type="button" class="tab" data-tab="export">Export</button>
    </div>
  </div>

  <div class="tabpanel active" data-tab="config">
  <section>
  <h2>Config source &amp; launch isolation</h2>
  <div class="hint" style="margin-bottom:10px">
    Controls whether an implicit <code>config.json</code> (in the launch working directory or
    <code>~/.win-cli-mcp/</code>) can silently override the settings on the other tabs. Referencing a
    config file passes <code>--config</code>, which makes the server ignore implicit files; per-shell
    settings (Shells tab) do the same via an auto-managed config. With neither, the launch uses plain
    CLI flags and an implicit <code>config.json</code> can override them — the status chip in the
    header reflects this.
  </div>
  <label>Config file <span class="hint">passed via --config; CLI settings override it</span></label>
  <input type="text" id="configFile" placeholder="\${workspaceFolder}/wcli0.config.json" />
  <label class="checkbox optional-inherit"><input type="checkbox" id="configFile-inherit" /> Inherit <span class="hint">no override; uncheck to set an explicit value (empty allowed)</span></label>
  </section>
  </div>

  <div class="tabpanel" data-tab="launch">
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
  </section>
  </div>

  <div class="tabpanel" data-tab="shells">
  <section>
  <h2>Shells & Directories</h2>
  <label>Configuration mode <span class="hint">pick one way to choose which shells are enabled</span></label>
  <div class="seg modeseg" id="shellModeSeg">
    <button type="button" class="segbtn" id="mode-simple">Simple &mdash; one shell</button>
    <button type="button" class="segbtn" id="mode-per">Per-shell &mdash; advanced</button>
  </div>
  <div class="hint" id="shellModeHelp" style="margin:0 0 6px"></div>
  <div class="hint" id="shellModeWarn" style="display:none;margin:0 0 6px;color:var(--vscode-charts-yellow,#d7a930)">Per-shell settings are configured and still override the simple selection. Switch to Per-shell to view or clear them.</div>

  <label>Inherited per-shell config <span class="hint">when set at Workspace scope, ignore per-shell settings (wcli0.shells) inherited from User scope</span></label>
  <select id="ignoreInheritedShells">
    <option value="default">Inherit (use per-shell config)</option>
    <option value="enabled">Ignore inherited per-shell config (use global flags)</option>
    <option value="disabled">Do not ignore (explicit)</option>
  </select>
  <div class="hint" style="margin-top:4px">VS Code merges <code>wcli0.shells</code> across scopes, so a Workspace cannot drop a User-scope shell by clearing it. Choose <strong>Ignore</strong> to opt this workspace out of managed per-shell mode and launch with the global CLI flags instead.</div>
  <div class="hint" id="ignoreInheritedShellsUserNote" style="display:none;margin-top:4px;color:var(--vscode-charts-yellow,#d7a930)">This opt-out applies to Workspace scope only. At User scope it would suppress your own per-shell config everywhere, so it is disabled here &mdash; switch to Workspace to use it.</div>

  <div id="simplePane">
    <label>Shell <span class="hint">enable one shell, or "all"</span></label>
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

  <label>Allowed directories <span class="hint">one per line; supports \${workspaceFolder}; shared by all shells</span></label>
  <textarea id="allowedDirectories" placeholder="\${workspaceFolder}"></textarea>
  <label class="checkbox optional-inherit"><input type="checkbox" id="allowedDirectories-inherit" /> Inherit <span class="hint">no override; uncheck and leave empty to set an explicit empty list that masks the other scope</span></label>
  <label>Initial directory <span class="hint">shared by all shells</span></label>
  <input type="text" id="initialDir" />
  <label class="checkbox optional-inherit"><input type="checkbox" id="initialDir-inherit" /> Inherit <span class="hint">no override; uncheck to set an explicit value (empty allowed)</span></label>
  </section>

  <section id="perShellSection">
  <h2>Per-Shell Configuration</h2>
  <div class="hint" style="margin-bottom:4px">
    Configure each shell independently. These per-shell values are used instead of the simple
    <strong>Shell</strong> selection: the extension writes an auto-managed config file and launches the
    server with <code>--config</code>. Restart the MCP server to apply changes.
  </div>
  <div class="shell-summary" id="shellSummary"><span class="lbl">Enabled shells:</span>${renderShellSummary()}</div>
  ${renderShellBlocks()}
  </section>
  </div>

  <div class="tabpanel" data-tab="safety">
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
  </div>

  <div class="tabpanel" data-tab="transport">
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
  </div>

  <div class="tabpanel" data-tab="export">
  <section>
  <h2>Generate &amp; Export</h2>
  <div class="hint" style="margin-bottom:10px">Export the configuration as a runnable command or file. Your current changes in this form are saved to the selected scope first, so the output always matches what you see.</div>
  <div class="export-actions">
    <button class="secondary" id="showCommand">Show launch command</button>
    <button class="secondary" id="genConfig">Generate config.json</button>
    <button class="secondary" id="writeMcp">Write .vscode/mcp.json</button>
  </div>
  </section>
  </div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const $ = (id) => document.getElementById(id);
  const numberFields = ['commandTimeout','maxCommandLength','maxOutputLines','transport.port'];
  // Booleans rendered as tri-state selects (Inherit / enabled / disabled). Selecting
  // Inherit submits null, which applySettings maps to undefined -> clears the value
  // at the target scope so a previous override can be removed from the form.
  // ignoreInheritedShells uses the same value scheme (its options carry the
  // default/enabled/disabled values) so it round-trips through this machinery.
  const triBoolFields = ['allowAllDirs','debug','ignoreInheritedShells'];
  const arrayFields = ['allowedDirectories'];
  const stringFields = ['launch.packageSpec','launch.nodeScriptPath','launch.customCommand','launch.cwd','configFile','shell','initialDir','logDirectory','enableTruncation','enableLogResources','safetyMode','launch.method','transport.host','transport.mode'];
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
  const inheritTriFields = ['allowAllDirs','debug','ignoreInheritedShells'];

  // Per-shell configuration (wcli0.shells). Mirrors PER_SHELL_DEFS on the host.
  const SHELL_DEFS = [
    { name: 'powershell', label: 'PowerShell', wsl: false }, { name: 'cmd', label: 'cmd', wsl: false },
    { name: 'gitbash', label: 'Git Bash', wsl: false }, { name: 'wsl', label: 'WSL', wsl: true },
    { name: 'bash', label: 'bash', wsl: true },
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
    // Reflect the loaded enabled state onto the segmented toggles and summary chips.
    syncAllSegs();
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
    // Default the shells editor to whichever mode the loaded config implies: the
    // per-shell cards when any shell is configured (wcli0.shells), otherwise the
    // simple single-shell selector. The two are mutually-exclusive views.
    setShellMode(Object.keys(loadedShells || {}).length > 0 ? 'per' : 'simple');
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
    updateIsolation();
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

  // ---- Design 5: tabs, per-shell segmented enable, isolation status ----
  // Tab switching. Only runs in the real webview; the test harness exposes no
  // '.tab' elements (querySelectorAll returns []), so this no-ops there.
  const tabButtons = document.querySelectorAll('.tab');
  const tabPanels = document.querySelectorAll('.tabpanel');
  tabButtons.forEach((t) => t.addEventListener('click', () => {
    const name = t.dataset.tab;
    tabButtons.forEach((x) => x.classList.toggle('active', x === t));
    tabPanels.forEach((p) => p.classList.toggle('active', p.dataset.tab === name));
  }));

  // Shells editor mode: Simple (the single Shell selector) vs Per-shell (the cards).
  // A view toggle only — it shows one editor at a time so a user is not configuring
  // shells in two places at once. It does not change what collect() submits; the
  // per-shell cards still map to wcli0.shells and the dropdown to wcli0.shell. Uses
  // only style.display / className so it is safe under the test harness's minimal DOM
  // (which has no classList). The mode itself is never persisted; it is re-derived
  // from the loaded config on every (re)populate (see setVal).
  let shellMode = 'simple';
  function applyShellMode() {
    const simple = shellMode === 'simple';
    const sp = $('simplePane'); if (sp) sp.style.display = simple ? '' : 'none';
    const ps = $('perShellSection'); if (ps) ps.style.display = simple ? 'none' : '';
    const bs = $('mode-simple'); if (bs) bs.className = 'segbtn' + (simple ? ' sel' : '');
    const bp = $('mode-per'); if (bp) bp.className = 'segbtn' + (simple ? '' : ' sel');
    const help = $('shellModeHelp');
    if (help) {
      help.textContent = simple
        ? 'Enable one shell (or "all") with the shared directories below. Best for most setups.'
        : 'Configure each shell independently - executable, security limits and its own allowed paths.';
    }
    // In Simple mode, warn when per-shell overrides are configured: the server still
    // applies wcli0.shells when present, so they win over the simple selection.
    const warn = $('shellModeWarn');
    if (warn) warn.style.display = (simple && Object.keys(collectShells()).length > 0) ? '' : 'none';
  }
  function setShellMode(m) { shellMode = m; applyShellMode(); }
  const modeSimpleBtn = $('mode-simple');
  if (modeSimpleBtn) modeSimpleBtn.addEventListener('click', () => setShellMode('simple'));
  const modePerBtn = $('mode-per');
  if (modePerBtn) modePerBtn.addEventListener('click', () => setShellMode('per'));

  // Reflect a per-shell enabled <select> value onto its segmented buttons, the
  // collapsed-card state label and its summary chip. Pure property assignments, so
  // it is safe under the test harness's minimal DOM (no classList/createElement).
  const SEG_TO_VAL = { 'default': 'default', on: 'enabled', off: 'disabled' };
  function setSeg(name) {
    const sel = $('sh-' + name + '-enabled');
    if (!sel) return;
    const v = sel.value || 'default';
    for (const k of ['default', 'on', 'off']) {
      const b = $('seg-' + name + '-' + k);
      if (b) b.className = 'segbtn' + (SEG_TO_VAL[k] === v ? ' sel' : '');
    }
    const st = $('sstate-' + name);
    if (st) st.textContent = v === 'enabled' ? 'enabled' : v === 'disabled' ? 'disabled' : 'inherit (default)';
    const sum = $('sum-' + name);
    if (sum) {
      const def = SHELL_DEFS.find((d) => d.name === name) || {};
      sum.className = 'stchip ' + (v === 'enabled' ? 'on' : v === 'disabled' ? 'off' : 'def');
      sum.textContent = (def.label || name) + ': ' + (v === 'enabled' ? 'on' : v === 'disabled' ? 'off' : 'default');
    }
  }
  function syncAllSegs() { for (const d of SHELL_DEFS) setSeg(d.name); }

  // Wire the segmented enable buttons to drive the hidden <select> (the value source
  // collectShells reads). getElementById works in the harness, so wiring is safe;
  // the click handlers only run on user interaction.
  for (const d of SHELL_DEFS) {
    const sel = $('sh-' + d.name + '-enabled');
    if (!sel) continue;
    for (const k of ['default', 'on', 'off']) {
      const b = $('seg-' + d.name + '-' + k);
      if (!b) continue;
      b.addEventListener('click', (e) => {
        if (e && e.preventDefault) e.preventDefault();
        sel.value = SEG_TO_VAL[k];
        setSeg(d.name);
        updateIsolation();
      });
    }
  }

  // Derive the header isolation status from the current form: a referenced config
  // file OR any per-shell configuration isolates the launch (the server then ignores
  // implicit config.json files); otherwise an implicit file could override the flags.
  function updateIsolation() {
    const chip = $('isolationChip');
    if (!chip) return;
    const cfg = $('configFile');
    let isolated = !!(cfg && cfg.value && cfg.value.trim());
    if (!isolated) {
      // Any meaningful per-shell configuration isolates the launch, not just an
      // enabled/command change. collectShells() builds exactly the wcli0.shells object
      // the host reads, keeping a shell only when it carries a user-set field
      // (executable args, security/restriction/path overrides, WSL options included),
      // so it mirrors the host's hasPerShellConfig/isMeaningfulShellConfig (P84).
      // When "Ignore inherited per-shell config" is enabled the host's
      // hasPerShellConfig returns false (the launch uses global flags), so the
      // per-shell config no longer isolates it — mirror that here.
      const ign = $('ignoreInheritedShells');
      const masked = !!(ign && ign.value === 'enabled');
      isolated = !masked && Object.keys(collectShells()).length > 0;
    }
    chip.className = 'statuschip ' + (isolated ? 'sc-ok' : 'sc-warn');
    chip.textContent = isolated ? 'Isolated' : 'Overridable';
  }
  const configFileEl = $('configFile');
  if (configFileEl) configFileEl.addEventListener('input', updateIsolation);
  // Toggling "Ignore inherited per-shell config" flips whether per-shell config
  // isolates the launch, so refresh the header chip when it changes.
  const ignoreShellsEl = $('ignoreInheritedShells');
  if (ignoreShellsEl) ignoreShellsEl.addEventListener('change', updateIsolation);
  // Refresh the isolation status as the user types in ANY per-shell field, not only
  // the segmented enable buttons and configFile. Without this the chip would lag when
  // an executable command/args, an override or a WSL option is edited (P84). The
  // enable <select> is driven by the segmented buttons, which call updateIsolation.
  const PER_SHELL_ISOLATION_FIELDS = [
    '-cmd', '-args', '-sec-maxlen', '-sec-timeout', '-sec-inject', '-sec-restrict',
    '-block-cmd', '-block-arg', '-block-op', '-paths', '-wsl-mount', '-wsl-inherit',
  ];
  for (const d of SHELL_DEFS) {
    for (const suffix of PER_SHELL_ISOLATION_FIELDS) {
      const el = $('sh-' + d.name + suffix);
      if (!el) continue;
      el.addEventListener('input', updateIsolation);
      el.addEventListener('change', updateIsolation);
    }
  }

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
        // Switch the checked radio to Global only when doing so cannot silently move
        // unsaved edits across scopes. The external init that removes the last folder
        // skips the value/formScope reload while the form is dirty (the dirty guard
        // below), so flipping a dirty Workspace form to Global would make Save persist
        // project-specific values into User scope (P89). Keep Workspace selected there
        // so Save still targets the loaded scope (the host refuses a Workspace save
        // when no folder is open). A clean form has no edits to mis-save, so it
        // switches to the only valid scope.
        if (ws.checked && gl && !(isDirty() && formScope === 'Workspace')) {
          gl.checked = true;
        }
      }
      // .vscode/mcp.json is workspace-relative; nothing to write without a folder.
      $('writeMcp').disabled = true;
    }
  }

  // The inherited-shell mask (ignoreInheritedShells) is a Workspace-only opt-out from
  // User-scope per-shell config. A Global value would suppress the User scope's OWN
  // wcli0.shells everywhere (hasPerShellConfig treats any effective true as
  // authoritative), so disable the control while editing User scope and show why,
  // preventing the form from ever persisting it globally (P97).
  function applyScopeAvailability(scope) {
    const ign = $('ignoreInheritedShells');
    if (!ign) return;
    const isUser = scope === 'Global';
    ign.disabled = isUser;
    const note = $('ignoreInheritedShellsUserNote');
    if (note) note.style.display = isUser ? '' : 'none';
  }

  window.addEventListener('message', (e) => {
    const msg = e.data;
    if (msg.type === 'saved') {
      showSaved();
      return;
    }
    if (msg.type === 'init') {
      // Workspace availability (enable/disable the Workspace radio and the mcp.json
      // export, show the no-folder hint) must track reality even when the field-value
      // refresh is skipped — e.g. a folder added later must re-enable the Workspace
      // controls. It deliberately does NOT switch a dirty form's selected scope (see
      // applyWorkspaceAvailability, P89), so apply it before the dirty guard.
      applyWorkspaceAvailability(msg.hasWorkspace);
      // A background configuration change must not discard unsaved edits, nor silently
      // retarget the save scope. While the form is dirty, skip BOTH the field refresh
      // and the scope-radio switch on an external reload, so the loaded scope
      // (formScope) stays selected and Save targets it instead of the externally forced
      // scope — otherwise removing the last workspace folder would persist Workspace
      // values into User scope (P35/P89). Explicit ready/scope-change reloads (external
      // falsy) always apply. A later save re-baselines cleanly.
      if (msg.external && isDirty()) {
        return;
      }
      if (msg.scope) {
        const r = document.querySelector('input[name=scope][value=' + msg.scope + ']');
        if (r && !r.disabled) r.checked = true;
      }
      setVal(msg.settings, msg.setKeys, msg.setSelectKeys, msg.setArrayKeys);
      initial = collect();
      // Record the scope the form now reflects so a cancelled scope switch can
      // revert the radio to it (P70).
      formScope = msg.scope || formScope;
      // Enable/disable the Workspace-only inherited-shell mask for the loaded scope (P97).
      applyScopeAvailability(formScope);
    }
  });
  vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
}
