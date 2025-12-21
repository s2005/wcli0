import { ShellPlugin, ShellConfig, ValidationContext, ValidationResult } from '../base/ShellInterface.js';
import { BashPlugin } from '../bash/index.js';
import { GitBashPlugin } from '../gitbash/index.js';

const isWindows = (platform: NodeJS.Platform): boolean => platform === 'win32';

/**
 * Bash Auto Shell Plugin
 *
 * Selects Bash or Git Bash implementation based on the host platform.
 * Delegates validation and merge behaviors to the chosen implementation.
 */
export class BashAutoPlugin implements ShellPlugin {
  readonly shellType = 'bash_auto';
  readonly displayName: string;
  readonly defaultConfig: ShellConfig;
  private readonly delegate: ShellPlugin;

  constructor(platform: NodeJS.Platform = process.platform) {
    this.delegate = isWindows(platform) ? new GitBashPlugin() : new BashPlugin();
    this.displayName = `${this.delegate.displayName} (Auto)`;
    this.defaultConfig = this.delegate.defaultConfig;
  }

  validateCommand(command: string, context: ValidationContext): ValidationResult {
    return this.delegate.validateCommand(command, {
      ...context,
      shellType: context.shellType ?? this.delegate.shellType,
    });
  }

  validatePath(path: string, context: ValidationContext): ValidationResult {
    return this.delegate.validatePath(path, {
      ...context,
      shellType: context.shellType ?? this.delegate.shellType,
    });
  }

  mergeConfig(base: ShellConfig, override: Partial<ShellConfig>): ShellConfig {
    return this.delegate.mergeConfig(base, override);
  }

  getBlockedCommands(): string[] {
    return this.delegate.getBlockedCommands();
  }
}
