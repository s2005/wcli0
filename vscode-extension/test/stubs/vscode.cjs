// Fake of the `vscode` module rich enough to unit-test the extension's logic
// (settings, args, config-file, provider, commands, webview, activation)
// outside the Extension Host. Loaded in place of `vscode` via hook.cjs.
//
// State is process-global; call `__reset()` in beforeEach to clear it.

const path = require('node:path');

class Uri {
  constructor(scheme, fsPath) {
    this.scheme = scheme;
    this.fsPath = fsPath;
    this.path = fsPath;
  }
  toString() {
    return `${this.scheme}://${this.fsPath}`;
  }
  static file(p) {
    return new Uri('file', p);
  }
  static parse(s) {
    const u = new Uri('uri', s);
    u._raw = s;
    u.toString = () => s;
    return u;
  }
  static joinPath(base, ...segs) {
    // Real vscode.Uri paths always use forward slashes regardless of the host
    // OS, so use POSIX joining here (node:path.join would emit backslashes on
    // Windows and break the POSIX-style fsPath keys the tests assert on).
    return Uri.file(path.posix.join(base.fsPath, ...segs));
  }
}

class EventEmitter {
  constructor() {
    this._listeners = [];
    this.event = (listener) => {
      this._listeners.push(listener);
      return { dispose: () => {} };
    };
  }
  fire(value) {
    for (const l of this._listeners) {
      l(value);
    }
  }
  dispose() {
    this._listeners = [];
  }
}

class McpStdioServerDefinition {
  constructor(label, command, args, env) {
    this.label = label;
    this.command = command;
    this.args = args;
    this.env = env;
    this.cwd = undefined;
  }
}

class McpHttpServerDefinition {
  constructor(label, uri, headers) {
    this.label = label;
    this.uri = uri;
    this.headers = headers;
  }
}

const ConfigurationTarget = { Global: 1, Workspace: 2, WorkspaceFolder: 3 };
const ViewColumn = { Active: -1, One: 1 };

// ---- mutable state -------------------------------------------------------
const state = {
  workspaceFolders: undefined,
  configGlobal: new Map(),
  configWorkspace: new Map(),
  files: new Map(), // fsPath -> Buffer
  readError: undefined, // when set, fs.readFile throws it
  calls: {
    info: [],
    warn: [],
    error: [],
    saveDialog: undefined, // function or value returned by showSaveDialog
    infoReturn: undefined, // value returned by showInformationMessage
    warnReturn: undefined, // value returned by showWarningMessage
    clipboard: [],
    executedCommands: [],
    registeredCommands: new Map(),
    openedDocs: [],
    shownDocs: [],
  },
  lastWebviewPanel: undefined,
  lmHasProvider: true,
  registeredMcpProviders: [],
  configChangeListeners: [],
};

function __reset() {
  state.workspaceFolders = undefined;
  state.configGlobal.clear();
  state.configWorkspace.clear();
  state.files.clear();
  state.readError = undefined;
  state.calls.info = [];
  state.calls.warn = [];
  state.calls.error = [];
  state.calls.saveDialog = undefined;
  state.calls.infoReturn = undefined;
  state.calls.warnReturn = undefined;
  state.calls.clipboard = [];
  state.calls.executedCommands = [];
  state.calls.registeredCommands = new Map();
  state.calls.openedDocs = [];
  state.calls.shownDocs = [];
  state.lastWebviewPanel = undefined;
  state.lmHasProvider = true;
  state.registeredMcpProviders = [];
  state.configChangeListeners = [];
}

function __setConfig(target, key, value) {
  const map = target === ConfigurationTarget.Workspace ? state.configWorkspace : state.configGlobal;
  if (value === undefined) {
    map.delete(key);
  } else {
    map.set(key, value);
  }
}

const workspace = {
  get workspaceFolders() {
    return state.workspaceFolders;
  },
  set workspaceFolders(v) {
    state.workspaceFolders = v;
  },
  getConfiguration(section /*, scope */) {
    const full = (key) => `${section}.${key}`;
    return {
      get(key, def) {
        const k = full(key);
        if (state.configWorkspace.has(k)) return state.configWorkspace.get(k);
        if (state.configGlobal.has(k)) return state.configGlobal.get(k);
        return def;
      },
      async update(key, value, target) {
        __setConfig(target ?? ConfigurationTarget.Workspace, full(key), value);
      },
      inspect(key) {
        const k = full(key);
        return {
          key: k,
          defaultValue: undefined,
          globalValue: state.configGlobal.has(k) ? state.configGlobal.get(k) : undefined,
          workspaceValue: state.configWorkspace.has(k) ? state.configWorkspace.get(k) : undefined,
          workspaceFolderValue: undefined,
        };
      },
    };
  },
  onDidChangeConfiguration(cb) {
    state.configChangeListeners.push(cb);
    return { dispose: () => {} };
  },
  async openTextDocument(uri) {
    state.calls.openedDocs.push(uri);
    return { uri };
  },
  fs: {
    async readFile(uri) {
      if (state.readError) {
        throw state.readError;
      }
      if (!state.files.has(uri.fsPath)) {
        const err = new Error(`ENOENT: ${uri.fsPath}`);
        err.code = 'FileNotFound';
        throw err;
      }
      return state.files.get(uri.fsPath);
    },
    async writeFile(uri, content) {
      state.files.set(uri.fsPath, Buffer.from(content));
    },
    async createDirectory() {},
  },
};

const window = {
  showInformationMessage(message, ...items) {
    state.calls.info.push({ message, items });
    return Promise.resolve(state.calls.infoReturn);
  },
  showWarningMessage(message, ...items) {
    state.calls.warn.push({ message, items });
    return Promise.resolve(state.calls.warnReturn);
  },
  showErrorMessage(message) {
    state.calls.error.push(message);
    return Promise.resolve(undefined);
  },
  async showSaveDialog() {
    const d = state.calls.saveDialog;
    return typeof d === 'function' ? d() : d;
  },
  async showTextDocument(doc) {
    state.calls.shownDocs.push(doc);
    return doc;
  },
  createOutputChannel(name) {
    return {
      name,
      lines: [],
      append(s) {
        this.lines.push(s);
      },
      appendLine(s) {
        this.lines.push(s);
      },
      clear() {
        this.lines = [];
      },
      show() {},
      dispose() {},
    };
  },
  createWebviewPanel(viewType, title) {
    const panel = {
      viewType,
      title,
      revealed: false,
      disposed: false,
      _disposeCbs: [],
      webview: {
        html: '',
        posted: [],
        _handler: undefined,
        postMessage(m) {
          this.posted.push(m);
          return Promise.resolve(true);
        },
        onDidReceiveMessage(cb) {
          this._handler = cb;
          return { dispose: () => {} };
        },
      },
      reveal() {
        this.revealed = true;
      },
      onDidDispose(cb) {
        this._disposeCbs.push(cb);
        return { dispose: () => {} };
      },
      dispose() {
        this.disposed = true;
        for (const cb of this._disposeCbs) cb();
      },
    };
    state.lastWebviewPanel = panel;
    return panel;
  },
};

const commands = {
  registerCommand(id, cb) {
    state.calls.registeredCommands.set(id, cb);
    return { dispose: () => {} };
  },
  async executeCommand(id, ...args) {
    state.calls.executedCommands.push({ id, args });
    const handler = state.calls.registeredCommands.get(id);
    if (handler) {
      return handler(...args);
    }
    return undefined;
  },
};

const env = {
  clipboard: {
    async writeText(text) {
      state.calls.clipboard.push(text);
    },
  },
};

const extensions = {
  getExtension() {
    return undefined;
  },
};

const lm = {};
Object.defineProperty(lm, 'registerMcpServerDefinitionProvider', {
  configurable: true,
  get() {
    if (!state.lmHasProvider) {
      return undefined;
    }
    return (id, provider) => {
      state.registeredMcpProviders.push({ id, provider });
      return { dispose: () => {} };
    };
  },
});

module.exports = {
  Uri,
  EventEmitter,
  McpStdioServerDefinition,
  McpHttpServerDefinition,
  ConfigurationTarget,
  ViewColumn,
  workspace,
  window,
  commands,
  env,
  extensions,
  lm,
  // test helpers
  __state: state,
  __reset,
  __setConfig,
};
