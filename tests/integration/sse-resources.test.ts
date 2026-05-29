import { describe, test, expect, afterEach } from '@jest/globals';
import { SseTestClient } from '../helpers/SseTestClient.js';

describe('SSE Resource Handlers', () => {
  let client: SseTestClient | null = null;

  afterEach(async () => {
    if (client) {
      await client.close();
      client = null;
    }
  });

  test('resources/list returns configuration resources', async () => {
    client = await SseTestClient.create();
    const response = await client.call('resources/list');
    expect(response.error).toBeUndefined();
    const uris = response.result.resources.map((r: any) => r.uri);
    expect(uris).toContain('cli://config');
    expect(uris).toContain('cli://config/global');
    expect(uris).toContain('cli://info/security');
  });

  test('resources/list includes enabled shell configuration resources', async () => {
    client = await SseTestClient.create();
    const response = await client.call('resources/list');
    const uris = response.result.resources.map((r: any) => r.uri);
    // SseTestClient enables the wsl shell for cross-platform testing.
    expect(uris).toContain('cli://config/shells/wsl');
  });

  test('resources/templates/list returns an empty list', async () => {
    client = await SseTestClient.create();
    const response = await client.call('resources/templates/list');
    expect(response.error).toBeUndefined();
    expect(Array.isArray(response.result.resourceTemplates)).toBe(true);
    expect(response.result.resourceTemplates).toHaveLength(0);
  });

  test('resources/read cli://config returns parseable JSON config', async () => {
    client = await SseTestClient.create();
    const response = await client.call('resources/read', { uri: 'cli://config' });
    expect(response.error).toBeUndefined();
    const content = response.result.contents[0];
    expect(content.uri).toBe('cli://config');
    expect(content.mimeType).toBe('application/json');
    const cfg = JSON.parse(content.text);
    expect(cfg).toHaveProperty('global');
    expect(cfg).toHaveProperty('shells');
  });

  test('resources/read cli://config/global returns global settings', async () => {
    client = await SseTestClient.create();
    const response = await client.call('resources/read', { uri: 'cli://config/global' });
    expect(response.error).toBeUndefined();
    const cfg = JSON.parse(response.result.contents[0].text);
    expect(cfg).toHaveProperty('security');
  });

  test('resources/read cli://info/security returns security information', async () => {
    client = await SseTestClient.create();
    const response = await client.call('resources/read', { uri: 'cli://info/security' });
    expect(response.error).toBeUndefined();
    const info = JSON.parse(response.result.contents[0].text);
    expect(info).toHaveProperty('globalSettings');
    expect(info).toHaveProperty('enabledShells');
  });

  test('resources/read of unknown URI returns an error', async () => {
    client = await SseTestClient.create();
    const response = await client.call('resources/read', { uri: 'cli://does/not/exist' });
    expect(response.error).toBeDefined();
    expect(response.error.message).toContain('Unknown resource URI');
  });
});
