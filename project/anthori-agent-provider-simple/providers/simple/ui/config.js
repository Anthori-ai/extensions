(function () {
  const DEFAULTS = {}

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

  function init() {
    const providerApi = getProviderApi()
    const httpInput = document.getElementById("simple-http")
    const modelInput = document.getElementById("simple-model")
    const contextLimitInput = document.getElementById("simple-context-limit")
    const status = document.getElementById("simple-status")

    if (!providerApi || !httpInput || !modelInput || !contextLimitInput || !status) {
      return
    }

    let syncTimer = 0

    function setStatus(message) {
      const text = String(message || "").trim()
      if (!text) {
        status.textContent = ""
        status.hidden = true
        status.dataset.state = ""
        return
      }
      status.textContent = text
      status.hidden = false
      status.dataset.state = "error"
    }

    function applyValues(values) {
      const normalized = sanitizeConfig(values)
      httpInput.value = String(normalized.http || "")
      modelInput.value = String(normalized.llmModel || "")
      contextLimitInput.value = normalized.maxContextTokens == null
        ? ""
        : String(normalized.maxContextTokens)
    }

    function readValues() {
      const values = {}
      const http = String(httpInput.value || "").trim()
      const model = String(modelInput.value || "").trim()
      const contextLimitRaw = String(contextLimitInput.value || "").trim()

      if (http) {
        values.http = http
      }
      if (model) {
        values.llmModel = model
      }
      if (contextLimitRaw) {
        const parsed = Number.parseInt(contextLimitRaw, 10)
        if (Number.isFinite(parsed) && parsed > 0) {
          values.maxContextTokens = parsed
        }
      }
      // Provider-level timeout override was removed so execution/control timeout remains the only budget source.
      return values
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

    async function load() {
      try {
        const config = await providerApi.config.get(DEFAULTS)
        applyValues(config)
        await providerApi.config.setDraft(readValues(), { replace: true })
        setStatus("")
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Failed to load the Simple provider UI.")
      }
    }

    httpInput.addEventListener("input", queueDraftSync)
    modelInput.addEventListener("input", queueDraftSync)
    contextLimitInput.addEventListener("input", queueDraftSync)
    httpInput.addEventListener("change", flushDraftSync)
    modelInput.addEventListener("change", flushDraftSync)
    contextLimitInput.addEventListener("change", flushDraftSync)

    void load()
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true })
  } else {
    init()
  }
})()
