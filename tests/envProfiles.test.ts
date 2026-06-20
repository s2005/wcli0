import { describe, test, expect } from '@jest/globals';
import {
  interpolateEnvValue,
  resolveProfileEnv,
  ProfileSelectionError
} from '../src/utils/envProfiles.js';
import { DEFAULT_CONFIG } from '../src/utils/config.js';
import * as configModule from '../src/utils/config.js';
import type { EnvProfileConfig, ServerConfig } from '../src/types/config.js';

const validateConfig = (configModule as any).validateConfig as (cfg: ServerConfig) => void;

function cloneDefault(): ServerConfig {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

describe('interpolateEnvValue', () => {
  const base: NodeJS.ProcessEnv = {
    PATH: '/usr/bin:/bin',
    ORACLE_HOME: '/opt/oracle/19'
  };

  test('replaces a present placeholder', () => {
    expect(interpolateEnvValue('${ORACLE_HOME}/bin', base)).toBe('/opt/oracle/19/bin');
  });

  test('replaces an absent placeholder with empty string', () => {
    expect(interpolateEnvValue('${MISSING}/bin', base)).toBe('/bin');
  });

  test('replaces multiple placeholders', () => {
    expect(interpolateEnvValue('${ORACLE_HOME};${PATH}', base)).toBe(
      '/opt/oracle/19;/usr/bin:/bin'
    );
  });

  test('leaves text without placeholders unchanged', () => {
    expect(interpolateEnvValue('C:/oracle/19/bin', base)).toBe('C:/oracle/19/bin');
  });

  test('prepends a literal segment before an interpolated PATH', () => {
    expect(interpolateEnvValue('C:/oracle/19/bin;${PATH}', base)).toBe(
      'C:/oracle/19/bin;/usr/bin:/bin'
    );
  });
});

describe('resolveProfileEnv', () => {
  const base: NodeJS.ProcessEnv = {
    PATH: '/usr/bin:/bin',
    HOME: '/home/user'
  };

  const profiles: Record<string, EnvProfileConfig> = {
    ora19: {
      description: 'Oracle 19 client',
      env: {
        ORACLE_HOME: '/opt/oracle/19',
        PATH: '/opt/oracle/19/bin:${PATH}'
      }
    },
    cmdOnly: {
      allowedShells: ['cmd'],
      env: {
        FOO: 'bar'
      }
    }
  };

  test('returns empty object for an undefined profile name', () => {
    expect(resolveProfileEnv(profiles, undefined, 'bash', base)).toEqual({});
  });

  test('returns empty object for an empty profile name', () => {
    expect(resolveProfileEnv(profiles, '', 'bash', base)).toEqual({});
  });

  test('returns empty object when no profiles configured and no name given', () => {
    expect(resolveProfileEnv(undefined, undefined, 'bash', base)).toEqual({});
  });

  test('throws ProfileSelectionError listing valid names for unknown profile', () => {
    expect(() => resolveProfileEnv(profiles, 'nope', 'bash', base)).toThrow(
      ProfileSelectionError
    );
    expect(() => resolveProfileEnv(profiles, 'nope', 'bash', base)).toThrow(/ora19/);
    expect(() => resolveProfileEnv(profiles, 'nope', 'bash', base)).toThrow(/cmdOnly/);
  });

  test('throws ProfileSelectionError when shell is not allowed', () => {
    expect(() => resolveProfileEnv(profiles, 'cmdOnly', 'bash', base)).toThrow(
      ProfileSelectionError
    );
    expect(() => resolveProfileEnv(profiles, 'cmdOnly', 'bash', base)).toThrow(
      /not allowed for shell 'bash'/
    );
  });

  test('resolves a profile and interpolates values against base', () => {
    const resolved = resolveProfileEnv(profiles, 'ora19', 'bash', base);
    expect(resolved).toEqual({
      ORACLE_HOME: '/opt/oracle/19',
      PATH: '/opt/oracle/19/bin:/usr/bin:/bin'
    });
  });

  test('PATH prepend ordering places the profile segment first', () => {
    const resolved = resolveProfileEnv(profiles, 'ora19', 'bash', base);
    expect(resolved.PATH.startsWith('/opt/oracle/19/bin:')).toBe(true);
  });

  test('allows a shell listed in allowedShells', () => {
    const resolved = resolveProfileEnv(profiles, 'cmdOnly', 'cmd', base);
    expect(resolved).toEqual({ FOO: 'bar' });
  });

  test('P109: an empty allowedShells is treated as unrestricted (usable from any shell)', () => {
    const withEmpty: Record<string, EnvProfileConfig> = {
      anyShell: { allowedShells: [], env: { FOO: 'bar' } }
    };
    expect(resolveProfileEnv(withEmpty, 'anyShell', 'bash', base)).toEqual({ FOO: 'bar' });
    expect(resolveProfileEnv(withEmpty, 'anyShell', 'cmd', base)).toEqual({ FOO: 'bar' });
  });

  test('P111: an inherited Object.prototype name throws ProfileSelectionError, not TypeError', () => {
    for (const name of ['toString', 'constructor', 'hasOwnProperty']) {
      expect(() => resolveProfileEnv(profiles, name, 'bash', base)).toThrow(
        ProfileSelectionError
      );
      expect(() => resolveProfileEnv(profiles, name, 'bash', base)).toThrow(
        /Unknown profile/
      );
    }
  });

  test('profile value overrides base when merged by caller', () => {
    const overriding: Record<string, EnvProfileConfig> = {
      p: { env: { PATH: 'override-only' } }
    };
    const resolved = resolveProfileEnv(overriding, 'p', 'bash', base);
    const merged = { ...base, ...resolved };
    expect(merged.PATH).toBe('override-only');
  });
});

describe('validateConfig profiles', () => {
  test('accepts a valid profiles map', () => {
    const cfg = cloneDefault();
    cfg.profiles = {
      ora19: {
        description: 'Oracle 19',
        allowedShells: ['cmd', 'powershell'],
        env: { ORACLE_HOME: 'C:/oracle/19', PATH: 'C:/oracle/19/bin;${PATH}' }
      }
    };
    expect(() => validateConfig(cfg)).not.toThrow();
  });

  test('passes when profiles is absent', () => {
    const cfg = cloneDefault();
    delete cfg.profiles;
    expect(() => validateConfig(cfg)).not.toThrow();
  });

  test('rejects an unknown shell in allowedShells', () => {
    const cfg = cloneDefault();
    cfg.profiles = {
      bad: { allowedShells: ['fish' as any], env: { FOO: 'bar' } }
    };
    expect(() => validateConfig(cfg)).toThrow(/Invalid profile 'bad'/);
    expect(() => validateConfig(cfg)).toThrow(/unknown shell 'fish'/);
  });

  test('rejects a non-string env value', () => {
    const cfg = cloneDefault();
    cfg.profiles = {
      bad: { env: { FOO: 123 as any } }
    };
    expect(() => validateConfig(cfg)).toThrow(/env value for 'FOO' must be a string/);
  });

  test('rejects an empty env object', () => {
    const cfg = cloneDefault();
    cfg.profiles = {
      bad: { env: {} }
    };
    expect(() => validateConfig(cfg)).toThrow(/must contain at least one variable/);
  });

  test('rejects a missing env object', () => {
    const cfg = cloneDefault();
    cfg.profiles = {
      bad: {} as any
    };
    expect(() => validateConfig(cfg)).toThrow(/env must be an object/);
  });

  test('rejects allowedShells that is not an array', () => {
    const cfg = cloneDefault();
    cfg.profiles = {
      bad: { allowedShells: 'cmd' as any, env: { FOO: 'bar' } }
    };
    expect(() => validateConfig(cfg)).toThrow(/allowedShells must be an array/);
  });

  test('P112: rejects an array-valued profiles map', () => {
    const cfg = cloneDefault();
    cfg.profiles = [] as any;
    expect(() => validateConfig(cfg)).toThrow(/profiles: must be an object/);
  });

  test('P112: rejects a non-object profiles value', () => {
    const cfg = cloneDefault();
    cfg.profiles = 'oops' as any;
    expect(() => validateConfig(cfg)).toThrow(/profiles: must be an object/);
  });

  test('P109: accepts a profile with an empty allowedShells array', () => {
    const cfg = cloneDefault();
    cfg.profiles = {
      anyShell: { allowedShells: [], env: { FOO: 'bar' } }
    };
    expect(() => validateConfig(cfg)).not.toThrow();
  });

  test('rejects a profile with a blank name', () => {
    const cfg = cloneDefault();
    cfg.profiles = {
      '': { env: { FOO: 'bar' } }
    } as any;
    expect(() => validateConfig(cfg)).toThrow(/profile name must be a non-empty string/);
  });
});
