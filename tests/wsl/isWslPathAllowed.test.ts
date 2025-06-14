import { describe, test, expect } from '@jest/globals';
import { isWslPathAllowed } from '../../src/utils/validation';

const allowedPaths = ['/mnt/c/allowed', '/tmp', 'C:\\Windows\\allowed'];

describe('isWslPathAllowed', () => {
  test.each([
    ['/mnt/c/allowed/subdir', true],
    ['/tmp/workdir', true],
    ['/mnt/c/Windows/allowed/test', true],
    ['/mnt/d/forbidden', false],
    ['/usr/local', false],
    ['/home/user', false],
  ])('returns %s for %s', (path, expected) => {
    expect(isWslPathAllowed(path, allowedPaths)).toBe(expected);
  });
});
