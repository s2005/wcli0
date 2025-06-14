#!/usr/bin/env node

// WSL Emulator for cross-platform testing
// Mimics basic wsl.exe behavior for development and testing

import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';

const args = process.argv.slice(2);

// Mock file system for 'ls' command emulation
const mockFileSystem = {
  '/tmp': [
    // Mimicking 'ls -la /tmp' output structure for simplicity, even if not all details are used by tests
    'total 0',
    'drwxrwxrwt  2 root root  40 Jan  1 00:00 .',
    'drwxr-xr-x 20 root root 480 Jan  1 00:00 ..'
    // Add more mock files/dirs for /tmp if needed by other tests, e.g., 'somefile.txt'
  ],
  // Example: Add other mock paths as needed by tests
  // '/mnt/c/Users/testuser/docs': ['document1.txt', 'report.pdf'],
};


// Handle WSL list distributions command
if ((args.includes('-l') || args.includes('--list')) &&
    (args.includes('-v') || args.includes('--verbose'))) {
  console.log('NAME            STATE           VERSION');
  console.log('* Ubuntu-Test    Running         2');
  process.exit(0);
}

// Handle command execution with -e flag
if (args[0] === '-e') {
  if (args.length < 2) {
    console.error('Error: No command provided after -e flag.');
    console.error('Usage: wsl-emulator -e <command>');
    process.exit(1);
  }

  // Get the command and its arguments
  const command = args[1];
  const commandArgs = args.slice(2);

  // Special handling for common test commands
  switch (command) {
    case 'pwd':
      // Use original WSL path if available (when called from server)
      if (process.env.WSL_ORIGINAL_PATH) {
        console.log(process.env.WSL_ORIGINAL_PATH);
      } else {
        // When called directly (like in standalone tests), return actual directory
        console.log(process.cwd());
      }
      process.exit(0);
      break;
    case 'exit':
      if (commandArgs.length === 1) {
        const exitCode = parseInt(commandArgs[0], 10);
        if (!isNaN(exitCode)) {
          process.exit(exitCode);
        }
      }
      process.exit(0);
      break;
    case 'ls':
      const pathArg = commandArgs.find(arg => arg.startsWith('/'));

      if (pathArg) {
        // Path argument provided, use mockFileSystem
        if (mockFileSystem.hasOwnProperty(pathArg)) {
          mockFileSystem[pathArg].forEach(item => console.log(item));
          process.exit(0);
        } else {
          console.error(`ls: cannot access '${pathArg}': No such file or directory`);
          process.exit(2);
        }
      } else {
        // No path argument, list contents of process.cwd()
        try {
          const files = fs.readdirSync(process.cwd());
          files.forEach(file => {
            console.log(file); // Test 5.1.1 expects to find 'src'
          });
          process.exit(0);
        } catch (e) {
          console.error(`ls: cannot read directory '.': ${e.message}`);
          process.exit(2);
        }
      }
      break;
    case 'echo':
      console.log(commandArgs.join(' '));
      process.exit(0);
      break;
    case 'uname':
      if (commandArgs.includes('-a')) {
        console.log('Linux Ubuntu-Test 5.10.0-0-generic #0-Ubuntu SMP x86_64 GNU/Linux');
        process.exit(0);
      }
      break;
  }

  // For other commands, try to execute them
  try {
    const result = spawnSync(command, commandArgs, {
      stdio: 'inherit',
      shell: true,
      env: { ...process.env, WSL_DISTRO_NAME: 'Ubuntu-Test' }
    });
    process.exit(result.status || 0);
  } catch (error) {
    console.error(`Command execution failed: ${error.message}`);
    process.exit(127);
  }
}

// If no recognized command, show error
console.error('Error: Invalid arguments. Expected -e <command> OR --list --verbose');
console.error('Received:', args.join(' '));
process.exit(1);
