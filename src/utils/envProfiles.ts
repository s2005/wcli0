import type { EnvProfileConfig, ShellType } from '../types/config.js';
import { debugLog } from './log.js';

/**
 * Error thrown when a requested profile cannot be selected: either the name is
 * not configured or the profile's `allowedShells` excludes the requested shell.
 * Callers convert this into an `McpError(InvalidParams)` for the client.
 */
export class ProfileSelectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProfileSelectionError';
  }
}

const PLACEHOLDER = /\$\{([^}]+)\}/g;

/**
 * Replace `${NAME}` placeholders in `value` with `base[NAME]`. An undefined
 * referenced variable resolves to an empty string and is debug-logged. Only the
 * `${NAME}` form is supported (no `$NAME`) to avoid clashing with literal shell
 * text in command values.
 */
export function interpolateEnvValue(value: string, base: NodeJS.ProcessEnv): string {
  return value.replace(PLACEHOLDER, (_match, name: string) => {
    const resolved = base[name];
    if (resolved === undefined) {
      debugLog(
        `Profile env interpolation: referenced variable '${name}' is undefined; using empty string`
      );
      return '';
    }
    return resolved;
  });
}

/**
 * Resolve the interpolated environment map for a selected profile.
 *
 * - An empty or undefined `profileName` returns `{}` (no profile selected),
 *   preserving the pre-feature spawn environment.
 * - An unknown `profileName` throws a `ProfileSelectionError` listing the valid
 *   profile names.
 * - A profile whose `allowedShells` excludes `shellType` throws a
 *   `ProfileSelectionError` explaining the restriction.
 * - Otherwise the profile's `env` map is returned with each value interpolated
 *   against `base` (typically `process.env`).
 */
export function resolveProfileEnv(
  profiles: Record<string, EnvProfileConfig> | undefined,
  profileName: string | undefined,
  shellType: ShellType,
  base: NodeJS.ProcessEnv
): Record<string, string> {
  if (!profileName) {
    return {};
  }

  const available = profiles ?? {};
  // Use an own-property check: the input schema's profile enum is advisory, so a
  // client can pass an inherited Object.prototype name like 'toString' or
  // 'constructor'. A plain `available[profileName]` would then return the built-in
  // function instead of undefined, skip the unknown-profile branch, and later throw
  // a TypeError reading `.env` instead of the intended ProfileSelectionError.
  const profile = Object.prototype.hasOwnProperty.call(available, profileName)
    ? available[profileName]
    : undefined;
  if (!profile) {
    const names = Object.keys(available);
    const validList = names.length > 0 ? names.join(', ') : '(none configured)';
    throw new ProfileSelectionError(
      `Unknown profile '${profileName}'. Valid profiles: ${validList}`
    );
  }

  // An empty `allowedShells` ([]) means "all shells" (matching the setting's
  // documented semantics), so only enforce the restriction when the list has
  // entries — otherwise `[].includes(shellType)` is always false and would reject
  // the profile for every shell, making the empty-array form unusable.
  if (profile.allowedShells && profile.allowedShells.length > 0 && !profile.allowedShells.includes(shellType)) {
    throw new ProfileSelectionError(
      `Profile '${profileName}' is not allowed for shell '${shellType}'. ` +
        `Allowed shells: ${profile.allowedShells.join(', ')}`
    );
  }

  const resolved: Record<string, string> = {};
  for (const [key, val] of Object.entries(profile.env)) {
    resolved[key] = interpolateEnvValue(val, base);
  }
  return resolved;
}
