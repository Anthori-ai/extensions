# Storage Foundation

Hidden shared storage foundation for Anthori project extensions.

This package contributes:
- `kv-base`: hidden executable base for scoped KV storage controls
- `table-base`: hidden executable base for scoped table storage controls
- `provider-base`: hidden executable base for storage-backed provider controls

Visible storage controls should come from packages that depend on this foundation, such as `anthori.storage.standard`.

Current table-storage contract notes:
- `insert` takes pure row JSON and returns `{ ok: true, id }`
- `select` returns row envelopes like `{ id, created, updated, row, turn? }`
- `update` accepts either `{ where, values }` for patch updates or `{ where, row }` for full row replacement
- `turn` is storage-owned metadata for session/execution scope, not caller-authored row data
