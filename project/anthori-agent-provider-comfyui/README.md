# ComfyUI Provider

Project extension that adds a ComfyUI-backed image provider.

The provider exposes the `anthori.agent-image.v1` interface and implements the `renderImage` runtime action through `comfyui-provider-runtime`.

Provider config:

- `comfyBaseUrl`: ComfyUI HTTP server root, for example `http://127.0.0.1:8188`.
- `checkpoint`: optional checkpoint override.
- `httpTimeoutSeconds`: optional render timeout.
- `workflows`: imported Comfy API workflow JSON templates.

