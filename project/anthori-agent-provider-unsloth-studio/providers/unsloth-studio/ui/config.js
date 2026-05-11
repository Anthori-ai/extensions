(function () {
  const DEFAULTS = {
    apiBaseUrl: "http://127.0.0.1:8888/v1",
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

  function sanitizeUserSecrets(values) {
    return isPlainObject(values) ? values : {}
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
        message: "Unsloth Studio did not respond in time. Check that Studio is running and the URL is correct.",
        detail: normalizedDetail,
      }
    }
    if (
      lower.includes("connection refused") ||
      lower.includes("actively refused") ||
      lower.includes("econnrefused")
    ) {
      return {
        message: "Could not connect to Unsloth Studio. Check that Studio is running and the URL is correct.",
        detail: normalizedDetail,
      }
    }
    if (
      lower.includes("no such host") ||
      lower.includes("name or service not known") ||
      lower.includes("server misbehaving")
    ) {
      return {
        message: "Could not resolve the Unsloth Studio server address. Check the configured URL.",
        detail: normalizedDetail,
      }
    }
    if (
      lower.includes("not authenticated") ||
      lower.includes("unauthorized") ||
      lower.includes("invalid api key") ||
      lower.includes("401") ||
      lower.includes("403")
    ) {
      return {
        message: "Unsloth Studio rejected the request. Check the API key.",
        detail: normalizedDetail,
      }
    }
    if (lower.includes("404")) {
      return {
        message: "Unsloth Studio responded, but the endpoint was not found. Use the Studio API base URL, usually ending in /v1.",
        detail: normalizedDetail,
      }
    }
    return {
      message: normalizedDetail || String(fallbackMessage || "Unsloth Studio request failed.").trim(),
      detail: normalizedDetail,
    }
  }

  function init() {
    const providerApi = getProviderApi()
    const root = document.getElementById("unsloth-studio-config-root")
    const apiKeyInput = document.getElementById("unsloth-studio-api-key")
    const baseUrlInput = document.getElementById("unsloth-studio-base-url")
    const modelSelect = document.getElementById("unsloth-studio-model")
    const contextLimitInput = document.getElementById("unsloth-studio-context-limit")
    const reasoningSelect = document.getElementById("unsloth-studio-reasoning")
    const statusEl = document.getElementById("unsloth-studio-status")

    if (
      !providerApi ||
      !root ||
      !apiKeyInput ||
      !baseUrlInput ||
      !modelSelect ||
      !contextLimitInput ||
      !reasoningSelect ||
      !statusEl
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

    async function loadUserSecrets(defaults = {}) {
      if (!providerApi?.userSecrets || typeof providerApi.userSecrets.get !== "function") {
        return sanitizeUserSecrets(defaults)
      }
      return sanitizeUserSecrets(await providerApi.userSecrets.get(defaults))
    }

    async function saveUserSecrets(values) {
      if (!providerApi?.userSecrets || typeof providerApi.userSecrets.set !== "function") {
        return sanitizeUserSecrets(values)
      }
      return sanitizeUserSecrets(await providerApi.userSecrets.set(values, { replace: true }))
    }

    function createInlineSpinner() {
      const spinner = document.createElement("span")
      spinner.className = "provider-inline-status-spinner"
      spinner.setAttribute("aria-hidden", "true")
      for (let index = 0; index < 3; index += 1) {
        const dot = document.createElement("span")
        dot.className = "extension-modal-busy-dot"
        spinner.appendChild(dot)
      }
      return spinner
    }

    function ensureInlineStatusContent(target) {
      let spinner = target.querySelector(".provider-inline-status-spinner")
      if (!(spinner instanceof HTMLElement)) {
        spinner = createInlineSpinner()
      }
      let message = target.querySelector(".provider-inline-status-message")
      if (!(message instanceof HTMLElement)) {
        message = document.createElement("span")
        message.className = "provider-inline-status-message"
      }
      target.replaceChildren(spinner, message)
      return { spinner, message }
    }

    function setInlineStatus(target, message, state, options = {}) {
      const text = String(message || "").trim()
      if (!text) {
        target.replaceChildren()
        target.textContent = ""
        target.hidden = true
        target.dataset.state = ""
        target.title = ""
        return
      }
      const { spinner, message: messageEl } = ensureInlineStatusContent(target)
      spinner.hidden = String(state || "").trim() !== "loading"
      messageEl.textContent = text
      target.hidden = false
      target.dataset.state = String(state || "error").trim() || "error"
      target.title = String(options.detail || "").trim()
    }

    function hasApiKey() {
      return String(apiKeyInput.value || "").trim().length > 0
    }

    function hasBaseUrl() {
      return String(baseUrlInput.value || "").trim().length > 0
    }

    function modelPlaceholder() {
      if (!hasApiKey()) return "(enter an API key)"
      if (!hasBaseUrl()) return "(enter a URL)"
      return "(active loaded model)"
    }

    function applyUserSecretsValues(values) {
      const secrets = sanitizeUserSecrets(values)
      apiKeyInput.value = String(secrets.apiKey || "")
      return secrets
    }

    function readUserSecretValues() {
      const values = {}
      const apiKey = String(apiKeyInput.value || "").trim()
      if (apiKey) {
        values.apiKey = apiKey
      }
      return values
    }

    function renderModelOptions(items, selectedValue, placeholderText) {
      modelSelect.innerHTML = ""
      const placeholder = document.createElement("option")
      placeholder.value = ""
      placeholder.textContent = String(placeholderText || modelPlaceholder())
      modelSelect.appendChild(placeholder)

      const cleanSelectedValue = String(selectedValue || "").trim()
      const seen = new Set()
      const list = Array.isArray(items) ? items : []
      list.forEach((entry) => {
        const id = typeof entry === "string"
          ? entry.trim()
          : String(entry && entry.id ? entry.id : "").trim()
        if (!id) return
        seen.add(id)
        const label = typeof entry === "string"
          ? id
          : String(entry && entry.label ? entry.label : id).trim() || id
        const option = document.createElement("option")
        option.value = id
        option.textContent = label
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

    function applyValues(configValues, userSecretValues) {
      const normalized = sanitizeConfig(configValues)
      applyUserSecretsValues(userSecretValues)
      baseUrlInput.value = String(normalized.apiBaseUrl || DEFAULTS.apiBaseUrl)
      renderModelOptions([], String(normalized.llmModel || ""), modelPlaceholder())
      contextLimitInput.value = normalized.maxContextTokens == null
        ? ""
        : String(normalized.maxContextTokens)
      reasoningSelect.value = String(normalized.reasoningEffort || "").trim().toLowerCase()
    }

    function readValues() {
      const values = {}
      const baseUrl = String(baseUrlInput.value || "").trim()
      const model = String(modelSelect.value || "").trim()
      const contextLimit = readPositiveIntegerInput(contextLimitInput)
      const reasoning = String(reasoningSelect.value || "").trim().toLowerCase()

      if (baseUrl) {
        values.apiBaseUrl = baseUrl
      }
      if (model) {
        values.llmModel = model
      }
      if (contextLimit > 0) {
        values.maxContextTokens = contextLimit
      }
      if (reasoning) {
        values.reasoningEffort = reasoning
      }
      return values
    }

    async function syncDraft() {
      try {
        await providerApi.config.setDraft(readValues(), { replace: true })
        await saveUserSecrets(readUserSecretValues())
      } catch (error) {
        setInlineStatus(
          statusEl,
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

    function setUiReady(ready) {
      root.dataset.uiReady = ready ? "true" : "false"
    }

    async function refreshModels() {
      const selectedValue = String(modelSelect.value || "").trim()
      try {
        await syncDraft()
        renderModelOptions([], selectedValue, modelPlaceholder())
        if (!hasApiKey() || !hasBaseUrl()) {
          setInlineStatus(statusEl, "", "")
          return
        }

        modelSelect.disabled = true
        renderModelOptions([], selectedValue, "(loading...)")
        setInlineStatus(statusEl, "Loading models...", "loading")

        const result = await callRuntimeAction("listModels", {})
        const items = Array.isArray(result?.items) ? result.items : []
        renderModelOptions(items, selectedValue, modelPlaceholder())
        if (!Array.isArray(items) || items.length === 0) {
          setInlineStatus(
            statusEl,
            "No loaded models were returned. Load a model in Unsloth Studio, then refresh.",
            "warning"
          )
        } else {
          setInlineStatus(statusEl, "", "")
        }
      } catch (error) {
        renderModelOptions([], selectedValue, modelPlaceholder())
        const runtimeError = describeRuntimeError(error, "Failed to load models from Unsloth Studio.")
        setInlineStatus(statusEl, runtimeError.message, "error", { detail: runtimeError.detail })
      } finally {
        modelSelect.disabled = false
      }
    }

    async function load() {
      setUiReady(false)
      try {
        const config = await providerApi.config.get(DEFAULTS)
        const userSecrets = await loadUserSecrets({})
        applyValues(config, userSecrets)
        setUiReady(true)
        await syncDraft()
        await refreshModels()
      } catch (error) {
        const runtimeError = describeRuntimeError(error, "Failed to load the Unsloth Studio provider UI.")
        setInlineStatus(statusEl, runtimeError.message, "error", { detail: runtimeError.detail })
      } finally {
        setUiReady(true)
      }
    }

    apiKeyInput.addEventListener("input", () => {
      renderModelOptions([], String(modelSelect.value || "").trim(), modelPlaceholder())
      queueDraftSync()
    })
    apiKeyInput.addEventListener("change", () => {
      void refreshModels()
    })
    baseUrlInput.addEventListener("input", () => {
      renderModelOptions([], String(modelSelect.value || "").trim(), modelPlaceholder())
      queueDraftSync()
    })
    baseUrlInput.addEventListener("change", () => {
      void refreshModels()
    })
    baseUrlInput.addEventListener("blur", () => {
      void refreshModels()
    })
    modelSelect.addEventListener("change", flushDraftSync)
    contextLimitInput.addEventListener("input", queueDraftSync)
    contextLimitInput.addEventListener("change", flushDraftSync)
    reasoningSelect.addEventListener("change", flushDraftSync)

    void load()
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true })
  } else {
    init()
  }
})()
