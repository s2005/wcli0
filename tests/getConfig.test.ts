import { describe, expect, test, jest } from '@jest/globals';
import { ServerConfig } from '../src/types/config.js';
import { createSerializableConfig } from '../src/utils/configUtils.js';

// Mock the Server class from MCP SDK
jest.mock('@modelcontextprotocol/sdk/server/index.js', () => {
  return {
    Server: jest.fn().mockImplementation(() => {
      return {
        setRequestHandler: jest.fn(),
        start: jest.fn()
      };
    })
  };
});

// Mock the StdioServerTransport
jest.mock('@modelcontextprotocol/sdk/server/stdio.js', () => {
  return {
    StdioServerTransport: jest.fn()
  };
});

describe('get_config tool', () => {
  // Sample test config with new nested structure
  const testConfig: ServerConfig = {
    global: {
      security: {
        maxCommandLength: 1000,
        commandTimeout: 30,
        enableInjectionProtection: true,
        restrictWorkingDirectory: true
      },
      restrictions: {
        blockedCommands: ['rm', 'del'],
        blockedArguments: ['--exec'],
        blockedOperators: []
      },
      paths: {
        allowedPaths: ['/test/path']
      }
    },
    shells: {
      powershell: {
        type: 'powershell',
        enabled: true,
        executable: {
          command: 'powershell.exe',
          args: ['-Command']
        },
        overrides: {
          restrictions: {
            blockedOperators: ['&', '|']
          }
        }
      },
      cmd: {
        type: 'cmd',
        enabled: true,
        executable: {
          command: 'cmd.exe',
          args: ['/c']
        },
        overrides: {
          restrictions: {
            blockedOperators: ['&', '|']
          }
        }
      },
      gitbash: {
        type: 'gitbash',
        enabled: false,
        executable: {
          command: 'bash.exe',
          args: ['-c']
        },
        overrides: {
          restrictions: {
            blockedOperators: ['&', '|']
          }
        }
      }
    }
  };

  test('createSerializableConfig returns structured configuration', () => {
    // Call the utility function directly with our test config
    const safeConfig = createSerializableConfig(testConfig);
    
    // Verify the structure and content of the safe config
    expect(safeConfig).toBeDefined();
    expect(safeConfig.global).toBeDefined();
    expect(safeConfig.global.security).toBeDefined();
    expect(safeConfig.shells).toBeDefined();
    
    // Check security settings
    expect(safeConfig.global.security.maxCommandLength).toBe(testConfig.global.security.maxCommandLength);
    expect(safeConfig.global.restrictions.blockedCommands).toEqual(testConfig.global.restrictions.blockedCommands);
    expect(safeConfig.global.restrictions.blockedArguments).toEqual(testConfig.global.restrictions.blockedArguments);
    expect(safeConfig.global.paths.allowedPaths).toEqual(testConfig.global.paths.allowedPaths);
    expect(safeConfig.global.security.restrictWorkingDirectory).toBe(testConfig.global.security.restrictWorkingDirectory);
    expect(safeConfig.global.security.commandTimeout).toBe(testConfig.global.security.commandTimeout);
    expect(safeConfig.global.security.enableInjectionProtection).toBe(testConfig.global.security.enableInjectionProtection);
    
    // Check shells configuration
    if (testConfig.shells.powershell) {
      expect(safeConfig.shells.powershell.type).toBe('powershell');
      expect(safeConfig.shells.powershell.restrictions?.blockedOperators)
        .toEqual(testConfig.shells.powershell.overrides?.restrictions?.blockedOperators || undefined);
    }

    if (testConfig.shells.cmd) {
      expect(safeConfig.shells.cmd.type).toBe('cmd');
    }

    if (testConfig.shells.gitbash) {
      expect(safeConfig.shells.gitbash).toBeUndefined();
    }

    // Verify that executable information is not included
    if (safeConfig.shells.powershell) {
      expect((safeConfig.shells.powershell as any).executable).toBeUndefined();
    }
    if (safeConfig.shells.cmd) {
      expect((safeConfig.shells.cmd as any).executable).toBeUndefined();
    }

  });

  test('createSerializableConfig returns consistent config structure', () => {
    // Call the utility function directly with our test config
    const safeConfig = createSerializableConfig(testConfig);
    
    // Verify the structure matches what we expect both tools to return
    expect(safeConfig).toHaveProperty('global');
    expect(safeConfig.global).toHaveProperty('security');
    expect(safeConfig).toHaveProperty('shells');
    
    // Verify security properties
    expect(safeConfig.global.security).toHaveProperty('maxCommandLength');
    expect(safeConfig.global.restrictions).toHaveProperty('blockedCommands');
    expect(safeConfig.global.restrictions).toHaveProperty('blockedArguments');
    expect(safeConfig.global.restrictions).toHaveProperty('blockedOperators');
    expect(safeConfig.global.paths).toHaveProperty('allowedPaths');
    expect(safeConfig.global.paths).toHaveProperty('initialDir');
    expect(safeConfig.global.security).toHaveProperty('restrictWorkingDirectory');
    expect(safeConfig.global.security).toHaveProperty('commandTimeout');
    expect(safeConfig.global.security).toHaveProperty('enableInjectionProtection');
    
    // Verify shells structure
    Object.keys(testConfig.shells).forEach(shellName => {
      const shell = testConfig.shells[shellName as keyof typeof testConfig.shells];
      if (shell && shell.enabled) {
        expect(safeConfig.shells).toHaveProperty(shellName);
        expect(safeConfig.shells[shellName]).toHaveProperty('type');
      }
    });

  });

  test('createSerializableConfig omits disabled shells', () => {
    const safeConfig = createSerializableConfig(testConfig);

    expect(safeConfig.shells.gitbash).toBeUndefined();
    expect(safeConfig.shells.powershell).toBeDefined();
    expect(safeConfig.shells.cmd).toBeDefined();
  });

  test('createSerializableConfig handles empty shells config', () => {
    const testConfigMinimal: ServerConfig = {
      global: {
        security: { ...testConfig.global.security },
        restrictions: { ...testConfig.global.restrictions },
        paths: { ...testConfig.global.paths }
      },
      shells: {}
    };

    const safeConfig = createSerializableConfig(testConfigMinimal);

    expect(safeConfig).toBeDefined();
    expect(safeConfig.global).toBeDefined();
    expect(safeConfig.shells).toBeDefined();
    expect(Object.keys(safeConfig.shells)).toHaveLength(0);
  });

  test('createSerializableConfig omits restrictions when injection protection disabled', () => {
    const disabledConfig: ServerConfig = {
      ...testConfig,
      global: {
        ...testConfig.global,
        security: {
          ...testConfig.global.security,
          enableInjectionProtection: false
        }
      }
    };

    const safeConfig = createSerializableConfig(disabledConfig);

    expect(safeConfig.global.restrictions).toBeUndefined();
  });
  
  test('get_config tool response format', () => {
    // Call the utility function directly with our test config
    const safeConfig = createSerializableConfig(testConfig);
    
    // Format it as the tool would
    const formattedResponse = {
      content: [{
        type: "text",
        text: JSON.stringify(safeConfig, null, 2)
      }],
      isError: false,
      metadata: {}
    };
    
    // Verify the response structure matches what we expect
    expect(formattedResponse).toHaveProperty('content');
    expect(formattedResponse).toHaveProperty('isError');
    expect(formattedResponse).toHaveProperty('metadata');
    expect(formattedResponse.isError).toBe(false);
    expect(formattedResponse.content).toBeInstanceOf(Array);
    expect(formattedResponse.content[0]).toHaveProperty('type', 'text');
    expect(formattedResponse.content[0]).toHaveProperty('text');
    
    // Parse the JSON string in the response
    const parsedConfig = JSON.parse(formattedResponse.content[0].text);
    
    // Verify it contains the expected structure
    expect(parsedConfig).toHaveProperty('global');
    expect(parsedConfig.global).toHaveProperty('security');
    expect(parsedConfig).toHaveProperty('shells');
    
    // Verify the content matches what we expect
    expect(parsedConfig).toEqual(safeConfig);
  });
});
