import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  CONFIG_SECTION,
  ConfigScope,
  defaultSettings,
  explicitlySetArrayKeys,
  explicitlySetKeys,
  explicitlySetSelectKeys,
  INHERITABLE_SELECT_KEYS,
  OPTIONAL_ARRAY_KEYS,
  OPTIONAL_STRING_KEYS,
  primaryWorkspaceFolder,
  readSettingsForScope,
  Wcli0Settings,
} from './settings';
import { detectWorkspaceMcpJson, parseMcpEntry, readWcli0Entry } from './configSource';
import { writeMcpJsonFromSettings } from './commands';

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
  'profiles',
  'ignoreInheritedShells',
  'ignoreInheritedProfiles',
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

/** Which configuration source the form is editing. */
type ConfigSourceKind = 'settings' | 'mcpJson';

/** A source descriptor sent to the webview for the switcher menu. */
interface DetectedSource {
  /** 'settings' / 'mcpJson' are editable; 'homeConfig' is a read-only preview. */
  kind: ConfigSourceKind | 'homeConfig';
  label: string;
  fsPath?: string;
  /** True for an entry that is listed only for awareness (never a save target). */
  readOnly?: boolean;
  /** Whether a detected mcp.json actually holds a wcli0 entry to load. */
  hasWcli0?: boolean;
  /** Whether the backing file exists. */
  exists?: boolean;
}

/** Dotted form field key -> normalized {@link Wcli0Settings} property. */
const FIELD_TO_PROP: Record<string, keyof Wcli0Settings> = {
  'launch.method': 'launchMethod',
  'launch.packageSpec': 'packageSpec',
  'launch.nodeScriptPath': 'nodeScriptPath',
  'launch.customCommand': 'customCommand',
  'launch.cwd': 'cwd',
  configFile: 'configFile',
  shell: 'shell',
  shells: 'shells',
  profiles: 'profiles',
  ignoreInheritedShells: 'ignoreInheritedShells',
  ignoreInheritedProfiles: 'ignoreInheritedProfiles',
  allowedDirectories: 'allowedDirectories',
  initialDir: 'initialDir',
  commandTimeout: 'commandTimeout',
  maxCommandLength: 'maxCommandLength',
  wslMountPoint: 'wslMountPoint',
  maxOutputLines: 'maxOutputLines',
  enableTruncation: 'enableTruncation',
  enableLogResources: 'enableLogResources',
  logDirectory: 'logDirectory',
  allowAllDirs: 'allowAllDirs',
  safetyMode: 'safetyMode',
  debug: 'debug',
  'transport.mode': 'transportMode',
  'transport.host': 'transportHost',
  'transport.port': 'transportPort',
};

/** Enum selects whose form value '' means "inherit" (mapped to the default here). */
const ENUM_INHERIT_FIELDS = new Set([
  'launch.method',
  'shell',
  'safetyMode',
  'enableTruncation',
  'enableLogResources',
  'transport.mode',
]);

/**
 * Overlay the form's changed field values onto a baseline settings object, used to
 * build the settings a file-source "Save to file" writes. Starting from the loaded
 * file's settings preserves fields the form does not model (extraArgs, blocked lists,
 * env, custom args) instead of dropping them. A `null` value (the form's Inherit for
 * a tri-state) or an empty enum select maps to the schema default, since a file has
 * no scope to inherit from.
 */
function overlaySettings(base: Wcli0Settings, values: Record<string, unknown>): Wcli0Settings {
  const out = { ...base } as unknown as Record<string, unknown>;
  const defaults = defaultSettings() as unknown as Record<string, unknown>;
  for (const [field, prop] of Object.entries(FIELD_TO_PROP)) {
    if (!(field in values)) {
      continue;
    }
    const v = values[field];
    if (v === null || (v === '' && ENUM_INHERIT_FIELDS.has(field))) {
      out[prop] = defaults[prop];
      continue;
    }
    out[prop] = v;
  }
  return out as unknown as Wcli0Settings;
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

  // The configuration source the form is editing. 'settings' (the default) edits the
  // wcli0.* VS Code settings; 'mcpJson' edits the workspace .vscode/mcp.json entry.
  let currentSource: ConfigSourceKind = 'settings';
  // The settings parsed from the loaded mcp.json, used as the baseline a "Save to
  // file" overlays the form's edits onto so unmodeled fields (extraArgs, blocked
  // lists, env) are preserved rather than dropped.
  let loadedFileSettings: Wcli0Settings | undefined;
  // The raw `servers.wcli0` entry as loaded from .vscode/mcp.json. A "Save to file"
  // merges the regenerated fields onto this so VS Code-supported fields the form does not
  // model (HTTP headers/oauth, stdio envFile/dev, non-string env, custom/socket URLs) are
  // preserved rather than dropped (P7/P9/P10/P12).
  let loadedFileEntry: Record<string, unknown> | undefined;
  // Notes from reverse-parsing the loaded entry (parts the form cannot fully model).
  // Carried in every file-source init so a clean reload/save clears stale notes (P11).
  let loadedFileNotes: string[] = [];
  // The fsPath of the workspace folder whose .vscode/mcp.json is loaded as the file
  // source. Tracked so that if the primary workspace folder changes (multi-root
  // removal/reorder), the stale file source is reset rather than saved back to the
  // new folder, which would overwrite it with the previous folder's config (P2).
  let loadedFileFolder: string | undefined;
  // Cached detected sources for the switcher. Refreshed on ready / workspace-folder
  // change / after a file save, so post() (which must stay synchronous — a config
  // change re-posts synchronously) can include it without awaiting detection.
  let detectedSources: DetectedSource[] = [];

  const refreshDetection = async (): Promise<void> => {
    const sources: DetectedSource[] = [];
    const folder = primaryWorkspaceFolder();
    if (folder) {
      const d = await detectWorkspaceMcpJson(folder);
      sources.push({
        kind: 'mcpJson',
        label: '.vscode/mcp.json',
        fsPath: d.fsPath,
        exists: d.exists,
        hasWcli0: d.hasWcli0,
      });
    }
    // The server's implicit ~/.win-cli-mcp/config.json is listed READ-ONLY only: it
    // is never an editable/save target, so a save can't silently overwrite it.
    const home = path.join(os.homedir(), '.win-cli-mcp', 'config.json');
    let homeExists = false;
    try {
      homeExists = fs.existsSync(home);
    } catch {
      homeExists = false;
    }
    if (homeExists) {
      sources.push({ kind: 'homeConfig', label: '~/.win-cli-mcp/config.json', fsPath: home, readOnly: true });
    }
    detectedSources = sources;
  };

  // `external` marks a reload triggered by a background configuration change (not
  // an explicit ready/scope-change). The webview ignores such a reload while the
  // form has unsaved edits so it doesn't silently overwrite the user's work.
  const post = (external = false) => {
    const scope = primaryWorkspaceFolder()?.uri;
    // When editing a file source the form shows the file's concrete values, so every
    // optional/inheritable key is reported "set" (the form would otherwise render an
    // unset value as "Inherit" — meaningless for a file with no scope to inherit).
    const fileSource = currentSource === 'mcpJson';
    const fileSettings = loadedFileSettings ?? defaultSettings();
    webview.postMessage({
      type: 'init',
      external,
      source: currentSource,
      detected: detectedSources,
      // The file-source parse notes (empty off the file source), sent on EVERY init so a
      // clean reload or save clears notes that no longer apply (P11).
      notes: fileSource ? loadedFileNotes : [],
      hasWorkspace: !!primaryWorkspaceFolder(),
      // The open folder names, so the form can resolve ${workspaceFolder:name} tokens
      // exactly as the host does when deciding whether a profile isolates (P110).
      workspaceFolderNames: (vscode.workspace.workspaceFolders ?? []).map((f) => f.name),
      scope: currentScope,
      settings: fileSource ? fileSettings : readSettingsForScope(currentScope, scope),
      // Which optional-string keys are explicitly set at this scope, so the form
      // can distinguish an empty override from "Inherit" (both read as empty).
      setKeys: fileSource ? [...OPTIONAL_STRING_KEYS] : explicitlySetKeys(currentScope, scope),
      // Which inheritable enum/boolean keys are explicitly set at this scope, so the
      // form can show "Inherit" for an unset field instead of the schema default it
      // reads back (which would misreport e.g. an unset safetyMode as "safe").
      setSelectKeys: fileSource
        ? [...INHERITABLE_SELECT_KEYS]
        : explicitlySetSelectKeys(currentScope, scope),
      // Which optional-array keys (allowedDirectories) are explicitly set at this
      // scope, so the form can show an explicit empty override as set rather than as
      // "Inherit" (both render an empty textarea otherwise — see P69).
      setArrayKeys: fileSource ? [...OPTIONAL_ARRAY_KEYS] : explicitlySetArrayKeys(currentScope, scope),
    });
  };

  // Switch the active source and re-post the form populated from it. For the file
  // source, read and reverse-parse the workspace .vscode/mcp.json wcli0 entry; an
  // absent entry or no folder is reported and the switch is refused.
  const switchSource = async (target: ConfigSourceKind): Promise<boolean> => {
    if (target === 'mcpJson') {
      const folder = primaryWorkspaceFolder();
      if (!folder) {
        void vscode.window.showErrorMessage('wcli0: open a workspace folder first.');
        return false;
      }
      const entry = await readWcli0Entry(folder);
      if (!entry) {
        void vscode.window.showErrorMessage(
          'wcli0: no wcli0 server entry found in .vscode/mcp.json to load.',
        );
        return false;
      }
      const { settings, notes } = parseMcpEntry(entry);
      loadedFileSettings = settings;
      loadedFileEntry = entry;
      loadedFileNotes = notes;
      loadedFileFolder = folder.uri.fsPath;
      currentSource = 'mcpJson';
      // post() carries the notes in its init message (cleared on a note-free reload, P11).
      post();
      return true;
    }
    currentSource = 'settings';
    loadedFileSettings = undefined;
    loadedFileEntry = undefined;
    loadedFileNotes = [];
    loadedFileFolder = undefined;
    post();
    return true;
  };

  webview.html = renderHtml(webview);
  // After a file-source reset (the loaded .vscode/mcp.json's folder is no longer the
  // primary one) the form still holds that file's values and a file-relative dirty
  // baseline. Both save and export persist these via applySettings, which would
  // silently corrupt wcli0.* settings with file-shaped edits — so confirm first (P28).
  // Returns true when the user agrees to write to settings, false when they decline.
  const confirmStaleFileSourceWrite = async (): Promise<boolean> => {
    const pick = await vscode.window.showWarningMessage(
      'wcli0: these values came from a .vscode/mcp.json source that is no longer active ' +
        '(the workspace folder changed). Save them to your VS Code settings anyway?',
      { modal: true },
      'Save to settings',
    );
    return pick === 'Save to settings';
  };
  const msgSub = webview.onDidReceiveMessage(async (msg: { type: string } & Partial<SavePayload> & { source?: ConfigSourceKind; fromResetFileSource?: boolean }) => {
    if (msg.type === 'ready') {
      await refreshDetection();
      post();
    } else if ((msg.type === 'sourceChange' || msg.type === 'sourceChangeRequest') && msg.source) {
      // Switching the source reloads the form from that source (a non-external init
      // bypassing the dirty guard), so a dirty form confirms first — mirroring the
      // scope-switch guard (P70). The webview reverts its UI optimistically and only a
      // confirmed request proceeds.
      if (msg.type === 'sourceChangeRequest') {
        const choice = await vscode.window.showWarningMessage(
          'Discard unsaved changes and switch the configuration source?',
          { modal: true },
          'Discard changes',
        );
        if (choice !== 'Discard changes') {
          return;
        }
      }
      // Only the editable kinds are accepted as a target; the read-only home config
      // can never become a load/save target here (REQ-6).
      if (msg.source === 'settings' || msg.source === 'mcpJson') {
        await switchSource(msg.source);
      }
    } else if (msg.type === 'revertFileRequest') {
      // Reload the wcli0 entry from disk, discarding unsaved form edits. The webview
      // only sends this when the form is dirty (a clean form has nothing to revert and
      // gives its own inline feedback), so always confirm before discarding. Uses
      // revert-specific wording rather than the generic source-switch prompt, and
      // signals 'reverted' on success so the webview can flash a confirmation.
      const choice = await vscode.window.showWarningMessage(
        'Discard unsaved changes and reload the wcli0 entry from .vscode/mcp.json?',
        { modal: true },
        'Discard changes',
      );
      if (choice === 'Discard changes' && (await switchSource('mcpJson'))) {
        webview.postMessage({ type: 'reverted' });
      }
    } else if (msg.type === 'openHomeConfig') {
      // Open the server's implicit ~/.win-cli-mcp/config.json as a read-only preview.
      // It is never an editable/save target here (REQ-6); the menu row just opens it so
      // the user can inspect what can silently override their settings. Recompute the
      // path host-side rather than trusting the message so this can only open that file,
      // and mark the editor read-only in-session to prevent accidental edits.
      const home = path.join(os.homedir(), '.win-cli-mcp', 'config.json');
      try {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(home));
        await vscode.window.showTextDocument(doc, { preview: true });
        await vscode.commands.executeCommand(
          'workbench.action.files.setActiveEditorReadonlyInSession',
        );
      } catch {
        void vscode.window.showErrorMessage(
          'wcli0: could not open ~/.win-cli-mcp/config.json.',
        );
      }
    } else if (msg.type === 'saveToFile' && msg.values) {
      const folder = primaryWorkspaceFolder();
      if (!folder) {
        void vscode.window.showErrorMessage('wcli0: open a workspace folder first.');
        return;
      }
      // Reject a stale file-source save. If the primary workspace folder changed while the
      // form had unsaved edits, the host already reset the file source (wsSub) but a dirty
      // webview ignores that external init and still posts saveToFile. Writing the stale form
      // values to the NEW folder would overwrite ITS .vscode/mcp.json with the previous
      // folder's config — the very wrong-folder overwrite the reset avoids (P6). Only proceed
      // while still in mcpJson mode for THIS folder, with the loaded entry intact.
      if (
        currentSource !== 'mcpJson' ||
        loadedFileFolder !== folder.uri.fsPath ||
        !loadedFileEntry
      ) {
        void vscode.window.showErrorMessage(
          'wcli0: the workspace folder changed, so the loaded .vscode/mcp.json is no longer ' +
            'active. Switch the source to .vscode/mcp.json again to reload it before saving.',
        );
        return;
      }
      // Overlay the form's changed values onto the loaded file baseline so unmodeled
      // fields survive, then merge the regenerated entry onto the loaded raw entry (so
      // unmodeled VS Code keys are preserved, P7/P12) and write it back to
      // .vscode/mcp.json. Never touches wcli0.* settings.
      const settings = overlaySettings(loadedFileSettings ?? defaultSettings(), msg.values);
      const ok = await writeMcpJsonFromSettings(settings, folder, { baseEntry: loadedFileEntry });
      if (!ok) {
        return;
      }
      // Re-baseline from what was actually written to disk rather than the pre-write
      // form state, so fields the form does not model match the file. In particular,
      // when the user chose "Omit environment" the written entry has no env; reusing
      // `settings` (which still carries the old env) as the baseline would let
      // overlaySettings resurrect that omitted secret on a later unrelated save (P4).
      const written = await readWcli0Entry(folder);
      if (written) {
        const reparsed = parseMcpEntry(written);
        loadedFileSettings = reparsed.settings;
        loadedFileEntry = written;
        loadedFileNotes = reparsed.notes;
      } else {
        loadedFileSettings = settings;
        loadedFileNotes = [];
      }
      loadedFileFolder = folder.uri.fsPath;
      await refreshDetection();
      post();
      webview.postMessage({ type: 'saved' });
      void vscode.window.showInformationMessage('wcli0: saved to .vscode/mcp.json.');
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
      // After a file-source reset (folder change), the form still holds the now-gone
      // file's values and a file-relative dirty baseline. Writing them into wcli0.*
      // settings would silently corrupt the scope with file-shaped edits the user made
      // for a file, not for settings — so confirm before doing it (P28). The webview only
      // sets this flag while that stale baseline is in effect; a clean re-baseline clears it.
      if (msg.fromResetFileSource && !(await confirmStaleFileSourceWrite())) {
        return; // declined — leave settings untouched
      }
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
      // Export actions read and persist wcli0.* settings. While editing a file source
      // the form holds the .vscode/mcp.json entry, not settings, so persisting its
      // values would corrupt wcli0.* settings and the export would be generated from
      // settings rather than the loaded file. The webview disables the export buttons
      // in file mode; refuse here too as defense in depth (P1).
      if (currentSource === 'mcpJson') {
        void vscode.window.showErrorMessage(
          'wcli0: export actions are unavailable while editing a .vscode/mcp.json source. ' +
            'Switch to VS Code Settings to export.',
        );
        return;
      }
      // Export actions operate on persisted settings. Persist the form's current
      // edits first so what the user sees in the form is what gets exported —
      // otherwise unsaved changes (e.g. Limits & Safety) would be silently
      // dropped from the generated config.json / mcp.json / launch command.
      if (msg.values && msg.target) {
        // After a file-source reset (folder change) the form still holds the now-gone
        // file's values; the export's applySettings would write them into wcli0.*
        // settings just like a plain save would, so confirm first — matching the save
        // path's guard. Without this the re-enabled export buttons bypass the P28
        // confirmation and silently persist stale file-source edits into settings.
        if (msg.fromResetFileSource && !(await confirmStaleFileSourceWrite())) {
          return; // declined — leave settings untouched, skip the export
        }
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
    // A file source is workspace-relative and tied to the folder it was loaded from.
    // Reset it whenever the primary folder no longer matches that folder — either no
    // folder remains, or a multi-root removal/reorder changed the primary. Keeping the
    // stale source would let the next "Save to file" overwrite the new folder's
    // .vscode/mcp.json with the previously loaded folder's config (P2).
    let sourceWasReset = false;
    if (currentSource === 'mcpJson' && primaryWorkspaceFolder()?.uri.fsPath !== loadedFileFolder) {
      currentSource = 'settings';
      loadedFileSettings = undefined;
      loadedFileEntry = undefined;
      loadedFileNotes = [];
      loadedFileFolder = undefined;
      sourceWasReset = true;
    }
    // Post synchronously from the cached detection (a test asserts the re-post happens
    // synchronously on folder change). Then refresh the detection cache and push a
    // detection-only update so a folder added/changed while the panel is open updates the
    // source switcher and the "Load & edit" banner for a workspace that already has
    // .vscode/mcp.json (P16) — without it the detection only appears on the next unrelated
    // post. A dedicated `detected` message (not a full init) is used so it cannot race a
    // concurrent save's scope realignment by re-posting a stale scope (P96).
    post(true);
    // The post above is an external reload, which a DIRTY form ignores so it does not discard
    // unsaved edits — but that also means it never applies the source reset, leaving the UI
    // showing and saving as the now-gone file source until a save is rejected. Push a
    // dedicated source-reset message that switches the UI off the file source even while
    // dirty (field values and dirty state are left untouched, P25).
    if (sourceWasReset) {
      webview.postMessage({ type: 'sourceReset', source: 'settings', detected: detectedSources });
    }
    void refreshDetection().then(() =>
      webview.postMessage({ type: 'detected', detected: detectedSources }),
    );
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
        <div><label>Max command length</label><input type="number" id="sh-${d.name}-sec-maxlen" min="1" step="any" /></div>
        <div><label>Command timeout (s)</label><input type="number" id="sh-${d.name}-sec-timeout" min="1" step="any" /></div>
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
  button:not(:disabled):hover { background: var(--vscode-button-hoverBackground); }
  button:disabled { opacity: .5; cursor: default; }
  button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  button.secondary:not(:disabled):hover { background: var(--vscode-button-secondaryHoverBackground); }
  .scope-radio { display: inline-flex; gap: 14px; align-items: center; flex-wrap: wrap; }
  .scope-radio > span { font-weight: 600; }
  .scope-radio label {
    display: inline-flex; align-items: center; gap: 6px; font-weight: 400; margin: 0;
    padding: 3px 9px; border-radius: 4px; cursor: pointer;
    border: 1px solid transparent;
  }
  /* Native radios render as dark-on-dark in most VS Code themes, so the selected
     option is nearly invisible. Tint the control with the theme focus color and
     visibly highlight the checked label (chip outline + accent text). */
  .scope-radio input[type=radio] {
    accent-color: var(--vscode-focusBorder, var(--vscode-button-background));
    width: 15px; height: 15px; margin: 0; cursor: pointer;
  }
  .scope-radio label:hover { background: var(--vscode-list-hoverBackground, transparent); }
  .scope-radio label:has(input:checked) {
    border-color: var(--vscode-focusBorder, var(--vscode-button-background));
    background: var(--vscode-list-activeSelectionBackground, var(--vscode-button-background));
    color: var(--vscode-list-activeSelectionForeground, var(--vscode-button-foreground));
    font-weight: 600;
  }
  .scope-radio input[type=radio]:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
  .scope-radio label:has(input:disabled) { opacity: 0.5; cursor: not-allowed; }
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
    <div class="source-row" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px">
      <span class="hint">Editing:</span>
      <span id="sourceChip" class="statuschip sc-ok" title="The configuration source the form is editing">VS Code Settings</span>
      <span id="sourcePath" class="hint" style="font-family:var(--vscode-editor-font-family);max-width:360px;overflow-wrap:anywhere;word-break:break-word"></span>
      <span class="switcher" style="position:relative">
        <button type="button" id="switchSourceBtn" class="secondary">Switch source &#9662;</button>
        <div id="sourceMenu" style="display:none;position:absolute;top:calc(100% + 4px);left:0;z-index:20;min-width:320px;padding:6px;border-radius:6px;background:var(--vscode-editorWidget-background,#252526);border:1px solid var(--vscode-panel-border,#3c3c3c);box-shadow:0 6px 24px #0008"></div>
      </span>
    </div>
    <div class="savebar">
      <div class="scope-radio">
        <span>Save to:</span>
        <label><input type="radio" name="scope" value="Workspace" checked /> Workspace</label>
        <label><input type="radio" name="scope" value="Global" /> User</label>
      </div>
      <div class="saveactions">
        <span id="isolationChip" class="statuschip sc-warn" title="Whether an implicit config.json could override these settings. Open the Config source tab.">Overridable</span>
        <span id="dirtyMsg" class="saved-msg" style="display:none;color:var(--vscode-charts-yellow,#d7a930)">Unsaved changes</span>
        <span id="savedMsg" class="saved-msg" style="display:none">Saved &#10003;</span>
        <button id="revertFile" class="secondary" style="display:none">Revert to file</button>
        <button id="save">Save settings</button>
      </div>
    </div>
    <div id="settingsHint" class="hint" style="margin-top:6px">
      Workspace: this project's .vscode/settings.json &middot; User: your global settings.
    </div>
    <div id="fileHint" class="hint" style="display:none;margin-top:6px">
      Editing a file directly. Save writes the wcli0 entry back to this file; other servers are preserved.
    </div>
    <div id="detectBanner" class="hint" style="display:none;margin-top:8px;padding:10px 12px;border-radius:6px;border:1px solid var(--vscode-panel-border,#3c3c3c);border-left:3px solid var(--vscode-charts-blue,#6fb3e0);background:var(--vscode-editorWidget-background,#252526)">
      <span>You are editing <strong>VS Code Settings</strong>. A <strong>wcli0</strong> server also exists in <code>.vscode/mcp.json</code> &mdash; its values are <strong>not loaded here</strong>. Load it to edit that file instead.</span>
      <span style="display:inline-flex;gap:8px;margin-left:8px">
        <button type="button" id="loadMcpJson">Load &amp; edit .vscode/mcp.json</button>
        <button type="button" id="dismissBanner" class="secondary">Dismiss</button>
      </span>
    </div>
    <div id="sourceNotes" class="hint" style="display:none;margin-top:8px;color:var(--vscode-charts-yellow,#d7a930)"></div>
    <div id="noWorkspace" class="hint" style="display:none;color:var(--vscode-errorForeground)">
      No workspace folder open — only User scope is available.
    </div>
    <div class="tabnav" id="tabnav">
      <button type="button" class="tab active" data-tab="config">Config source</button>
      <button type="button" class="tab" data-tab="launch">Launch</button>
      <button type="button" class="tab" data-tab="shells">Shells</button>
      <button type="button" class="tab" data-tab="profiles">Profiles</button>
      <button type="button" class="tab" data-tab="safety">Limits &amp; Safety</button>
      <button type="button" class="tab" data-tab="transport">Transport</button>
      <button type="button" class="tab" data-tab="export">Export</button>
    </div>
  </div>

  <div id="networkLockNote" class="hint" style="display:none;margin:0 0 10px;color:var(--vscode-charts-yellow,#d7a930)">
    This .vscode/mcp.json entry is an http/sse server, so it stores only its URL. The Launch,
    Config file, Shells, Profiles, and Limits &amp; Safety options cannot be written to it and are
    disabled here &mdash; edit them in VS Code Settings, or switch this entry to stdio on the
    Transport tab.
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

  <div class="tabpanel" data-tab="profiles">
  <section>
  <h2>Environment Profiles</h2>
  <div class="hint" style="margin-bottom:10px">
    Named environment profiles (the server's <code>profiles</code> map). Each profile's
    <code>env</code> is merged into a command's environment when selected via the
    <code>profile</code> parameter on <code>execute_command</code>. When any profile is configured the
    extension writes an auto-managed config file and launches the server with <code>--config</code>
    (profiles cannot be passed as CLI flags). Restart the MCP server to apply changes.
  </div>

  <label>Inherited profiles <span class="hint">when set at Workspace scope, ignore environment profiles (wcli0.profiles) inherited from User scope</span></label>
  <select id="ignoreInheritedProfiles">
    <option value="default">Inherit (use profiles)</option>
    <option value="enabled">Ignore inherited profiles</option>
    <option value="disabled">Do not ignore (explicit)</option>
  </select>
  <div class="hint" style="margin-top:4px">VS Code merges <code>wcli0.profiles</code> across scopes, so a Workspace cannot drop a User-scope profile by clearing it. Choose <strong>Ignore</strong> to opt this workspace out of inherited profiles &mdash; they no longer force the managed <code>--config</code> launch or block the <code>.vscode/mcp.json</code> export.</div>
  <div class="hint" id="ignoreInheritedProfilesUserNote" style="display:none;margin-top:4px;color:var(--vscode-charts-yellow,#d7a930)">This opt-out applies to Workspace scope only. At User scope it would suppress your own profiles everywhere, so it is disabled here &mdash; switch to Workspace to use it.</div>
  <label>Profiles <span class="hint">JSON object keyed by profile name</span></label>
  <textarea id="profilesJson" spellcheck="false" style="min-height:200px" placeholder='{
  "ora19": {
    "description": "Oracle 19c client",
    "allowedShells": ["cmd", "powershell"],
    "env": {
      "ORACLE_HOME": "C:/oracle/19",
      "PATH": "C:/oracle/19/bin;\${PATH}"
    }
  }
}'></textarea>
  <div class="hint" id="profilesError" style="display:none;margin-top:6px;color:var(--vscode-errorForeground)"></div>
  <div class="hint" style="margin-top:6px">
    Each profile requires a non-empty <code>env</code> map of string values. <code>\${VAR}</code> in a
    value is interpolated by the server against its own environment (e.g. <code>\${PATH}</code>);
    <code>\${workspaceFolder}</code> and <code>\${userHome}</code> are resolved when the config is
    generated. <code>allowedShells</code> is optional (omit to allow every shell).
  </div>
  </section>
  </div>

  <div class="tabpanel" data-tab="safety">
  <section>
  <h2>Limits & Safety</h2>
  <div class="row">
    <div><label>Command timeout (s)</label><input type="number" id="commandTimeout" min="1" step="any" /></div>
    <div><label>Max command length</label><input type="number" id="maxCommandLength" min="1" step="any" /></div>
    <div><label>Max output lines</label><input type="number" id="maxOutputLines" min="1" max="10000" step="any" /></div>
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
  // Whether a workspace folder is open, and the open folder names (sent on every
  // init). Used to resolve workspaceFolder tokens the way the host does when deciding
  // if a profile isolates (P110).
  let currentHasWorkspace = true;
  let currentWorkspaceFolderNames = [];
  const numberFields = ['commandTimeout','maxCommandLength','maxOutputLines','transport.port'];
  // Booleans rendered as tri-state selects (Inherit / enabled / disabled). Selecting
  // Inherit submits null, which applySettings maps to undefined -> clears the value
  // at the target scope so a previous override can be removed from the form.
  // ignoreInheritedShells / ignoreInheritedProfiles use the same value scheme (their
  // options carry the default/enabled/disabled values) so they round-trip through
  // this machinery.
  const triBoolFields = ['allowAllDirs','debug','ignoreInheritedShells','ignoreInheritedProfiles'];
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
  const inheritTriFields = ['allowAllDirs','debug','ignoreInheritedShells','ignoreInheritedProfiles'];

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

  // ---- Environment profiles (wcli0.profiles) ----
  // The profiles map is edited as JSON: arbitrary profile names and arbitrary env
  // keys do not map onto fixed form controls. parseProfiles returns the parsed
  // object, or null when the text is present but not a JSON object; an empty
  // textarea means {} (no profiles configured).
  function parseProfiles() {
    const el = $('profilesJson');
    const raw = el ? el.value.trim() : '';
    if (raw === '') return {};
    try {
      const v = JSON.parse(raw);
      if (v && typeof v === 'object' && !Array.isArray(v)) return v;
      return null;
    } catch (e) {
      return null;
    }
  }
  // Whether a parsed profiles object has at least one profile the host would emit.
  // Mirrors the host's isMeaningfulProfile/buildProfiles so the isolation chip matches
  // the provider's managed-launch decision, including the drop conditions that make a
  // profile non-isolating: a present-but-non-array allowedShells, a non-empty
  // allowedShells with no valid shell name, and an env value whose extension-owned
  // token cannot resolve.
  const PROFILE_SHELL_NAMES = SHELL_DEFS.map((d) => d.name);
  // The host drops an env value when, after resolving the extension-owned tokens, one
  // is still unresolved (the server would expand the leftover to empty). Mirror the
  // host's resolveVariables exactly: a named workspaceFolder:NAME token resolves only
  // when a folder of that name is open, a plain workspaceFolder token resolves when any
  // folder is open, and userHome always resolves. Then drop the value if any
  // extension-owned token remains. (Regex sources are built from escaped strings so
  // the surrounding template literal never sees a literal dollar-brace to interpolate.)
  function profileEnvValueUsable(v) {
    if (typeof v !== 'string') return false;
    var resolved = v
      .replace(/\\$\\{workspaceFolder:([^}]+)\\}/g, function (m, name) {
        return currentWorkspaceFolderNames.indexOf(name) !== -1 ? 'x' : m;
      })
      .replace(/\\$\\{workspaceFolder\\}/g, function (m) {
        return currentHasWorkspace ? 'x' : m;
      })
      .replace(/\\$\\{userHome\\}/g, 'x');
    return !/\\$\\{workspaceFolder(?::[^}]+)?\\}|\\$\\{userHome\\}/.test(resolved);
  }
  function hasMeaningfulProfiles(p) {
    if (!p || typeof p !== 'object') return false;
    return Object.keys(p).some((name) => {
      if (!name.trim()) return false;
      const prof = p[name];
      if (!prof || typeof prof !== 'object') return false;
      // Mirror buildProfiles' allowedShells drops (P107): a present-but-non-array
      // value, or a non-empty array with no valid shell, drops the whole profile.
      const allowed = prof.allowedShells;
      if (allowed !== undefined) {
        if (!Array.isArray(allowed)) return false;
        if (allowed.length > 0 && !allowed.some((sh) => PROFILE_SHELL_NAMES.includes(sh))) {
          return false;
        }
      }
      const env = prof.env;
      if (!env || typeof env !== 'object' || Array.isArray(env)) return false;
      return Object.keys(env).some((k) => k.trim() !== '' && profileEnvValueUsable(env[k]));
    });
  }
  // Refresh the inline parse-error message; returns true when the JSON is valid.
  // Used as a save/export guard (mirrors validateNumbers) so an invalid profiles
  // edit cannot be persisted.
  function validateProfiles() {
    const err = $('profilesError');
    const ok = parseProfiles() !== null;
    if (err) {
      err.style.display = ok ? 'none' : '';
      if (!ok) err.textContent = 'Profiles must be a valid JSON object keyed by profile name.';
    }
    return ok;
  }
  function setProfilesVal(profiles) {
    profiles = profiles || {};
    const el = $('profilesJson');
    if (!el) return;
    el.value = Object.keys(profiles).length ? JSON.stringify(profiles, null, 2) : '';
    validateProfiles();
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
    setProfilesVal(s.profiles);
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
    // Profiles are edited as JSON. A parse failure keeps the loaded baseline so an
    // in-progress invalid edit is never submitted as a change (collectChanged sees
    // no diff); the save/export guards block an invalid edit outright via
    // validateProfiles. Valid text submits the object; {} clears the setting.
    const parsedProfiles = parseProfiles();
    values['profiles'] =
      parsedProfiles !== null
        ? parsedProfiles
        : initial && initial['profiles'] !== undefined
          ? initial['profiles']
          : {};
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

  // Enable "Revert to file" only when the form has unsaved edits — a clean form already
  // matches the file, so there is nothing to revert. The button is also hidden entirely
  // outside the file source (see setActiveSource). Called on every reload/save (via
  // setActiveSource) and live on each field edit (delegated input/change listeners).
  function reflectDirty() {
    const dirty = isDirty();
    const rb = $('revertFile');
    if (rb) rb.disabled = !dirty;
    // Surface the "Unsaved changes" indicator only while editing the file source, where
    // there is no per-scope Save cue: a clean form (or any settings-source form) hides it,
    // a dirty file form shows it. Toggled live via the delegated input/change listeners and
    // on every reload/save through setActiveSource (P22).
    const dm = $('dirtyMsg');
    if (dm) dm.style.display = dirty && currentSourceClient === 'mcpJson' ? '' : 'none';
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
    // The set of editable tabs depends on the mode for a file source (see below).
    applyFileTransportLock();
  }
  $('transport.mode').addEventListener('change', updateTransportRows);

  // The data-tab panels whose fields cannot be stored in a network (http/sse)
  // .vscode/mcp.json entry — which is just type + url: the launch command, the referenced
  // config file, per-shell config, profiles, and limits/safety/logging/allowed-directories.
  const NETWORK_LOCKED_PANELS = ['config', 'launch', 'shells', 'profiles', 'safety'];
  // When editing an http/sse FILE source, disable those panels' controls (and show a notice)
  // so edits that the entry cannot store are not made and then silently dropped on the
  // post-save reparse (P-httpdrop). The Transport tab stays editable so the URL can be changed
  // or the entry switched back to stdio. A settings source keeps everything editable (the
  // values persist in wcli0.* settings), and so does a stdio file source.
  function applyFileTransportLock() {
    const modeEl = $('transport.mode');
    if (!modeEl || typeof document.querySelector !== 'function') return; // minimal test DOM
    const mode = modeEl.value;
    const lock = currentSourceClient === 'mcpJson' && (mode === 'http' || mode === 'sse');
    for (const name of NETWORK_LOCKED_PANELS) {
      const panel = document.querySelector('.tabpanel[data-tab="' + name + '"]');
      if (!panel || !panel.querySelectorAll) continue;
      for (const el of panel.querySelectorAll('input, select, textarea, button')) {
        el.disabled = lock;
      }
    }
    const note = $('networkLockNote');
    if (note) note.style.display = lock ? '' : 'none';
    // Unlocking blanket-enabled every control above, so restore the conditional disabled
    // states (the Workspace-only inherited-config masks) that other logic owns (P97).
    if (!lock) applyScopeAvailability(formScope);
  }

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
    // Any meaningful environment profile also isolates the launch: the provider
    // writes a managed --config when profiles are configured. Mirror the host's
    // hasProfilesConfig — including the inherited-profiles mask: when "Ignore
    // inherited profiles" is enabled the host returns false (profiles no longer
    // force the managed launch), so they must not isolate here either.
    if (!isolated) {
      const ignProf = $('ignoreInheritedProfiles');
      const profMasked = !!(ignProf && ignProf.value === 'enabled');
      isolated = !profMasked && hasMeaningfulProfiles(parseProfiles());
    }
    chip.className = 'statuschip ' + (isolated ? 'sc-ok' : 'sc-warn');
    chip.textContent = isolated ? 'Isolated' : 'Overridable';
  }
  const configFileEl = $('configFile');
  if (configFileEl) configFileEl.addEventListener('input', updateIsolation);
  // Editing the profiles JSON re-validates it inline and refreshes the isolation
  // chip (a meaningful profile flips the launch to managed/isolated, like shells).
  const profilesEl = $('profilesJson');
  if (profilesEl) {
    profilesEl.addEventListener('input', () => {
      validateProfiles();
      updateIsolation();
    });
  }
  // Toggling "Ignore inherited per-shell config" flips whether per-shell config
  // isolates the launch, so refresh the header chip when it changes.
  const ignoreShellsEl = $('ignoreInheritedShells');
  if (ignoreShellsEl) ignoreShellsEl.addEventListener('change', updateIsolation);
  // Toggling "Ignore inherited profiles" flips whether profiles isolate the launch,
  // so refresh the header chip when it changes (mirrors the shells mask above).
  const ignoreProfilesEl = $('ignoreInheritedProfiles');
  if (ignoreProfilesEl) ignoreProfilesEl.addEventListener('change', updateIsolation);
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

  // Block any out-of-range numeric input before a save or export posts values. The
  // port (1..65535), the global/per-shell timeouts and command lengths (>= 1) and
  // maxOutputLines (1..10000) all carry min/max constraints; without this only the
  // port was checked, so an invalid value such as commandTimeout=0 or
  // maxOutputLines=10001 would persist and then make validateLaunchSpec register no
  // server (and the export handlers would emit a config the server rejects at
  // startup). Mirror the host-side validateLaunchSpec bounds with native validity UI
  // so the form fails fast on the first offending control. (P100)
  function validateNumbers() {
    for (const el of document.querySelectorAll('input[type=number]')) {
      if (el.disabled || el.value === '') continue;
      if (!el.checkValidity()) {
        el.reportValidity();
        return false;
      }
    }
    return true;
  }

  // The active configuration source ('settings' or 'mcpJson'), set from each init.
  let currentSourceClient = 'settings';
  let bannerDismissed = false;
  // True after a sourceReset switched the form off a file source while it was dirty: the
  // form still holds the (now-gone) file's values and a file-relative dirty baseline, so a
  // plain "Save settings" would silently write those file edits into wcli0.* settings.
  // Guarded in the save handler; cleared whenever the form re-baselines to real values.
  let resetFromFileSource = false;

  $('save').addEventListener('click', () => {
    if (!validateNumbers() || !validateProfiles()) return;
    if (currentSourceClient === 'mcpJson') {
      // Editing a file: write the entry back to .vscode/mcp.json, not to settings.
      vscode.postMessage({ type: 'saveToFile', values: collectChanged() });
      return;
    }
    const target = document.querySelector('input[name=scope]:checked').value;
    // After a file-source reset the form's values/baseline are file-derived; flag the
    // save so the host confirms before writing them into settings rather than doing it
    // silently (P28). isDirty() guards against a no-op save re-prompting needlessly.
    vscode.postMessage({
      type: 'save',
      target,
      values: collectChanged(),
      fromResetFileSource: resetFromFileSource && isDirty(),
    });
  });
  // Export actions carry the current form state so the host can persist unsaved
  // edits before generating, keeping the output in sync with what is on screen.
  function exportAction(type) {
    if (!validateNumbers() || !validateProfiles()) return;
    const target = document.querySelector('input[name=scope]:checked').value;
    // After a file-source reset the form's values/baseline are file-derived; flag the
    // export so the host confirms before applySettings writes them into settings,
    // matching the Save button's guard — otherwise an export would silently persist
    // stale file-source edits into wcli0.* settings (P28).
    vscode.postMessage({
      type,
      target,
      values: collectChanged(),
      fromResetFileSource: resetFromFileSource && isDirty(),
    });
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
  // Check-mark glyph built from its code point so the source stays ASCII (no literal
  // non-ASCII characters in code, matching the HTML template's &#10003; convention).
  const CHECK = String.fromCharCode(0x2713);
  // Briefly show a transient status message in the shared indicator span, then restore
  // its default "Saved" label. Used for save, revert, and "nothing to revert" feedback.
  function flashStatus(text) {
    const el = $('savedMsg');
    if (!el) return;
    el.textContent = text;
    el.style.display = '';
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => { el.style.display = 'none'; el.textContent = 'Saved ' + CHECK; }, 2500);
  }
  function showSaved() {
    // Re-baseline so the indicator clears once further edits are made.
    initial = collect();
    flashStatus('Saved ' + CHECK);
  }

  // Reflect whether a workspace folder is available: enable/disable the Workspace
  // scope radio and the workspace-only .vscode/mcp.json export, and show the
  // no-workspace hint. When the folder is gone, force the Global radio so the form
  // never keeps Workspace selected against a non-existent target.
  function applyWorkspaceAvailability(hasWorkspace) {
    currentHasWorkspace = !!hasWorkspace;
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

  // The inherited-config masks (ignoreInheritedShells / ignoreInheritedProfiles) are
  // Workspace-only opt-outs from User-scope shells/profiles. A Global value would
  // suppress the User scope's OWN wcli0.shells / wcli0.profiles everywhere (the
  // has*Config gates treat any effective true as authoritative), so disable each
  // control while editing User scope and show why, preventing the form from ever
  // persisting them globally (P97).
  function applyScopeAvailability(scope) {
    const isUser = scope === 'Global';
    // The masks are VS Code settings-only opt-outs that no .vscode/mcp.json entry can store,
    // so disable them on ANY file source regardless of mode — editing one on a stdio file
    // source would otherwise let Save to file "succeed" while the post-save reparse drops the
    // edit and reports Saved (P-maskfile). http/sse file sources already disable the whole
    // Shells/Profiles panels via applyFileTransportLock; this also covers the stdio case.
    const isFile = currentSourceClient === 'mcpJson';
    const ign = $('ignoreInheritedShells');
    if (ign) {
      ign.disabled = isUser || isFile;
      const note = $('ignoreInheritedShellsUserNote');
      if (note) note.style.display = isUser ? '' : 'none';
    }
    // The inherited-profiles mask is Workspace-only for the same reason (a Global
    // value would suppress the user's own profiles everywhere), so disable it while
    // editing User scope and show why; disable it on a file source too (P-maskfile).
    const ignProf = $('ignoreInheritedProfiles');
    if (ignProf) {
      ignProf.disabled = isUser || isFile;
      const noteProf = $('ignoreInheritedProfilesUserNote');
      if (noteProf) noteProf.style.display = isUser ? '' : 'none';
    }
  }

  // ---- Configuration source switcher (source bar) ----
  // Request a switch to the given editable source, guarding unsaved edits with the
  // host modal (mirrors the scope-switch guard). A clean form switches immediately.
  function requestSource(target) {
    if (target === currentSourceClient) { hideSourceMenu(); return; }
    hideSourceMenu();
    vscode.postMessage({ type: isDirty() ? 'sourceChangeRequest' : 'sourceChange', source: target });
  }
  function hideSourceMenu() { const m = $('sourceMenu'); if (m) m.style.display = 'none'; }
  // Build the switcher menu from the detected sources. Editable entries post a switch;
  // the read-only home config is shown disabled and never becomes a target.
  function renderSourceMenu(detected) {
    const menu = $('sourceMenu');
    if (!menu) return;
    // The menu is built with createElement; the unit-test DOM harness has none, so
    // no-op there (menu interaction is not unit-tested). Real webview builds it.
    if (typeof document.createElement !== 'function') return;
    menu.textContent = '';
    const add = (label, sub, onClick, opts) => {
      opts = opts || {};
      const row = document.createElement('div');
      // The active (currently loaded) source gets a highlighted row + an "active"
      // badge so it is unmistakable which source the form values come from. A bare
      // checkmark was too easy to miss and competed with the detection banner's
      // highlight on a different file.
      row.style.cssText = 'padding:8px 10px;border-radius:4px;' +
        (opts.disabled ? 'opacity:.55;' : 'cursor:pointer;') +
        (opts.active ? 'background:var(--vscode-list-activeSelectionBackground,#04395e);border-left:3px solid var(--vscode-focusBorder,#0078d4);' : '');
      const main = document.createElement('div');
      main.style.cssText = 'font-weight:600;display:flex;align-items:center;gap:8px';
      const labelEl = document.createElement('span');
      labelEl.textContent = label;
      main.appendChild(labelEl);
      if (opts.active) {
        const badge = document.createElement('span');
        badge.textContent = 'active';
        badge.style.cssText = 'font-size:.72em;font-weight:600;text-transform:uppercase;letter-spacing:.04em;padding:1px 6px;border-radius:8px;background:var(--vscode-focusBorder,#0078d4);color:var(--vscode-button-foreground,#fff)';
        main.appendChild(badge);
      }
      row.appendChild(main);
      if (sub) {
        const s = document.createElement('div');
        s.style.cssText = 'opacity:.7;font-size:.83em;font-family:var(--vscode-editor-font-family)';
        s.textContent = sub;
        row.appendChild(s);
      }
      if (!opts.disabled && onClick && !opts.active) {
        row.addEventListener('mouseenter', () => { row.style.background = '#ffffff14'; });
        row.addEventListener('mouseleave', () => { row.style.background = 'transparent'; });
        row.addEventListener('click', onClick);
      } else if (!opts.disabled && onClick) {
        // Active row: clicking the already-loaded source is a no-op, so keep its
        // highlight static and don't rebind hover (which would wipe the background).
        row.addEventListener('click', onClick);
      }
      menu.appendChild(row);
    };
    add('VS Code Settings', 'wcli0.* · User & Workspace', () => requestSource('settings'), { active: currentSourceClient === 'settings' });
    for (const d of (detected || [])) {
      if (d.kind === 'mcpJson') {
        const tag = d.hasWcli0 ? ' (wcli0 entry)' : (d.exists ? ' (no wcli0 entry)' : ' (not present)');
        add('.vscode/mcp.json' + tag, d.fsPath || '', d.hasWcli0 ? () => requestSource('mcpJson') : null, { disabled: !d.hasWcli0, active: currentSourceClient === 'mcpJson' });
      } else if (d.kind === 'homeConfig') {
        // Not an editable source, but clicking opens it read-only so the row is not a
        // dead item — it lets the user inspect the global config that can override them.
        add(d.label, 'read-only · click to open (never a save target)', () => {
          hideSourceMenu();
          vscode.postMessage({ type: 'openHomeConfig' });
        }, {});
      }
    }
  }
  // Reflect the active source: scope radio + hints + Save button label/behavior.
  function setActiveSource(source, detected) {
    currentSourceClient = source || 'settings';
    const isFile = currentSourceClient === 'mcpJson';
    const chip = $('sourceChip');
    if (chip) {
      chip.textContent = isFile ? 'mcp.json' : 'VS Code Settings';
      chip.className = 'statuschip ' + (isFile ? 'sc-warn' : 'sc-ok');
    }
    const fileEntry = (detected || []).find((d) => d.kind === 'mcpJson');
    const sp = $('sourcePath');
    if (sp) {
      const pathLabel = isFile && fileEntry ? (fileEntry.fsPath || '') + ' (servers.wcli0)' : '';
      sp.textContent = pathLabel;
      // Full path as a hover tooltip (it wraps but can still be long); empty string
      // clears it when not editing a file.
      sp.title = pathLabel;
    }
    const sr = document.querySelector('.scope-radio');
    if (sr) sr.style.display = isFile ? 'none' : '';
    if ($('settingsHint')) $('settingsHint').style.display = isFile ? 'none' : '';
    if ($('fileHint')) $('fileHint').style.display = isFile ? '' : 'none';
    if ($('revertFile')) {
      $('revertFile').style.display = isFile ? '' : 'none';
      $('revertFile').title = 'Discard unsaved edits and reload the wcli0 entry from the file on disk.';
    }
    if ($('save')) {
      $('save').textContent = isFile ? 'Save to file' : 'Save settings';
      $('save').title = isFile
        ? 'Write the wcli0 entry back to the loaded file. Other servers in the file are preserved.'
        : 'Save these values to your VS Code settings at the selected scope.';
    }
    // Export actions read/write wcli0.* settings, so they do not apply while editing a
    // file source — disable them to match the host's refusal (P1). Off the file source,
    // restore them: writeMcp additionally depends on a workspace folder being open.
    for (const id of ['showCommand', 'genConfig', 'writeMcp']) {
      const btn = $(id);
      if (!btn) continue;
      btn.disabled = isFile || (id === 'writeMcp' && !currentHasWorkspace);
      btn.title = isFile
        ? 'Switch to VS Code Settings to export. Export actions operate on settings, not a file source.'
        : '';
    }
    applyDetected(detected);
    // Lock the non-transport tabs when this is an http/sse file source (their fields cannot
    // be saved to a network entry); re-enable them otherwise. Runs after the mode is set.
    applyFileTransportLock();
    // The just-loaded form is clean (baseline === values), so disable Revert until an
    // edit is made. Live edits re-evaluate via the delegated input/change listeners.
    reflectDirty();
  }
  // Update the detection-dependent UI (source-switcher rows + the "Load & edit" banner) from
  // the current detected sources, using the active source already on screen. Kept separate
  // from setActiveSource so a background detection refresh (e.g. after a workspace-folder
  // change, P16) can refresh just this without re-posting scope/field values.
  function applyDetected(detected) {
    const fileEntry = (detected || []).find((d) => d.kind === 'mcpJson');
    // The detection banner only makes sense while editing settings and a wcli0 entry
    // exists in the workspace mcp.json (and the user has not dismissed it).
    const banner = $('detectBanner');
    if (banner) {
      const show =
        currentSourceClient !== 'mcpJson' && !bannerDismissed && !!(fileEntry && fileEntry.hasWcli0);
      banner.style.display = show ? '' : 'none';
    }
    renderSourceMenu(detected);
  }
  // Re-evaluate the Revert button's enabled state on any field edit. input/change
  // bubble, so a single delegated listener covers every control in the form. Guarded
  // for the unit-test DOM harness, which has no document-level addEventListener.
  if (typeof document.addEventListener === 'function') {
    document.addEventListener('input', reflectDirty);
    document.addEventListener('change', reflectDirty);
  }
  const switchBtn = $('switchSourceBtn');
  if (switchBtn) switchBtn.addEventListener('click', () => {
    const m = $('sourceMenu');
    if (m) m.style.display = m.style.display === 'none' ? 'block' : 'none';
  });
  const loadBtn = $('loadMcpJson');
  if (loadBtn) loadBtn.addEventListener('click', () => requestSource('mcpJson'));
  const dismissBtn = $('dismissBanner');
  if (dismissBtn) dismissBtn.addEventListener('click', () => {
    bannerDismissed = true;
    if ($('detectBanner')) $('detectBanner').style.display = 'none';
  });
  const revertBtn = $('revertFile');
  if (revertBtn) revertBtn.addEventListener('click', () => {
    // The button is disabled on a clean form (reflectDirty), so a click means there are
    // unsaved edits. Guard anyway, then ask the host to confirm and reload from disk (it
    // flashes "Reverted" on success).
    if (!isDirty()) return;
    vscode.postMessage({ type: 'revertFileRequest' });
  });

  window.addEventListener('message', (e) => {
    const msg = e.data;
    if (msg.type === 'saved') {
      showSaved();
      return;
    }
    if (msg.type === 'reverted') {
      // The host already re-posted the file values (re-baselining the form via init);
      // just flash a confirmation so the click has a visible effect.
      flashStatus('Reverted from file ' + CHECK);
      return;
    }
    if (msg.type === 'detected') {
      // A background detection refresh (workspace folder added/changed). Update only the
      // switcher rows and the "Load & edit" banner; never touches scope/fields, so it cannot
      // disturb a dirty form or a just-saved scope (P16/P96).
      applyDetected(msg.detected);
      return;
    }
    if (msg.type === 'sourceReset') {
      // The host reset the active source because the loaded .vscode/mcp.json's folder is no
      // longer the primary one. Switch the UI off the file source even while the form is
      // dirty — the file is gone, so continuing to show and save as it is wrong (P25). Field
      // values and the dirty state are left untouched so unsaved edits are not discarded;
      // setActiveSource re-evaluates the dirty indicator for the new (settings) source.
      setActiveSource(msg.source, msg.detected);
      // The form keeps the file's values and a file-relative dirty baseline (P25), so a
      // subsequent "Save settings" must be confirmed before writing them into settings (P28).
      // Only arm the guard when the form is actually dirty: the wsSub flow sends an external
      // init (post(true)) BEFORE this sourceReset, and for a CLEAN form that init re-baselines
      // to real settings values (clearing the flag), so arming unconditionally here would
      // flag a settings-derived save and trip a false P28 confirmation (P38).
      if (isDirty()) {
        resetFromFileSource = true;
      }
      // Off the file source there are never parse notes — clear any left from the file (P11).
      const notesEl = $('sourceNotes');
      if (notesEl) {
        notesEl.textContent = '';
        notesEl.style.display = 'none';
      }
      return;
    }
    if (msg.type === 'init') {
      // Workspace availability (enable/disable the Workspace radio and the mcp.json
      // export, show the no-folder hint) must track reality even when the field-value
      // refresh is skipped — e.g. a folder added later must re-enable the Workspace
      // controls. It deliberately does NOT switch a dirty form's selected scope (see
      // applyWorkspaceAvailability, P89), so apply it before the dirty guard.
      applyWorkspaceAvailability(msg.hasWorkspace);
      currentWorkspaceFolderNames = Array.isArray(msg.workspaceFolderNames)
        ? msg.workspaceFolderNames
        : [];
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
      // The form now reflects real persisted values (settings or a freshly loaded file),
      // so the post-reset file-derived baseline is gone — drop the P28 save guard.
      resetFromFileSource = false;
      // Record the scope the form now reflects so a cancelled scope switch can
      // revert the radio to it (P70).
      formScope = msg.scope || formScope;
      // Enable/disable the Workspace-only inherited-shell mask for the loaded scope (P97).
      applyScopeAvailability(formScope);
      // Reflect the active configuration source (source bar, switcher, banner, Save
      // button) from this init. Clear stale parse notes when not on a file source.
      setActiveSource(msg.source, msg.detected);
      // Render the file-source parse notes from this init. Every file-source init carries
      // the current notes (empty when none apply), so a clean reload or save clears stale
      // notes rather than leaving an obsolete warning visible (P11); off the file source
      // there are never notes.
      const notesEl = $('sourceNotes');
      if (notesEl) {
        const notes =
          currentSourceClient === 'mcpJson' && Array.isArray(msg.notes) ? msg.notes : [];
        notesEl.textContent = notes.join(' ');
        notesEl.style.display = notes.length ? '' : 'none';
      }
    }
  });
  vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
}
