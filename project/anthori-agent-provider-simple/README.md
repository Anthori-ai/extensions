# Simple HTTP Provider

This extension bundles a `simple` provider definition with a hosted configuration UI.

It depends on the project extension `anthori.agent.foundation`, which contributes the shared hidden text-provider base that this package specializes.

## What it includes

- Extension manifest field: `providers`
- Extension manifest field: `externalLibraries`
- Extension-owned provider definition discovery
- Hosted provider configuration UI through `window.anthoriProvider`
- Sandboxed runtime execution through a bundled provider library

Bundled provider definition ID: `simple`
Bundled provider runtime library ID: `simple-provider-runtime`

## Files

- `manifest.yaml`: extension manifest with one bundled provider definition path.
- `external-libraries/simple-provider-runtime/`: bundled provider runtime library.
- `providers/simple/manifest.yaml`: provider definition manifest for the Simple HTTP runtime.
- `providers/simple/ui/config.html`: hosted provider configuration iframe.
- `providers/simple/ui/config.js`: iframe logic using `window.anthoriProvider`.

## How to try it

1. Open a project in Anthori.
2. Open **Inspector > Project > Extensions**.
3. Use **+** and import this folder first:
   - `<repo>/bundled/extensions/project/anthori-agent-foundation`
4. Use **+** again and import the default visible Agent package if you want it:
   - `<repo>/bundled/extensions/project/anthori-agent-standard`
5. Use **+** again and select this folder:
   - `<repo>/bundled/extensions/project/anthori-agent-provider-simple`

After import:

1. Open **Providers** for that project.
2. Choose **New Provider**.
3. Select **Simple HTTP**.
4. Use the hosted config UI to set the HTTP endpoint.
5. Save the provider and target it from an `Agent/Text` provider control.

## Transport contract

The runtime issues:

- `POST config.http`
- header `content-type: application/json`
- success only when `response.ok === true`

Transport failures and non-success responses return an error string. Common connection and upstream transport failures are normalized before they are surfaced.

## Request body

The request body is always JSON:

```json
{
  "text": "trim(request.prompt) or latest non-empty text from request.messages"
}
```

More precisely:

- `text` is always present.
- Primary source: `trim(request.prompt)`.
- Fallback source: the latest non-empty text extracted from `request.messages`.
- `request.model`, `request.system`, `request.messages`, and `request.tools` still exist in the Anthori-side caller contract, but this provider does not forward them to the HTTP endpoint.

## Response body

On a successful HTTP response, the runtime trims `response.body` and resolves text using these rules:

1. If the body parses as a JSON object, use the first non-empty trimmed string in:
   - `text`
   - `reply`
   - `output`
   - `content`
2. If those fields are empty, use `choices[0].message.content`
3. If JSON parsing fails, use the raw trimmed response body text

Failure and success rules:

- If `response.ok !== true`, the call fails.
- If the resolved text is empty, the call fails with `provider response did not include text`.
- Successful runtime output is:

```json
{
  "text": "<resolved text>"
}
```

## Notes

- The provider config requires `http` for text calls.
- The `list-models` action also requires `maxContextTokens > 0` and reports `llmModel` or `"custom-model"` when `llmModel` is empty.
- The bundled runtime library now uses `entry: runtime/simple-provider-runtime.js`, so Anthori executes it inside the server and routes the outbound request through host `http.fetch` rather than a subprocess.
- This extension externalizes the provider definition, hosted UI, and runtime text dispatch path for the Simple provider.
- Use the `Agent` control from `anthori.agent.standard` when you want a first-party caller for this provider.
