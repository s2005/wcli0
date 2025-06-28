# gitbashWorkingDir

- **converts Git Bash style path to Windows format for spawn cwd** – verifies that when executing a command through the Git Bash shell the working directory passed to `spawn` is converted from `/d/dir` style to `D:\dir` so child processes run in the correct location.
