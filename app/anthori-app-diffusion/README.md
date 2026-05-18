# Diffusion

Anthori app extension for managing local diffusion runtimes and model files.

The first native runtime target is `stable-diffusion.cpp`. The app extension
owns runtime/model discovery and exposes runtime actions that project controls
can call later, starting with text-to-image generation.

The app settings panel owns runtime engine selection and model directory
discovery. The app panel can download Hugging Face model files into the managed
model directory, including curated multi-file bundles such as Wan 2.2 T2V A14B,
and project providers select from the discovered model list.
Generation parameters such as size, steps, and sampler belong on graph controls
or provider-level actions. Graph controls should copy or record generated files
into session-owned storage or execution artifacts so session deletion removes
the generated output too.

Keep large upstream runtime source, build outputs, and model weights outside
this extension directory so generated extension bundles do not accidentally
include them.

Suggested local source cache:

```text
/Users/john/Git/Anthori_Dependencies/stable-diffusion.cpp
```

Downloaded model files are managed through the Diffusion panel and stored under
the extension state model directory unless the user selects another directory.
