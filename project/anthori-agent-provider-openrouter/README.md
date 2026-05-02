# OpenRouter Provider Extension

This extension bundles an OpenRouter provider definition.

It includes:

- `providers/openrouter` — OpenRouter provider definition using the OpenAI-compatible API.
- `control-definitions/openrouter` — OpenRouter text-provider control.
- `openai-compatible-provider-runtime` dependency for request handling.

The default base URL is `https://openrouter.ai/api/v1`, which is kept in runtime defaults so you only configure API key and model.
