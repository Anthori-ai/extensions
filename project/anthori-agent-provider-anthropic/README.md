# Anthropic Provider

This extension bundles a real `anthropic-provider` definition with a hosted configuration UI.

It depends on the project extension `anthori.agent.foundation`, which contributes the shared hidden text-provider base that this package specializes.

It includes:

- Extension manifest field: `providers`
- Extension manifest field: `externalLibraries`
- Extension-owned provider definition discovery
- Hosted provider configuration UI through `window.anthoriProvider`
- Definition-backed Anthropic text dispatch through a sandboxed bundled library

Bundled provider definition ID: `anthropic-provider`
Bundled provider runtime library ID: `anthropic-provider-runtime`

## Files

- `manifest.yaml`: extension manifest with one bundled provider definition path.
- `external-libraries/anthropic-provider-runtime/`: bundled sandboxed provider runtime library.
- `providers/anthropic/manifest.yaml`: provider definition manifest for the Anthropic runtime.
- `providers/anthropic/ui/config.html`: hosted provider configuration iframe.
- `providers/anthropic/ui/config.js`: iframe logic using `window.anthoriProvider`.

## How to try it

1. Start Anthori.
2. Open a project.
3. Import `anthori-agent-foundation` as a project extension from:
   - `<repo>/bundled/extensions/project/anthori-agent-foundation`
4. Import `anthori-agent-standard` as a project extension if you want the default visible `Agent` control:
   - `<repo>/bundled/extensions/project/anthori-agent-standard`
5. Import this extension as a project extension from:
   - `<repo>/bundled/extensions/project/anthori-agent-provider-anthropic`
6. Open `Providers`.
7. Create a new `Anthropic` provider.
8. Enter an Anthropic API key, choose a model, and save.
9. Target it from the `Agent` control contributed by `anthori.agent.standard`.

## Notes

- This extension externalizes the provider definition, hosted UI, and Anthropic text dispatch path.
