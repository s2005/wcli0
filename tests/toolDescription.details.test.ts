import { describe, test, expect } from '@jest/globals';
import {
  buildExecuteCommandDescription,
  buildValidateDirectoriesDescription,
  buildGetConfigDescription
} from '../src/utils/toolDescription.js';
import type { ResolvedShellConfig } from '../src/types/config.js';

function sampleConfig(name: string, type: 'cmd' | 'powershell' | 'gitbash' | 'wsl' = 'cmd'): ResolvedShellConfig {
  return {
    type,
    enabled: true,
    executable: { command: name, args: [] },
    security: {
      maxCommandLength: 1000,
      commandTimeout: 30,
      enableInjectionProtection: true,
      restrictWorkingDirectory: true
    },
    restrictions: { blockedCommands: [], blockedArguments: [], blockedOperators: [] },
    paths: { allowedPaths: ['C\\Allowed'], initialDir: undefined }
  };
}

describe('Detailed Tool Descriptions', () => {
  test('buildExecuteCommandDescription includes shell summaries and examples', () => {
    const configs = new Map<string, ResolvedShellConfig>();
    configs.set('cmd', sampleConfig('cmd.exe', 'cmd'));
    configs.set('wsl', { ...sampleConfig('wsl.exe', 'wsl'), wslConfig: { mountPoint: '/mnt/', inheritGlobalPaths: true } });

    const result = buildExecuteCommandDescription(configs);

    expect(result).toContain('Execute a command in the specified shell (cmd, wsl)');
    expect(result).toContain('**cmd:**');
    expect(result).toContain('**wsl:**');
    expect(result).toContain('WSL:');
    expect(result).toContain('Windows CMD:');
  });

  test('buildExecuteCommandDescription notes path formats for all shells', () => {
    const configs = new Map<string, ResolvedShellConfig>();
    configs.set('powershell', sampleConfig('powershell.exe', 'powershell'));
    configs.set('cmd', sampleConfig('cmd.exe', 'cmd'));
    configs.set('gitbash', sampleConfig('bash.exe', 'gitbash'));
    configs.set('wsl', { ...sampleConfig('wsl.exe', 'wsl'), wslConfig: { mountPoint: '/mnt/', inheritGlobalPaths: true } });

    const result = buildExecuteCommandDescription(configs);

    expect(result).toContain('Path format: Windows-style');
    expect(result).toContain('Path format: Mixed');
    expect(result).toContain('Path format: Unix-style');
  });

  test('buildValidateDirectoriesDescription describes shell specific mode', () => {
    const result = buildValidateDirectoriesDescription(true);
    expect(result).toContain('Check if directories are within allowed paths');
    expect(result).toContain('Shell-Specific Validation');
    expect(result).toContain('"shell": "wsl"');
  });

  test('buildValidateDirectoriesDescription without shell specific mode', () => {
    const result = buildValidateDirectoriesDescription(false);
    expect(result).toContain('Validates directories against the global allowed paths configuration.');
    expect(result).not.toContain('Shell-Specific Validation');
  });

  test('buildGetConfigDescription outlines return fields', () => {
    const result = buildGetConfigDescription();
    expect(result).toContain('Get the windows CLI server configuration');
    expect(result).toContain('`configuration`');
    expect(result).toContain('`resolvedShells`');
  });
});
