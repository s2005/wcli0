# P102 - Prevent custom args from defeating generated config flags

When the custom launch command invokes `wcli0` directly or through a forwarding
wrapper, conflicting entries in `launch.customArgs` are prepended without the
sanitization applied to `extraArgs` (`argsBuilder.ts`, around line 597). Custom args
containing `--config other.json` followed by the managed `--config
managed-config.json` are parsed by the server's scalar yargs option as an array,
making `loadConfig` ignore the mandatory managed file and fall back to implicit
configuration; a conflicting `--transport` similarly defeats forced stdio. Reject
these reserved server flags in custom args whenever the extension emits its own
values.
