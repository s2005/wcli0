import { defineConfig } from '@vscode/test-cli';

// Runs the integration tests inside a real VS Code Extension Host.
// Requires network access (to download VS Code) and a display (use xvfb-run on
// headless CI). See README "Testing".
export default defineConfig({
  files: 'test/integration/**/*.test.js',
  version: 'stable',
  mocha: {
    ui: 'bdd',
    timeout: 60000,
  },
});
