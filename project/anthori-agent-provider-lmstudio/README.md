# LM Studio Provider

This extension bundles a real `lmstudio` provider definition with hosted configuration UI.

It depends on the project extension `anthori.agent.foundation`, which contributes the shared hidden text-provider base that this package specializes.

## What it includes

- Extension manifest field: `providers`
- Extension manifest field: `externalLibraries`
- Extension-owned provider definition discovery
- Hosted provider configuration UI through `window.anthoriProvider`
- Sandboxed runtime execution for LM Studio text and model-list actions

Bundled provider definition ID: `lmstudio`
Bundled provider runtime library ID: `lmstudio-provider-runtime`

## Files

- `manifest.yaml`: extension manifest with one bundled provider definition path.
- `external-libraries/lmstudio-provider-runtime/`: bundled provider runtime library.
- `providers/lmstudio/manifest.yaml`: provider definition manifest for the LM Studio runtime.
- `providers/lmstudio/ui/config.html`: hosted provider configuration iframe.
- `providers/lmstudio/ui/config.js`: iframe logic using `window.anthoriProvider`.

## How to try it

1. Open a project in Anthori.
2. Open **Inspector > Project > Extensions**.
3. Use **+** and import this folder first:
   - `<repo>/bundled/extensions/project/anthori-agent-foundation`
4. Use **+** again and import the default visible Agent package if you want it:
   - `<repo>/bundled/extensions/project/anthori-agent-standard`
5. Use **+** again and select this folder:
   - `<repo>/bundled/extensions/project/anthori-agent-provider-lmstudio`

After import:

1. Open **Providers** for that project.
2. Choose **New Provider**.
3. Select **LM Studio**.
4. Use the hosted config UI to set the loopback base URL.
5. Tab or click out of the URL field to refresh the model list.

## Notes

- The LM Studio server URL should point at the local server root, for example `http://127.0.0.1:1234`.
- Do not append `/v1/models`; Anthori adds the OpenAI-compatible path when it queries LM Studio.
- The bundled runtime library now uses `entry: runtime/lmstudio-provider-runtime.js`, so Anthori executes LM Studio requests through host `http.fetch` and emits chunk events from the returned SSE body inside the sandboxed runtime.
- When LM Studio exposes `reasoning_content` separately from normal reply text, the bundled runtime forwards that as structured `reasoning` parts alongside normal `text` chunks.
- This extension externalizes the provider definition, hosted UI, text requests, and model-list requests for LM Studio.
