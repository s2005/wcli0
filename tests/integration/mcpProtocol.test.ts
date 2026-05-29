import { describe, test, expect, afterEach } from '@jest/globals';
import { TestCLIServer } from '../helpers/TestCLIServer.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '../helpers/InMemoryTransport.js';
import { CLIServer } from '../../src/index.js';
import { DEFAULT_CONFIG } from '../../src/utils/config.js';
import type { ServerConfig } from '../../src/types/config.js';

const server = new TestCLIServer({
  global: {
    security: { restrictWorkingDirectory: true },
    paths: { allowedPaths: [process.cwd()] },
  },
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

describe('Stdio Protocol Handshake', () => {
  let cliServer: CLIServer | null = null;
  let mcpClient: Client | null = null;
  let clientTransport: InMemoryTransport | null = null;

  afterEach(async () => {
    if (clientTransport) {
      await clientTransport.close();
      clientTransport = null;
    }
    mcpClient = null;
    cliServer = null;
  });

  function createTestConfig(): ServerConfig {
    const config: ServerConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    config.global.security.restrictWorkingDirectory = false;
    return config;
  }

  async function setupConnectedPair(): Promise<{
    cliServer: CLIServer;
    client: Client;
    clientTransport: InMemoryTransport;
  }> {
    const config = createTestConfig();
    const srv = new CLIServer(config);
    const [clientSide, serverSide] = InMemoryTransport.createConnectedPair();

    await (srv as any).server.connect(serverSide);

    const cl = new Client(
      { name: 'test-client', version: '1.0.0' },
      { capabilities: {} }
    );
    await cl.connect(clientSide);

    return { cliServer: srv, client: cl, clientTransport: clientSide };
  }

  test('initialize handshake via stdio', async () => {
    const { cliServer: srv, client: cl, clientTransport: ct } = await setupConnectedPair();
    cliServer = srv;
    mcpClient = cl;
    clientTransport = ct;

    // Client.connect() performs initialize automatically
    expect(cl.getServerVersion()).toBeDefined();
    expect(cl.getServerVersion()?.name).toBe('wcli0');
    expect(cl.getServerCapabilities()).toBeDefined();
  });

  test('initialized notification via stdio', async () => {
    const { cliServer: srv, client: cl, clientTransport: ct } = await setupConnectedPair();
    cliServer = srv;
    mcpClient = cl;
    clientTransport = ct;

    // Client.connect() sends initialized notification automatically
    // Verify we can make subsequent requests (proving handshake completed)
    const tools = await cl.listTools();
    expect(tools.tools).toBeDefined();
    expect(tools.tools.length).toBeGreaterThan(0);
  });

  test('tools/list via stdio client', async () => {
    const { cliServer: srv, client: cl, clientTransport: ct } = await setupConnectedPair();
    cliServer = srv;
    mcpClient = cl;
    clientTransport = ct;

    const result = await cl.listTools();
    const toolNames = result.tools.map((t) => t.name);
    expect(toolNames).toContain('execute_command');
    expect(toolNames).toContain('get_config');
    expect(toolNames).toContain('get_current_directory');
    expect(toolNames).toContain('set_current_directory');
  });

  test('tools/call via stdio client', async () => {
    const { cliServer: srv, client: cl, clientTransport: ct } = await setupConnectedPair();
    cliServer = srv;
    mcpClient = cl;
    clientTransport = ct;

    const result = await cl.callTool({ name: 'get_config', arguments: {} });
    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');
    const cfg = JSON.parse(result.content[0].text as string);
    expect(cfg).toHaveProperty('global');
    expect(cfg).toHaveProperty('shells');
  });

  test('error response on unknown method', async () => {
    const { cliServer: srv, client: cl, clientTransport: ct } = await setupConnectedPair();
    cliServer = srv;
    mcpClient = cl;
    clientTransport = ct;

    await expect(
      cl.request(
        { method: 'nonexistent/method', params: {} },
        { timeout: 5000 }
      )
    ).rejects.toThrow();
  });
});

describe('Stdio Resource Handlers', () => {
  let cliServer: CLIServer | null = null;
  let mcpClient: Client | null = null;
  let clientTransport: InMemoryTransport | null = null;

  afterEach(async () => {
    if (clientTransport) {
      await clientTransport.close();
      clientTransport = null;
    }
    mcpClient = null;
    cliServer = null;
  });

  function createTestConfig(): ServerConfig {
    const config: ServerConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    config.global.security.restrictWorkingDirectory = false;
    return config;
  }

  async function setupConnectedPair(): Promise<{
    cliServer: CLIServer;
    client: Client;
    clientTransport: InMemoryTransport;
  }> {
    const config = createTestConfig();
    const srv = new CLIServer(config);
    const [clientSide, serverSide] = InMemoryTransport.createConnectedPair();

    await (srv as any).server.connect(serverSide);

    const cl = new Client(
      { name: 'test-client', version: '1.0.0' },
      { capabilities: {} }
    );
    await cl.connect(clientSide);

    return { cliServer: srv, client: cl, clientTransport: clientSide };
  }

  test('listResources via stdio client', async () => {
    const { cliServer: srv, client: cl, clientTransport: ct } = await setupConnectedPair();
    cliServer = srv;
    mcpClient = cl;
    clientTransport = ct;

    const result = await cl.listResources();
    const uris = result.resources.map((r) => r.uri);
    expect(uris).toContain('cli://config');
    expect(uris).toContain('cli://config/global');
    expect(uris).toContain('cli://info/security');
  });

  test('listResourceTemplates via stdio client', async () => {
    const { cliServer: srv, client: cl, clientTransport: ct } = await setupConnectedPair();
    cliServer = srv;
    mcpClient = cl;
    clientTransport = ct;

    const result = await cl.listResourceTemplates();
    expect(Array.isArray(result.resourceTemplates)).toBe(true);
    expect(result.resourceTemplates).toHaveLength(0);
  });

  test('readResource cli://config via stdio client', async () => {
    const { cliServer: srv, client: cl, clientTransport: ct } = await setupConnectedPair();
    cliServer = srv;
    mcpClient = cl;
    clientTransport = ct;

    const result = await cl.readResource({ uri: 'cli://config' });
    expect(result.contents[0].mimeType).toBe('application/json');
    const cfg = JSON.parse(result.contents[0].text as string);
    expect(cfg).toHaveProperty('global');
    expect(cfg).toHaveProperty('shells');
  });

  test('readResource of unknown URI rejects via stdio client', async () => {
    const { cliServer: srv, client: cl, clientTransport: ct } = await setupConnectedPair();
    cliServer = srv;
    mcpClient = cl;
    clientTransport = ct;

    await expect(
      cl.readResource({ uri: 'cli://does/not/exist' })
    ).rejects.toThrow();
  });
});
