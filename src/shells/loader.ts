import { shellRegistry } from '../core/registry.js';
import { ShellPlugin } from './base/ShellInterface.js';

export interface LoaderConfig {
  shells: string[];
  verbose?: boolean;
}

/**
 * Load shell plugins into the registry
 *
 * Dynamically imports and registers shell plugins based on the configuration.
 * Only the specified shells are loaded, enabling build-time optimization.
 *
 * @param config - Loader configuration specifying which shells to load
 */
export async function loadShells(config: LoaderConfig): Promise<void> {
  const { shells, verbose = false } = config;

  for (const shellType of shells) {
    try {
      if (verbose) {
        console.log(`Loading shell: ${shellType}`);
      }

      let plugin: ShellPlugin | null = null;

      switch (shellType) {
        case 'powershell': {
          const { PowerShellPlugin } = await import('./powershell/index.js');
          plugin = new PowerShellPlugin();
          break;
        }
        case 'cmd': {
          const { CmdPlugin } = await import('./cmd/index.js');
          plugin = new CmdPlugin();
          break;
        }
        case 'gitbash': {
          const { GitBashPlugin } = await import('./gitbash/index.js');
          plugin = new GitBashPlugin();
          break;
        }
        case 'bash': {
          const { BashPlugin } = await import('./bash/index.js');
          plugin = new BashPlugin();
          break;
        }
        case 'wsl': {
          const { WslPlugin } = await import('./wsl/index.js');
          plugin = new WslPlugin();
          break;
        }
        default:
          console.warn(`Unknown shell type: ${shellType}`);
      }

      if (plugin) {
        shellRegistry.register(plugin);
        if (verbose) {
          console.log(`✓ Loaded shell: ${plugin.displayName}`);
        }
      }
    } catch (error) {
      console.error(`Failed to load shell ${shellType}:`, error);
    }
  }

  if (verbose) {
    console.log(`Loaded ${shellRegistry.getCount()} shell(s)`);
  }
}
