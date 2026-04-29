# Data Standard

First-party data controls packaged as a project extension.

- Uses the generic executable host through `anthori-data-standard-runtime`
- Contributes visible `Data > Collection`, `Data > State`, and `Data > Config` controls
- `Collection` is session-backed shared data and defaults to `["read"]` access
- `State` is execution-backed runtime memory and defaults to `["read", "write", "delete"]` access
- `Config` is a control-local immutable JSON/YAML value with optional schema validation and a schema-derived output contract
- Keeps the existing collection/config behavior while removing those visible controls from the kernel
