import { BashAutoPlugin } from '../bash_auto/index.js';

const realPlatform = process.platform;

const setPlatform = (platform: NodeJS.Platform): void => {
  Object.defineProperty(process, 'platform', { value: platform });
};

describe('BashAutoPlugin', () => {
  afterEach(() => {
    setPlatform(realPlatform);
  });

  it('uses Bash defaults on linux platforms', () => {
    setPlatform('linux');

    const plugin = new BashAutoPlugin();

    expect(plugin.defaultConfig.shellCommand).toBe('/bin/bash');
    expect(plugin.getBlockedCommands()).toEqual(
      expect.arrayContaining(['rm -rf /'])
    );
  });

  it('uses Git Bash defaults on win32 platforms', () => {
    setPlatform('win32');

    const plugin = new BashAutoPlugin();

    expect(plugin.defaultConfig.shellCommand).toBe(
      'C:\\Program Files\\Git\\bin\\bash.exe'
    );
    expect(plugin.getBlockedCommands()).toEqual(
      expect.arrayContaining(['rm -rf /'])
    );
  });

  it('uses Bash defaults on darwin (macOS) platforms', () => {
    setPlatform('darwin');

    const plugin = new BashAutoPlugin();

    expect(plugin.displayName).toBe('Bash (Auto)');
    expect(plugin.defaultConfig.shellCommand).toBe('/bin/bash');
    expect(plugin.getBlockedCommands()).toEqual(
      expect.arrayContaining(['rm -rf /'])
    );
  });

  it.each([
    { platform: 'linux' as const, expectedShell: 'bash' },
    { platform: 'darwin' as const, expectedShell: 'bash' },
    { platform: 'win32' as const, expectedShell: 'gitbash' },
  ])(
    'delegates validation to the selected implementation on $platform',
    ({ platform, expectedShell }) => {
      setPlatform(platform);
      const plugin = new BashAutoPlugin();

      const result = plugin.validateCommand('rm -rf /', {
        shellType: plugin.shellType,
      });

      expect(result.valid).toBe(false);
      expect(result.errors?.[0]).toContain(expectedShell);

      const merged = plugin.mergeConfig(plugin.defaultConfig, {
        restrictions: {
          ...plugin.defaultConfig.restrictions,
          blockedCommands: ['echo'],
        },
      });

      expect(merged.restrictions.blockedCommands).toContain('echo');
    }
  );
});
