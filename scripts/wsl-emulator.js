#!/usr/bin/env node

// WSL emulator for cross-platform tests.
// Supports:
// - `-l -v` / `--list --verbose`
// - `-e <command> [args...]`

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const args = process.argv.slice(2);

function normalizePosixPath(inputPath) {
  const normalized = path.posix.normalize(inputPath);
  if (normalized === '/') {
    return normalized;
  }
  return normalized.replace(/\/+$/, '');
}

function isPathInAllowedPaths(testPath, allowedPaths) {
  const normalizedTestPath = normalizePosixPath(testPath);

  return allowedPaths.some((allowedPath) => {
    const normalizedAllowedPath = normalizePosixPath(allowedPath);
    const relativePath = path.posix.relative(normalizedAllowedPath, normalizedTestPath);
    return relativePath === '' || (!relativePath.startsWith('..') && !path.posix.isAbsolute(relativePath));
  });
}

function parseAllowedPaths(rawValue) {
  if (!rawValue) {
    return [];
  }

  const trimmed = rawValue.trim();
  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.filter((value) => typeof value === 'string' && value.startsWith('/'));
    }
  } catch {
    // Fall through to delimiter parsing
  }

  return trimmed
    .split(/[;,]/)
    .map((value) => value.trim())
    .filter((value) => value.startsWith('/'));
}

function validateWorkingDirFromEnv() {
  const allowedPathsRaw = process.env.WSL_ALLOWED_PATHS || process.env.ALLOWED_PATHS || '';
  const allowedPaths = parseAllowedPaths(allowedPathsRaw);

  if (allowedPaths.length === 0) {
    return;
  }

  const workingDir = process.env.WSL_ORIGINAL_PATH || process.cwd();
  if (!workingDir.startsWith('/') || !isPathInAllowedPaths(workingDir, allowedPaths)) {
    console.error(`WSL working directory is not allowed: ${workingDir}`);
    process.exit(1);
  }
}

if ((args.includes('-l') || args.includes('--list')) && (args.includes('-v') || args.includes('--verbose'))) {
  console.log('NAME            STATE           VERSION');
  console.log('* Ubuntu-Test    Running         2');
  process.exit(0);
}

if (args[0] !== '-e' || args.length < 2) {
  console.error('Error: Invalid arguments. Expected -e <command> [args...] OR --list --verbose');
  process.exit(1);
}

validateWorkingDirFromEnv();

const command = args[1];
const commandArgs = args.slice(2);
const emulatedWorkingDir = process.env.WSL_ORIGINAL_PATH || process.cwd();

switch (command) {
  case 'pwd':
    console.log(emulatedWorkingDir);
    process.exit(0);
    break;
  case 'echo':
    console.log(commandArgs.join(' '));
    process.exit(0);
    break;
  case 'exit': {
    const exitCode = commandArgs.length === 1 ? Number.parseInt(commandArgs[0], 10) : 0;
    process.exit(Number.isNaN(exitCode) ? 0 : exitCode);
    break;
  }
  case 'uname':
    if (commandArgs.length > 0 && commandArgs[0] === '-a') {
      console.log('Linux Ubuntu-Test 5.15.0-0-generic x86_64 GNU/Linux');
    } else {
      console.log('Linux');
    }
    process.exit(0);
    break;
  case 'ls': {
    const resolvedArgs = commandArgs.length > 0 ? commandArgs : [emulatedWorkingDir];
    const hasAllFlag = resolvedArgs.some((arg) => arg.startsWith('-') && arg.includes('a'));
    const explicitTmp = resolvedArgs.includes('/tmp');

    if (hasAllFlag && explicitTmp) {
      console.log('total 8');
      console.log('drwxrwxrwt 10 root root 4096 Jan 1 00:00 .');
      console.log('drwxr-xr-x 23 root root 4096 Jan 1 00:00 ..');
      process.exit(0);
      break;
    }

    const lsResult = spawnSync('ls', resolvedArgs, {
      cwd: process.cwd(),
      env: process.env,
      encoding: 'utf8'
    });

    if (!lsResult.error) {
      if (lsResult.stdout) {
        process.stdout.write(lsResult.stdout);
      }
      if (lsResult.stderr) {
        process.stderr.write(lsResult.stderr);
      }
      process.exit(typeof lsResult.status === 'number' ? lsResult.status : 0);
      break;
    }

    const targetPath = commandArgs.find((arg) => !arg.startsWith('-')) || emulatedWorkingDir;
    try {
      const entries = fs.readdirSync(targetPath);
      entries.forEach((entry) => console.log(entry));
      process.exit(0);
    } catch {
      console.error(`ls: cannot access '${targetPath}': No such file or directory`);
      process.exit(2);
    }
    break;
  }
  default: {
    const result = spawnSync(command, commandArgs, {
      cwd: process.cwd(),
      env: process.env,
      encoding: 'utf8'
    });

    if (result.error) {
      console.error(result.error.message);
      process.exit(typeof result.status === 'number' ? result.status : 1);
    }

    if (result.stdout) {
      process.stdout.write(result.stdout);
    }
    if (result.stderr) {
      process.stderr.write(result.stderr);
    }
    process.exit(typeof result.status === 'number' ? result.status : 0);
  }
}
