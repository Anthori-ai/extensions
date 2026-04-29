# Ollama Provider

This extension bundles a real `ollama-provider` provider definition with hosted configuration UI.

It depends on `anthori.agent.foundation` for the shared text-provider base and `anthori.agent.provider.openai-compatible-runtime` for the runtime library.

## What it includes

- Extension manifest field: `providers`
- Extension-owned provider definition discovery
- Hosted provider configuration UI through `window.anthoriProvider`
- Sandboxed runtime execution for Ollama text and model-list actions

Bundled provider definition ID: `ollama-provider`
Bundled provider runtime library ID: `openai-compatible-provider-runtime`

## How to try it

1. Open a project in Anthori.
2. Open **Inspector > Project > Extensions**.
3. Import these bundled project extensions if they are not already present:
   - `<repo>/bundled/extensions/project/anthori-agent-foundation`
   - `<repo>/bundled/extensions/project/anthori-agent-standard`
   - `<repo>/bundled/extensions/project/anthori-agent-provider-openai-compatible-runtime`
   - `<repo>/bundled/extensions/project/anthori-agent-provider-ollama`

After import:

1. Open **Providers** for that project.
2. Choose **New Provider**.
3. Select **Ollama**.
4. Use the hosted config UI to set the local server root URL.
5. Tab or click out of the URL field to refresh the model list.

## Notes

- The Ollama server URL should point at the local server root, for example `http://127.0.0.1:11434`.
- Do not append `/v1`, `/api`, or `/api/tags`; Anthori adds the required paths.
- Model listing uses Ollama's native `/api/tags` endpoint.
- Model context sizing uses Ollama's native `/api/show` endpoint and falls back to 4096 tokens when Ollama does not report a configured context window.
- Text generation uses Ollama's OpenAI-compatible `/v1/chat/completions` endpoint.
