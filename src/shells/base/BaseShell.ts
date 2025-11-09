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
   * Supports both command name matching and full command pattern matching.
   * Override for shell-specific validation logic.
   */
  validateCommand(command: string, context: ValidationContext): ValidationResult {
    const errors: string[] = [];

    // Check blocked commands
    const blockedCommands = [
      ...this.getBlockedCommands(),
      ...(context.blockedCommands || [])
    ];

    const trimmedCommand = command.trim().toLowerCase();
    const commandName = trimmedCommand.split(/\s+/)[0];

    for (const blocked of blockedCommands) {
      const blockedLower = blocked.toLowerCase();

      // Check if the blocked entry matches:
      // 1. The full command (for patterns like "rm -rf /")
      // 2. The command name (for simple blocks like "del")
      if (trimmedCommand === blockedLower ||
          trimmedCommand.startsWith(blockedLower + ' ') ||
          commandName === blockedLower) {
        errors.push(`Command '${blocked}' is blocked for ${this.shellType}`);
        break;
      }
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
