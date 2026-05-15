# Llama

Anthori app extension for managing local llama.cpp GGUF models and Hugging Face model downloads.

Loaded llama.cpp server processes are owned by the active Anthori app session. The extension stops them when the model is unloaded, and the runtime watchdog terminates them if Anthori exits.
