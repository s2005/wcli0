import { CLIServer } from '../../src/index.js';
import { TestCLIServer } from './TestCLIServer.js';
import { jest } from '@jest/globals';

/**
 * Helper functions for testing CLI server functionality without directly accessing private methods
 * or importing MCP SDK directly, which doesn't work well in ESM test environment.
 */

/**
 * Intercept the server's setupHandlers method to collect registered handlers
 * 
 * @param server The CLIServer instance to initialize and capture handlers from
 * @returns A Map of method names to handler functions
 */
export function initializeServerAndCollectHandlers(server: CLIServer): Map<string, Function> {
  // Storage for captured handlers
  const capturedHandlers = new Map<string, Function>();
  
  // Store original prototype methods to restore later
  const proto = Object.getPrototypeOf(server);
  const origSetupHandlers = proto.constructor.prototype.setupHandlers;
  
  // Replace the real setupHandlers with our instrumented version
  proto.constructor.prototype.setupHandlers = function() {
    // Create a temporary mcpRequest replacement in the server instance
    // This is better than trying to mock the import directly
    (this as any)._mcpRequest = (method: string, schema: any, handler: Function) => {
      // Capture the handler
      capturedHandlers.set(method, handler);
      // Return a mock request function for chaining
      return { request: jest.fn() };
    };
    
    // Try to call original method with our mocked dependency injected to the instance
    try {
      // Store original initialize method
      const originalInitialize = (this as any).initialize;
      
      // Replace initialize method temporarily
      (this as any).initialize = function() {
        // During initialize, use our temporary mcpRequest
        return Promise.resolve();
      };
      
      // Now call the regular setup handlers with our mock in place
      origSetupHandlers.call(this);
      
      // Restore the initialize method
      (this as any).initialize = originalInitialize;
    } finally {
      // Always cleanup mcpRequest mock even if an error occurs
      delete (this as any)._mcpRequest;
    }
  };
  
  // Call the instrumented setupHandlers to collect handlers
  try {
    proto.constructor.prototype.setupHandlers.call(server);
  } finally {
    // Always restore the original method
    proto.constructor.prototype.setupHandlers = origSetupHandlers;
  }
  
  return capturedHandlers;
}

/**
 * Execute the list tools request handler
 * @param server - The server to use
 * @returns The list of tools
 */
export async function executeListTools(server: CLIServer): Promise<any> {
  // If we have a TestCLIServer, use it directly
  if (server instanceof TestCLIServer) {
    return (server as any).listTools();
  }
  
  // Otherwise, create a new TestCLIServer with the same configuration
  const testServer = new TestCLIServer((server as any).config);
  return await testServer.listTools();
}

/**
 * Execute the list resources request handler
 * @param server - The server to use
 * @returns The list of resources
 */
export async function executeListResources(server: CLIServer): Promise<any> {
  // If we have a TestCLIServer, use it directly
  if (server instanceof TestCLIServer) {
    return (server as TestCLIServer).listResources();
  }
  
  // Otherwise, create a new TestCLIServer with the same configuration
  const testServer = new TestCLIServer((server as any).config);
  return await testServer.listResources();
}

/**
 * Execute the read resource request handler
 * @param server - The server to use
 * @param uri - The resource URI
 * @returns The resource content
 */
export async function executeReadResource(server: CLIServer, uri: string): Promise<any> {
  // If we have a TestCLIServer, use it directly
  if (server instanceof TestCLIServer) {
    return (server as TestCLIServer).readResource(uri);
  }
  
  // Special handling for disabled shell resources when using CLIServer
  const shellMatch = uri.match(/^cli:\/\/config\/shells\/(.+)$/);
  if (shellMatch) {
    const shellName = shellMatch[1];
    const config = (server as any).config;
    
    // Check if the shell is disabled or doesn't exist
    if (!config.shells[shellName] || !config.shells[shellName].enabled) {
      throw new Error('not found or not enabled');
    }
  }
  
  // Otherwise, create a new TestCLIServer with the same configuration
  const testServer = new TestCLIServer((server as any).config);
  return await testServer.readResource(uri);
}
