# System

First-party system controls packaged as a project extension.

- Uses the generic executable host through `anthori-system-runtime`
- Currently exposes the `System > Time` and `System > Exec` controls
- `System > Exec` exposes explicit polling contracts for visible reverse async command execution while still returning its normal final command result object
- Preserves the old command/workdir/env contract while moving the visible control out of the kernel
