# Unsloth Studio Provider

This extension bundles an `unsloth-studio-provider` provider definition with hosted configuration UI.

It connects Anthori provider controls to the OpenAI-compatible inference API exposed by Unsloth Studio.

## Contents

- Provider definition for `Unsloth Studio`
- Visible text-provider control definition
- Hosted provider configuration UI
- Sandboxed runtime execution through the shared OpenAI-compatible provider runtime

Bundled provider definition ID: `unsloth-studio-provider`

## Setup

1. Run Unsloth Studio.
2. Create an API key in Unsloth Studio.
3. Install this extension package in the project, along with:
   - `<repo>/bundled/extensions/project/anthori-agent-foundation`
   - `<repo>/bundled/extensions/project/anthori-agent-standard`
   - `<repo>/bundled/extensions/project/anthori-agent-provider-openai-compatible-runtime`
   - `<repo>/bundled/extensions/project/anthori-agent-provider-unsloth-studio`
4. Add a provider config in the Providers panel.
5. Select **Unsloth Studio**.
6. Enter the Studio API key and base URL.

## Notes

- Default local base URL: `http://127.0.0.1:8888/v1`.
- LAN example: `http://192.168.4.4:8888/v1`.
- Anthori also accepts the server root, such as `http://127.0.0.1:8888`, and normalizes it to `/v1`.
- Model listing uses `/v1/models` and enriches the active loaded model with `/v1/status` context metadata when Studio reports it.
- Text generation uses `/v1/chat/completions`.
