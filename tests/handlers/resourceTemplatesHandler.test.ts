import { describe, test, expect } from '@jest/globals';
import { CLIServer } from '../../src/index.js';
import { buildTestConfig } from '../helpers/testUtils.js';
import { executeListResourceTemplates } from '../helpers/testServerUtils.js';

describe('ListResourceTemplates Handler', () => {
  test('returns empty template list', async () => {
    const config = buildTestConfig();
    const server = new CLIServer(config);
    const result = await executeListResourceTemplates(server);
    expect(result.resourceTemplates).toEqual([]);
  });
});
