import { describe, test, expect } from '@jest/globals';
import path from 'path';
import { CLIServer } from '../../src/index.js';
import { buildTestConfig } from '../helpers/testUtils.js';
import { executeListTools } from '../helpers/testServerUtils.js';

describe('ListTools Handler', () => {
  
  test('lists only enabled shells in execute_command', async () => {
    const config = buildTestConfig({
      shells: {
        cmd: { enabled: true, executable: { command: 'cmd.exe', args: ['/c'] } },
        powershell: { enabled: false, executable: { command: 'powershell.exe', args: [] } },
        wsl: { enabled: true, executable: { command: 'node', args: [path.resolve(process.cwd(), 'scripts/wsl-emulator.js'), '-e'] } }
      }
    });

    const server = new CLIServer(config);
    const result = await executeListTools(server);
    
    const executeCommand = result.tools.find(t => t.name === 'execute_command');
    
    expect(executeCommand).toBeDefined();
    expect(executeCommand.inputSchema.properties.shell.enum).toEqual(['cmd', 'wsl']);
    expect(executeCommand.inputSchema.properties.shell.enum).not.toContain('powershell');
  });

  test('includes shell-specific settings in description', async () => {
    const config = buildTestConfig({
      global: {
        security: { commandTimeout: 30 }
      },
      shells: {
        cmd: {
          enabled: true,
          executable: { command: 'cmd.exe', args: ['/c'] },
          overrides: {
            security: { commandTimeout: 60 }
          }
        }
      }
    });

    const server = new CLIServer(config);
    const result = await executeListTools(server);
    
    const executeCommand = result.tools.find(t => t.name === 'execute_command');
    
    expect(executeCommand.description).toContain('cmd:');
    expect(executeCommand.description).toContain('Command timeout: 60s');
  });

  test('indicates path format for each shell', async () => {
    const config = buildTestConfig({
      shells: {
        cmd: { enabled: true, executable: { command: 'cmd.exe', args: ['/c'] } },
        wsl: { enabled: true, executable: { command: 'node', args: [path.resolve(process.cwd(), 'scripts/wsl-emulator.js'), '-e'] } },
        gitbash: { enabled: true, executable: { command: 'bash.exe', args: ['-c'] } }
      }
    });

    const server = new CLIServer(config);
    const result = await executeListTools(server);
    
    const executeCommand = result.tools.find(t => t.name === 'execute_command');
    
    expect(executeCommand.description).toContain('Path format: Windows-style');
    expect(executeCommand.description).toContain('Path format: Unix-style');
    expect(executeCommand.description).toContain('Path format: Mixed');
  });

  test('validate_directories shows shell option when shells enabled', async () => {
    const config = buildTestConfig({
      global: {
        security: { restrictWorkingDirectory: true }
      },
      shells: {
        wsl: { enabled: true, executable: { command: 'node', args: [path.resolve(process.cwd(), 'scripts/wsl-emulator.js'), '-e'] } }
      }
    });

    const server = new CLIServer(config);
    const result = await executeListTools(server);
    
    const validateDirs = result.tools.find(t => t.name === 'validate_directories');
    
    expect(validateDirs).toBeDefined();
    expect(validateDirs.inputSchema.properties.shell).toBeDefined();
    expect(validateDirs.inputSchema.properties.shell.enum).toContain('wsl');
    expect(validateDirs.description).toContain('Shell-Specific Validation');
  });

  test('omits validate_directories when restrictions disabled', async () => {
    const config = buildTestConfig({
      global: {
        security: { restrictWorkingDirectory: false }
      }
    });

    const server = new CLIServer(config);
    const result = await executeListTools(server);
    
    const validateDirs = result.tools.find(t => t.name === 'validate_directories');
    
    expect(validateDirs).toBeUndefined();
  });
});
