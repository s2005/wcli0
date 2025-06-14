import { describe, test, expect } from '@jest/globals';
import { validateWslWorkingDirectory } from '../../src/utils/validation';

const allowedPaths = ['/mnt/c/allowed', '/tmp', 'C:\\Windows\\allowed'];

describe('validateWslWorkingDirectory', () => {
  test('throws for invalid paths', () => {
    expect(() => validateWslWorkingDirectory('/mnt/d/invalid', allowedPaths)).toThrow('WSL working directory must be within allowed paths');
    expect(() => validateWslWorkingDirectory('relative/path', allowedPaths)).toThrow('WSL working directory must be an absolute path');
  });

  test('accepts valid paths', () => {
    expect(() => validateWslWorkingDirectory('/mnt/c/allowed', allowedPaths)).not.toThrow();
    expect(() => validateWslWorkingDirectory('/tmp', allowedPaths)).not.toThrow();
  });
});
