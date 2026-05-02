This extension bundles a hosted DeepSeek provider definition.

It includes:

- `providers/deepseek` — DeepSeek provider definition using the OpenAI-compatible API.
- `control-definitions/deepseek` — DeepSeek text-provider control.
- `external-libraries/openai-compatible-provider-runtime` dependency for request handling.

The default base URL is `https://api.deepseek.com` with model list and chat completion support from DeepSeek’s OpenAI-compatible endpoint.
