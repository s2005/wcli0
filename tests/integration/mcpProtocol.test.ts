import { describe, test, expect } from '@jest/globals';
import { TestCLIServer } from '../helpers/TestCLIServer.js';

const server = new TestCLIServer({
  global: {
    security: { restrictWorkingDirectory: true },
    paths: { allowedPaths: [process.cwd()] }
  }
});

describe('MCP Protocol Interactions', () => {
  test('should return configuration via get_config tool', async () => {
    const result = await server.callTool('get_config', {});
    const text = result.content[0]?.text ?? '';
    const cfg = JSON.parse(text);
    expect(cfg).toHaveProperty('global');
    expect(cfg.global).toHaveProperty('security');
    expect(cfg).toHaveProperty('shells');
  });

  test('should validate directories correctly', async () => {
    const res = await server.callTool('validate_directories', { directories: [process.cwd()] });
    expect(res.isError).toBe(false);
    expect(res.content[0].text).toContain('All specified directories');
  });
});
