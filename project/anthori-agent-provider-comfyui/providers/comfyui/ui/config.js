(function () {
  const DEFAULTS = {
    comfyBaseUrl: "http://127.0.0.1:8188",
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

  function cloneStructuredValue(value) {
    if (typeof structuredClone === "function") {
      return structuredClone(value)
    }
    return JSON.parse(JSON.stringify(value))
  }

  function isComfyWorkflowGraph(value) {
    if (!isPlainObject(value)) return false
    return Object.values(value).some((entry) => {
      if (!isPlainObject(entry)) return false
      return String(entry.class_type || "").trim().length > 0
    })
  }

  function unwrapComfyWorkflowGraph(raw) {
    let value = raw
    if (typeof value === "string") {
      const text = value.trim()
      if (!text) return null
      try {
        value = JSON.parse(text)
      } catch {
        return null
      }
    }
    if (!isPlainObject(value)) return null

    if (isComfyWorkflowGraph(value)) return value
    if (isPlainObject(value.prompt) && isComfyWorkflowGraph(value.prompt)) return value.prompt
    if (isPlainObject(value.workflow) && isComfyWorkflowGraph(value.workflow)) return value.workflow
    if (isPlainObject(value.graph) && isComfyWorkflowGraph(value.graph)) return value.graph
    return null
  }

  function normalizeComfyWorkflowId(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64)
  }

  function ensureUniqueComfyWorkflowId(candidate, existingIds) {
    const clean = normalizeComfyWorkflowId(candidate) || "workflow"
    if (!existingIds.has(clean)) {
      existingIds.add(clean)
      return clean
    }
    let index = 2
    while (index < 1000) {
      const next = `${clean}-${index}`
      if (!existingIds.has(next)) {
        existingIds.add(next)
        return next
      }
      index += 1
    }
    const fallback = `${clean}-${Date.now()}`
    existingIds.add(fallback)
    return fallback
  }

  function normalizeComfyWorkflowTemplate(rawEntry, index, existingTemplates = []) {
    if (!isPlainObject(rawEntry)) return null
    const graph = unwrapComfyWorkflowGraph(rawEntry.graph ?? rawEntry.workflow ?? rawEntry.prompt ?? rawEntry)
    if (!graph) return null
    const existingIds = new Set(
      existingTemplates
        .map((item) => String(item?.id || "").trim().toLowerCase())
        .filter(Boolean)
    )
    let id = normalizeComfyWorkflowId(rawEntry.id || rawEntry.name || `workflow-${index + 1}`)
    if (!id) id = `workflow-${index + 1}`
    id = ensureUniqueComfyWorkflowId(id, existingIds)
    const name = String(rawEntry.name || id).trim()
    return {
      id,
      name,
      graph: cloneStructuredValue(graph),
    }
  }

  function normalizeComfyWorkflowTemplates(config) {
    const normalized = sanitizeConfig(config)
    const source = Array.isArray(normalized.workflows)
      ? normalized.workflows
      : Array.isArray(normalized.workflowTemplates)
        ? normalized.workflowTemplates
        : []
    const templates = []
    source.forEach((rawEntry, index) => {
      const item = normalizeComfyWorkflowTemplate(rawEntry, index, templates)
      if (item) templates.push(item)
    })
    return templates
  }

  function init() {
    const providerApi = getProviderApi()
    const root = document.getElementById("comfyui-config-root")
    const baseUrlInput = document.getElementById("comfyui-base-url")
    const checkpointInput = document.getElementById("comfyui-checkpoint")
    const timeoutInput = document.getElementById("comfyui-timeout")
    const workflowAddButton = document.getElementById("comfyui-workflow-add")
    const workflowList = document.getElementById("comfyui-workflow-list")
    const status = document.getElementById("comfyui-status")

    if (
      !providerApi ||
      !root ||
      !baseUrlInput ||
      !checkpointInput ||
      !timeoutInput ||
      !workflowAddButton ||
      !workflowList ||
      !status
    ) {
      return
    }

    let syncTimer = 0
    let comfyWorkflowTemplates = []

    function setStatus(message, state = "error") {
      const text = String(message || "").trim()
      if (!text) {
        status.textContent = ""
        status.hidden = true
        status.dataset.state = ""
        return
      }
      status.textContent = text
      status.hidden = false
      status.dataset.state = String(state || "error").trim() || "error"
    }

    function applyValues(values) {
      const normalized = sanitizeConfig(values)
      baseUrlInput.value = String(normalized.comfyBaseUrl || DEFAULTS.comfyBaseUrl)
      checkpointInput.value = String(normalized.checkpoint || "")
      timeoutInput.value = normalized.httpTimeoutSeconds == null
        ? ""
        : String(normalized.httpTimeoutSeconds)
      setComfyWorkflowTemplates(normalizeComfyWorkflowTemplates(normalized))
    }

    function readValues() {
      const values = {}
      const baseUrl = String(baseUrlInput.value || "").trim()
      const checkpoint = String(checkpointInput.value || "").trim()
      const timeoutRaw = String(timeoutInput.value || "").trim()

      if (baseUrl) values.comfyBaseUrl = baseUrl
      if (checkpoint) values.checkpoint = checkpoint
      if (timeoutRaw) {
        const parsed = Number.parseInt(timeoutRaw, 10)
        if (Number.isFinite(parsed) && parsed > 0) {
          values.httpTimeoutSeconds = parsed
        }
      }
      const workflows = serializeComfyWorkflowTemplates()
      if (workflows.length > 0) {
        values.workflows = workflows
      }
      return values
    }

    function renderComfyWorkflowTemplateList() {
      workflowList.innerHTML = ""

      if (!comfyWorkflowTemplates.length) {
        const empty = document.createElement("div")
        empty.className = "provider-workflow-empty"
        empty.textContent = "No workflow JSON files added."
        workflowList.appendChild(empty)
        return
      }

      comfyWorkflowTemplates.forEach((template, index) => {
        const item = document.createElement("div")
        item.className = "provider-workflow-item"

        const header = document.createElement("div")
        header.className = "provider-workflow-item-header"

        const summary = document.createElement("span")
        const nodeCount = Object.keys(template.graph || {}).length
        summary.textContent = `${nodeCount} nodes`

        const removeButton = document.createElement("button")
        removeButton.type = "button"
        removeButton.className = "secondary"
        removeButton.dataset.workflowAction = "remove"
        removeButton.dataset.workflowIndex = String(index)
        removeButton.textContent = "Remove"

        header.append(summary, removeButton)

        const nameLine = document.createElement("div")
        nameLine.className = "provider-workflow-name"
        nameLine.textContent = String(template.name || "")

        const idLine = document.createElement("div")
        idLine.className = "provider-workflow-id"
        idLine.textContent = `ID: ${String(template.id || "")}`

        item.append(header, nameLine, idLine)
        workflowList.appendChild(item)
      })
    }

    function setComfyWorkflowTemplates(templates) {
      const source = Array.isArray(templates) ? templates : []
      const normalized = []
      source.forEach((entry, index) => {
        const parsed = normalizeComfyWorkflowTemplate(entry, index, normalized)
        if (parsed) normalized.push(parsed)
      })
      comfyWorkflowTemplates = normalized
      renderComfyWorkflowTemplateList()
    }

    function serializeComfyWorkflowTemplates() {
      const workflows = []
      const existingIds = new Set()
      comfyWorkflowTemplates.forEach((entry, index) => {
        if (!isPlainObject(entry)) return
        const graph = unwrapComfyWorkflowGraph(entry.graph)
        if (!graph) return
        let id = normalizeComfyWorkflowId(entry.id || entry.name || `workflow-${index + 1}`)
        if (!id) id = `workflow-${index + 1}`
        id = ensureUniqueComfyWorkflowId(id, existingIds)
        workflows.push({
          id,
          name: String(entry.name || id).trim(),
          graph: cloneStructuredValue(graph),
        })
      })
      return workflows
    }

    async function importComfyWorkflowFile(selection) {
      const filePath = String(selection?.path || "").trim()
      const fileName = String(selection?.name || "").trim()
      const fileContent = String(selection?.content || "")
      if (!filePath || !fileContent) return
      const next = comfyWorkflowTemplates.slice()
      const existingIds = new Set(
        next
          .map((entry) => String(entry?.id || "").trim().toLowerCase())
          .filter(Boolean)
      )
      try {
        const parsed = JSON.parse(fileContent)
        const graph = unwrapComfyWorkflowGraph(parsed)
        if (!graph) {
          setStatus("No valid Comfy API workflow JSON found in the selected file.", "error")
          return
        }
        const basename = String(fileName || filePath)
          .replace(/\.json$/i, "")
          .trim()
        const id = ensureUniqueComfyWorkflowId(basename || `workflow-${next.length + 1}`, existingIds)
        next.push({
          id,
          name: basename || id,
          graph: cloneStructuredValue(graph),
        })
      } catch {
        setStatus("No valid Comfy API workflow JSON found in the selected file.", "error")
        return
      }

      setComfyWorkflowTemplates(next)
      await syncDraft()
      setStatus("Imported 1 workflow.", "info")
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
      if (syncTimer) window.clearTimeout(syncTimer)
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
        setStatus(error instanceof Error ? error.message : "Failed to load the ComfyUI provider UI.")
      }
    }

    baseUrlInput.addEventListener("input", queueDraftSync)
    checkpointInput.addEventListener("input", queueDraftSync)
    timeoutInput.addEventListener("input", queueDraftSync)
    baseUrlInput.addEventListener("change", flushDraftSync)
    checkpointInput.addEventListener("change", flushDraftSync)
    timeoutInput.addEventListener("change", flushDraftSync)
    workflowAddButton.addEventListener("click", async () => {
      try {
        const selected = await providerApi.files.selectTextFile({
          title: "Choose Comfy Workflow JSON",
          message: "Select a Comfy API workflow JSON file from the server filesystem.",
          selectLabel: "Use File",
          allowedFileExtensions: [".json"],
        })
        await importComfyWorkflowFile(selected)
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Failed to open the path picker.")
      }
    })
    workflowList.addEventListener("click", async (event) => {
      const removeButton = event.target.closest("button[data-workflow-action='remove']")
      if (!removeButton) return
      const index = Number(removeButton.dataset.workflowIndex)
      if (!Number.isInteger(index) || index < 0) return
      const next = comfyWorkflowTemplates.filter((_, itemIndex) => itemIndex !== index)
      setComfyWorkflowTemplates(next)
      await syncDraft()
    })

    void load()
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true })
  } else {
    init()
  }
})()
