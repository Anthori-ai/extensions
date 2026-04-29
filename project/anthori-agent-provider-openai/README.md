# OpenAI Provider

This production variant bundles a real `openai-provider` definition with a hosted configuration UI and bundled runtime library.

It is intentionally API-key-only. The sibling `.debug` variant keeps the ChatGPT OAuth flow for debug builds, but production builds do not ship the embedded OAuth client id.

It depends on the project extension `anthori.agent.foundation`, which contributes the shared hidden text-provider base that this package specializes.

It includes:

- Extension manifest field: `providers`
- Extension-owned provider definition discovery
- Hosted provider configuration UI through `window.anthoriProvider`
- Definition-backed OpenAI text dispatch
- Definition-backed OpenAI model actions through the sandboxed bundled runtime library

Bundled provider definition ID: `openai-provider`

## Files

- `manifest.yaml`: extension manifest with one bundled provider definition path.
- `providers/openai/manifest.yaml`: provider definition manifest for the OpenAI runtime.
- `providers/openai/ui/config.html`: hosted provider configuration iframe.
- `providers/openai/ui/config.js`: iframe logic using `window.anthoriProvider`.
- `external-libraries/openai-provider-runtime/`: bundled runtime library for auth, model listing, and text requests.

## How to try it

1. Start Anthori.
2. Open a project.
3. Import `anthori-agent-foundation` as a project extension from:
   - `<repo>/bundled/extensions/project/anthori-agent-foundation`
4. Import `anthori-agent-standard` as a project extension if you want the default visible `Agent` control:
   - `<repo>/bundled/extensions/project/anthori-agent-standard`
5. Import this extension as a project extension from:
   - `<repo>/bundled/extensions/project/anthori-agent-provider-openai`
6. Open `Providers`.
7. Create a new `OpenAI` provider.
8. Paste an OpenAI API key.
9. Once an API key is present, choose a model if you want a default.
10. Save the provider and target it from the `Agent` control contributed by `anthori.agent.standard`.

## Notes

- OpenAI credentials now live in extension-owned per-user state/secrets managed by Anthori, so one authenticated OpenAI extension install can be reused across projects without reauthenticating.
- The hosted UI uses generic provider runtime calls (`listModels`) instead of provider-specific host endpoints.
- The bundled runtime library now uses `entry: runtime/openai-provider-runtime.js`, so Anthori runs OpenAI model-list and text requests inside the server through host `http.fetch`.
