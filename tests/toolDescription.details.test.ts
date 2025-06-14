import { describe, test, expect } from '@jest/globals';
import {
  buildExecuteCommandDescription,
  buildValidateDirectoriesDescription,
  buildGetConfigDescription
} from '../src/utils/toolDescription.js';
import type { ResolvedShellConfig } from '../src/types/config.js';

function sampleConfig(name: string): ResolvedShellConfig {
  return {
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
    configs.set('cmd', sampleConfig('cmd.exe'));
    configs.set('wsl', { ...sampleConfig('wsl.exe'), wslConfig: { mountPoint: '/mnt/', inheritGlobalPaths: true } });

    const result = buildExecuteCommandDescription(configs);

    expect(result).toContain('Execute a command in the specified shell (cmd, wsl)');
    expect(result).toContain('**cmd:**');
    expect(result).toContain('**wsl:**');
    expect(result).toContain('WSL:');
    expect(result).toContain('Windows CMD:');
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
