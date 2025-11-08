import { ShellPlugin } from '../shells/base/ShellInterface.js';

/**
 * Shell Registry
 *
 * Manages registration and retrieval of shell plugins.
 * Implements singleton pattern to ensure single source of truth.
 */
export class ShellRegistry {
  private shells: Map<string, ShellPlugin> = new Map();
  private static instance: ShellRegistry;

  private constructor() {}

  /**
   * Get the singleton instance
   */
  static getInstance(): ShellRegistry {
    if (!ShellRegistry.instance) {
      ShellRegistry.instance = new ShellRegistry();
    }
    return ShellRegistry.instance;
  }

  /**
   * Register a shell plugin
   *
   * @param shell - The shell plugin to register
   */
  register(shell: ShellPlugin): void {
    if (this.shells.has(shell.shellType)) {
      console.warn(`Shell ${shell.shellType} is already registered, skipping`);
      return;
    }
    console.log(`Registering shell: ${shell.shellType}`);
    this.shells.set(shell.shellType, shell);
  }

  /**
   * Unregister a shell plugin
   *
   * @param shellType - The shell type to unregister
   * @returns true if unregistered, false if not found
   */
  unregister(shellType: string): boolean {
    return this.shells.delete(shellType);
  }

  /**
   * Get a registered shell by type
   *
   * @param shellType - The shell type to retrieve
   * @returns The shell plugin or undefined if not found
   */
  getShell(shellType: string): ShellPlugin | undefined {
    return this.shells.get(shellType);
  }

  /**
   * Get all registered shells
   *
   * @returns Array of all registered shell plugins
   */
  getAllShells(): ShellPlugin[] {
    return Array.from(this.shells.values());
  }

  /**
   * Get all registered shell types
   *
   * @returns Array of shell type identifiers
   */
  getShellTypes(): string[] {
    return Array.from(this.shells.keys());
  }

  /**
   * Check if a shell is registered
   *
   * @param shellType - The shell type to check
   * @returns true if registered, false otherwise
   */
  hasShell(shellType: string): boolean {
    return this.shells.has(shellType);
  }

  /**
   * Get count of registered shells
   *
   * @returns Number of registered shells
   */
  getCount(): number {
    return this.shells.size;
  }

  /**
   * Clear all registered shells (mainly for testing)
   */
  clear(): void {
    this.shells.clear();
  }
}

/**
 * Export singleton instance
 */
export const shellRegistry = ShellRegistry.getInstance();
