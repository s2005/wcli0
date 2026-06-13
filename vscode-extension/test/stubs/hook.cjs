// Preload hook: resolve `require('vscode')` to the local stub so the compiled
// extension modules can be unit-tested under plain Node. Used via
// `node --require ./test/stubs/hook.cjs`.
const Module = require('module');
const path = require('path');

const stubPath = path.join(__dirname, 'vscode.cjs');
const originalResolve = Module._resolveFilename;

Module._resolveFilename = function (request, ...rest) {
  if (request === 'vscode') {
    return stubPath;
  }
  return originalResolve.call(this, request, ...rest);
};
