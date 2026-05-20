# Diffusion Project Extension

Adds a selectable Diffusion media provider and matching provider controls.

The provider delegates image rendering to the active `anthori.app.diffusion` app
extension, which owns runtime discovery, model directories, and engine
selection.

Download and scan models from the Diffusion app panel. The panel groups curated
packages and Hugging Face search by generation operation, such as Text to Image
or Text to Video. Provider config exposes one Model selector. Internally the
selected value is a model package: it may be a discovered single-file checkpoint
or a curated multi-file package such as a Wan 2.2 quant variant. Graph nodes can
override that selection for a single call.

Model packages declare the runtime recipe and supported operations, so image
and video controls filter the same model list without exposing separate
file-vs-package fields in the inspector.

Static generation options such as LoRAs, sampler parameters, and Wan component
choices belong in provider/node configuration. Advanced callers can pass a
`generationConfig` JSON object; the runtime merges it into the generation
request before calling the app extension.

## Controls

- `TextToImage`: generates an image from a text prompt.
- `ImageToImage`: generates an image from an input image and prompt.
- `TextToVideo`: generates a video from a text prompt when the selected runtime
  and model support video generation.
- `ImageToVideo`: generates a video from an input image and prompt when the
  selected runtime and model support video generation.


The optional `Preview` target accepts both image and video metadata. Video
outputs use `videoPath` or `videoBase64` with a `video/*` media type.
