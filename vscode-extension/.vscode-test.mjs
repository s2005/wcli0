import { existsSync, readFileSync } from 'node:fs';
import { defineConfig } from '@vscode/test-cli';

// Runs the integration tests inside a real VS Code Extension Host.
//
// By default this downloads VS Code ("stable"). To run without the on-demand
// download (e.g. offline or for a deterministic run), run
// `npm run setup:test-editor` first: it fetches a VS Code-compatible build
// (VSCodium) from GitHub and writes its path to .vscode-test/editor-path, which
// is picked up here via useInstallation.fromPath so no download is attempted.
// You can also point at any local install with VSCODE_TEST_FROM_PATH.

const editorPathFile = new URL('.vscode-test/editor-path', import.meta.url);
let fromPath = process.env.VSCODE_TEST_FROM_PATH;
if (!fromPath && existsSync(editorPathFile)) {
  fromPath = readFileSync(editorPathFile, 'utf8').trim();
}

export default defineConfig({
  files: 'test/integration/**/*.test.js',
  // Chromium needs these to run as root inside a container/CI.
  launchArgs: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  ...(fromPath ? { useInstallation: { fromPath } } : { version: 'stable' }),
  mocha: {
    ui: 'bdd',
    timeout: 120000,
  },
});
