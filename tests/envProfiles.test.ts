import { describe, test, expect } from '@jest/globals';
import {
  interpolateEnvValue,
  resolveProfileEnv,
  ProfileSelectionError
} from '../src/utils/envProfiles.js';
import type { EnvProfileConfig } from '../src/types/config.js';

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

  test('profile value overrides base when merged by caller', () => {
    const overriding: Record<string, EnvProfileConfig> = {
      p: { env: { PATH: 'override-only' } }
    };
    const resolved = resolveProfileEnv(overriding, 'p', 'bash', base);
    const merged = { ...base, ...resolved };
    expect(merged.PATH).toBe('override-only');
  });
});
