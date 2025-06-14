/**
 * Common reusable strings and helper builders for unit tests.
 */

export const testPaths = {
  tempDir: '/c/win-cli-test',
  windowsDir: 'C\\Windows',
  safeDir: 'C\\safe\\path',
};

export const commands = {
  echo: 'echo hi',
  blocked: 'rm file.txt',
  injection: 'echo hi & echo there',
};

/**
 * Build a chained command for testing command parsing and validation.
 *
 * @param dir - Directory to change into before running the command
 * @param cmd - Command to execute after the directory change
 */
export function chainCommand(dir: string, cmd: string): string {
  return `cd ${dir} && ${cmd}`;
}
