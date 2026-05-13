# Git

First-party project extension that exposes semantic and shell-shaped Git controls through the sandboxed executable host.

`System > Git` contains typed Git controls for common repository operations. Their inputs use fields such as `paths`, `message`, `branch`, `mode`, `base`, and `target` instead of command strings, and their outputs are structured where Git has structured data.

`System > Git > Shell` contains command-shaped wrappers for common Git commands: `status`, `diff`, `log`, `show`, `branch`, `ls-files`, `blame`, `add`, `restore`, `commit`, `switch`, `stash`, `fetch`, `pull`, and `push`. Each control accepts one command string, either just the args or the full `git <subcommand>` form, and returns command output text in the closest practical style. The wrappers call `git` through Anthori's sandboxed Exec host with argv, not through a shell. A single output pipe to `head`, `head -n N`, `tail`, or `tail -n N` is supported for familiar output trimming. Other shell operators and redirection fail the control call.

Permissions are matched at the Git subcommand level, such as `git status`, `git commit`, or `git push`, while the process itself is executed as `git` with structured argv.
