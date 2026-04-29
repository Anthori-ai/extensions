(function () {
  const DEFAULTS = {
    llmBaseUrl: "http://127.0.0.1:1234",
  }

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
        message: "LM Studio did not respond in time. Check that the local server is running and the URL is correct.",
        detail: normalizedDetail,
      }
    }
    if (
      lower.includes("connection refused") ||
      lower.includes("actively refused") ||
      lower.includes("econnrefused")
    ) {
      return {
        message: "Could not connect to LM Studio. Check that the local server is running and the URL is correct.",
        detail: normalizedDetail,
      }
    }
    if (
      lower.includes("no such host") ||
      lower.includes("name or service not known") ||
      lower.includes("server misbehaving")
    ) {
      return {
        message: "Could not resolve the LM Studio server address. Check the configured URL.",
        detail: normalizedDetail,
      }
    }
    if (lower.includes("404")) {
      return {
        message: "LM Studio responded, but the models endpoint was not found. Check that the URL points at the LM Studio API.",
        detail: normalizedDetail,
      }
    }
    return {
      message: String(fallbackMessage || "LM Studio request failed.").trim(),
      detail: normalizedDetail,
    }
  }

  function init() {
    const providerApi = getProviderApi()
    const root = document.getElementById("lmstudio-config-root")
    const baseUrlInput = document.getElementById("lmstudio-base-url")
    const modelSelect = document.getElementById("lmstudio-model")
    const reasoningSelect = document.getElementById("lmstudio-reasoning")
    const modelStatus = document.getElementById("lmstudio-model-status")
    const modelStatusSpinner = document.getElementById("lmstudio-model-status-spinner")
    const modelStatusMessage = document.getElementById("lmstudio-model-status-message")

    if (
      !providerApi ||
      !root ||
      !baseUrlInput ||
      !modelSelect ||
      !reasoningSelect ||
      !modelStatus ||
      !modelStatusSpinner ||
      !modelStatusMessage
    ) {
      return
    }

    let syncTimer = 0

    async function callRuntimeAction(action, payload = {}) {
      if (!providerApi?.runtime || typeof providerApi.runtime.call !== "function") {
        throw new Error("Provider runtime bridge is unavailable.")
      }
      return providerApi.runtime.call(action, payload)
    }

    function setModelStatus(message, state, options = {}) {
      const text = String(message || "").trim()
      if (!text) {
        modelStatusMessage.textContent = ""
        modelStatus.hidden = true
        modelStatus.dataset.state = ""
        modelStatus.title = ""
        modelStatusSpinner.hidden = true
        return
      }
      modelStatusMessage.textContent = text
      modelStatus.hidden = false
      modelStatus.dataset.state = String(state || "error").trim() || "error"
      modelStatus.title = String(options.detail || "").trim()
      modelStatusSpinner.hidden = String(state || "").trim() !== "loading"
    }

    function applyValues(values) {
      const normalized = sanitizeConfig(values)
      baseUrlInput.value = String(normalized.llmBaseUrl || DEFAULTS.llmBaseUrl)
      renderModelOptions([], String(normalized.llmModel || ""))
      reasoningSelect.value = String(normalized.reasoningEffort || "").trim().toLowerCase()
    }

    function readValues() {
      const values = {}
      const baseUrl = String(baseUrlInput.value || "").trim()
      const model = String(modelSelect.value || "").trim()
      const reasoning = String(reasoningSelect.value || "").trim().toLowerCase()

      if (baseUrl) {
        values.llmBaseUrl = baseUrl
      }
      if (model) {
        values.llmModel = model
      }
      if (reasoning) {
        values.reasoningEffort = reasoning
      }
      // Provider-level timeout override was removed so execution/control timeout remains the only budget source.
      return values
    }

    async function syncDraft() {
      try {
        await providerApi.config.setDraft(readValues(), { replace: true })
      } catch (error) {
        setModelStatus(
          error instanceof Error ? error.message : "Failed to sync the provider draft.",
          "error"
        )
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
        option.textContent = id
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

    function setUiReady(ready) {
      root.dataset.uiReady = ready ? "true" : "false"
    }

    async function refreshModels() {
      const currentModel = String(modelSelect.value || "").trim()
      renderModelOptions([], "")
      modelSelect.disabled = true
      setModelStatus("Loading models...", "loading")
      try {
        await providerApi.config.setDraft(readValues(), { replace: true })
        const result = await callRuntimeAction("listModels", {})
        const items = Array.isArray(result?.items) ? result.items : []
        renderModelOptions(items, currentModel)
        if (!Array.isArray(items) || items.length === 0) {
          setModelStatus(
            "No models were returned. Check that LM Studio is running and its local server is enabled.",
            "warning"
          )
        } else {
          setModelStatus("", "")
        }
      } catch (error) {
        renderModelOptions([], currentModel)
        const runtimeError = describeRuntimeError(error, "Failed to load models from LM Studio.")
        setModelStatus(runtimeError.message, "error", { detail: runtimeError.detail })
      } finally {
        modelSelect.disabled = false
      }
    }

    async function commitBaseUrl() {
      await refreshModels()
    }

    async function load() {
      setUiReady(false)
      setModelStatus("", "")
      try {
        const config = await providerApi.config.get(DEFAULTS)
        applyValues(config)
        await providerApi.config.setDraft(readValues(), { replace: true })
        setUiReady(true)
        if (String(baseUrlInput.value || "").trim()) {
          await refreshModels()
        }
      } catch (error) {
        const runtimeError = describeRuntimeError(error, "Failed to load the LM Studio provider UI.")
        setModelStatus(runtimeError.message, "error", { detail: runtimeError.detail })
      } finally {
        setUiReady(true)
      }
    }

    baseUrlInput.addEventListener("input", queueDraftSync)
    baseUrlInput.addEventListener("change", () => {
      void commitBaseUrl()
    })
    modelSelect.addEventListener("change", flushDraftSync)
    reasoningSelect.addEventListener("change", flushDraftSync)

    void load()
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true })
  } else {
    init()
  }
})()
