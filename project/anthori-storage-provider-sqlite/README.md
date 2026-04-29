# SQLite Storage Provider

SQLite-backed storage provider package for Anthori projects.

This package depends on `anthori.storage.foundation` and contributes:
- the `sqlite` provider definition
- the visible `KV SQLite` and `Table SQLite` provider controls over the hidden storage provider base
- a small runtime library that resolves the configured database path for host-managed SQLite operations
