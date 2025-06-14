import { CLIServer } from '../src/index';
import { ServerConfig } from '../src/types/config';
import { DEFAULT_CONFIG } from '../src/utils/config';
import { McpError, ErrorCode, CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import path, { dirname } from 'path';
import fs from 'fs';
import os from 'os';
import { normalizeWindowsPath } from '../src/utils/validation';
import { fileURLToPath } from 'url';

// ESM compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const wslEmulatorPath = path.resolve(process.cwd(), 'scripts/wsl-emulator.js');

describe('WSL Shell Execution via Emulator (Tests 1-4)', () => {
  let serverInstance: CLIServer;
  let testConfig: ServerConfig;

  beforeEach(() => {
    testConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    
    // Configure shells
    if (testConfig.shells) {
      // Setup WSL shell with emulator
      testConfig.shells.wsl = {
        enabled: true,
        executable: {
          command: 'node',
          args: [wslEmulatorPath, '-e']
        },
        overrides: {
          restrictions: {
            blockedOperators: ['&', '|', ';', '`']
          }
        },
        wslConfig: {
          mountPoint: '/mnt/',
          inheritGlobalPaths: true,
          pathMapping: {
            enabled: true,
            windowsToWsl: true
          }
        }
      };
      
      // Disable other shells
      if (testConfig.shells.cmd) testConfig.shells.cmd.enabled = false;
      if (testConfig.shells.powershell) testConfig.shells.powershell.enabled = false;
      if (testConfig.shells.gitbash) testConfig.shells.gitbash.enabled = false;
    }
    
    // Update global config
    if (testConfig.global) {
      // Security settings
      if (testConfig.global.security) {
        testConfig.global.security.restrictWorkingDirectory = false;
        testConfig.global.security.enableInjectionProtection = true;
      }
      
      // Remove -e from blocked args
      if (testConfig.global.restrictions && testConfig.global.restrictions.blockedArguments) {
        testConfig.global.restrictions.blockedArguments = 
          testConfig.global.restrictions.blockedArguments.filter(arg => arg !== '-e');
      }
    }
    
    serverInstance = new CLIServer(testConfig);
  });

  test('Test 1: Basic command execution (echo)', async () => {
    const result = await serverInstance._executeTool({
      name: 'execute_command',
      arguments: { shell: 'wsl', command: 'echo hello wsl via emulator' }
    }) as CallToolResult;
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('hello wsl via emulator');
    expect((result.metadata as any)?.exitCode).toBe(0);
  });

  test('Test 2: Command with a specific error exit code', async () => {
    const result = await serverInstance._executeTool({
      name: 'execute_command',
      arguments: { shell: 'wsl', command: 'exit 42' }
    }) as CallToolResult;
    expect(result.isError).toBe(true);
    expect((result.metadata as any)?.exitCode).toBe(42);
    expect(result.content[0].text).toContain('Command failed with exit code 42');
  });

  test('Test 3: Command producing stderr output', async () => {
    const commandThatGeneratesStderr = 'ls /nonexistent_directory_for_wsl_test_xyz';
    const failingResult = await serverInstance._executeTool({
        name: 'execute_command',
        arguments: { shell: 'wsl', command: commandThatGeneratesStderr }
    }) as CallToolResult;
    expect(failingResult.isError).toBe(true);
    expect([1, 2]).toContain((failingResult.metadata as any)?.exitCode);
    expect(failingResult.content[0].text).toMatch(/No such file or directory|cannot access/i);
    expect(failingResult.content[0].text).toContain('Error output:');
  });

  test('Test 4: Injection protection (semicolon)', async () => {
    try {
      await serverInstance._executeTool({
        name: 'execute_command',
        arguments: { shell: 'wsl', command: 'echo bad ; ls' }
      });
      throw new Error('Test failed: Command with semicolon should have been rejected');
    } catch (e: any) {
      expect(e).toBeInstanceOf(McpError);
      expect(e.code).toBe(ErrorCode.InvalidRequest);
      expect(e.message).toContain('Command contains blocked operator for wsl: ;');
    }
  });

  test('Test 4.1: uname -a execution', async () => {
    const result = await serverInstance._executeTool({
      name: 'execute_command',
      arguments: { shell: 'wsl', command: 'uname -a' }
    }) as CallToolResult;
    expect(result.isError).toBe(false);
    expect((result.metadata as any)?.exitCode).toBe(0);
    expect(result.content[0].text).not.toBe('');
    // Emulator specific output is the raw output of `uname -a`
    expect(result.content[0].text).toMatch(/(Linux|Msys)/i);
  });

  test('Test 4.2: Command with multiple arguments (ls -la /tmp)', async () => {
    // /tmp should generally exist in a Linux-like environment provided by the emulator
    const result = await serverInstance._executeTool({
      name: 'execute_command',
      arguments: { shell: 'wsl', command: 'ls -la /tmp' }
    }) as CallToolResult;
    expect(result.isError).toBe(false);
    expect((result.metadata as any)?.exitCode).toBe(0);
    // Check for actual ls output patterns
    expect(result.content[0].text).toMatch(/total\s\d+/);
    expect(result.content[0].text).toContain('.'); // current directory
    expect(result.content[0].text).toContain('..'); // parent directory
  });

  test('Test 4.3: Command with non-existent path argument (ls /mnt/c)', async () => {
    // The emulator runs in `/app` and does not have `/mnt/c`. This command should fail.
    const result = await serverInstance._executeTool({
      name: 'execute_command',
      arguments: { shell: 'wsl', command: 'ls /mnt/c' }
    }) as CallToolResult;
    expect(result.isError).toBe(true); // Expect an error
    expect((result.metadata as any)?.exitCode).not.toBe(0); // Expect non-zero exit code
    // The error message from `ls` itself might be "No such file or directory"
    expect(result.content[0].text).toMatch(/No such file or directory|cannot access/i);
  });
});

describe('WSL Working Directory Validation (Test 5)', () => { // Removed .only
  let serverInstanceForCwdTest: CLIServer;
  let cwdTestConfig: ServerConfig;
  let wslAllowedBase: string;

  beforeEach(() => {
    cwdTestConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    
    // Configure shells
    if (cwdTestConfig.shells) {
      // Setup WSL shell with emulator
      cwdTestConfig.shells.wsl = {
        enabled: true,
        executable: {
          command: 'node',
          args: [wslEmulatorPath, '-e']
        },
        overrides: {
          restrictions: {
            blockedOperators: ['&', '|', ';', '`']
          }
        },
        wslConfig: {
          mountPoint: '/mnt/',
          inheritGlobalPaths: true,
          pathMapping: {
            enabled: true,
            windowsToWsl: true
          }
        }
      };
      
      // Disable other shells
      if (cwdTestConfig.shells.cmd) cwdTestConfig.shells.cmd.enabled = false;
      if (cwdTestConfig.shells.powershell) cwdTestConfig.shells.powershell.enabled = false;
      if (cwdTestConfig.shells.gitbash) cwdTestConfig.shells.gitbash.enabled = false;
    }
    
    // Update global config
    if (cwdTestConfig.global) {
      // Security settings
      if (cwdTestConfig.global.security) {
        cwdTestConfig.global.security.restrictWorkingDirectory = true;
        cwdTestConfig.global.security.enableInjectionProtection = false;
      }
      
      // Path settings
      if (cwdTestConfig.global.paths) {
        // Use a temp directory so creation does not require special permissions
        wslAllowedBase = path.join(os.tmpdir(), 'tad');
        cwdTestConfig.global.paths.allowedPaths = [wslAllowedBase];
      }
      
      // Remove -e from blocked args
      if (cwdTestConfig.global.restrictions && cwdTestConfig.global.restrictions.blockedArguments) {
        cwdTestConfig.global.restrictions.blockedArguments = 
          cwdTestConfig.global.restrictions.blockedArguments.filter(arg => arg !== '-e');
      }
    }

    serverInstanceForCwdTest = new CLIServer(cwdTestConfig);
  });

  test('Test 5.1: Valid WSL working directory (temp tad/sub)', async () => {
    const windowsSubPath = path.join(wslAllowedBase, 'sub');
    // This path should be allowed by the config using the temp base
    // Ensure the directory exists for the emulator to chdir successfully
    fs.mkdirSync(windowsSubPath, { recursive: true });

    // Convert Windows path to WSL format for the command
    const wslPath = windowsSubPath.replace(/^([A-Z]):\\/, (match, drive) => `/mnt/${drive.toLowerCase()}/`).replace(/\\/g, '/');

    const result = await serverInstanceForCwdTest._executeTool({
      name: 'execute_command',
      arguments: {
        shell: 'wsl',
        command: 'pwd',
        workingDir: wslPath
      }
    }) as CallToolResult;

    expect(result.isError).toBe(false);
    expect((result.metadata as any)?.exitCode).toBe(0);
    // `pwd` in the emulator will output the actual working directory the
    // process was spawned with. Since the directory exists in the test
    // environment, it should match the provided workingDir.
    const firstContent = result.content[0];
    if (firstContent && firstContent.type === 'text') {
      expect(firstContent.text.trim()).toBe(wslPath);
    } else {
      throw new Error('Expected first content part to be text for pwd test.');
    }
    // Check that the metadata reflects the intended WSL working directory
    expect((result.metadata as any)?.workingDirectory).toBe(wslPath);
  });

  test('Test 5.1.1: Valid WSL working directory (/tmp)', async () => {
    // Reconfigure allowedPaths for this test to include a typical Linux path
    // Create a deep copy of the config and update properly with inheritance structure
    const tmpConfig = JSON.parse(JSON.stringify(cwdTestConfig));
    
    // Update the allowed paths in the global.paths property
    if (tmpConfig.global && tmpConfig.global.paths) {
      tmpConfig.global.paths.allowedPaths = ['/tmp'];
    }
    
    // Create a new server with the updated config
    serverInstanceForCwdTest = new CLIServer(tmpConfig);

    const wslTmpPath = '/tmp';
    const result = await serverInstanceForCwdTest._executeTool({
      name: 'execute_command',
      arguments: {
        shell: 'wsl',
        command: 'ls', // Simple command
        workingDir: wslTmpPath
      }
    }) as CallToolResult;

    expect(result.isError).toBe(false);
    expect((result.metadata as any)?.exitCode).toBe(0);
    // `ls` in the emulator will output the contents of the provided
    // working directory. We simply ensure some output was produced and
    // that the metadata reflects the directory used.
    expect(result.content[0].text).not.toBe('');
    expect(result.content[0].text).not.toContain('Executed successfully'); // No longer part of eval output
    expect((result.metadata as any)?.workingDirectory).toBe(wslTmpPath);
  });


  test('Test 5.2: Invalid WSL working directory (not in allowedPaths - /mnt/d/forbidden)', async () => {
    // serverInstanceForCwdTest is configured with allowedPaths = ['C:\\tad']
    // /mnt/d/forbidden_dir normalizes to D:\forbidden_dir which is not in C:\tad
    const wslInvalidPath = '/mnt/d/forbidden_dir';
    try {
      await serverInstanceForCwdTest._executeTool({
        name: 'execute_command',
        arguments: {
          shell: 'wsl',
          command: 'pwd',
          workingDir: wslInvalidPath
        }
      });
      throw new Error('Test failed: Command with invalid CWD should have been rejected');
    } catch (e: any) {
      expect(e).toBeInstanceOf(McpError);
      expect(e.code).toBe(ErrorCode.InvalidRequest);
      // Updated error message format includes the WSL working directory validation message
      expect(e.message).toContain('Working directory validation failed');
      expect(e.message).toContain('WSL working directory must be within allowed paths');
    }
  });

  test('Test 5.3: Invalid WSL working directory (valid prefix, not directory containment - /mnt/c/tad_plus_suffix)', async () => {
    // serverInstanceForCwdTest is configured with allowedPaths = ['C:\\tad']
    // /mnt/c/tad_plus_suffix normalizes to C:\tad_plus_suffix, which is not a subdirectory of C:\tad
    const wslInvalidPathSuffix = '/mnt/c/tad_plus_suffix';
     try {
      await serverInstanceForCwdTest._executeTool({
        name: 'execute_command',
        arguments: {
          shell: 'wsl',
          command: 'pwd',
          workingDir: wslInvalidPathSuffix
        }
      });
      throw new Error('Test failed: Command with invalid CWD suffix should have been rejected');
    } catch (e: any) {
      expect(e).toBeInstanceOf(McpError);
      expect(e.code).toBe(ErrorCode.InvalidRequest);
      // Updated error message format for path suffix case
      expect(e.message).toContain('Working directory validation failed');
      expect(e.message).toContain('WSL working directory must be within allowed paths');
    }
  });

  test('Test 5.4: Invalid WSL working directory (pure Linux path not allowed - /usr/local)', async () => {
    // serverInstanceForCwdTest is configured with allowedPaths = ['C:\\tad']
    // A pure Linux path like /usr/local will not be in C:\tad.
    const wslPureLinuxPath = '/usr/local';
     try {
      await serverInstanceForCwdTest._executeTool({
        name: 'execute_command',
        arguments: {
          shell: 'wsl',
          command: 'pwd',
          workingDir: wslPureLinuxPath
        }
      });
      throw new Error('Test failed: Command with pure Linux CWD not in allowedPaths should have been rejected');
    } catch (e: any) {
      expect(e).toBeInstanceOf(McpError);
      expect(e.code).toBe(ErrorCode.InvalidRequest);
      expect(e.message).toContain('Working directory validation failed');
      expect(e.message).toContain('WSL working directory must be within allowed paths');
    }
  });
});
