import { describe, test, expect } from '@jest/globals';
import { loadConfig } from '../../src/utils/config.js';
import fs from 'fs';
import path from 'path';

describe('Configuration Examples', () => {
  const examplesDir = path.join(process.cwd(), 'config.examples');
  
  // Get all example files
  const exampleFiles = fs.existsSync(examplesDir) 
    ? fs.readdirSync(examplesDir).filter(f => f.endsWith('.json'))
    : [];

  test.each(exampleFiles)('example %s is valid', (filename) => {
    const configPath = path.join(examplesDir, filename);
    const configContent = fs.readFileSync(configPath, 'utf8');
    
    // Should parse without error
    expect(() => JSON.parse(configContent)).not.toThrow();
    
    // Should load without error
    expect(() => loadConfig(configPath)).not.toThrow();
    
    // Should have required structure
    const config = loadConfig(configPath);
    expect(config.global).toBeDefined();
    expect(config.shells).toBeDefined();
  });

  test('sample config is valid', () => {
    const samplePath = path.join(process.cwd(), 'config.examples', 'config.sample.json');
    if (fs.existsSync(samplePath)) {
      expect(() => loadConfig(samplePath)).not.toThrow();
    }
  });

  test('all shells in examples have correct structure', () => {
    exampleFiles.forEach(filename => {
      const configPath = path.join(examplesDir, filename);
      const config = loadConfig(configPath);
      
      Object.entries(config.shells).forEach(([shellName, shell]) => {
        if (shell) {
          expect(shell.enabled).toBeDefined();
          expect(shell.executable).toBeDefined();
          expect(shell.executable.command).toBeDefined();
          expect(shell.executable.args).toBeInstanceOf(Array);
          
          // If overrides exist, check structure
          if (shell.overrides) {
            const { security, restrictions, paths } = shell.overrides;
            
            if (security) {
              Object.keys(security).forEach(key => {
                expect(['maxCommandLength', 'commandTimeout', 'enableInjectionProtection', 'restrictWorkingDirectory']).toContain(key);
              });
            }
            
            if (restrictions) {
              Object.keys(restrictions).forEach(key => {
                expect(['blockedCommands', 'blockedArguments', 'blockedOperators']).toContain(key);
              });
            }
            
            if (paths) {
              Object.keys(paths).forEach(key => {
                expect(['allowedPaths', 'initialDir']).toContain(key);
              });
            }
          }
        }
      });
    });
  });

  test('development config allows longer timeouts', () => {
    const devConfigPath = path.join(examplesDir, 'development.json');
    if (fs.existsSync(devConfigPath)) {
      const config = loadConfig(devConfigPath);
      expect(config.global.security.commandTimeout).toBeGreaterThan(60);
    }
  });

  test('production config is restrictive', () => {
    const prodConfigPath = path.join(examplesDir, 'production.json');
    if (fs.existsSync(prodConfigPath)) {
      const config = loadConfig(prodConfigPath);
      expect(config.global.security.commandTimeout).toBeLessThanOrEqual(15);
      expect(config.global.security.maxCommandLength).toBeLessThanOrEqual(1000);
      expect(config.global.restrictions.blockedCommands.length).toBeGreaterThan(10);
    }
  });

  test('minimal config has minimal restrictions', () => {
    const minimalConfigPath = path.join(examplesDir, 'minimal.json');
    if (fs.existsSync(minimalConfigPath)) {
      const config = loadConfig(minimalConfigPath);
      expect(config.global.security.restrictWorkingDirectory).toBe(false);
      // Check that only cmd shell is explicitly enabled in the config
      const enabledShells = Object.entries(config.shells).filter(([_, shell]) => shell?.enabled);
      expect(enabledShells.length).toBeGreaterThanOrEqual(1);
      expect(config.shells.cmd?.enabled).toBe(true);
    }
  });

  // P3: the README must not advertise an unauthenticated bind-all-interfaces
  // example and must warn before binding to a non-loopback address.
  describe('README SSE transport documentation (P3)', () => {
    const readme = fs.readFileSync(path.join(process.cwd(), 'README.md'), 'utf8');

    test('does not present a runnable 0.0.0.0 SSE example', () => {
      expect(readme).not.toMatch(/npx wcli0 --transport sse --sse-host 0\.0\.0\.0/);
    });

    test('documents the custom-port example bound to localhost', () => {
      expect(readme).toMatch(/--sse-host 127\.0\.0\.1 --sse-port 3000/);
    });

    test('includes a security warning about binding to all interfaces', () => {
      const warning = readme.match(/> \*\*Security:\*\*[\s\S]*?authenticated[\s\S]*?\n\n/i);
      expect(warning).not.toBeNull();
      expect(warning![0]).toMatch(/0\.0\.0\.0/);
    });
  });
});
