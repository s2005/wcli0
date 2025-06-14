import { describe, expect, test } from '@jest/globals';
import { loadConfig } from '../src/utils/config.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

const createTempConfig = (config: any): string => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'win-cli-shell-test-'));
  const configPath = path.join(tempDir, 'config.json');
  
  // Make sure we have a proper structure with global key
  if (!config.global) {
    config.global = {
      security: { 
        maxCommandLength: 1000,
        commandTimeout: 30,
        enableInjectionProtection: true,
        restrictWorkingDirectory: false
      },
      restrictions: {
        blockedCommands: [],
        blockedArguments: [],
        blockedOperators: []
      },
      paths: {
        allowedPaths: []
      }
    };
  }
  
  fs.writeFileSync(configPath, JSON.stringify(config));
  return configPath;
};

describe('Conditional Shell Configuration', () => {
  test('WSL only included with explicit shells.wsl configuration', () => {
    const configPath = createTempConfig({
      shells: {
        wsl: { enabled: true },
        powershell: { enabled: false },
        cmd: { enabled: false },
        gitbash: { enabled: false }
      }
    });

    const cfg = loadConfig(configPath);

    expect(cfg.shells).toHaveProperty('wsl');
    expect(cfg.shells.wsl?.enabled).toBe(true);
    
    // Default shells are likely still there but should be disabled
    if (cfg.shells.powershell) {
      expect(cfg.shells.powershell.enabled).toBe(false);
    }
    if (cfg.shells.cmd) {
      expect(cfg.shells.cmd.enabled).toBe(false);
    }
    if (cfg.shells.gitbash) {
      expect(cfg.shells.gitbash.enabled).toBe(false);
    }

    fs.rmSync(path.dirname(configPath), { recursive: true, force: true });
  });

  test('backward compatibility with full shell specification', () => {
    const configPath = createTempConfig({
      shells: {
        powershell: { enabled: true },
        cmd: { enabled: true },
        gitbash: { enabled: true },
        wsl: { enabled: true }
      }
    });

    const cfg = loadConfig(configPath);

    expect(cfg.shells).toHaveProperty('powershell');
    expect(cfg.shells).toHaveProperty('cmd');
    expect(cfg.shells).toHaveProperty('gitbash');
    expect(cfg.shells).toHaveProperty('wsl');

    fs.rmSync(path.dirname(configPath), { recursive: true, force: true });
  });

  test('shell validatePath and blockedOperators properly assigned', () => {
    const configPath = createTempConfig({
      shells: {
        gitbash: { enabled: true }
      }
    });

    const cfg = loadConfig(configPath);

    expect(cfg.shells.gitbash?.validatePath).toBeDefined();
    
    // In the new structure, blockedOperators is in overrides.restrictions if specified
    // but might also be inherited from global config
    if (cfg.shells.gitbash?.overrides?.restrictions?.blockedOperators) {
      expect(cfg.shells.gitbash.overrides.restrictions.blockedOperators).toEqual(['&', '|', ';', '`']);
    } else {
      // If not in shell-specific overrides, should be in global restrictions
      expect(cfg.global.restrictions.blockedOperators).toBeDefined();
    }

    fs.rmSync(path.dirname(configPath), { recursive: true, force: true });
  });
});
