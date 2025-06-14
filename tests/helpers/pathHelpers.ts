import path from 'path';

/**
 * Mocks Node's path utilities to behave consistently for Windows paths.
 * This helper should be called at the top level of a test file.
 */
export function mockWindowsPaths(): void {
  const origAbs = path.isAbsolute;
  const origRes = path.resolve;

  beforeEach(() => {
    (path as any).isAbsolute = (p: string) => /^([a-zA-Z]:\\|\\\\|\/)/.test(p) || origAbs(p);
    // path.resolve will now use its native behavior
  });

  afterEach(() => {
    (path as any).isAbsolute = origAbs;
    (path as any).resolve = origRes;
  });
}
