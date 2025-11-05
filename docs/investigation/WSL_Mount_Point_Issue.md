# WSL2 Mount Point Investigation

This document analyzes how `wcli0` handles WSL paths and why a misconfigured mount point might cause the behavior described in the issue.

## Relevant Code Sections

- **Mount point configuration** – `bash` and `wsl` shells define a `mountPoint` inside `wslConfig`. Default is `/mnt/`.
- **Path conversion** – `convertWindowsToWslPath` in `src/utils/validation.ts` converts a Windows path to its WSL equivalent using the configured mount point.
- **Allowed path resolution** – `resolveWslAllowedPaths` builds the list of allowed Linux paths for WSL shells. It converts Windows paths based on `mountPoint` when `inheritGlobalPaths` is enabled.
- **Working directory validation** – `validateWorkingDirectory` in `src/utils/pathValidation.ts` delegates to `validateWslPath` when running under WSL.

## Example Code

```ts
export function convertWindowsToWslPath(windowsPath: string, mountPoint: string = '/mnt/'): string {
  if (windowsPath.startsWith('\\\\') || windowsPath.startsWith('//')) {
    throw new Error('UNC paths are not supported for WSL conversion.');
  }
  const driveRegex = /^([a-zA-Z]):([\\/]?.*)$/;
  const match = windowsPath.match(driveRegex);
  if (match) {
    const driveLetter = match[1].toLowerCase();
    let restOfPath = match[2].replace(/\\/g, '/');
    restOfPath = restOfPath.replace(/^\/+/g, '');
    restOfPath = restOfPath.replace(/\/+/g, '/');
    if (restOfPath.endsWith('/')) {
      restOfPath = restOfPath.slice(0, -1);
    }
    const baseMount = mountPoint.endsWith('/') ? mountPoint : mountPoint + '/';
    if (!restOfPath) {
      return `${baseMount}${driveLetter}`;
    }
    return `${baseMount}${driveLetter}/${restOfPath}`;
  }
  return windowsPath;
}
```

_Source: `src/utils/validation.ts` lines 162‑196_.

## Possible Cause of the Issue

1. `wcli0` expects Windows drives to appear under the mount point (default `/mnt/`).
2. If WSL is configured with a different mount location or if the mount is not active, paths like `/mnt/c/temp` will not correspond to `C:\temp`.
3. The server converts the configured allowed Windows paths to WSL paths using `convertWindowsToWslPath`. If the conversion uses the wrong mount point, the resulting allowed path may point elsewhere.
4. When the shell tries to access `/mnt/c/temp`, WSL might redirect or mount another drive at that location, leading to incorrect directory content.

## Recommendation

Verify the actual mount point in your WSL distribution with `cat /etc/wsl.conf` and update `wslConfig.mountPoint` accordingly. Alternatively, adjust the `allowedPaths` to match the real path as seen from WSL.
