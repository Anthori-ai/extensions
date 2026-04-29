# Official Extensions

This repository contains public, first-party, import-ready Anthori extensions that are intended for real use rather than example/demo packaging.

- `project/`: project-scoped extension packages
- `app/`: app-scoped extension packages

- `project/anthori-agent-foundation/`: first-party hidden agent foundation package that contributes shared `agent-base` and `text-provider-base` definitions plus their bundled runtime library over the generic executable host.
- `project/anthori-agent-standard/`: first-party standard visible `Agent` package built on `anthori.agent.foundation`.
- `project/anthori-composition-standard/`: bundles the generic `Composition > Bundle` and `Composition > Selector` controls plus a bundled runtime library for grouped-control inspection/invocation and single-option dispatch over the generic executable host.
- `project/anthori-storage-foundation/`: first-party hidden storage foundation package that contributes shared `kv-base`, `table-base`, and `provider-base` definitions plus their bundled runtime library over the generic executable host.
- `project/anthori-storage-standard/`: first-party standard visible storage package built on `anthori.storage.foundation`.
- `project/anthori-storage-provider-sqlite/`: bundles the SQLite storage provider definition, explicit SQLite provider control, and path-resolution runtime library, and depends on `anthori.storage.foundation`.
- `project/anthori-data-standard/`: bundles visible `Data > Collection` and `Data > Definition` controls plus a bundled runtime library that uses sandboxed `host.data.call(...)` APIs over the generic executable host.
- `project/anthori-signals-standard/`: bundles visible `Signals > Alarm`, `Signals > Timer`, and `Signals > Shutdown` controls plus a bundled runtime library that uses sandboxed `host.signal.call(...)` APIs over the generic executable host. Queue-backed `Channel` remains a kernel signal primitive.
- `project/anthori-system/`: bundles the explicit `System > Time` and `System > Exec` controls plus a bundled runtime library that uses sandboxed `host.system.call(...)` APIs over the generic executable host.
- `project/anthori-system-network/`: bundles the explicit `System > Network > Fetch` control plus a bundled runtime library that uses sandboxed `host.http.fetch(...)` APIs over the generic executable host. `Fetch` supports buffered `text`, `base64`, and raw `bytes` responses plus optional Stream-boundary response chunk handling.
- `project/anthori-system-display/`: bundles explicit `System > Display` and `System > Input` controls plus a bundled runtime library that uses sandboxed `host.display.call(...)` APIs over the generic executable host. This slice currently targets macOS and Windows.
- `project/anthori-system-filesystem/`: bundles explicit `System > Filesystem` controls plus a bundled runtime library that uses sandboxed `host.fs.*` APIs over the generic executable host. `Filesystem > Read` supports `utf8`, `base64`, and raw `bytes` content, and can also stream chunked file content through an optional Stream boundary target.
- `project/anthori-app-graph/`: bundles explicit `App > Project > Graph` controls plus a bundled runtime library that uses sandboxed `host.graph.*` APIs over the generic executable host.
- `project/anthori-app-session/`: bundles explicit `App > Project > Session` controls plus child-runtime `Start`/`Stop` controls over sandboxed `host.session.*` APIs on the generic executable host. `Start` creates a transient child session by default, or can reuse a selected existing session.
- `project/anthori-app-project/`: bundles explicit `App > Project` management, import/export, inspection, workspace, and settings controls plus a bundled runtime library that uses sandboxed `host.project.*` APIs over the generic executable host.
- `project/anthori-app-ui/`: bundles explicit `App > UI` controls such as `Anthori Guide`, `Show Bubble`, `Set Assistant Active`, `Set Assistant Emotion`, `Set Assistant Talking`, Anthori-window inspection, pointer input, watches, and validated step execution over sandboxed `host.ui.call(...)` APIs on the generic executable host. `Anthori Guide` reads the bundled docs/search surface exposed through `host.docs.*` for assistant/tool-facing product and UI help. This slice requires a connected desktop client for automation actions.
- `project/anthori-app-web/`: bundles explicit `App > Web` automation and inspection controls plus a bundled runtime library that uses sandboxed `host.web.call(...)` APIs over the generic executable host and the native desktop `web.request` bridge. This first slice currently targets the macOS Swift wrapper and the Windows C# wrapper.
- `project/anthori-agent-provider-lmstudio/`: bundles the LM Studio provider definition, hosted configuration UI, and runtime library, and depends on `anthori.agent.foundation`.
- `project/anthori-agent-provider-ollama/`: bundles the Ollama provider definition and hosted configuration UI, uses the shared OpenAI-compatible runtime, and depends on `anthori.agent.foundation`.
- `project/anthori-agent-provider-unsloth-studio/`: bundles the Unsloth Studio provider definition and hosted configuration UI, uses the shared OpenAI-compatible runtime, and depends on `anthori.agent.foundation`.
- `project/anthori-agent-provider-openai/`: bundles the OpenAI provider definition, hosted configuration UI, and runtime library, and depends on `anthori.agent.foundation`.
- `project/anthori-agent-provider-anthropic/`: bundles the Anthropic provider definition, hosted configuration UI, and runtime library, and depends on `anthori.agent.foundation`.
- `project/anthori-agent-provider-simple/`: bundles the Simple HTTP provider definition, hosted configuration UI, and runtime library, and depends on `anthori.agent.foundation`.
- `project/anthori-agent-provider-openai-compatible-runtime/`: shared runtime library used by Google and other API-key providers that expose OpenAI-compatible chat completions.
- `project/anthori-agent-provider-google/`: bundles the Google provider definition and Google text provider control, and depends on `anthori.agent.foundation` plus the shared OpenAI-compatible runtime.
- `app/anthori-app-git/`: app-scoped Git UI integration package.

Use these from:

- `Inspector > Project > Extensions` for project-scoped import
- `Settings > Extensions` for app-level import when Anthori Pro is enabled

Import directly from these folders by path. Anthori no longer relies on prepackaged ZIP archives for the built-in first-party extension catalog.

Debug/private extension variants live in the sibling private repository `Anthori_Extensions_Debug` and are overlaid into Anthori's local `bundled/extensions` tree only for debug builds.

Build-type variant convention:

- Keep the canonical runtime/package id stable in the manifest. For example, both the normal and debug variants of a package should still declare the same `id`.
- Put the debug source folder under a sibling directory whose folder name ends with `.debug`, for example `anthori-app-git.debug/`.
- Use manifest `availability.buildTypes` plus `variant.kind` to declare when that variant should be selected. A typical debug variant uses:
  - `availability.buildTypes: [debug]`
  - `variant.kind: debug`
- If `variant.kind` is set and `availability.buildTypes` is omitted, Anthori treats that variant as available only in the same build type as `variant.kind`.
- Release packaging prunes bundled extension folders whose directory name ends with `.debug`. Runtime selection still uses manifest build availability, so direct path-linked imports are also rejected when the current build type does not allow them.

Legacy reference packages that are intentionally outside the active extension set
now live under [`attic/extensions`](/Users/john/Git/Anthori/attic/extensions).
- Extension manifests now declare `format: 1` as the manifest schema version. Keep package `version` for the extension's own release/versioning.
- Bundled extension-owned control-definition and provider-definition manifests also declare `format: 1` as their schema version.
- Bundled extension-owned external-library manifests also declare `format: 1` as their schema version.
