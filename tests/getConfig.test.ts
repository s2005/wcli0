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
      expect(safeConfig.shells.powershell.enabled).toBe(testConfig.shells.powershell.enabled);
      expect(safeConfig.shells.powershell.executable.command).toBe(testConfig.shells.powershell.executable?.command);
      expect(safeConfig.shells.powershell.executable.args).toEqual(testConfig.shells.powershell.executable?.args || []);
      expect(safeConfig.shells.powershell.overrides?.restrictions?.blockedOperators)
        .toEqual(testConfig.shells.powershell.overrides?.restrictions?.blockedOperators || []);
    }
    
    if (testConfig.shells.cmd) {
      expect(safeConfig.shells.cmd.enabled).toBe(testConfig.shells.cmd.enabled);
    }
    
    if (testConfig.shells.gitbash) {
      expect(safeConfig.shells.gitbash.enabled).toBe(testConfig.shells.gitbash.enabled);
    }
    
    // Verify that function properties are not included in the serializable config
    // We now look for overrides.validatePath property which shouldn't be included in serialized output
    if (safeConfig.shells.powershell) {
      expect(safeConfig.shells.powershell.validatePath).toBeUndefined();
    }
    if (safeConfig.shells.cmd) {
      expect(safeConfig.shells.cmd.validatePath).toBeUndefined();
    }
    if (safeConfig.shells.gitbash) {
      expect(safeConfig.shells.gitbash.validatePath).toBeUndefined();
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
        expect(safeConfig.shells[shellName]).toHaveProperty('enabled');
        expect(safeConfig.shells[shellName]).toHaveProperty('executable');
        expect(safeConfig.shells[shellName].executable).toHaveProperty('command');
        expect(safeConfig.shells[shellName].executable).toHaveProperty('args');
        if (safeConfig.shells[shellName].overrides && safeConfig.shells[shellName].overrides.restrictions) {
          expect(safeConfig.shells[shellName].overrides.restrictions).toHaveProperty('blockedOperators');
        }
      }
    });

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
