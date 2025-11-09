import { jest } from '@jest/globals';
import { ShellRegistry } from '../registry.js';
import { ShellPlugin, ShellConfig } from '../../shells/base/ShellInterface.js';

// Mock shell plugins for testing
class MockShellA implements ShellPlugin {
  readonly shellType = 'mock-a';
  readonly displayName = 'Mock Shell A';
  readonly defaultConfig: ShellConfig = {} as any;
  validateCommand = jest.fn(() => ({ valid: true }));
  validatePath = jest.fn(() => ({ valid: true }));
  getBlockedCommands = jest.fn(() => []);
  mergeConfig = jest.fn((base: ShellConfig, override: Partial<ShellConfig>) => ({ ...base, ...override } as ShellConfig));
}

class MockShellB implements ShellPlugin {
  readonly shellType = 'mock-b';
  readonly displayName = 'Mock Shell B';
  readonly defaultConfig: ShellConfig = {} as any;
  validateCommand = jest.fn(() => ({ valid: true }));
  validatePath = jest.fn(() => ({ valid: true }));
  getBlockedCommands = jest.fn(() => []);
  mergeConfig = jest.fn((base: ShellConfig, override: Partial<ShellConfig>) => ({ ...base, ...override } as ShellConfig));
}

describe('ShellRegistry', () => {
  let registry: ShellRegistry;

  beforeEach(() => {
    // Create fresh registry for each test
    registry = ShellRegistry.getInstance();
    registry.clear();
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = ShellRegistry.getInstance();
      const instance2 = ShellRegistry.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('register', () => {
    it('should register a shell plugin', () => {
      const shell = new MockShellA();
      registry.register(shell);

      expect(registry.hasShell('mock-a')).toBe(true);
      expect(registry.getCount()).toBe(1);
    });

    it('should not register duplicate shells', () => {
      const shell1 = new MockShellA();
      const shell2 = new MockShellA();

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      registry.register(shell1);
      registry.register(shell2);

      expect(registry.getCount()).toBe(1);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('already registered')
      );

      consoleSpy.mockRestore();
    });

    it('should register multiple different shells', () => {
      const shellA = new MockShellA();
      const shellB = new MockShellB();

      registry.register(shellA);
      registry.register(shellB);

      expect(registry.getCount()).toBe(2);
      expect(registry.hasShell('mock-a')).toBe(true);
      expect(registry.hasShell('mock-b')).toBe(true);
    });

    it('should log when registering shell', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const shell = new MockShellA();

      registry.register(shell);

      expect(consoleSpy).toHaveBeenCalledWith('Registering shell: mock-a');

      consoleSpy.mockRestore();
    });
  });

  describe('getShell', () => {
    it('should retrieve registered shell', () => {
      const shell = new MockShellA();
      registry.register(shell);

      const retrieved = registry.getShell('mock-a');
      expect(retrieved).toBe(shell);
    });

    it('should return undefined for unregistered shell', () => {
      const retrieved = registry.getShell('non-existent');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('getAllShells', () => {
    it('should return all registered shells', () => {
      const shellA = new MockShellA();
      const shellB = new MockShellB();

      registry.register(shellA);
      registry.register(shellB);

      const all = registry.getAllShells();
      expect(all).toHaveLength(2);
      expect(all).toContain(shellA);
      expect(all).toContain(shellB);
    });

    it('should return empty array when no shells registered', () => {
      const all = registry.getAllShells();
      expect(all).toHaveLength(0);
    });
  });

  describe('getShellTypes', () => {
    it('should return all shell type identifiers', () => {
      registry.register(new MockShellA());
      registry.register(new MockShellB());

      const types = registry.getShellTypes();
      expect(types).toContain('mock-a');
      expect(types).toContain('mock-b');
      expect(types).toHaveLength(2);
    });

    it('should return empty array when no shells registered', () => {
      const types = registry.getShellTypes();
      expect(types).toHaveLength(0);
    });
  });

  describe('hasShell', () => {
    it('should return true for registered shell', () => {
      const shell = new MockShellA();
      registry.register(shell);

      expect(registry.hasShell('mock-a')).toBe(true);
    });

    it('should return false for unregistered shell', () => {
      expect(registry.hasShell('non-existent')).toBe(false);
    });
  });

  describe('getCount', () => {
    it('should return correct count of registered shells', () => {
      expect(registry.getCount()).toBe(0);

      registry.register(new MockShellA());
      expect(registry.getCount()).toBe(1);

      registry.register(new MockShellB());
      expect(registry.getCount()).toBe(2);
    });
  });

  describe('unregister', () => {
    it('should unregister a shell', () => {
      const shell = new MockShellA();
      registry.register(shell);

      const result = registry.unregister('mock-a');
      expect(result).toBe(true);
      expect(registry.hasShell('mock-a')).toBe(false);
      expect(registry.getCount()).toBe(0);
    });

    it('should return false for non-existent shell', () => {
      const result = registry.unregister('non-existent');
      expect(result).toBe(false);
    });

    it('should not affect other registered shells', () => {
      registry.register(new MockShellA());
      registry.register(new MockShellB());

      registry.unregister('mock-a');

      expect(registry.hasShell('mock-a')).toBe(false);
      expect(registry.hasShell('mock-b')).toBe(true);
      expect(registry.getCount()).toBe(1);
    });
  });

  describe('clear', () => {
    it('should clear all registered shells', () => {
      registry.register(new MockShellA());
      registry.register(new MockShellB());

      expect(registry.getCount()).toBe(2);

      registry.clear();

      expect(registry.getCount()).toBe(0);
      expect(registry.getAllShells()).toHaveLength(0);
    });

    it('should work when no shells are registered', () => {
      expect(() => registry.clear()).not.toThrow();
      expect(registry.getCount()).toBe(0);
    });
  });
});
