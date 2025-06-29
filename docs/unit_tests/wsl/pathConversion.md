# wsl/pathConversion

- **convertWindowsToWslPath handles standard and mixed separators** – converts typical Windows paths, forward slashes and mixed separators to `/mnt/<drive>/` form.
- **handles drive roots and trailing slashes** – correctly processes paths like `C:/` and `C:\\Users\\`.
- **supports custom mount points and paths with spaces** – allows overriding the mount root and preserves spaces during conversion.
- **returns non-Windows paths unchanged and rejects UNC paths** – Unix-style or relative paths pass through while UNC paths throw an error.
