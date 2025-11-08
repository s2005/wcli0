import { ShellPlugin, ValidationContext, ValidationResult, ShellConfig } from './ShellInterface.js';

/**
 * Base Shell Implementation
 *
 * Provides default implementations for common shell functionality.
 * Concrete shell implementations should extend this class.
 */
export abstract class BaseShell implements ShellPlugin {
  abstract readonly shellType: string;
  abstract readonly displayName: string;
  abstract readonly defaultConfig: ShellConfig;

  /**
   * Validate a command for this shell
   *
   * Default implementation checks against blocked commands.
   * Override for shell-specific validation logic.
   */
  validateCommand(command: string, context: ValidationContext): ValidationResult {
    const errors: string[] = [];

    // Check blocked commands
    const blockedCommands = [
      ...this.getBlockedCommands(),
      ...(context.blockedCommands || [])
    ];

    const commandName = command.trim().split(/\s+/)[0].toLowerCase();
    if (blockedCommands.some(blocked => commandName === blocked.toLowerCase())) {
      errors.push(`Command '${commandName}' is blocked for ${this.shellType}`);
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * Validate a path for this shell
   *
   * Default implementation allows all paths.
   * Override for shell-specific path validation.
   */
  validatePath(path: string, context: ValidationContext): ValidationResult {
    return { valid: true };
  }

  /**
   * Get blocked commands for this shell
   *
   * Must be implemented by concrete shell classes.
   */
  abstract getBlockedCommands(): string[];

  /**
   * Merge configuration with shell-specific logic
   *
   * Default implementation does a deep merge of security and restrictions.
   * Override for shell-specific merge logic.
   */
  mergeConfig(base: ShellConfig, override: Partial<ShellConfig>): ShellConfig {
    return {
      ...base,
      ...override,
      security: {
        ...base.security,
        ...(override.security || {})
      },
      restrictions: {
        ...base.restrictions,
        ...(override.restrictions || {})
      },
      paths: {
        ...base.paths,
        ...(override.paths || {})
      }
    };
  }
}
