(function () {
  function getProviderApi() {
    return window.anthoriProvider && typeof window.anthoriProvider === "object"
      ? window.anthoriProvider
      : null
  }

  function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value)
  }

  function sanitizeConfig(config) {
    return isPlainObject(config) ? config : {}
  }

  function stripRuntimeErrorPrefix(message) {
    return String(message || "")
      .replace(/^EXTERNAL LIBRARY\s+"[^"]+"\s+ACTION\s+"[^"]+"\s+FAILED:\s*/i, "")
      .trim()
  }

  function describeRuntimeError(error, fallbackMessage) {
    const rawMessage = error instanceof Error ? error.message : String(error || "")
    const detail = stripRuntimeErrorPrefix(rawMessage)
    const normalizedDetail = detail || String(fallbackMessage || "").trim()
    const lower = normalizedDetail.toLowerCase()

    if (
      lower.includes("i/o timeout") ||
      lower.includes("context deadline exceeded") ||
      lower.includes("timeout awaiting response headers")
    ) {
      return {
        message: "Anthropic did not respond in time. Check your network connection and provider settings.",
        detail: normalizedDetail,
      }
    }
    if (
      lower.includes("unauthorized") ||
      lower.includes("authentication_error") ||
      lower.includes("invalid api key") ||
      lower.includes("401")
    ) {
      return {
        message: "Anthropic rejected the request. Check your API key.",
        detail: normalizedDetail,
      }
    }
    if (
      lower.includes("permission_error") ||
      lower.includes("not_found_error") ||
      lower.includes("model:")
    ) {
      return {
        message: "The configured Anthropic model is not available for this API key. Pick a model from the live list.",
        detail: normalizedDetail,
      }
    }
    if (
      lower.includes("connection refused") ||
      lower.includes("actively refused") ||
      lower.includes("econnrefused")
    ) {
      return {
        message: "Could not connect to Anthropic. Check your network connection and provider settings.",
        detail: normalizedDetail,
      }
    }
    return {
      message: normalizedDetail || String(fallbackMessage || "Anthropic request failed.").trim(),
      detail: normalizedDetail,
    }
  }

  function init() {
    const providerApi = getProviderApi()
    const apiKeyInput = document.getElementById("anthropic-api-key")
    const modelSelect = document.getElementById("anthropic-model")
    const contextLimitInput = document.getElementById("anthropic-context-limit")
    const status = document.getElementById("anthropic-status")

    if (!providerApi || !apiKeyInput || !modelSelect || !contextLimitInput || !status) {
      return
    }

    let syncTimer = 0

    async function callRuntimeAction(action, payload = {}) {
      if (!providerApi?.runtime || typeof providerApi.runtime.call !== "function") {
        throw new Error("Provider runtime bridge is unavailable.")
      }
      return providerApi.runtime.call(action, payload)
    }

    function setStatus(message, state = "error", options = {}) {
      const text = String(message || "").trim()
      if (!text) {
        status.textContent = ""
        status.hidden = true
        status.dataset.state = ""
        status.title = ""
        return
      }
      status.textContent = text
      status.hidden = false
      status.dataset.state = String(state || "error").trim() || "error"
      status.title = String(options.detail || "").trim()
    }

    function renderModelOptions(items, selectedValue = "") {
      modelSelect.innerHTML = ""
      const placeholder = document.createElement("option")
      placeholder.value = ""
      placeholder.textContent = "(optional)"
      modelSelect.appendChild(placeholder)

      const cleanSelectedValue = String(selectedValue || "").trim()
      const list = Array.isArray(items) ? items : []
      const seen = new Set()
      list.forEach((entry) => {
        const id = typeof entry === "string"
          ? entry.trim()
          : String(entry && entry.id ? entry.id : "").trim()
        if (!id) return
        seen.add(id)
        const option = document.createElement("option")
        option.value = id
        option.textContent = typeof entry === "string"
          ? id
          : String(entry && entry.label ? entry.label : id).trim() || id
        modelSelect.appendChild(option)
      })
      if (cleanSelectedValue && !seen.has(cleanSelectedValue)) {
        const option = document.createElement("option")
        option.value = cleanSelectedValue
        option.textContent = cleanSelectedValue
        modelSelect.appendChild(option)
      }
      modelSelect.value = cleanSelectedValue
    }

    function readPositiveIntegerInput(input) {
      const raw = String(input?.value || "").trim()
      if (!raw) return 0
      const parsed = Number.parseInt(raw, 10)
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
    }

    function applyValues(values) {
      const normalized = sanitizeConfig(values)
      apiKeyInput.value = String(normalized.apiKey || "")
      renderModelOptions([], String(normalized.llmModel || ""))
      contextLimitInput.value = normalized.maxContextTokens == null
        ? ""
        : String(normalized.maxContextTokens)
    }

    function readValues() {
      const values = {}
      const apiKey = String(apiKeyInput.value || "").trim()
      const model = String(modelSelect.value || "").trim()
      const contextLimit = readPositiveIntegerInput(contextLimitInput)

      if (apiKey) {
        values.apiKey = apiKey
      }
      if (model) {
        values.llmModel = model
      }
      if (contextLimit > 0) {
        values.maxContextTokens = contextLimit
      }
      // Provider-level timeout override was removed so execution/control timeout remains the only budget source.
      return values
    }

    async function refreshModels() {
      const currentModel = String(modelSelect.value || "").trim()
      renderModelOptions([], currentModel)
      modelSelect.disabled = true
      setStatus("Loading models...", "loading")
      try {
        await providerApi.config.setDraft(readValues(), { replace: true })
        const result = await callRuntimeAction("listModels", {})
        const items = Array.isArray(result?.items) ? result.items : []
        renderModelOptions(items, currentModel)
        if (items.length === 0) {
          setStatus("No models were returned for this API key.", "warning")
        } else {
          setStatus("")
        }
      } catch (error) {
        renderModelOptions([], currentModel)
        const runtimeError = describeRuntimeError(error, "Failed to load models from Anthropic.")
        setStatus(runtimeError.message, "error", { detail: runtimeError.detail })
      } finally {
        modelSelect.disabled = false
      }
    }

    async function syncDraft() {
      try {
        await providerApi.config.setDraft(readValues(), { replace: true })
        setStatus("")
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Failed to sync the provider draft.")
      }
    }

    function queueDraftSync() {
      if (syncTimer) {
        window.clearTimeout(syncTimer)
      }
      syncTimer = window.setTimeout(() => {
        syncTimer = 0
        void syncDraft()
      }, 180)
    }

    function flushDraftSync() {
      if (syncTimer) {
        window.clearTimeout(syncTimer)
        syncTimer = 0
      }
      void syncDraft()
    }

    async function commitApiKey() {
      await refreshModels()
    }

    async function load() {
      try {
        const config = await providerApi.config.get({})
        applyValues(config)
        await providerApi.config.setDraft(readValues(), { replace: true })
        setStatus("")
        if (String(apiKeyInput.value || "").trim()) {
          await refreshModels()
        }
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Failed to load the Anthropic provider UI.")
      }
    }

    apiKeyInput.addEventListener("input", queueDraftSync)
    apiKeyInput.addEventListener("change", () => {
      void commitApiKey()
    })
    modelSelect.addEventListener("change", flushDraftSync)
    contextLimitInput.addEventListener("input", queueDraftSync)
    contextLimitInput.addEventListener("change", flushDraftSync)

    void load()
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true })
  } else {
    init()
  }
})()
