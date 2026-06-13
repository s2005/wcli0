// Minimal stub of the `vscode` module for unit-testing pure logic outside the
// Extension Host. Only the surface used by settings.ts / argsBuilder.ts /
// configFile.ts is implemented. Tests can mutate `workspace.workspaceFolders`.

const workspace = {
  workspaceFolders: undefined,
  getConfiguration() {
    // Not exercised by unit tests (readSettings is glue over the real API).
    return {
      get: (_key, def) => def,
      update: async () => {},
    };
  },
};

module.exports = {
  workspace,
  Uri: {
    file: (p) => ({ fsPath: p, scheme: 'file' }),
    parse: (s) => ({ toString: () => s }),
  },
};
