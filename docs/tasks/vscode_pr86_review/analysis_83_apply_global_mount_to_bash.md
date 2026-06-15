# Analysis 83 - Apply the global WSL mount point to bash inheritance

## Decision: Valid — fix applied

`buildConfigFile` now seeds the global `wcli0.wslMountPoint` onto both the `wsl` and `bash` shell
entries (a per-shell `wslConfig.mountPoint` still overrides it), matching the server's
`applyCliWslMountPoint`, which seeds both.

**Why:** the server (`src/utils/config.ts:applyCliWslMountPoint`) applies the CLI mount point to
`['wsl','bash']`. With bash omitted, a bash shell whose `wslConfig.inheritGlobalPaths` is enabled
converts inherited Windows paths using the `/mnt/` default instead of the configured mount, so
commands under a custom mount are rejected. The existing test that asserted bash ignored the mount
encoded the wrong assumption and was corrected to expect the seeded value (bash still disables
inheritance by default). Verified by the updated `P83` test in `configFile.test.cjs`.
