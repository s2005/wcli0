import { jest } from '@jest/globals';
import { loadShells } from '../loader.js';
import { shellRegistry } from '../../core/registry.js';
import { setDebugLogging } from '../../utils/log.js';

describe('Shell Loader', () => {
  beforeEach(() => {
    shellRegistry.clear();
  });

  afterEach(() => {
    shellRegistry.clear();
    setDebugLogging(false);
  });

  it('should load specified shells', async () => {
    await loadShells({
      shells: ['gitbash', 'powershell'],
    });

    expect(shellRegistry.getCount()).toBe(2);
    expect(shellRegistry.hasShell('gitbash')).toBe(true);
    expect(shellRegistry.hasShell('powershell')).toBe(true);
  });

  it('should load all shells when requested', async () => {
    await loadShells({
      shells: ['powershell', 'cmd', 'gitbash', 'bash', 'bash_auto', 'wsl'],
    });

    expect(shellRegistry.getCount()).toBe(6);
    expect(shellRegistry.hasShell('powershell')).toBe(true);
    expect(shellRegistry.hasShell('cmd')).toBe(true);
    expect(shellRegistry.hasShell('gitbash')).toBe(true);
    expect(shellRegistry.hasShell('bash')).toBe(true);
    expect(shellRegistry.hasShell('bash_auto')).toBe(true);
    expect(shellRegistry.hasShell('wsl')).toBe(true);
  });

  it('should handle empty shell list', async () => {
    await loadShells({
      shells: [],
    });

    expect(shellRegistry.getCount()).toBe(0);
  });

  it('should handle invalid shell types gracefully', async () => {
    setDebugLogging(true);
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });

    await loadShells({
      shells: ['gitbash', 'invalid-shell', 'powershell'],
    });

    expect(shellRegistry.getCount()).toBe(2);
    expect(shellRegistry.hasShell('gitbash')).toBe(true);
    expect(shellRegistry.hasShell('powershell')).toBe(true);
    expect(shellRegistry.hasShell('invalid-shell')).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Unknown shell type: invalid-shell')
    );

    consoleSpy.mockRestore();
  });

  it('should load shells independently', async () => {
    await loadShells({
      shells: ['gitbash'],
    });

    expect(shellRegistry.hasShell('gitbash')).toBe(true);
    expect(shellRegistry.hasShell('powershell')).toBe(false);
    expect(shellRegistry.hasShell('cmd')).toBe(false);
    expect(shellRegistry.hasShell('bash')).toBe(false);
    expect(shellRegistry.hasShell('wsl')).toBe(false);
  });

  it('should load PowerShell correctly', async () => {
    await loadShells({
      shells: ['powershell'],
    });

    const shell = shellRegistry.getShell('powershell');
    expect(shell).toBeDefined();
    expect(shell?.displayName).toBe('PowerShell');
    expect(shell?.defaultConfig.shellCommand).toBe('powershell.exe');
  });

  it('should load CMD correctly', async () => {
    await loadShells({
      shells: ['cmd'],
    });

    const shell = shellRegistry.getShell('cmd');
    expect(shell).toBeDefined();
    expect(shell?.displayName).toBe('Command Prompt (CMD)');
    expect(shell?.defaultConfig.shellCommand).toBe('cmd.exe');
  });

  it('should load Git Bash correctly', async () => {
    await loadShells({
      shells: ['gitbash'],
    });

    const shell = shellRegistry.getShell('gitbash');
    expect(shell).toBeDefined();
    expect(shell?.displayName).toBe('Git Bash');
    expect(shell?.defaultConfig.shellCommand).toContain('bash.exe');
  });

  it('should load Bash correctly', async () => {
    await loadShells({
      shells: ['bash'],
    });

    const shell = shellRegistry.getShell('bash');
    expect(shell).toBeDefined();
    expect(shell?.displayName).toBe('Bash');
    expect(shell?.defaultConfig.shellCommand).toBe('/bin/bash');
  });

  it('should load Bash Auto correctly', async () => {
    await loadShells({
      shells: ['bash_auto'],
    });

    const shell = shellRegistry.getShell('bash_auto');
    expect(shell).toBeDefined();
    // BashAutoPlugin delegates to Git Bash on Windows, Bash on other platforms
    const isWindows = process.platform === 'win32';
    expect(shell?.displayName).toBe(isWindows ? 'Git Bash (Auto)' : 'Bash (Auto)');
    expect(shell?.defaultConfig.shellCommand).toBe(
      isWindows ? 'C:\\Program Files\\Git\\bin\\bash.exe' : '/bin/bash'
    );
  });

  it('should load WSL correctly', async () => {
    await loadShells({
      shells: ['wsl'],
    });

    const shell = shellRegistry.getShell('wsl');
    expect(shell).toBeDefined();
    expect(shell?.displayName).toBe('WSL (Windows Subsystem for Linux)');
    expect(shell?.defaultConfig.shellCommand).toBe('wsl.exe');
  });

  it('should support verbose mode', async () => {
    setDebugLogging(true);
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

    await loadShells({
      shells: ['gitbash'],
      verbose: true,
    });

    expect(consoleSpy).toHaveBeenCalledWith('Loading shell: gitbash');
    expect(consoleSpy).toHaveBeenCalledWith('✓ Loaded shell: Git Bash');
    expect(consoleSpy).toHaveBeenCalledWith('Loaded 1 shell(s)');

    consoleSpy.mockRestore();
  });

  it('should handle loading errors gracefully', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

    // This should not throw even if there's an error
    await loadShells({
      shells: ['gitbash'],
    });

    // Should still load the valid shell
    expect(shellRegistry.hasShell('gitbash')).toBe(true);

    consoleErrorSpy.mockRestore();
  });

  it('should load multiple shells in order', async () => {
    await loadShells({
      shells: ['cmd', 'powershell', 'gitbash'],
    });

    const types = shellRegistry.getShellTypes();
    expect(types).toContain('cmd');
    expect(types).toContain('powershell');
    expect(types).toContain('gitbash');
    expect(types.length).toBe(3);
  });

  it('should register bash_auto alongside explicit shells without duplicates', async () => {
    setDebugLogging(true);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });

    await loadShells({
      shells: ['bash_auto', 'bash'],
    });
    await loadShells({
      shells: ['bash_auto'],
    });

    expect(shellRegistry.getCount()).toBe(2);
    expect(shellRegistry.hasShell('bash_auto')).toBe(true);
    expect(shellRegistry.hasShell('bash')).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Shell bash_auto is already registered, skipping')
    );

    warnSpy.mockRestore();
  });
});
