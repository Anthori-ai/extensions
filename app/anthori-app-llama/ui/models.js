(function () {
  const LLAMA_RUNTIME_RELEASES_API_URL = "https://api.github.com/repos/ggml-org/llama.cpp/releases/latest"
  const LLAMA_RUNTIME_LIBRARY_ID = "anthori-llama-runtime"
  const LLAMA_GPU_SELECTION_NONE = "__none__"
  const DOWNLOAD_STATUS_POLL_MS = 1000
  const DOWNLOAD_START_STALE_MS = 30000
  const DOWNLOAD_STATUS_MISSING_LIMIT = 10
  const RUNTIME_LOAD_STATUS_POLL_MS = 1500
  const RUNTIME_STATUS_POLL_MS = 1000
  const MODEL_FIT_CONTEXT_TOKENS = 256000
  const MODEL_FIT_MIN_CONTEXT_RESERVE_BYTES = 6 * 1000 * 1000 * 1000
  const MODEL_FIT_MAX_CONTEXT_RESERVE_BYTES = 48 * 1000 * 1000 * 1000

  const DEFAULTS = Object.freeze({
    modelRoot: "",
    models: [],
    modelOptions: {},
    downloads: [],
    runtimeId: "",
    gpuStrategy: "split-evenly",
    enabledGpuIds: [],
    limitDedicatedGpuMemory: true,
    offloadKvCache: true,
    modelGuardrail: "relaxed",
  })

  const state = {
    values: {
      modelRoot: "",
      models: [],
      modelOptions: {},
      downloads: [],
    },
    backendAvailable: false,
    backendModels: [],
    resolvedModelRoot: "",
    runtime: null,
    runtimePacks: [],
    runtimePlatform: "",
    selectedRuntimeId: "",
    runtimeCheckingUpdates: false,
    hardware: null,
    runtimeBusyId: "",
    runtimeModelAction: "",
    runtimeModelActionPath: "",
    runtimeModelActionStartedAt: 0,
    runtimeModelActionToken: 0,
    runtimeLoadStatusTimer: 0,
    runtimeStatusPollTimer: 0,
    runtimeStatusPollInFlight: false,
    runtimeActivitySamples: {},
    downloading: false,
    expandedModels: new Set(),
    expandedHuggingFaceRepositories: new Set(),
    activeDownloads: {},
    cancelingDownloads: new Set(),
    removingDownloads: new Set(),
    removingModels: new Set(),
    downloadStatusPollTimer: 0,
    downloadRateSamples: {},
    saving: false,
    hf: {
      query: "",
      searching: false,
      loadingRepository: "",
      results: [],
      filesByRepository: {},
      error: "",
    },
  }

  const els = {}

  function $(id) {
    return document.getElementById(id)
  }

  function on(element, eventName, handler) {
    if (element instanceof HTMLElement) {
      element.addEventListener(eventName, handler)
    }
  }

  function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value)
  }

  function normalizeString(value) {
    return String(value || "").trim()
  }

  function basename(path) {
    const value = normalizeString(path)
    if (!value) return ""
    const parts = value.split(/[\\/]+/).filter(Boolean)
    return parts[parts.length - 1] || value
  }

  function dirname(path) {
    const value = normalizeString(path).replace(/\\/g, "/")
    const index = value.lastIndexOf("/")
    return index > 0 ? value.slice(0, index) : ""
  }

  function formatCount(value) {
    const number = Number(value)
    if (!Number.isFinite(number) || number <= 0) return ""
    try {
      return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(Math.floor(number))
    } catch (_error) {
      return String(Math.floor(number))
    }
  }

  function formatBytes(value, options = {}) {
    const bytes = Number(value)
    if (!Number.isFinite(bytes) || bytes <= 0) return ""
    const units = ["B", "KB", "MB", "GB", "TB"]
    let amount = bytes
    let index = 0
    while (amount >= 1000 && index < units.length - 1) {
      amount /= 1000
      index += 1
    }
    const decimals = Number.isFinite(Number(options.decimals))
      ? Math.max(0, Math.floor(Number(options.decimals)))
      : (amount >= 10 || index === 0 ? 0 : 1)
    return `${amount.toFixed(decimals).replace(/\.0+$/, "")} ${units[index]}`
  }

  function formatShortBytes(value) {
    const bytes = Number(value)
    if (!Number.isFinite(bytes) || bytes <= 0) return ""
    const gb = bytes / 1000 / 1000 / 1000
    if (gb >= 10) return `${Math.round(gb)} GB`
    if (gb >= 1) return `${Math.round(gb * 10) / 10} GB`
    return formatBytes(bytes)
  }

  function normalizeByteCount(...values) {
    for (const value of values) {
      const number = Number(value)
      if (Number.isFinite(number) && number > 0) {
        return Math.floor(number)
      }
    }
    return 0
  }

  function clampNumber(value, min, max) {
    const number = Number(value)
    if (!Number.isFinite(number)) return min
    return Math.max(min, Math.min(max, number))
  }

  function normalizePositiveInteger(value) {
    const number = Number(value)
    if (!Number.isFinite(number) || number <= 0) return 0
    return Math.floor(number)
  }

  function normalizeOptionalInteger(value, options = {}) {
    if (value === null || value === undefined || String(value).trim() === "") return null
    const number = Number(value)
    if (!Number.isFinite(number)) return null
    const integer = Math.floor(number)
    if (Number.isFinite(options.min) && integer < options.min) return null
    if (Number.isFinite(options.max) && integer > options.max) return null
    return integer
  }

  function normalizeOptionalNumber(value, options = {}) {
    if (value === null || value === undefined || String(value).trim() === "") return null
    const number = Number(value)
    if (!Number.isFinite(number)) return null
    if (Number.isFinite(options.min) && number < options.min) return null
    if (Number.isFinite(options.max) && number > options.max) return null
    return number
  }

  function normalizeKvCacheType(value) {
    const normalized = normalizeString(value).toLowerCase()
    return ["f32", "f16", "bf16", "q8_0", "q4_0", "q4_1", "iq4_nl", "q5_0", "q5_1"].includes(normalized)
      ? normalized
      : ""
  }

  function normalizeBooleanOverride(value) {
    if (value === true || value === false) return value
    const normalized = normalizeString(value).toLowerCase()
    if (normalized === "on" || normalized === "true") return true
    if (normalized === "off" || normalized === "false") return false
    return null
  }

  function formatGB(value) {
    const bytes = Number(value)
    if (!Number.isFinite(bytes) || bytes <= 0) return "Unavailable"
    const gb = bytes / 1000 / 1000 / 1000
    const rounded = gb >= 10 ? Math.round(gb * 10) / 10 : Math.round(gb * 100) / 100
    return `${rounded} GB`
  }

  function formatElapsedTime(startedAt) {
    const started = Number(startedAt)
    if (!Number.isFinite(started) || started <= 0) return ""
    const seconds = Math.max(0, Math.floor((Date.now() - started) / 1000))
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    const remainder = seconds % 60
    return remainder > 0 ? `${minutes}m ${remainder}s` : `${minutes}m`
  }

  function normalizeStringList(value) {
    if (!Array.isArray(value)) return []
    const seen = new Set()
    const items = []
    value.forEach((entry) => {
      const normalized = normalizeString(entry)
      if (!normalized || seen.has(normalized)) return
      seen.add(normalized)
      items.push(normalized)
    })
    return items
  }

  function normalizeGpuStrategy(value) {
    const normalized = normalizeString(value)
    return normalized === "first" ? "first" : "split-evenly"
  }

  function normalizeGuardrail(value) {
    const normalized = normalizeString(value)
    return ["off", "relaxed", "balanced", "strict"].includes(normalized) ? normalized : "relaxed"
  }

  function selectedGpuIdsForHardware(hardware) {
    const configured = normalizeStringList(state.values.enabledGpuIds)
    if (configured.length === 1 && configured[0] === LLAMA_GPU_SELECTION_NONE) {
      return new Set()
    }
    const hardwareIds = new Set(hardware.gpus.map((gpu) => gpu.id).filter(Boolean))
    const legacyIndexToId = new Map()
    hardware.gpus.forEach((gpu) => {
      if (gpu.id && gpu.deviceIndex) {
        legacyIndexToId.set(gpu.deviceIndex, gpu.id)
      }
    })
    if (configured.length > 0) {
      return new Set(configured
        .filter((id) => id !== LLAMA_GPU_SELECTION_NONE)
        .map((id) => hardwareIds.has(id) ? id : legacyIndexToId.get(id))
        .filter(Boolean))
    }
    return hardwareIds
  }

  function saveEnabledGpuIds(ids, hardware) {
    const allIds = hardware.gpus.map((gpu) => gpu.id).filter(Boolean)
    const next = Array.from(ids).filter(Boolean)
    if (next.length === 0) {
      state.values.enabledGpuIds = [LLAMA_GPU_SELECTION_NONE]
    } else if (allIds.length > 0 && next.length === allIds.length && allIds.every((id) => ids.has(id))) {
      state.values.enabledGpuIds = []
    } else {
      state.values.enabledGpuIds = next
    }
  }

  function selectedVramBytes(hardware) {
    const info = hardware || state.hardware
    if (!info || !Array.isArray(info.gpus) || info.gpus.length === 0) return 0
    const selectedIds = selectedGpuIdsForHardware(info)
    return info.gpus.reduce((total, gpu) => {
      if (!gpu.id || !selectedIds.has(gpu.id)) return total
      return total + normalizeByteCount(gpu.vramBytes)
    }, 0)
  }

  function modelFitEstimate(fileBytes) {
    const bytes = normalizeByteCount(fileBytes)
    if (bytes <= 0) {
      return {
        tier: "unknown",
        label: "Unknown",
        title: "Model size is unavailable.",
      }
    }
    const hardware = state.hardware || normalizeHardware(null)
    const ramBytes = normalizeByteCount(hardware.memory?.ramBytes)
    const vramBytes = selectedRuntimeSupportsAcceleration() ? selectedVramBytes(hardware) : 0
    const hasGpuTarget = vramBytes > 0
    const totalBytes = ramBytes + vramBytes
    const primaryBytes = hasGpuTarget ? vramBytes : ramBytes
    if (primaryBytes <= 0 && totalBytes <= 0) {
      return {
        tier: "unknown",
        label: "Unknown",
        title: "System memory is unavailable.",
      }
    }
    const contextReserve = clampNumber(bytes * 0.35, MODEL_FIT_MIN_CONTEXT_RESERVE_BYTES, MODEL_FIT_MAX_CONTEXT_RESERVE_BYTES)
    const estimatedBytes = bytes + contextReserve
    const memoryLabel = [hasGpuTarget ? `${formatShortBytes(vramBytes)} VRAM` : "", ramBytes > 0 ? `${formatShortBytes(ramBytes)} RAM` : ""]
      .filter(Boolean)
      .join(" + ")
    const targetLabel = hasGpuTarget ? "enabled VRAM" : "RAM"
    const title = `Estimated for ${formatCount(MODEL_FIT_CONTEXT_TOKENS)} context tokens. Needs about ${formatShortBytes(estimatedBytes)} against ${memoryLabel || formatShortBytes(primaryBytes || totalBytes)}.`
    if (primaryBytes > 0 && estimatedBytes <= primaryBytes * 0.75) {
      return { tier: "good", label: "Fits", title }
    }
    if (hasGpuTarget) {
      if (estimatedBytes <= vramBytes) {
        return { tier: "warn", label: "Borderline", title: `${title} Close to ${targetLabel} limit.` }
      }
      if (estimatedBytes <= totalBytes) {
        return { tier: "warn", label: "Borderline", title: `${title} May require partial CPU/RAM fallback.` }
      }
    } else if (estimatedBytes <= primaryBytes) {
      return { tier: "warn", label: "Borderline", title: `${title} Close to ${targetLabel} limit.` }
    }
    return { tier: "bad", label: "Too large", title }
  }

  function applyFitStyle(element, fileBytes) {
    if (!(element instanceof HTMLElement)) return
    const estimate = modelFitEstimate(fileBytes)
    element.classList.add("llama-file-size", estimate.tier)
    element.title = estimate.title
  }

  function setIconButtonSvg(button, pathData) {
    button.replaceChildren()
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
    svg.setAttribute("viewBox", "0 0 24 24")
    svg.setAttribute("aria-hidden", "true")
    const paths = Array.isArray(pathData) ? pathData : [pathData]
    paths.forEach((value) => {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path")
      path.setAttribute("d", value)
      svg.appendChild(path)
    })
    button.appendChild(svg)
  }

  function setIconButtonSpinner(button) {
    button.replaceChildren()
    const spinner = document.createElement("span")
    spinner.className = "llama-file-spinner"
    spinner.setAttribute("aria-hidden", "true")
    button.appendChild(spinner)
  }

  function createVisionIcon(title = "Vision-capable model") {
    const icon = document.createElement("span")
    icon.className = "llama-vision-icon"
    icon.title = title
    icon.setAttribute("aria-label", title)
    icon.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>'
    return icon
  }

  function selectedRuntimePack() {
    const selectedId = normalizeString(state.values.runtimeId || state.selectedRuntimeId || state.runtimePacks.find((pack) => pack.selected)?.id)
    if (!selectedId) return null
    return state.runtimePacks.find((pack) => pack.id === selectedId) || null
  }

  function selectedRuntimeSupportsAcceleration() {
    const pack = selectedRuntimePack()
    if (!pack) return true
    const variant = normalizeString(pack.variant).toLowerCase()
    const id = normalizeString(pack.id).toLowerCase()
    return variant !== "cpu" && !id.includes(".cpu")
  }

  function runtimePackKey(value) {
    return normalizeString(value).toLowerCase()
  }

  function runtimePackIsSelectable(pack) {
    return Boolean(pack && pack.compatible && pack.installed)
  }

  function isModelsSurface() {
    return normalizeString(document.body?.dataset?.llamaSurface).toLowerCase() === "models"
  }

  function runtimeEngineSetupMessage() {
    if (!isModelsSurface()) return ""
    const selectedId = runtimePackKey(state.values.runtimeId || state.selectedRuntimeId || state.runtimePacks.find((pack) => pack.selected)?.id)
    if (!selectedId) return "Install or select a runtime engine from Settings > Extensions > Llama."
    const pack = state.runtimePacks.find((entry) => runtimePackKey(entry.id) === selectedId)
    if (!runtimePackIsSelectable(pack)) {
      return "Install or select a runtime engine from Settings > Extensions > Llama."
    }
    return ""
  }

  function adoptSelectedRuntimeFromPacks() {
    if (normalizeString(state.values.runtimeId)) return false
    const selectedId = normalizeString(state.selectedRuntimeId || state.runtimePacks.find((pack) => pack.selected)?.id)
    if (!selectedId) return false
    const selectedPack = state.runtimePacks.find((pack) => runtimePackKey(pack.id) === runtimePackKey(selectedId))
    if (!runtimePackIsSelectable(selectedPack)) return false
    state.values.runtimeId = selectedPack.id
    return true
  }

  function encodePathSegments(value) {
    return normalizeString(value)
      .split("/")
      .filter(Boolean)
      .map((part) => encodeURIComponent(part))
      .join("/")
  }

  function createId(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  }

  function normalizeModelLookupKey(value) {
    return normalizeString(value)
      .replace(/\\/g, "/")
      .split("/")
      .filter(Boolean)
      .join("/")
      .toLowerCase()
  }

  function huggingFaceModelKey(repository, file) {
    return normalizeModelLookupKey(`${normalizeString(repository)}/${normalizeString(file)}`)
  }

  function activeDownloadItems() {
    return Object.values(state.activeDownloads || {}).map(normalizeDownload).filter(Boolean)
  }

  function setActiveDownload(download) {
    const normalized = normalizeDownload(download)
    if (!normalized) return
    state.activeDownloads = Object.assign({}, state.activeDownloads, {
      [normalized.id]: normalized,
    })
    updateDownloadStatusPolling()
  }

  function removeActiveDownload(id) {
    const downloadId = normalizeString(id)
    if (!downloadId) return
    const next = Object.assign({}, state.activeDownloads)
    delete next[downloadId]
    state.activeDownloads = next
    const nextSamples = Object.assign({}, state.downloadRateSamples || {})
    delete nextSamples[downloadId]
    state.downloadRateSamples = nextSamples
    updateDownloadStatusPolling()
  }

  function updateDownloadRateSample(download) {
    const normalized = normalizeDownload(download)
    if (!normalized) return null
    const downloaded = normalizeByteCount(normalized.bytesDownloaded)
    const now = Date.now()
    const previous = state.downloadRateSamples[normalized.id]
    let rateBytesPerSecond = normalizeByteCount(previous?.rateBytesPerSecond)
    if (previous && downloaded > previous.bytesDownloaded && now > previous.at) {
      const elapsedSeconds = (now - previous.at) / 1000
      const instantRate = elapsedSeconds > 0 ? (downloaded - previous.bytesDownloaded) / elapsedSeconds : 0
      if (instantRate > 0) {
        rateBytesPerSecond = rateBytesPerSecond > 0
          ? (rateBytesPerSecond * 0.65) + (instantRate * 0.35)
          : instantRate
      }
    }
    state.downloadRateSamples = Object.assign({}, state.downloadRateSamples || {}, {
      [normalized.id]: {
        bytesDownloaded: downloaded,
        at: now,
        rateBytesPerSecond,
      },
    })
    return state.downloadRateSamples[normalized.id]
  }

  function downloadRateText(download) {
    const normalized = normalizeDownload(download)
    if (!normalized) return ""
    const sample = state.downloadRateSamples[normalized.id]
    const rate = Number(sample?.rateBytesPerSecond)
    if (!Number.isFinite(rate) || rate <= 0) return ""
    return `${formatBytes(rate, { decimals: 1 })}/s`
  }

  function activeDownloadFor(repository, file) {
    const target = huggingFaceModelKey(repository, file)
    if (!target) return null
    return activeDownloadItems().find((download) => huggingFaceModelKey(download.repository, download.file) === target) || null
  }

  function downloadIsActive(download) {
    const status = normalizeString(download?.status)
    return status === "starting" || status === "downloading"
  }

  function downloadIsTerminal(download) {
    const status = normalizeString(download?.status)
    return status === "complete" || status === "failed" || status === "canceled"
  }

  function downloadIsComplete(download) {
    return normalizeString(download?.status) === "complete"
  }

  function downloadTimestamp(value) {
    const parsed = Date.parse(normalizeString(value))
    return Number.isFinite(parsed) ? parsed : 0
  }

  function downloadIsStaleStarting(download) {
    if (normalizeString(download?.status) !== "starting") return false
    const updatedAt = downloadTimestamp(download.updatedAt || download.startedAt)
    return updatedAt > 0 && Date.now() - updatedAt > DOWNLOAD_START_STALE_MS
  }

  function downloadedModelKeys() {
    const keys = new Set()
    state.backendModels.forEach((model) => {
      const key = normalizeModelLookupKey(model.id)
      if (key) keys.add(key)
    })
    return keys
  }

  function isDownloadedHuggingFaceFile(repository, file) {
    const key = huggingFaceModelKey(repository, file)
    return key ? downloadedModelKeys().has(key) : false
  }

  function downloadedHuggingFaceModel(repository, file) {
    const key = huggingFaceModelKey(repository, file)
    if (!key) return null
    return state.backendModels.map(normalizeModel).filter(Boolean).find((model) => normalizeModelLookupKey(model.id) === key) || null
  }

  function isDownloadedHuggingFaceEntry(repository, file) {
    if (!isDownloadedHuggingFaceFile(repository, file?.file)) return false
    if (!normalizeString(file?.projectorFile)) return true
    const model = downloadedHuggingFaceModel(repository, file.file)
    return Boolean(model?.projectorPath)
  }

  async function callLlamaAction(actionId, input = {}) {
    const api = window.anthoriExtension && window.anthoriExtension.actions
    if (!api || typeof api.call !== "function") {
      throw new Error("Extension actions are unavailable.")
    }
    const response = await api.call({
      libraryId: LLAMA_RUNTIME_LIBRARY_ID,
      actionId,
      input: input && typeof input === "object" ? input : {},
    })
    return isPlainObject(response?.output) ? response.output : {}
  }

  async function openAppExtensionsSettings() {
    const api = window.anthoriExtension && window.anthoriExtension.host
    if (!api || typeof api.openSettings !== "function") {
      setMessage("Settings bridge is unavailable.")
      return
    }
    try {
      await api.openSettings("extensions")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Settings failed to open.")
    }
  }

  async function selectModelRootDirectory() {
    const api = window.anthoriExtension && window.anthoriExtension.host
    if (!api || typeof api.selectPath !== "function") {
      setMessage("Path picker is unavailable.")
      return
    }
    try {
      const selected = await api.selectPath({
        title: "Choose Model Directory",
        message: "Choose a folder for Llama models.",
        selection: "directory",
        initialPath: state.values.modelRoot || state.resolvedModelRoot,
        selectLabel: "Use Folder",
        showFiles: false,
        allowCreate: true,
        returnEntry: true,
      })
      const selectedPath = normalizeString(isPlainObject(selected) ? selected.path : selected)
      if (!selectedPath) return
      await saveModelRoot(selectedPath)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Path picker failed.")
    }
  }

  function huggingFaceUrl(path, query = {}) {
    const url = new URL(path, "https://huggingface.co")
    Object.entries(query).forEach(([key, value]) => {
      const normalized = normalizeString(value)
      if (normalized) {
        url.searchParams.set(key, normalized)
      }
    })
    return url.toString()
  }

  async function fetchHuggingFaceJsonResponse(url) {
    const api = window.anthoriExtension && window.anthoriExtension.network
    if (!api || typeof api.fetch !== "function") {
      throw new Error("Network access is unavailable.")
    }
    const response = await api.fetch({
      url,
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    })
    const status = Number(response?.status)
    const body = normalizeString(response?.body)
    if (normalizeString(response?.bodyEncoding)) {
      throw new Error("Expected a text response.")
    }
    let parsed = null
    if (body) {
      try {
        parsed = JSON.parse(body)
      } catch (_error) {
        parsed = null
      }
    }
    if (!Number.isFinite(status) || status < 200 || status >= 300) {
      const message = normalizeString(parsed?.error) || normalizeString(parsed?.message) || `Hugging Face returned ${status || "an error"}.`
      throw new Error(message)
    }
    return {
      data: parsed,
      headers: isPlainObject(response?.headers) ? response.headers : {},
      url,
    }
  }

  async function fetchHuggingFaceJson(url) {
    const response = await fetchHuggingFaceJsonResponse(url)
    return response.data
  }

  function responseHeader(headers, name) {
    if (!isPlainObject(headers)) return ""
    const target = normalizeString(name).toLowerCase()
    const match = Object.entries(headers).find(([key]) => normalizeString(key).toLowerCase() === target)
    return match ? normalizeString(match[1]) : ""
  }

  function nextLinkUrl(headers, baseUrl = "") {
    const link = responseHeader(headers, "link")
    if (!link) return ""
    const match = /<([^>]+)>\s*;\s*rel="?next"?/i.exec(link)
    const href = match ? normalizeString(match[1]) : ""
    if (!href) return ""
    try {
      return new URL(href, baseUrl || "https://huggingface.co").toString()
    } catch (_error) {
      return href
    }
  }

  async function fetchHuggingFaceJsonPages(url, options = {}) {
    const maxPages = Math.max(1, Math.floor(Number(options.maxPages) || 50))
    const items = []
    let nextUrl = normalizeString(url)
    const seen = new Set()
    for (let page = 0; nextUrl && page < maxPages; page += 1) {
      if (seen.has(nextUrl)) break
      seen.add(nextUrl)
      const response = await fetchHuggingFaceJsonResponse(nextUrl)
      if (Array.isArray(response.data)) {
        items.push(...response.data)
      } else if (response.data) {
        items.push(response.data)
      }
      nextUrl = nextLinkUrl(response.headers, nextUrl)
    }
    return items
  }

  async function ensureHuggingFaceDownloadPermission() {
    const api = window.anthoriExtension && window.anthoriExtension.permissions
    if (!api || typeof api.ensureUser !== "function") {
      throw new Error("Permission bridge is unavailable.")
    }
    await api.ensureUser({
      requests: [
        {
          capability: "network",
          access: "connect",
          scope: "https://huggingface.co",
          scopeLabel: "https://huggingface.co",
          reason: "To browse and download model files from Hugging Face.",
        },
        {
          capability: "network",
          access: "connect",
          scope: "https://cdn-lfs.hf.co",
          scopeLabel: "https://cdn-lfs.hf.co",
          reason: "To download model file blobs from Hugging Face.",
        },
      ],
    })
  }

  async function ensureRuntimeDownloadPermission(runtime) {
    const api = window.anthoriExtension && window.anthoriExtension.permissions
    if (!api || typeof api.ensureUser !== "function") {
      throw new Error("Permission bridge is unavailable.")
    }
    const assets = Array.isArray(runtime?.assets) ? runtime.assets : []
    const releaseUrls = new Map()
    assets.forEach((asset) => {
      const url = normalizeString(asset?.url)
      if (!url) return
      let parsed = null
      try {
        parsed = new URL(url)
      } catch (_error) {
        return
      }
      const parts = parsed.pathname.split("/").filter(Boolean)
      const releasesIndex = parts.findIndex((part) => part === "releases")
      if (parsed.host !== "github.com" || releasesIndex < 2) {
        releaseUrls.set(url, url)
        return
      }
      const releaseUrl = `${parsed.origin}/${parts.slice(0, releasesIndex + 1).join("/")}`
      releaseUrls.set(releaseUrl, releaseUrl)
    })
    const requests = Array.from(releaseUrls.values()).map((url) => ({
      capability: "network",
      access: "connect",
      scope: url,
      scopeLabel: url,
      reason: "To download llama.cpp runtime packs.",
    }))
    await api.ensureUser({
      requests,
    })
  }

  async function ensureRuntimeUpdateCheckPermission() {
    const api = window.anthoriExtension && window.anthoriExtension.permissions
    if (!api || typeof api.ensureUser !== "function") {
      throw new Error("Permission bridge is unavailable.")
    }
    await api.ensureUser({
      requests: [
        {
          capability: "network",
          access: "connect",
          scope: LLAMA_RUNTIME_RELEASES_API_URL,
          scopeLabel: LLAMA_RUNTIME_RELEASES_API_URL,
          reason: "To check for llama.cpp runtime updates.",
        },
      ],
    })
  }

  function normalizeHuggingFaceModel(entry) {
    if (!isPlainObject(entry)) return null
    const repository = normalizeString(entry.modelId) || normalizeString(entry.id)
    if (!repository || !repository.includes("/")) return null
    const tags = Array.isArray(entry.tags)
      ? entry.tags.map((tag) => normalizeString(tag)).filter(Boolean)
      : []
    return {
      repository,
      downloads: Number.isFinite(Number(entry.downloads)) ? Math.max(0, Math.floor(Number(entry.downloads))) : 0,
      likes: Number.isFinite(Number(entry.likes)) ? Math.max(0, Math.floor(Number(entry.likes))) : 0,
      tags,
    }
  }

  function normalizeHuggingFaceFile(entry) {
    if (!isPlainObject(entry)) return null
    const file = normalizeString(entry.rfilename) || normalizeString(entry.path) || normalizeString(entry.name)
    if (!file || !file.toLowerCase().endsWith(".gguf")) return null
    const lfs = isPlainObject(entry.lfs) ? entry.lfs : {}
    const blobLfs = isPlainObject(entry.blobLfs) ? entry.blobLfs : {}
    const split = splitGgufShardInfo(file)
    return {
      file,
      bytes: normalizeByteCount(entry.size, lfs.size, blobLfs.size),
      projector: isProjectorGgufFile(file),
      split,
    }
  }

  function isSplitGgufShardFile(file) {
    return /-\d{5}-of-\d{5}\.gguf$/i.test(normalizeString(file))
  }

  function splitGgufShardInfo(file) {
    const path = normalizeString(file)
    const name = basename(path)
    const match = /^(.*)-(\d{5})-of-(\d{5})\.gguf$/i.exec(name)
    if (!match) return null
    const index = Number.parseInt(match[2], 10)
    const total = Number.parseInt(match[3], 10)
    if (!Number.isInteger(index) || !Number.isInteger(total) || index < 1 || total < 2 || index > total) return null
    const dir = dirname(path)
    return {
      key: `${dir}/${match[1]}:${total}`.toLowerCase(),
      index,
      total,
    }
  }

  function isProjectorGgufFile(file) {
    const name = basename(file).toLowerCase()
    return name.endsWith(".gguf") && (name.startsWith("mmproj") || name.startsWith("projector"))
  }

  function sortHuggingFaceFilesBySize(left, right) {
    const leftBytes = huggingFaceFileTotalBytes(left)
    const rightBytes = huggingFaceFileTotalBytes(right)
    if (leftBytes > 0 && rightBytes > 0 && leftBytes !== rightBytes) return leftBytes - rightBytes
    if (leftBytes > 0 && rightBytes <= 0) return -1
    if (leftBytes <= 0 && rightBytes > 0) return 1
    return normalizeString(left?.file).localeCompare(normalizeString(right?.file))
  }

  function huggingFaceFileTotalBytes(file) {
    const extraBytes = Array.isArray(file?.extraFiles)
      ? file.extraFiles.reduce((total, item) => total + normalizeByteCount(item?.bytes), 0)
      : 0
    return normalizeByteCount(file?.bytes) + normalizeByteCount(file?.projectorBytes) + extraBytes
  }

  function chooseProjectorForFile(file, projectors) {
    if (!file || !Array.isArray(projectors) || projectors.length === 0) return null
    const fileDir = dirname(file.file)
    const candidates = projectors.slice().sort((left, right) => {
      const leftSameDir = dirname(left.file) === fileDir
      const rightSameDir = dirname(right.file) === fileDir
      if (leftSameDir !== rightSameDir) return leftSameDir ? -1 : 1
      return normalizeString(left.file).localeCompare(normalizeString(right.file))
    })
    return candidates[0] || null
  }

  function huggingFaceTreeEntries(detail) {
    if (Array.isArray(detail)) return detail
    if (Array.isArray(detail?.siblings)) return detail.siblings
    if (Array.isArray(detail?.tree)) return detail.tree
    if (Array.isArray(detail?.files)) return detail.files
    return []
  }

  function groupedSplitHuggingFaceFiles(files) {
    const groups = new Map()
    files.forEach((file) => {
      if (!file?.split || file.projector) return
      const group = groups.get(file.split.key) || []
      group.push(file)
      groups.set(file.split.key, group)
    })
    return Array.from(groups.values())
      .map((group) => {
        const sorted = group.slice().sort((left, right) => left.split.index - right.split.index)
        const first = sorted.find((file) => file.split.index === 1)
        if (!first) return null
        const indexes = new Set(sorted.map((file) => file.split.index))
        const complete = indexes.size === first.split.total
        if (!complete) return null
        return Object.assign({}, first, {
          extraFiles: sorted
            .filter((file) => file.file !== first.file)
            .map((file) => ({ file: file.file, bytes: file.bytes, role: "model" })),
          splitFileCount: first.split.total,
        })
      })
      .filter(Boolean)
  }

  function normalizeHuggingFaceFiles(detail) {
    const files = huggingFaceTreeEntries(detail)
      .map(normalizeHuggingFaceFile)
      .filter(Boolean)
    const projectors = files.filter((file) => file.projector)
    return files
      .filter((file) => !file.split)
      .concat(groupedSplitHuggingFaceFiles(files))
      .filter((file) => !file.projector)
      .map((file) => {
        const projector = chooseProjectorForFile(file, projectors)
        if (!projector) return file
        return Object.assign({}, file, {
          projectorFile: projector.file,
          projectorBytes: projector.bytes,
          visionCapable: true,
        })
      })
      .sort(sortHuggingFaceFilesBySize)
  }

  function normalizeModel(entry) {
    if (!isPlainObject(entry)) return null
    const path = normalizeString(entry.path)
    if (!path) return null
    const name = normalizeString(entry.name) || basename(path)
    return {
      id: normalizeString(entry.id) || createId("model"),
      name,
      path,
      projectorPath: normalizeString(entry.projectorPath),
      visionCapable: entry.visionCapable === true || Boolean(normalizeString(entry.projectorPath)),
      source: normalizeString(entry.source) || "local",
      bytes: normalizeByteCount(entry.bytes),
      readonly: entry.readonly === true,
      addedAt: normalizeString(entry.addedAt) || new Date().toISOString(),
    }
  }

  function normalizeDownloadExtraFiles(value) {
    if (!Array.isArray(value)) return []
    const seen = new Set()
    return value
      .map((entry) => {
        if (!isPlainObject(entry)) return null
        const file = normalizeString(entry.file)
        if (!file || seen.has(file)) return null
        seen.add(file)
        return {
          file,
          bytes: normalizeByteCount(entry.bytes),
          role: normalizeString(entry.role) || "model",
        }
      })
      .filter(Boolean)
  }

  function normalizeDownload(entry) {
    if (!isPlainObject(entry)) return null
    const repository = normalizeString(entry.repository)
    const file = normalizeString(entry.file)
    if (!repository || !file) return null
    return {
      id: normalizeString(entry.id) || createId("download"),
      repository,
      file,
      projectorFile: normalizeString(entry.projectorFile),
      projectorBytes: normalizeByteCount(entry.projectorBytes),
      extraFiles: normalizeDownloadExtraFiles(entry.extraFiles),
      bytes: normalizeByteCount(entry.bytes, entry.bytesTotal),
      bytesDownloaded: normalizeByteCount(entry.bytesDownloaded, entry.downloadedBytes),
      revision: normalizeString(entry.revision) || "main",
      status: normalizeString(entry.status) || "queued",
      error: normalizeString(entry.error),
      addedAt: normalizeString(entry.addedAt) || new Date().toISOString(),
      startedAt: normalizeString(entry.startedAt),
      updatedAt: normalizeString(entry.updatedAt),
    }
  }

  function normalizeDownloadProgress(entry) {
    if (!isPlainObject(entry)) return null
    return normalizeDownload({
      id: entry.id,
      repository: entry.repository,
      file: entry.file,
      projectorFile: entry.projectorFile,
      projectorBytes: entry.projectorBytes,
      extraFiles: entry.extraFiles,
      revision: entry.revision,
      status: normalizeString(entry.status) || "downloading",
      bytes: normalizeByteCount(entry.bytesTotal, entry.bytes),
      bytesDownloaded: normalizeByteCount(entry.bytesDownloaded),
      error: entry.error,
      addedAt: entry.startedAt || entry.updatedAt,
      startedAt: entry.startedAt,
      updatedAt: entry.updatedAt,
    })
  }

  function storedDownloadFromProgress(progress, rawProgress = null, fallback = null) {
    const normalized = normalizeDownload(progress)
    if (!normalized) return null
    const fallbackDownload = normalizeDownload(fallback) || {}
    const raw = isPlainObject(rawProgress) ? rawProgress : {}
    const model = normalizeModel(raw.model)
    const bytes = normalizeByteCount(
      normalized.bytes,
      raw.bytesTotal,
      fallbackDownload.bytes,
      model?.bytes,
      normalized.bytesDownloaded,
      raw.bytesDownloaded,
    )
    return Object.assign({}, fallbackDownload, normalized, {
      bytes,
      projectorFile: normalized.projectorFile || fallbackDownload.projectorFile || normalizeString(raw.projectorFile),
      projectorBytes: normalizeByteCount(normalized.projectorBytes, fallbackDownload.projectorBytes, raw.projectorBytes),
      extraFiles: normalized.extraFiles.length > 0 ? normalized.extraFiles : fallbackDownload.extraFiles || normalizeDownloadExtraFiles(raw.extraFiles),
      bytesDownloaded: downloadIsTerminal(normalized)
        ? normalizeByteCount(normalized.bytesDownloaded, bytes)
        : normalizeByteCount(normalized.bytesDownloaded),
      error: normalizeString(normalized.error),
    })
  }

  function downloadsMatch(left, right) {
    return normalizeString(left?.id) === normalizeString(right?.id) &&
      normalizeString(left?.repository) === normalizeString(right?.repository) &&
      normalizeString(left?.file) === normalizeString(right?.file) &&
      normalizeString(left?.revision) === normalizeString(right?.revision) &&
      normalizeString(left?.status) === normalizeString(right?.status) &&
      normalizeString(left?.error) === normalizeString(right?.error) &&
      normalizeString(left?.projectorFile) === normalizeString(right?.projectorFile) &&
      JSON.stringify(normalizeDownloadExtraFiles(left?.extraFiles)) === JSON.stringify(normalizeDownloadExtraFiles(right?.extraFiles)) &&
      normalizeByteCount(left?.bytes) === normalizeByteCount(right?.bytes) &&
      normalizeByteCount(left?.projectorBytes) === normalizeByteCount(right?.projectorBytes) &&
      normalizeByteCount(left?.bytesDownloaded) === normalizeByteCount(right?.bytesDownloaded)
  }

  function downloadTotalBytes(download) {
    const extraBytes = Array.isArray(download?.extraFiles)
      ? download.extraFiles.reduce((total, item) => total + normalizeByteCount(item?.bytes), 0)
      : 0
    return normalizeByteCount(download?.bytes) + normalizeByteCount(download?.projectorBytes) + extraBytes
  }

  function upsertStoredDownload(progress, rawProgress = null, fallback = null) {
    const stored = storedDownloadFromProgress(progress, rawProgress, fallback)
    if (!stored || !downloadIsTerminal(stored)) return false
    if (downloadIsComplete(stored)) {
      const previousLength = state.values.downloads.length
      state.values.downloads = state.values.downloads.filter((item) => item.id !== stored.id)
      return state.values.downloads.length !== previousLength
    }
    const previous = state.values.downloads.find((item) => item.id === stored.id)
    if (previous && downloadsMatch(previous, stored)) return false
    state.values.downloads = [
      stored,
    ].concat(state.values.downloads.filter((item) => item.id !== stored.id))
    return true
  }

  function downloadProgressPercent(download) {
    const total = normalizeByteCount(download?.bytes)
    const downloaded = normalizeByteCount(download?.bytesDownloaded)
    if (total <= 0 || downloaded <= 0) return 0
    return Math.max(0, Math.min(100, Math.round((downloaded / total) * 100)))
  }

  function formatDownloadProgress(download) {
    const status = normalizeString(download?.status)
    const total = normalizeByteCount(download?.bytes)
    const downloaded = normalizeByteCount(download?.bytesDownloaded)
    const rate = downloadRateText(download)
    const suffix = rate ? ` - ${rate}` : ""
    if (total > 0 && downloaded > 0) {
      const percent = downloadProgressPercent(download)
      return `${formatBytes(downloaded, { decimals: 1 })} / ${formatBytes(total, { decimals: 1 })} (${percent}%)${suffix}`
    }
    if (downloaded > 0) return `${formatBytes(downloaded, { decimals: 1 })} downloaded${suffix}`
    if (status === "downloading" && total > 0) return `0 B / ${formatBytes(total, { decimals: 1 })} (0%)${suffix}`
    if (status === "downloading") return "Connecting..."
    if (status === "starting") return "Starting..."
    return ""
  }

  function appendDownloadProgress(container, download) {
    const normalized = normalizeDownload(download)
    const progressText = formatDownloadProgress(download)
    if (!progressText) return
    const progress = document.createElement("div")
    progress.className = "llama-progress"
    if (normalized?.id) progress.dataset.llamaDownloadProgressId = normalized.id
    const detail = document.createElement("div")
    detail.className = "llama-card-meta"
    if (normalized?.id) detail.dataset.llamaDownloadProgressTextId = normalized.id
    detail.textContent = progressText
    progress.appendChild(detail)
    if (normalizeString(download?.status) === "downloading" || normalizeString(download?.status) === "starting") {
      const bar = document.createElement("div")
      bar.className = "llama-progress-bar"
      const fill = document.createElement("div")
      fill.className = "llama-progress-fill"
      if (normalized?.id) fill.dataset.llamaDownloadProgressFillId = normalized.id
      fill.style.width = `${downloadProgressPercent(download)}%`
      bar.appendChild(fill)
      progress.appendChild(bar)
    }
    container.appendChild(progress)
  }

  function renderDownloadStatusText() {
    if (!els.hfStatus) return
    const active = activeDownloadItems()
    els.hfStatus.textContent = active.length === 1
      ? `Downloading ${active[0].file}${formatDownloadProgress(active[0]) ? ` - ${formatDownloadProgress(active[0])}` : "..."}`
      : active.length > 1
      ? `Downloading ${active.length} models`
      : state.hf.searching
      ? "Searching Hugging Face..."
      : (state.hf.results.length > 0 ? `${state.hf.results.length} repositories` : "")
  }

  function downloadElementsByData(attribute, id) {
    const downloadId = normalizeString(id)
    if (!downloadId) return []
    return Array.from(document.querySelectorAll(`[${attribute}]`))
      .filter((element) => element instanceof HTMLElement && element.dataset[attribute.replace(/^data-/, "").replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase())] === downloadId)
  }

  function updateDownloadProgressViews(download) {
    const normalized = normalizeDownload(download)
    if (!normalized) return false
    let updated = false
    renderDownloadStatusText()
    const progressText = formatDownloadProgress(normalized)
    const progressPercent = downloadProgressPercent(normalized)
    downloadElementsByData("data-llama-download-id", normalized.id).forEach((button) => {
      if (!(button instanceof HTMLButtonElement)) return
      button.classList.add("is-active")
      button.disabled = true
      button.setAttribute("aria-label", progressPercent > 0
        ? `Downloading ${normalized.file}: ${progressPercent}%`
        : `Downloading ${normalized.file}`)
      button.title = progressPercent > 0 ? `Downloading ${progressPercent}%` : "Downloading"
      updated = true
    })
    downloadElementsByData("data-llama-download-meta-id", normalized.id).forEach((meta) => {
      meta.textContent = [formatBytes(normalized.bytes), normalized.revision, normalized.status, normalized.error]
        .filter(Boolean)
        .join(" - ")
      updated = true
    })
    downloadElementsByData("data-llama-download-progress-text-id", normalized.id).forEach((detail) => {
      detail.textContent = progressText
      updated = true
    })
    downloadElementsByData("data-llama-download-progress-fill-id", normalized.id).forEach((fill) => {
      fill.style.width = `${progressPercent}%`
      updated = true
    })
    return updated
  }

  function normalizeModelOptionEntry(entry) {
    const source = isPlainObject(entry) ? entry : {}
    const options = {}
    const copyInteger = (key, min = 1) => {
      const value = normalizeOptionalInteger(source[key], { min })
      if (value !== null) options[key] = value
    }
    const copyString = (key) => {
      const value = normalizeString(source[key])
      if (value) options[key] = value
    }
    const copyNumber = (key, min = null, max = null) => {
      const value = normalizeOptionalNumber(source[key], { min, max })
      if (value !== null) options[key] = value
    }
    copyInteger("contextSize")
    copyInteger("threads")
    copyInteger("gpuLayers", 0)
    copyInteger("evalBatchSize")
    copyInteger("topK", 0)
    copyInteger("seed", -1)
    copyNumber("topP", 0, 1)
    copyNumber("minP", 0, 1)
    copyNumber("presencePenalty")
    copyNumber("repeatPenalty", 0)
    const offloadKvCache = normalizeBooleanOverride(source.offloadKvCache)
    if (offloadKvCache !== null) options.offloadKvCache = offloadKvCache
    const cacheTypeK = normalizeKvCacheType(source.cacheTypeK)
    const cacheTypeV = normalizeKvCacheType(source.cacheTypeV)
    if (cacheTypeK) options.cacheTypeK = cacheTypeK
    if (cacheTypeV) options.cacheTypeV = cacheTypeV
    copyString("draftModelPath")
    return options
  }

  function normalizeModelOptions(value) {
    if (!isPlainObject(value)) return {}
    const options = {}
    Object.entries(value).forEach(([key, entry]) => {
      const id = normalizeString(key)
      if (!id) return
      const normalized = normalizeModelOptionEntry(entry)
      if (Object.keys(normalized).length > 0) {
        options[id] = normalized
      }
    })
    return options
  }

  function normalizeRuntimeActivity(entry) {
    const source = isPlainObject(entry) ? entry : {}
    const activeSlots = normalizePositiveInteger(source.activeSlots)
    const promptProgress = Number(source.promptProgress)
    const taskIds = Array.isArray(source.taskIds)
      ? source.taskIds.map((value) => Number(value)).filter((value) => Number.isFinite(value))
      : []
    const slotIds = Array.isArray(source.slotIds)
      ? source.slotIds.map((value) => Number(value)).filter((value) => Number.isFinite(value))
      : []
    return {
      active: source.active === true,
      state: normalizeString(source.state) || "idle",
      activeSlots,
      slotIds,
      taskIds,
      promptTokens: normalizeByteCount(source.promptTokens),
      promptProcessedTokens: normalizeByteCount(source.promptProcessedTokens),
      promptProgress: Number.isFinite(promptProgress) ? Math.max(0, Math.min(1, promptProgress)) : 0,
      outputTokens: normalizeByteCount(source.outputTokens),
      outputRemainingTokens: Number.isFinite(Number(source.outputRemainingTokens)) ? Math.floor(Number(source.outputRemainingTokens)) : -1,
      outputTokensPerSecond: Number.isFinite(Number(source.outputTokensPerSecond)) ? Math.max(0, Number(source.outputTokensPerSecond)) : 0,
      updatedAt: normalizeString(source.updatedAt),
    }
  }

  function normalizeRuntime(entry) {
    const source = isPlainObject(entry) ? entry : {}
    return {
      running: source.running === true,
      starting: source.starting === true,
      ready: source.ready === true,
      pid: Number.isFinite(Number(source.pid)) ? Math.max(0, Math.floor(Number(source.pid))) : 0,
      runtimeId: normalizeString(source.runtimeId),
      baseUrl: normalizeString(source.baseUrl),
      modelPath: normalizeString(source.modelPath),
      binaryPath: normalizeString(source.binaryPath),
      binaryAvailable: source.binaryAvailable === true,
      startedAt: normalizeString(source.startedAt),
      lastError: normalizeString(source.lastError),
      stderr: normalizeString(source.stderr),
      activity: normalizeRuntimeActivity(source.activity),
    }
  }

  function runtimeActivitySampleKey(activity) {
    if (!activity || activity.active !== true) return ""
    const taskIds = Array.isArray(activity.taskIds) ? activity.taskIds.filter((id) => Number.isFinite(Number(id)) && Number(id) >= 0) : []
    if (taskIds.length > 0) return `task:${taskIds.join(",")}`
    const slotIds = Array.isArray(activity.slotIds) ? activity.slotIds.filter((id) => Number.isFinite(Number(id)) && Number(id) >= 0) : []
    if (slotIds.length > 0) return `slot:${slotIds.join(",")}`
    return "active"
  }

  function trackRuntimeActivity(runtime) {
    const normalized = normalizeRuntime(runtime)
    const activity = normalized.activity
    const key = runtimeActivitySampleKey(activity)
    if (!key || activity.state !== "generating") {
      state.runtimeActivitySamples = key ? state.runtimeActivitySamples : {}
      return normalized
    }
    const now = Date.now()
    const previous = state.runtimeActivitySamples[key]
    let rate = Number(previous?.rate)
    if (!Number.isFinite(rate) || rate < 0) rate = 0
    if (previous && activity.outputTokens > previous.outputTokens && now > previous.at) {
      const elapsedSeconds = (now - previous.at) / 1000
      const instantRate = elapsedSeconds > 0 ? (activity.outputTokens - previous.outputTokens) / elapsedSeconds : 0
      if (instantRate > 0) {
        rate = rate > 0 ? (rate * 0.65) + (instantRate * 0.35) : instantRate
      }
    }
    activity.outputTokensPerSecond = rate
    state.runtimeActivitySamples = {
      [key]: {
        outputTokens: activity.outputTokens,
        at: now,
        rate,
      },
    }
    return normalized
  }

  function runtimeIsLoading(runtime) {
    return runtime?.running === true && runtime.starting === true && runtime.ready !== true
  }

  function runtimeIsReady(runtime) {
    return runtime?.running === true && (runtime.ready === true || runtime.starting !== true)
  }

  function runtimeActionStartedAt(runtime) {
    const runtimeStartedAt = Date.parse(normalizeString(runtime?.startedAt))
    if (
      Number.isFinite(runtimeStartedAt) &&
      runtimeIsLoading(runtime) &&
      normalizeString(runtime?.modelPath) === normalizeString(state.runtimeModelActionPath)
    ) {
      return runtimeStartedAt
    }
    return state.runtimeModelActionStartedAt
  }

  function runtimeActionElapsedText(runtime) {
    return formatElapsedTime(runtimeActionStartedAt(runtime))
  }

  function compactRuntimeLogLine(line) {
    const text = normalizeString(line).replace(/\s+/g, " ")
    if (!text) return ""
    return text.length > 180 ? `${text.slice(0, 177)}...` : text
  }

  function runtimeStartupLine(runtime) {
    const stderr = normalizeString(runtime?.stderr)
    if (!stderr) return ""
    const lines = stderr.split(/\r?\n/).map(compactRuntimeLogLine).filter(Boolean)
    if (lines.length === 0) return ""
    const importantPatterns = [
      /^(error|fatal)\b/i,
      /\b(out of memory|cuda error|failed|invalid device|cannot allocate)\b/i,
      /^main: server is listening\b/i,
      /^main: model loaded\b/i,
      /^srv\s+load_model:/i,
      /^common_init_from_params:/i,
      /^sched_reserve:/i,
      /^llama_kv_cache:/i,
      /^llama_context:/i,
      /^load_tensors:/i,
      /^llama_prepare_model_devices:/i,
      /^print_info: model /i,
    ]
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index]
      if (importantPatterns.some((pattern) => pattern.test(line))) {
        return line
      }
    }
    return lines[lines.length - 1]
  }

  function runtimeLoadStatusText(runtime) {
    if (runtimeIsReady(runtime)) return "Model loaded."
    const elapsed = runtimeActionElapsedText(runtime)
    const line = runtimeStartupLine(runtime)
    const prefix = elapsed ? `Loading model (${elapsed})` : "Loading model"
    return line ? `${prefix} - ${line}` : `${prefix} - waiting for llama.cpp to report readiness`
  }

  function parseRuntimeMemorySize(amount, unit) {
    const value = Number(amount)
    if (!Number.isFinite(value) || value <= 0) return 0
    const normalizedUnit = normalizeString(unit).toLowerCase()
    const binary = normalizedUnit.includes("i")
    const base = binary ? 1024 : 1000
    switch (normalizedUnit.replace("i", "")) {
      case "b":
        return Math.round(value)
      case "kb":
        return Math.round(value * base)
      case "mb":
        return Math.round(value * base * base)
      case "gb":
        return Math.round(value * base * base * base)
      case "tb":
        return Math.round(value * base * base * base * base)
      default:
        return 0
    }
  }

  function categorizeRuntimeMemoryLine(line) {
    const text = normalizeString(line).toLowerCase()
    if (text.includes("kv self size") || text.includes("kv buffer size")) return "kv"
    if (text.includes("model buffer size")) return "model"
    if (text.includes("compute buffer size")) return "compute"
    if (text.includes("output buffer size")) return "output"
    return "other"
  }

  function runtimeMemorySummary(runtime) {
    const stderr = normalizeString(runtime?.stderr)
    if (!stderr) return null
    const totals = {
      model: 0,
      kv: 0,
      compute: 0,
      output: 0,
      other: 0,
    }
    const entries = []
    const seen = new Set()
    let kvSelfBytes = 0
    stderr.split(/\r?\n/).forEach((rawLine) => {
      const line = compactRuntimeLogLine(rawLine)
      if (!line) return
      const kvSelfMatch = /\bKV self size\s*=\s*([0-9]+(?:\.[0-9]+)?)\s*([KMGT]i?B|B)\b/i.exec(line)
      if (kvSelfMatch) {
        kvSelfBytes = Math.max(kvSelfBytes, parseRuntimeMemorySize(kvSelfMatch[1], kvSelfMatch[2]))
      }
      const bufferMatch = /\b(?:buffer|cache)\s+size\s*=\s*([0-9]+(?:\.[0-9]+)?)\s*([KMGT]i?B|B)\b/i.exec(line)
      if (!bufferMatch) return
      const bytes = parseRuntimeMemorySize(bufferMatch[1], bufferMatch[2])
      if (bytes <= 0) return
      const category = categorizeRuntimeMemoryLine(line)
      const key = `${category}:${line}`
      if (seen.has(key)) return
      seen.add(key)
      totals[category] += bytes
      entries.push({ category, bytes, line })
    })
    if (totals.kv <= 0 && kvSelfBytes > 0) {
      totals.kv = kvSelfBytes
      entries.push({ category: "kv", bytes: kvSelfBytes, line: "KV self size" })
    }
    const total = Object.values(totals).reduce((sum, value) => sum + value, 0)
    if (total <= 0) return null
    return Object.assign({ total, entries }, totals)
  }

  function formatRuntimeMemorySummary(summary) {
    if (!summary || summary.total <= 0) return ""
    const parts = []
    if (summary.model > 0) parts.push(`model ${formatShortBytes(summary.model)}`)
    if (summary.kv > 0) parts.push(`KV ${formatShortBytes(summary.kv)}`)
    if (summary.compute > 0) parts.push(`compute ${formatShortBytes(summary.compute)}`)
    if (summary.output > 0) parts.push(`output ${formatShortBytes(summary.output)}`)
    if (summary.other > 0) parts.push(`other ${formatShortBytes(summary.other)}`)
    return `Runtime memory ${formatShortBytes(summary.total)}${parts.length > 0 ? ` (${parts.join(", ")})` : ""}`
  }

  function runtimeMemorySummaryTitle(summary) {
    if (!summary || !Array.isArray(summary.entries) || summary.entries.length === 0) return ""
    return summary.entries
      .map((entry) => `${entry.category}: ${formatBytes(entry.bytes)} - ${entry.line}`)
      .join("\n")
  }

  function runtimeActivityForModel(runtime, model) {
    const normalizedRuntime = runtime || normalizeRuntime(null)
    const normalizedModel = normalizeModel(model)
    if (!normalizedRuntime.running || !normalizedModel) return null
    if (normalizeString(normalizedRuntime.modelPath) !== normalizeString(normalizedModel.path)) return null
    return normalizedRuntime.activity || normalizeRuntimeActivity(null)
  }

  function formatTokenRate(value) {
    const rate = Number(value)
    if (!Number.isFinite(rate) || rate <= 0) return ""
    const rounded = rate >= 10 ? Math.round(rate) : Math.round(rate * 10) / 10
    return `${rounded} tok/s`
  }

  function runtimeActivityProgress(activity) {
    if (!activity || activity.active !== true) return 0
    if (activity.state === "processing_prompt") {
      if (activity.promptProgress > 0) return activity.promptProgress
      if (activity.promptTokens > 0 && activity.promptProcessedTokens > 0) {
        return Math.max(0, Math.min(1, activity.promptProcessedTokens / activity.promptTokens))
      }
    }
    if (activity.state === "generating" && activity.outputRemainingTokens >= 0) {
      const total = activity.outputTokens + activity.outputRemainingTokens
      if (total > 0) return Math.max(0, Math.min(1, activity.outputTokens / total))
    }
    return 0
  }

  function formatRuntimeActivity(activity) {
    const normalized = normalizeRuntimeActivity(activity)
    if (!normalized.active) return "Idle"
    const prefix = normalized.activeSlots > 1 ? `${normalized.activeSlots} slots - ` : ""
    if (normalized.state === "processing_prompt") {
      const progress = runtimeActivityProgress(normalized)
      if (normalized.promptTokens > 0 && normalized.promptProcessedTokens > 0) {
        return `${prefix}Processing prompt ${Math.round(progress * 100)}% (${formatCount(normalized.promptProcessedTokens)} / ${formatCount(normalized.promptTokens)} tokens)`
      }
      return `${prefix}Processing prompt`
    }
    if (normalized.state === "generating") {
      const rate = formatTokenRate(normalized.outputTokensPerSecond)
      const suffix = rate ? ` at ${rate}` : ""
      if (normalized.outputRemainingTokens >= 0) {
        const total = normalized.outputTokens + normalized.outputRemainingTokens
        const percent = total > 0 ? ` ${Math.round(runtimeActivityProgress(normalized) * 100)}%` : ""
        return `${prefix}Generating output${percent} (${formatCount(normalized.outputTokens)} / ${formatCount(total)} tokens)${suffix}`
      }
      return `${prefix}Generating output - ${formatCount(normalized.outputTokens)} tokens${suffix}`
    }
    if (normalized.state === "starting_generation") {
      return `${prefix}Starting generation`
    }
    return `${prefix}Processing request`
  }

  function runtimeActivityTitle(activity) {
    const normalized = normalizeRuntimeActivity(activity)
    if (!normalized.active) return "The loaded model is idle."
    const parts = [formatRuntimeActivity(normalized)]
    if (normalized.taskIds.length > 0) parts.push(`Tasks: ${normalized.taskIds.join(", ")}`)
    if (normalized.slotIds.length > 0) parts.push(`Slots: ${normalized.slotIds.join(", ")}`)
    return parts.join("\n")
  }

  function updateRuntimeActivityElement(element, activity) {
    if (!(element instanceof HTMLElement)) return false
    const normalized = normalizeRuntimeActivity(activity)
    const text = element.querySelector("[data-llama-runtime-activity-text]")
    const bar = element.querySelector("[data-llama-runtime-activity-bar]")
    const fill = element.querySelector("[data-llama-runtime-activity-fill]")
    if (text) text.textContent = formatRuntimeActivity(normalized)
    element.title = runtimeActivityTitle(normalized)
    element.classList.toggle("is-active", normalized.active)
    element.classList.toggle("is-idle", !normalized.active)
    const progress = runtimeActivityProgress(normalized)
    if (bar instanceof HTMLElement) {
      bar.hidden = progress <= 0
    }
    if (fill instanceof HTMLElement) {
      fill.style.width = `${Math.round(progress * 100)}%`
    }
    return true
  }

  function createRuntimeActivityElement(runtime, model) {
    const activity = runtimeActivityForModel(runtime, model)
    if (!activity) return null
    const element = document.createElement("div")
    element.className = "llama-model-activity"
    element.dataset.llamaRuntimeActivityPath = normalizeString(model?.path)
    const text = document.createElement("span")
    text.className = "llama-model-activity-text"
    text.dataset.llamaRuntimeActivityText = "true"
    const bar = document.createElement("div")
    bar.className = "llama-model-activity-bar"
    bar.dataset.llamaRuntimeActivityBar = "true"
    const fill = document.createElement("div")
    fill.className = "llama-model-activity-fill"
    fill.dataset.llamaRuntimeActivityFill = "true"
    bar.appendChild(fill)
    element.append(text, bar)
    updateRuntimeActivityElement(element, activity)
    return element
  }

  function updateRuntimeModelActivityViews() {
    const runtime = state.runtime || normalizeRuntime(null)
    const activity = runtime.activity || normalizeRuntimeActivity(null)
    let updated = false
    document.querySelectorAll("[data-llama-runtime-activity-path]").forEach((element) => {
      if (!(element instanceof HTMLElement)) return
      if (normalizeString(element.dataset.llamaRuntimeActivityPath) !== normalizeString(runtime.modelPath)) {
        element.remove()
        return
      }
      if (updateRuntimeActivityElement(element, activity)) {
        updated = true
      }
    })
    return updated
  }

  function runtimeModelListCanBePreserved(previous, next) {
    const left = previous || normalizeRuntime(null)
    const right = next || normalizeRuntime(null)
    if (state.runtimeModelAction) return false
    return left.running === right.running &&
      left.ready === right.ready &&
      left.starting === right.starting &&
      left.pid === right.pid &&
      normalizeString(left.modelPath) === normalizeString(right.modelPath)
  }

  function shouldUpdateRuntimeLoadMessage(runtime, token) {
    return state.downloading === true &&
      state.runtimeModelAction === "load" &&
      state.runtimeModelActionToken > 0 &&
      state.runtimeModelActionToken === token &&
      !runtimeIsReady(runtime)
  }

  function runtimeMatchesActiveLoad(runtime) {
    return state.runtimeModelAction === "load" &&
      normalizeString(runtime?.modelPath) === normalizeString(state.runtimeModelActionPath)
  }

  function completeRuntimeLoadAction(token, message) {
    if (token > 0 && state.runtimeModelActionToken !== token) return false
    stopRuntimeLoadStatusPolling(token)
    state.downloading = false
    state.runtimeModelAction = ""
    state.runtimeModelActionPath = ""
    state.runtimeModelActionStartedAt = 0
    state.runtimeModelActionToken = 0
    render()
    if (message) {
      setMessage(message)
    }
    return true
  }

  function normalizeRuntimePack(entry) {
    if (!isPlainObject(entry)) return null
    const id = normalizeString(entry.id)
    if (!id) return null
    return {
      id,
      name: normalizeString(entry.name) || id,
      description: normalizeString(entry.description),
      type: normalizeString(entry.type) || "GGUF",
      variant: normalizeString(entry.variant),
      platform: normalizeString(entry.platform),
      version: normalizeString(entry.version),
      installedVersion: normalizeString(entry.installedVersion),
      installed: entry.installed === true,
      selected: entry.selected === true,
      compatible: entry.compatible !== false,
      latest: entry.latest === true,
      installable: entry.installable === true,
      removable: entry.removable === true,
      binaryPath: normalizeString(entry.binaryPath),
      assets: Array.isArray(entry.assets) ? entry.assets : [],
    }
  }

  function normalizeHardware(entry) {
    const source = isPlainObject(entry) ? entry : {}
    const cpu = isPlainObject(source.cpu) ? source.cpu : {}
    const memory = isPlainObject(source.memory) ? source.memory : {}
    const gpus = Array.isArray(source.gpus)
      ? source.gpus
        .filter((gpu) => isPlainObject(gpu))
        .map((gpu) => ({
          id: normalizeString(gpu.id),
          deviceIndex: normalizeString(gpu.deviceIndex),
          name: normalizeString(gpu.name),
          backend: normalizeString(gpu.backend),
          vramBytes: Number.isFinite(Number(gpu.vramBytes)) ? Math.max(0, Math.floor(Number(gpu.vramBytes))) : 0,
        }))
        .filter((gpu) => gpu.id || gpu.name)
      : []
    return {
      cpu: {
        name: normalizeString(cpu.name),
        architecture: normalizeString(cpu.architecture),
        cores: Number.isFinite(Number(cpu.cores)) ? Math.max(0, Math.floor(Number(cpu.cores))) : 0,
        features: normalizeStringList(cpu.features),
      },
      memory: {
        ramBytes: Number.isFinite(Number(memory.ramBytes)) ? Math.max(0, Math.floor(Number(memory.ramBytes))) : 0,
      },
      gpus,
    }
  }

  function normalizeValues(values) {
    const source = isPlainObject(values) ? values : {}
    return {
      modelRoot: normalizeString(source.modelRoot),
      models: Array.isArray(source.models) ? source.models.map(normalizeModel).filter(Boolean) : [],
      modelOptions: normalizeModelOptions(source.modelOptions),
      downloads: Array.isArray(source.downloads)
        ? source.downloads.map(normalizeDownload).filter((download) => download && !downloadIsComplete(download))
        : [],
      runtimeId: normalizeString(source.runtimeId),
      gpuStrategy: normalizeGpuStrategy(source.gpuStrategy),
      enabledGpuIds: normalizeStringList(source.enabledGpuIds),
      limitDedicatedGpuMemory: source.limitDedicatedGpuMemory !== false,
      offloadKvCache: source.offloadKvCache !== false,
      modelGuardrail: normalizeGuardrail(source.modelGuardrail),
    }
  }

  function setMessage(message) {
    if (els.message) {
      els.message.textContent = normalizeString(message)
    }
  }

  function errorMessage(error, fallback) {
    return normalizeString(error instanceof Error ? error.message : "") || fallback
  }

  function addSetupError(options, label, error, fallback) {
    if (!Array.isArray(options?.setupErrors)) return
    const message = errorMessage(error, fallback)
    if (!message) return
    options.setupErrors.push({
      label: normalizeString(label),
      message,
    })
  }

  function setupErrorSummary(errors) {
    const seen = new Set()
    const items = []
    const sourceErrors = Array.isArray(errors) ? errors : []
    sourceErrors.forEach((entry) => {
      const message = normalizeString(entry?.message)
      if (!message || seen.has(message)) return
      seen.add(message)
      items.push({
        label: normalizeString(entry?.label),
        message,
      })
    })
    if (items.length === 0) return ""
    if (items.length === 1) return `Llama setup failed: ${items[0].message}`
    const first = items[0]
    return `Llama setup failed: ${first.label ? `${first.label}: ` : ""}${first.message}`
  }

  function renderEmpty(container, text) {
    if (!(container instanceof HTMLElement)) return
    const empty = document.createElement("div")
    empty.className = "llama-empty"
    empty.textContent = text
    container.appendChild(empty)
  }

  function modelListHasInteractiveFocus() {
    const active = document.activeElement
    return active instanceof HTMLElement &&
      els.modelList instanceof HTMLElement &&
      els.modelList.contains(active) &&
      Boolean(active.closest("input, select, textarea, button"))
  }

  function modelOptionsKey(model) {
    const normalized = normalizeModel(model)
    if (!normalized) return ""
    return normalized.id || normalized.path
  }

  function modelPathKey(model) {
    const normalized = normalizeModel(model)
    if (!normalized) return ""
    return normalized.path || normalized.id
  }

  function removeModelLocalSettings(model) {
    const normalized = normalizeModel(model)
    if (!normalized) return
    const modelKeys = new Set([
      modelOptionsKey(normalized),
      normalized.id,
      normalized.path,
    ].map(normalizeModelLookupKey).filter(Boolean))
    const options = {}
    Object.entries(state.values.modelOptions || {}).forEach(([key, value]) => {
      if (modelKeys.has(normalizeModelLookupKey(key))) return
      options[key] = value
    })
    state.values.modelOptions = options
    state.values.downloads = state.values.downloads.filter((download) => {
      const key = huggingFaceModelKey(download.repository, download.file)
      return !key || !modelKeys.has(key)
    })
    state.expandedModels.delete(modelOptionsKey(normalized))
  }

  function modelOptionsForModel(model) {
    const key = modelOptionsKey(model)
    if (!key) return {}
    return normalizeModelOptionEntry(state.values.modelOptions?.[key])
  }

  function modelOptionDefaultText(optionKey) {
    switch (optionKey) {
      case "contextSize":
        return "Model default"
      case "threads":
      case "gpuLayers":
        return "Auto"
      case "evalBatchSize":
        return "512"
      case "offloadKvCache":
        return state.values.offloadKvCache === false ? "Off" : "On"
      case "seed":
        return "Random"
      case "topK":
        return "40"
      case "topP":
        return "0.95"
      case "minP":
        return "0.05"
      case "presencePenalty":
        return "0"
      case "repeatPenalty":
        return "1"
      case "cacheTypeK":
      case "cacheTypeV":
        return "f16"
      case "draftModelPath":
        return "None"
      default:
        return "Default"
    }
  }

  function modelOptionHasOverride(options, optionKey) {
    return Object.prototype.hasOwnProperty.call(options || {}, optionKey)
  }

  function setModelOption(model, optionKey, value) {
    const modelKey = modelOptionsKey(model)
    if (!modelKey) return
    const nextOptions = Object.assign({}, normalizeModelOptionEntry(state.values.modelOptions?.[modelKey]))
    const normalized = normalizeModelOptionEntry({ [optionKey]: value })
    if (Object.prototype.hasOwnProperty.call(normalized, optionKey)) {
      nextOptions[optionKey] = normalized[optionKey]
    } else {
      delete nextOptions[optionKey]
    }
    const allOptions = Object.assign({}, state.values.modelOptions || {})
    if (Object.keys(nextOptions).length > 0) {
      allOptions[modelKey] = nextOptions
    } else {
      delete allOptions[modelKey]
    }
    state.values.modelOptions = allOptions
  }

  function resetModelOption(model, optionKey) {
    setModelOption(model, optionKey, "")
  }

  function createModelOptionHeader(model, options, optionKey, label) {
    const header = document.createElement("div")
    header.className = "llama-field-header"
    const labelText = document.createElement("span")
    labelText.textContent = label
    header.appendChild(labelText)
    if (!modelOptionHasOverride(options, optionKey)) {
      return header
    }
    const reset = document.createElement("button")
    reset.className = "llama-reset-button"
    reset.type = "button"
    reset.title = `Reset to ${modelOptionDefaultText(optionKey)}`
    reset.setAttribute("aria-label", `Reset ${label}`)
    reset.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M10 11v6M14 11v6M6 6l1 14h10l1-14" /></svg>'
    reset.addEventListener("click", (event) => {
      event.preventDefault()
      event.stopPropagation()
      resetModelOption(model, optionKey)
      void saveAndRender()
    })
    header.appendChild(reset)
    return header
  }

  function createModelOptionField(model, options, optionKey, label, placeholder) {
    const field = document.createElement("label")
    field.className = "llama-field"
    const labelText = document.createElement("span")
    labelText.textContent = label
    const input = document.createElement("input")
    input.type = "number"
    input.min = "1"
    input.step = "1"
    input.placeholder = placeholder
    input.value = options[optionKey] > 0 ? String(options[optionKey]) : ""
    input.addEventListener("change", () => {
      setModelOption(model, optionKey, input.value)
      void saveAndRender("Model options saved.")
    })
    field.append(labelText, input)
    return field
  }

  function createNumberModelOptionField(model, options, optionKey, label, placeholder, config = {}) {
    const field = document.createElement("div")
    field.className = "llama-field"
    const input = document.createElement("input")
    input.type = "number"
    input.setAttribute("aria-label", label)
    if (config.min !== undefined) input.min = String(config.min)
    if (config.max !== undefined) input.max = String(config.max)
    input.step = config.step || "1"
    input.placeholder = placeholder || modelOptionDefaultText(optionKey)
    input.value = options[optionKey] !== undefined && options[optionKey] !== null ? String(options[optionKey]) : ""
    input.addEventListener("change", () => {
      setModelOption(model, optionKey, input.value)
      void saveAndRender("Model options saved.")
    })
    field.append(createModelOptionHeader(model, options, optionKey, label), input)
    return field
  }

  function createSelectModelOptionField(model, options, optionKey, label, choices) {
    const field = document.createElement("div")
    field.className = "llama-field"
    const select = document.createElement("select")
    select.setAttribute("aria-label", label)
    choices.forEach((choice) => {
      const option = document.createElement("option")
      option.value = choice.value
      option.textContent = choice.value === ""
        ? `Default (${modelOptionDefaultText(optionKey)})`
        : choice.label
      select.appendChild(option)
    })
    const value = options[optionKey]
    select.value = value === true ? "on" : value === false ? "off" : normalizeString(value)
    select.addEventListener("change", () => {
      setModelOption(model, optionKey, select.value)
      void saveAndRender("Model options saved.")
    })
    field.append(createModelOptionHeader(model, options, optionKey, label), select)
    return field
  }

  function createDraftModelOptionField(model, options) {
    const current = normalizeModel(model)
    const currentKeys = new Set([
      normalizeModelLookupKey(current?.id),
      normalizeModelLookupKey(current?.path),
    ].filter(Boolean))
    const choices = [{ value: "", label: "None" }]
    state.backendModels.forEach((entry) => {
      const candidate = normalizeModel(entry)
      if (!candidate) return
      const value = normalizeString(candidate.id) || normalizeString(candidate.path)
      if (!value || currentKeys.has(normalizeModelLookupKey(value))) return
      choices.push({
        value,
        label: candidate.name ? `${candidate.name} (${value})` : value,
      })
    })
    const selected = normalizeString(options.draftModelPath)
    if (selected && !choices.some((choice) => choice.value === selected)) {
      choices.push({ value: selected, label: `Missing: ${selected}` })
    }
    return createSelectModelOptionField(model, options, "draftModelPath", "Draft Model", choices)
  }

  function createModelOptionGrid(children) {
    const grid = document.createElement("div")
    grid.className = "llama-model-option-grid"
    children.forEach((child) => grid.appendChild(child))
    return grid
  }

  function renderLocalModels() {
    if (!els.modelList) return
    els.modelList.replaceChildren()
    if (!state.backendAvailable) {
      renderEmpty(els.modelList, "Model management is unavailable.")
      return
    }
    if (state.backendModels.length === 0) {
      if (activeDownloadItems().length === 0) {
        renderEmpty(els.modelList, "No downloaded models.")
      }
      return
    }
    const runtime = state.runtime || normalizeRuntime(null)
    state.backendModels.forEach((model) => {
      const modelKey = modelOptionsKey(model)
      const isExpanded = Boolean(modelKey && state.expandedModels.has(modelKey))
      const card = document.createElement("article")
      card.className = `llama-model-row${isExpanded ? " is-expanded" : ""}`
      const row = document.createElement("div")
      row.className = "llama-model-row-header"
      const main = document.createElement("button")
      main.className = "llama-model-row-main"
      main.type = "button"
      main.setAttribute("aria-expanded", isExpanded ? "true" : "false")
      const chevron = document.createElement("span")
      chevron.className = "llama-model-chevron"
      chevron.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>'
      const body = document.createElement("div")
      body.className = "llama-runtime-card-main"
      const title = document.createElement("div")
      title.className = "llama-card-title"
      title.append(document.createTextNode(model.name || basename(model.path)))
      if (model.visionCapable) {
        title.appendChild(createVisionIcon())
      }
      const isCurrentModel = runtime.running && runtime.modelPath === model.path
      const isStarting = isCurrentModel && runtimeIsLoading(runtime)
      const isRunning = isCurrentModel && runtimeIsReady(runtime)
      const isRuntimeAction = state.runtimeModelActionPath === model.path
      const isLoading = isRuntimeAction && state.runtimeModelAction === "load" && !isRunning
      const isUnloading = isRuntimeAction && state.runtimeModelAction === "unload"
      const modelRemoveKey = modelPathKey(model)
      const isRemoving = Boolean(modelRemoveKey && state.removingModels.has(modelRemoveKey))
      const metaParts = []
      if (model.id) metaParts.push(model.id)
      const size = formatBytes(model.bytes)
      if (size) metaParts.push(size)
      const meta = document.createElement("span")
      meta.className = "llama-card-meta"
      meta.textContent = metaParts.join(" - ")
      body.append(title, meta)
      if (isRunning) {
        const activity = createRuntimeActivityElement(runtime, model)
        if (activity) {
          body.appendChild(activity)
        }
        const memorySummary = runtimeMemorySummary(runtime)
        const memoryText = formatRuntimeMemorySummary(memorySummary)
        if (memoryText) {
          const memory = document.createElement("div")
          memory.className = "llama-card-meta llama-model-memory"
          memory.textContent = memoryText
          const memoryTitle = runtimeMemorySummaryTitle(memorySummary)
          if (memoryTitle) memory.title = memoryTitle
          body.appendChild(memory)
        }
      }
      main.append(chevron, body)
      main.addEventListener("click", () => {
        if (!modelKey) return
        if (state.expandedModels.has(modelKey)) {
          state.expandedModels.delete(modelKey)
        } else {
          state.expandedModels.add(modelKey)
        }
        render()
      })
      const start = document.createElement("button")
      start.className = "llama-button"
      start.type = "button"
      const loadingElapsed = runtimeActionElapsedText(runtime)
      start.textContent = isLoading || isStarting
        ? (loadingElapsed ? `Loading ${loadingElapsed}` : "Loading...")
        : isUnloading
        ? "Unloading..."
        : isRunning
        ? "Unload"
        : "Load"
      start.disabled = state.downloading || !state.backendAvailable || isRemoving
      start.addEventListener("click", () => {
        if (isCurrentModel) {
          void stopRuntime(model)
        } else {
          void startRuntime(model)
        }
      })
      const remove = document.createElement("button")
      remove.className = "llama-button danger"
      remove.type = "button"
      remove.textContent = isRemoving ? "Removing..." : "Remove"
      remove.disabled = state.downloading || !state.backendAvailable || isCurrentModel || isRemoving
      remove.title = isCurrentModel ? "Unload the model before removing it." : "Remove model file"
      remove.addEventListener("click", () => {
        void removeLocalModel(model)
      })
      const actions = document.createElement("div")
      actions.className = "llama-model-row-actions"
      actions.append(start, remove)
      row.append(main, actions)
      card.appendChild(row)
      if (isExpanded) {
        const options = modelOptionsForModel(model)
        const optionFields = document.createElement("div")
        optionFields.className = "llama-model-options"
        optionFields.append(
          createModelOptionGrid([
            createNumberModelOptionField(model, options, "contextSize", "Context Length", modelOptionDefaultText("contextSize"), { min: 1 }),
            createDraftModelOptionField(model, options),
            createNumberModelOptionField(model, options, "gpuLayers", "GPU Layers", modelOptionDefaultText("gpuLayers"), { min: 0 }),
            createNumberModelOptionField(model, options, "threads", "Threads", modelOptionDefaultText("threads"), { min: 1 }),
            createNumberModelOptionField(model, options, "evalBatchSize", "Evaluation Batch Size", modelOptionDefaultText("evalBatchSize"), { min: 1 }),
            createSelectModelOptionField(model, options, "offloadKvCache", "GPU KV Cache", [
              { value: "", label: "Default" },
              { value: "on", label: "On" },
              { value: "off", label: "Off" },
            ]),
            createNumberModelOptionField(model, options, "seed", "Seed", modelOptionDefaultText("seed"), { min: -1 }),
            createNumberModelOptionField(model, options, "topK", "Top K Sampling", modelOptionDefaultText("topK"), { min: 0 }),
            createNumberModelOptionField(model, options, "topP", "Top P Sampling", modelOptionDefaultText("topP"), { min: 0, max: 1, step: "0.01" }),
            createNumberModelOptionField(model, options, "minP", "Min P Sampling", modelOptionDefaultText("minP"), { min: 0, max: 1, step: "0.01" }),
            createNumberModelOptionField(model, options, "presencePenalty", "Presence Penalty", modelOptionDefaultText("presencePenalty"), { step: "0.01" }),
            createNumberModelOptionField(model, options, "repeatPenalty", "Repeat Penalty", modelOptionDefaultText("repeatPenalty"), { min: 0, step: "0.01" }),
            createSelectModelOptionField(model, options, "cacheTypeK", "K Cache Type", [
              { value: "", label: "Default" },
              { value: "f32", label: "f32" },
              { value: "f16", label: "f16" },
              { value: "bf16", label: "bf16" },
              { value: "q8_0", label: "q8_0" },
              { value: "q4_0", label: "q4_0" },
              { value: "q4_1", label: "q4_1" },
              { value: "iq4_nl", label: "iq4_nl" },
              { value: "q5_0", label: "q5_0" },
              { value: "q5_1", label: "q5_1" },
            ]),
            createSelectModelOptionField(model, options, "cacheTypeV", "V Cache Type", [
              { value: "", label: "Default" },
              { value: "f32", label: "f32" },
              { value: "f16", label: "f16" },
              { value: "bf16", label: "bf16" },
              { value: "q8_0", label: "q8_0" },
              { value: "q4_0", label: "q4_0" },
              { value: "q4_1", label: "q4_1" },
              { value: "iq4_nl", label: "iq4_nl" },
              { value: "q5_0", label: "q5_0" },
              { value: "q5_1", label: "q5_1" },
            ]),
          ])
        )
        card.appendChild(optionFields)
      }
      els.modelList.appendChild(card)
    })
  }

  function renderHuggingFaceResults() {
    if (!els.hfResultsList) return
    els.hfResultsList.replaceChildren()
    const networkAvailable = Boolean(window.anthoriExtension?.network?.fetch)
    if (!networkAvailable) {
      renderEmpty(els.hfResultsList, "Online model browsing is unavailable.")
      return
    }
    if (state.hf.searching) {
      renderEmpty(els.hfResultsList, "Searching...")
      return
    }
    if (state.hf.error) {
      renderEmpty(els.hfResultsList, state.hf.error)
      return
    }
    if (!normalizeString(state.hf.query)) {
      return
    }
    if (state.hf.results.length === 0) {
      renderEmpty(els.hfResultsList, "No model search results.")
      return
    }
    state.hf.results.forEach((model) => {
      const card = document.createElement("article")
      const isExpanded = state.expandedHuggingFaceRepositories.has(model.repository)
      card.className = `llama-model-row${isExpanded ? " is-expanded" : ""}`
      const row = document.createElement("div")
      row.className = "llama-model-row-header"
      const main = document.createElement("button")
      main.className = "llama-model-row-main"
      main.type = "button"
      main.setAttribute("aria-expanded", isExpanded ? "true" : "false")
      const chevron = document.createElement("span")
      chevron.className = "llama-model-chevron"
      chevron.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>'
      const body = document.createElement("div")
      body.className = "llama-runtime-card-main"
      const title = document.createElement("div")
      title.className = "llama-card-title"
      title.textContent = model.repository
      const isLoading = state.hf.loadingRepository === model.repository
      const files = Array.isArray(state.hf.filesByRepository[model.repository])
        ? state.hf.filesByRepository[model.repository]
        : null
      const metaParts = []
      const downloads = formatCount(model.downloads)
      const likes = formatCount(model.likes)
      if (downloads) metaParts.push(`${downloads} downloads`)
      if (likes) metaParts.push(`${likes} likes`)
      const visibleTags = model.tags.filter((tag) => tag !== "gguf").slice(0, 4)
      if (visibleTags.length > 0) metaParts.push(visibleTags.join(", "))
      const meta = document.createElement("div")
      meta.className = "llama-card-meta"
      meta.textContent = isLoading ? "Loading files..." : metaParts.join(" - ")
      body.append(title, meta)
      main.append(chevron, body)
      main.addEventListener("click", () => {
        if (state.expandedHuggingFaceRepositories.has(model.repository)) {
          state.expandedHuggingFaceRepositories.delete(model.repository)
          render()
          return
        }
        state.expandedHuggingFaceRepositories.add(model.repository)
        render()
        if (!files && !isLoading) {
          void loadHuggingFaceFiles(model.repository)
        }
      })
      row.appendChild(main)
      card.appendChild(row)
      if (isExpanded) {
        const list = document.createElement("div")
        list.className = "llama-file-list"
        if (isLoading && !files) {
          renderEmpty(list, "Loading files...")
        } else if (!files) {
          renderEmpty(list, "Files unavailable.")
        } else if (files.length === 0) {
          renderEmpty(list, "No GGUF files found.")
        } else {
          files.forEach((file) => {
            const activeDownload = activeDownloadFor(model.repository, file.file)
            const isActiveDownload = Boolean(activeDownload)
            const isDownloaded = isDownloadedHuggingFaceEntry(model.repository, file)
            const fileRow = document.createElement("div")
            fileRow.className = "llama-file-row"
            const main = document.createElement("div")
            main.className = "llama-file-main"
            const name = document.createElement("div")
            name.className = "llama-file-name"
            const totalBytes = downloadTotalBytes(file) || normalizeByteCount(file.bytes)
            const size = formatBytes(totalBytes)
            name.append(document.createTextNode(file.file))
            if (file.visionCapable) {
              name.appendChild(createVisionIcon("Vision-capable model; downloads the projector file too."))
            }
            const meta = document.createElement("div")
            meta.className = "llama-file-meta"
            const sizeText = document.createElement("span")
            sizeText.textContent = size || "Size unavailable"
            applyFitStyle(sizeText, totalBytes)
            meta.appendChild(sizeText)
            if (Number(file.splitFileCount) > 1) {
              const splitText = document.createElement("span")
              splitText.textContent = `${file.splitFileCount} split files`
              meta.appendChild(splitText)
            }
            main.append(name, meta)
            const download = document.createElement("button")
            download.className = "llama-icon-button llama-file-download"
            download.classList.toggle("is-active", isActiveDownload)
            download.type = "button"
            if (activeDownload?.id) download.dataset.llamaDownloadId = activeDownload.id
            const progress = downloadProgressPercent(activeDownload)
            download.setAttribute("aria-label", isActiveDownload
              ? (progress > 0 ? `Downloading ${file.file}: ${progress}%` : `Downloading ${file.file}`)
              : isDownloaded
              ? `${file.file} downloaded`
              : `Download ${file.file}`)
            download.title = isActiveDownload
              ? (progress > 0 ? `Downloading ${progress}%` : "Downloading")
              : isDownloaded
              ? "Downloaded"
              : "Download"
            if (isActiveDownload) {
              setIconButtonSpinner(download)
            } else {
              setIconButtonSvg(download, isDownloaded
                ? "M20 6 9 17l-5-5"
                : ["M12 3v12", "M7 10l5 5 5-5", "M5 21h14"])
            }
            download.disabled = state.hf.searching || !state.backendAvailable || isActiveDownload || isDownloaded
            download.addEventListener("click", () => {
              void downloadHuggingFaceModel({
                repository: model.repository,
                file: file.file,
                projectorFile: file.projectorFile,
                projectorBytes: file.projectorBytes,
                extraFiles: file.extraFiles,
                bytes: file.bytes,
                revision: "main",
              })
            })
            fileRow.append(main, download)
            list.appendChild(fileRow)
          })
        }
        card.appendChild(list)
      }
      els.hfResultsList.appendChild(card)
    })
  }

  function renderDownloads() {
    if (!els.downloadsList) return
    const active = activeDownloadItems()
    const activeIds = new Set(active.map((download) => download.id))
    const downloads = active.concat(state.values.downloads.filter((download) => !activeIds.has(download.id) && !downloadIsComplete(download)))
    els.downloadsList.replaceChildren()
    if (downloads.length === 0) {
      if (els.downloadsSection) els.downloadsSection.hidden = true
      return
    }
    if (els.downloadsSection) els.downloadsSection.hidden = false
    downloads.forEach((download) => {
      const isActiveDownload = activeIds.has(download.id)
      const isCanceling = state.cancelingDownloads.has(download.id)
      const isRemoving = state.removingDownloads.has(download.id)
      const card = document.createElement("article")
      card.className = "llama-card"
      if (download.id) card.dataset.llamaDownloadCardId = download.id
      const row = document.createElement("div")
      row.className = "llama-row"
      const title = document.createElement("div")
      title.className = "llama-card-title"
      title.textContent = `${download.repository}/${download.file}`
      const remove = document.createElement("button")
      remove.className = "llama-button danger"
      remove.type = "button"
      remove.textContent = isActiveDownload ? (isCanceling ? "Canceling..." : "Cancel") : (isRemoving ? "Removing..." : "Remove")
      remove.disabled = isCanceling || isRemoving
      remove.addEventListener("click", () => {
        if (isActiveDownload) {
          void cancelDownload(download)
          return
        }
        void removeDownload(download)
      })
      row.append(title, remove)
      const meta = document.createElement("div")
      meta.className = "llama-card-meta"
      if (download.id) meta.dataset.llamaDownloadMetaId = download.id
      meta.textContent = [formatBytes(download.bytes), download.revision, download.status, download.error]
        .filter(Boolean)
        .join(" - ")
      card.append(row, meta)
      appendDownloadProgress(card, download)
      els.downloadsList.appendChild(card)
    })
  }

  function renderRuntimePacks() {
    if (!els.runtimePackList) return
    const packs = state.runtimePacks.filter((pack) => pack.compatible)

    if (els.runtimePlatform) els.runtimePlatform.textContent = state.runtimePlatform || ""
    if (els.runtimeCheckUpdates) {
      els.runtimeCheckUpdates.disabled = state.downloading || state.runtimeCheckingUpdates || Boolean(state.runtimeBusyId)
      els.runtimeCheckUpdates.textContent = state.runtimeCheckingUpdates ? "Checking" : "Check for updates"
    }

    els.runtimePackList.replaceChildren()
    if (packs.length === 0) {
      renderEmpty(els.runtimePackList, "No runtime packs found.")
      return
    }
    packs.forEach((pack) => {
      const card = document.createElement("article")
      card.className = "llama-card llama-runtime-card"
      const main = document.createElement("div")
      main.className = "llama-runtime-card-main"
      const title = document.createElement("div")
      title.className = "llama-card-title"
      title.textContent = pack.name
      const meta = document.createElement("div")
      meta.className = "llama-card-meta"
      const details = []
      if (pack.description) details.push(pack.description)
      if (pack.installedVersion) details.push(`Installed ${pack.installedVersion}`)
      if (pack.binaryPath) details.push(pack.binaryPath)
      meta.textContent = details.join(" - ")
      const badges = document.createElement("div")
      badges.className = "llama-chip-row"
      const statusBadge = document.createElement("span")
      statusBadge.className = `llama-badge${pack.installed ? " ok" : ""}`
      statusBadge.textContent = pack.installed
        ? (pack.latest ? "Latest version" : "Update available")
        : (pack.installable ? "Not installed" : "Unavailable")
      badges.appendChild(statusBadge)
      if (pack.selected) {
        const selected = document.createElement("span")
        selected.className = "llama-badge ok"
        selected.textContent = "Selected"
        badges.appendChild(selected)
      }
      main.append(title, meta, badges)

      const actions = document.createElement("div")
      actions.className = "llama-inline-actions"
      const primary = document.createElement("button")
      primary.className = "llama-button"
      primary.type = "button"
      const busy = state.runtimeBusyId === pack.id
      if (pack.installed && !pack.selected) {
        primary.textContent = busy ? "Selecting" : "Use"
        primary.addEventListener("click", () => {
          void selectRuntimePack(pack.id)
        })
      } else if (pack.installed && !pack.latest && pack.installable) {
        primary.textContent = busy ? "Updating" : "Update"
        primary.addEventListener("click", () => {
          void installRuntimePack(pack)
        })
      } else if (!pack.installed && pack.installable) {
        primary.textContent = busy ? "Downloading" : "Download"
        primary.addEventListener("click", () => {
          void installRuntimePack(pack)
        })
      } else {
        primary.textContent = pack.selected ? "Selected" : "Unavailable"
        primary.disabled = true
      }
      primary.disabled = primary.disabled || state.downloading || Boolean(state.runtimeBusyId)
      actions.appendChild(primary)

      if (pack.removable) {
        const remove = document.createElement("button")
        remove.className = "llama-button danger"
        remove.type = "button"
        remove.textContent = "Remove"
        remove.disabled = state.downloading || Boolean(state.runtimeBusyId)
        remove.addEventListener("click", () => {
          void removeRuntimePack(pack.id)
        })
        actions.appendChild(remove)
      }
      card.append(main, actions)
      els.runtimePackList.appendChild(card)
    })
  }

  function renderHardware() {
    if (!els.gpuList) return
    const hardware = state.hardware || normalizeHardware(null)
    const cpuName = hardware.cpu.name || "Unavailable"
    const cpuMeta = []
    if (hardware.cpu.architecture) cpuMeta.push(hardware.cpu.architecture)
    if (hardware.cpu.cores) cpuMeta.push(`${hardware.cpu.cores} cores`)
    hardware.cpu.features.forEach((feature) => cpuMeta.push(feature))
    if (els.cpuStatus) els.cpuStatus.textContent = cpuName === "Unavailable" ? "" : "Compatible"
    if (els.cpuName) els.cpuName.textContent = cpuName
    els.cpuMeta?.replaceChildren()
    cpuMeta.forEach((item) => {
      const chip = document.createElement("span")
      chip.className = "llama-chip"
      chip.textContent = item
      els.cpuMeta?.appendChild(chip)
    })
    const totalVram = hardware.gpus.reduce((sum, gpu) => sum + gpu.vramBytes, 0)
    if (els.ramTotal) els.ramTotal.textContent = formatGB(hardware.memory.ramBytes)
    if (els.vramTotal) els.vramTotal.textContent = formatGB(totalVram)

    const supportsAcceleration = selectedRuntimeSupportsAcceleration()
    const showGpuControls = supportsAcceleration && hardware.gpus.length > 0
    if (els.gpuStrategyRow) els.gpuStrategyRow.hidden = !showGpuControls
    if (els.limitDedicatedRow) els.limitDedicatedRow.hidden = !supportsAcceleration
    if (els.offloadKvRow) els.offloadKvRow.hidden = !supportsAcceleration
    if (els.gpuStrategy) els.gpuStrategy.value = state.values.gpuStrategy || "split-evenly"
    if (els.limitDedicatedMemory) els.limitDedicatedMemory.checked = state.values.limitDedicatedGpuMemory
    if (els.offloadKvCache) els.offloadKvCache.checked = state.values.offloadKvCache
    els.gpuList.replaceChildren()
    if (hardware.gpus.length === 0) {
      renderEmpty(els.gpuList, "No GPUs detected.")
    } else {
      const enabledGpuIds = selectedGpuIdsForHardware(hardware)
      hardware.gpus.forEach((gpu) => {
        const card = document.createElement("article")
        card.className = "llama-card llama-gpu-card"
        const main = document.createElement("div")
        main.className = "llama-runtime-card-main"
        const title = document.createElement("div")
        title.className = "llama-card-title"
        title.textContent = gpu.name
        const meta = document.createElement("div")
        meta.className = "llama-card-meta"
        meta.textContent = `${formatGB(gpu.vramBytes)} - ${gpu.backend || "GPU"} - deviceId: ${gpu.id}`
        main.append(title, meta)
        const toggle = document.createElement("input")
        toggle.type = "checkbox"
        toggle.className = "themed-toggle"
        toggle.checked = enabledGpuIds.has(gpu.id)
        toggle.hidden = !showGpuControls
        toggle.addEventListener("change", () => {
          const next = selectedGpuIdsForHardware(hardware)
          if (toggle.checked) {
            next.add(gpu.id)
          } else {
            next.delete(gpu.id)
          }
          saveEnabledGpuIds(next, hardware)
          void saveAndRender("Hardware settings saved.")
        })
        card.append(main, toggle)
        els.gpuList.appendChild(card)
      })
    }
    els.guardrails.forEach((input) => {
      input.checked = input.value === state.values.modelGuardrail
    })
  }

  function renderModelRootControls() {
    if (els.modelRoot) {
      els.modelRoot.value = state.values.modelRoot
      els.modelRoot.placeholder = state.resolvedModelRoot || ""
    }
    if (els.modelRootBrowse) {
      els.modelRootBrowse.disabled = state.downloading || state.saving
    }
    if (els.modelRootReset) {
      els.modelRootReset.disabled = state.downloading || state.saving || !normalizeString(state.values.modelRoot)
    }
  }

  function renderRuntimeStatusControls() {
    const runtime = state.runtime || normalizeRuntime(null)
    if (els.runtimeUrl) els.runtimeUrl.value = runtime.baseUrl
    if (els.runtimeStop) {
      els.runtimeStop.hidden = !runtime.running
      els.runtimeStop.disabled = state.downloading
    }
    if (els.runtimeStatus && els.runtimeDetail) {
      if (runtimeIsLoading(runtime) && runtime.lastError) {
        els.runtimeStatus.textContent = "Load error"
        els.runtimeDetail.textContent = runtime.lastError
      } else if (runtimeIsLoading(runtime)) {
        els.runtimeStatus.textContent = "Loading"
        els.runtimeDetail.textContent = runtimeLoadStatusText(runtime)
      } else if (runtimeIsReady(runtime)) {
        els.runtimeStatus.textContent = "Running"
        els.runtimeDetail.textContent = runtime.pid > 0 ? `PID ${runtime.pid} - ${runtime.modelPath}` : runtime.modelPath
      } else if (!runtime.binaryAvailable) {
        els.runtimeStatus.textContent = "Binary missing"
        els.runtimeDetail.textContent = runtime.lastError || runtime.binaryPath
      } else if (!state.backendAvailable) {
        els.runtimeStatus.textContent = "Unavailable"
        els.runtimeDetail.textContent = runtime.lastError
      } else {
        els.runtimeStatus.textContent = "Stopped"
        els.runtimeDetail.textContent = runtime.binaryPath
      }
      els.runtimeStatus.classList.toggle("muted", !runtime.running)
    }
    if (els.runtimeSetupNotice) {
      const message = runtimeEngineSetupMessage()
      els.runtimeSetupNotice.hidden = !message
      const messageNode = els.runtimeSetupNotice.querySelector("span")
      if (messageNode) messageNode.textContent = message
    }
  }

  function renderSearchControls() {
    if (els.hfQuery) els.hfQuery.value = state.hf.query
    if (els.hfSearchSubmit) {
      els.hfSearchSubmit.disabled = state.downloading || state.hf.searching || !window.anthoriExtension?.network?.fetch
    }
  }

  function render(options = {}) {
    const preserveModelList = options.preserveModelList === true && (options.forcePreserveModelList === true || modelListHasInteractiveFocus())
    renderModelRootControls()
    renderRuntimeStatusControls()
    renderSearchControls()
    renderDownloadStatusText()
    if (!preserveModelList) {
      renderLocalModels()
    }
    renderRuntimePacks()
    renderHardware()
    renderHuggingFaceResults()
    renderDownloads()
  }

  async function refreshBackendModels(options = {}) {
    try {
      const data = await callLlamaAction("models-list", {
        modelRoot: state.values.modelRoot,
      })
      state.backendAvailable = true
      state.backendModels = Array.isArray(data.models) ? data.models.map(normalizeModel).filter(Boolean) : []
      state.resolvedModelRoot = normalizeString(data.modelRoot)
      render({ preserveModelList: options.preserveModelList === true })
      if (options.notify === true) {
        setMessage("Models refreshed.")
      }
    } catch (error) {
      state.backendAvailable = false
      state.backendModels = []
      addSetupError(options, "Models", error, "Model refresh failed.")
      render({ preserveModelList: options.preserveModelList === true })
      if (options.notify === true) {
        setMessage(errorMessage(error, "Model refresh failed."))
      }
    }
  }

  function updateDownloadStatusPolling() {
    const hasActiveDownloads = activeDownloadItems().length > 0
    if (hasActiveDownloads && !state.downloadStatusPollTimer) {
      state.downloadStatusPollTimer = window.setInterval(() => {
        void refreshDownloadStatuses()
      }, DOWNLOAD_STATUS_POLL_MS)
    } else if (!hasActiveDownloads && state.downloadStatusPollTimer) {
      window.clearInterval(state.downloadStatusPollTimer)
      state.downloadStatusPollTimer = 0
    }
  }

  function reconcileDownloadStatuses(rawDownloads) {
    let changed = false
    let saveNeeded = false
    const items = Array.isArray(rawDownloads) ? rawDownloads : []
    items.forEach((rawProgress) => {
      const progress = normalizeDownloadProgress(rawProgress)
      if (!progress) return
      if (state.removingDownloads.has(progress.id)) {
        if (state.activeDownloads[progress.id]) {
          removeActiveDownload(progress.id)
          changed = true
        }
        return
      }
      const activeDownload = state.activeDownloads[progress.id]
      const merged = Object.assign({}, activeDownload || {}, progress)
      if (downloadIsActive(merged) && !downloadIsStaleStarting(merged)) {
        if (!activeDownload || !downloadsMatch(activeDownload, merged)) {
          setActiveDownload(merged)
          updateDownloadRateSample(merged)
          changed = true
        }
        return
      }
      const terminal = downloadIsStaleStarting(merged)
        ? Object.assign({}, merged, {
          status: "failed",
          error: "Download worker did not start.",
        })
        : merged
      if (!downloadIsTerminal(terminal)) return
      if (activeDownload) {
        removeActiveDownload(terminal.id)
        changed = true
      }
      if (upsertStoredDownload(terminal, rawProgress, activeDownload)) {
        saveNeeded = true
        changed = true
      }
    })
    return { changed, saveNeeded }
  }

  async function refreshDownloadStatuses(options = {}) {
    try {
      const data = await callLlamaAction("models-download-status", {})
      const result = reconcileDownloadStatuses(data.downloads)
      if (result.saveNeeded) {
        await saveSettings()
        await refreshBackendModels({ preserveModelList: true })
      } else if (result.changed) {
        const active = activeDownloadItems()
        if (active.length === 0 || !active.every((download) => updateDownloadProgressViews(download))) {
          render({ preserveModelList: true })
        }
      }
    } catch (error) {
      addSetupError(options, "Downloads", error, "Download status refresh failed.")
      if (options.notify === true) {
        setMessage(errorMessage(error, "Download status refresh failed."))
      }
    } finally {
      updateDownloadStatusPolling()
    }
  }

  async function refreshRuntimeStatus(options = {}) {
    const token = Number(options.runtimeModelActionToken)
    try {
      const previousRuntime = state.runtime || normalizeRuntime(null)
      const runtime = trackRuntimeActivity(await callLlamaAction("runtime-status", {
        runtimeId: state.values.runtimeId || state.selectedRuntimeId,
      }))
      if (token > 0 && state.runtimeModelActionToken !== token) {
        return
      }
      state.runtime = runtime
      if (token > 0 && runtimeMatchesActiveLoad(state.runtime) && runtimeIsReady(state.runtime)) {
        completeRuntimeLoadAction(token, "Model loaded.")
        return
      }
      const preserveModelList = options.preserveModelList === true && runtimeModelListCanBePreserved(previousRuntime, state.runtime)
      if (preserveModelList) {
        renderRuntimeStatusControls()
        updateRuntimeModelActivityViews()
      } else {
        render()
      }
      if (options.updateRuntimeMessage !== false && shouldUpdateRuntimeLoadMessage(state.runtime, token)) {
        setMessage(runtimeLoadStatusText(state.runtime))
      }
    } catch (error) {
      if (token > 0 && state.runtimeModelActionToken !== token) {
        return
      }
      state.runtime = trackRuntimeActivity({
        binaryAvailable: false,
        lastError: errorMessage(error, "Runtime status failed."),
      })
      addSetupError(options, "Runtime status", error, "Runtime status failed.")
      render({ preserveModelList: options.preserveModelList === true })
    }
  }

  async function refreshRuntimePacks(options = {}) {
    try {
      const data = await callLlamaAction("runtimes-list", {
        runtimeId: state.values.runtimeId || state.selectedRuntimeId,
      })
      state.runtimePlatform = normalizeString(data.platform)
      state.selectedRuntimeId = normalizeString(data.selectedRuntimeId)
      state.runtimePacks = Array.isArray(data.runtimes)
        ? data.runtimes.map(normalizeRuntimePack).filter(Boolean)
        : []
      const adoptedSelection = adoptSelectedRuntimeFromPacks()
      if (adoptedSelection) {
        await saveSettings()
      }
      state.runtime = trackRuntimeActivity(data.status)
      render()
      if (options.notify === true) {
        setMessage("Runtime packs refreshed.")
      }
    } catch (error) {
      state.runtimePacks = []
      addSetupError(options, "Runtime packs", error, "Runtime pack refresh failed.")
      render()
      if (options.notify === true) {
        setMessage(errorMessage(error, "Runtime pack refresh failed."))
      }
    }
  }

  async function checkRuntimeUpdates() {
    try {
      await ensureRuntimeUpdateCheckPermission()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Permission denied.")
      return
    }
    state.runtimeCheckingUpdates = true
    render()
    setMessage("Checking for runtime updates...")
    try {
      const data = await callLlamaAction("runtimes-check-updates", {
        runtimeId: state.values.runtimeId || state.selectedRuntimeId,
      })
      state.runtimePlatform = normalizeString(data.platform)
      state.selectedRuntimeId = normalizeString(data.selectedRuntimeId)
      state.runtimePacks = Array.isArray(data.runtimes)
        ? data.runtimes.map(normalizeRuntimePack).filter(Boolean)
        : []
      state.runtime = trackRuntimeActivity(data.status)
      const currentVersion = normalizeString(data.currentVersion)
      const latestVersion = normalizeString(data.latestVersion)
      if (data.updateAvailable === true && latestVersion) {
        setMessage(`Runtime update available: ${latestVersion}.`)
      } else if (latestVersion || currentVersion) {
        setMessage(`Runtime packs are current (${latestVersion || currentVersion}).`)
      } else {
        setMessage("Runtime packs are current.")
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Runtime update check failed.")
    } finally {
      state.runtimeCheckingUpdates = false
      render()
    }
  }

  async function refreshHardware(options = {}) {
    try {
      state.hardware = normalizeHardware(await callLlamaAction("hardware-info"))
    } catch (error) {
      state.hardware = normalizeHardware(null)
      addSetupError(options, "Hardware", error, "Hardware info failed.")
    }
    render()
  }

  async function loadSettings() {
    const api = window.anthoriExtension && window.anthoriExtension.settings
    if (!api || typeof api.get !== "function") {
      state.values = normalizeValues(DEFAULTS)
      setMessage("Extension settings are unavailable.")
      render()
      return
    }
    try {
      const values = await api.get(DEFAULTS)
      state.values = normalizeValues(values)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Extension settings are unavailable.")
    }
    render()
    const setupErrors = []
    const setupOptions = { setupErrors }
    await refreshBackendModels(setupOptions)
    await refreshRuntimePacks(setupOptions)
    await refreshHardware(setupOptions)
    await refreshRuntimeStatus(setupOptions)
    await refreshDownloadStatuses(setupOptions)
    const summary = setupErrorSummary(setupErrors)
    if (summary) {
      setMessage(summary)
    }
  }

  async function saveSettings() {
    const api = window.anthoriExtension && window.anthoriExtension.settings
    if (!api || typeof api.setDraft !== "function" || typeof api.commit !== "function") {
      throw new Error("Extension settings are unavailable.")
    }
    state.saving = true
    try {
      await api.setDraft(state.values, { replace: true })
      const values = await api.commit()
      state.values = normalizeValues(values)
    } finally {
      state.saving = false
    }
  }

  async function saveAndRender(message) {
    try {
      await saveSettings()
      render()
      setMessage(message)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed.")
    }
  }

  async function saveModelRoot(value, options = {}) {
    const nextModelRoot = normalizeString(value)
    const isReset = options?.reset === true || !nextModelRoot
    if (els.modelRoot) {
      els.modelRoot.value = nextModelRoot
    }
    if (nextModelRoot === state.values.modelRoot) return
    const runtime = state.runtime || normalizeRuntime(null)
    const hadRuntime = runtime.running === true
    state.downloading = true
    state.runtimeModelAction = hadRuntime ? "unload" : ""
    state.runtimeModelActionPath = runtime.modelPath
    state.runtimeModelActionStartedAt = hadRuntime ? Date.now() : 0
    state.runtimeModelActionToken += 1
    render()
    setMessage(hadRuntime
      ? "Stopping loaded model before changing directory..."
      : isReset
        ? "Resetting model directory..."
        : "Saving model directory...")
    try {
      if (hadRuntime) {
        state.runtime = trackRuntimeActivity(await callLlamaAction("runtime-stop", {
          runtimeId: state.values.runtimeId || state.selectedRuntimeId || runtime.runtimeId,
        }))
      }
      state.values.modelRoot = nextModelRoot
      await saveSettings()
      await refreshBackendModels()
      await refreshDownloadStatuses()
      await refreshRuntimeStatus({ updateRuntimeMessage: false })
      const savedMessage = isReset ? "Model directory reset to default." : "Model directory saved."
      setMessage(hadRuntime ? `${savedMessage} Loaded model was unloaded.` : savedMessage)
    } catch (error) {
      render()
      setMessage(error instanceof Error ? error.message : "Model directory save failed.")
    } finally {
      state.downloading = false
      state.runtimeModelAction = ""
      state.runtimeModelActionPath = ""
      state.runtimeModelActionStartedAt = 0
      state.runtimeModelActionToken = 0
      render()
    }
  }

  async function searchHuggingFaceModels() {
    const query = normalizeString(els.hfQuery.value)
    if (!query) return
    state.hf.query = query
    state.hf.searching = true
    state.hf.error = ""
    render()
    setMessage("")
    try {
      const data = await fetchHuggingFaceJson(huggingFaceUrl("/api/models", {
        search: query,
        filter: "gguf",
        sort: "downloads",
        direction: "-1",
        limit: "20",
      }))
      const items = Array.isArray(data) ? data : (Array.isArray(data?.models) ? data.models : [])
      state.hf.results = items.map(normalizeHuggingFaceModel).filter(Boolean)
      state.hf.filesByRepository = {}
      state.expandedHuggingFaceRepositories.clear()
      if (state.hf.results.length === 0) {
        state.hf.error = "No GGUF models found."
      }
    } catch (error) {
      state.hf.results = []
      state.hf.filesByRepository = {}
      state.expandedHuggingFaceRepositories.clear()
      state.hf.error = error instanceof Error ? error.message : "Model search failed."
    } finally {
      state.hf.searching = false
      render()
    }
  }

  async function loadHuggingFaceFiles(repository) {
    const normalizedRepository = normalizeString(repository)
    if (!normalizedRepository) return
    state.hf.loadingRepository = normalizedRepository
    state.hf.error = ""
    render()
    try {
      let detail = await fetchHuggingFaceJsonPages(huggingFaceUrl(`/api/models/${encodePathSegments(normalizedRepository)}/tree/main`, {
        recursive: "true",
        expand: "true",
      }))
      let files = normalizeHuggingFaceFiles(detail)
      if (files.length === 0) {
        detail = await fetchHuggingFaceJson(huggingFaceUrl(`/api/models/${encodePathSegments(normalizedRepository)}`, {
          blobs: "true",
        }))
        files = normalizeHuggingFaceFiles(detail)
      }
      state.hf.filesByRepository = Object.assign({}, state.hf.filesByRepository, {
        [normalizedRepository]: files,
      })
    } catch (error) {
      state.hf.error = error instanceof Error ? error.message : "Failed to load model files."
    } finally {
      state.hf.loadingRepository = ""
      render()
    }
  }

  async function waitForDownloadComplete(id) {
    const downloadId = normalizeString(id)
    if (!downloadId) return null
    let missingStatusCount = 0
    let statusErrorCount = 0
    for (;;) {
      let data
      try {
        data = await callLlamaAction("models-download-status", { id: downloadId })
        statusErrorCount = 0
      } catch (error) {
        statusErrorCount += 1
        if (statusErrorCount >= DOWNLOAD_STATUS_MISSING_LIMIT) {
          throw error
        }
        await new Promise((resolve) => window.setTimeout(resolve, 500))
        continue
      }
      const progress = normalizeDownloadProgress(data.download)
      const activeDownload = state.activeDownloads[downloadId]
      if (progress && activeDownload) {
        const merged = Object.assign({}, activeDownload, progress)
        if (!downloadsMatch(activeDownload, merged)) {
          setActiveDownload(merged)
          updateDownloadRateSample(merged)
          if (!updateDownloadProgressViews(merged)) {
            render()
          }
        }
      }
      if (!progress) {
        missingStatusCount += 1
        if (missingStatusCount >= DOWNLOAD_STATUS_MISSING_LIMIT) {
          throw new Error("Download worker did not report status.")
        }
      } else {
        missingStatusCount = 0
      }
      const status = normalizeString(progress?.status)
      if (status === "complete" || status === "failed" || status === "canceled") {
        return data.download || progress
      }
      if (progress && downloadIsStaleStarting(Object.assign({}, activeDownload || {}, progress))) {
        throw new Error("Download worker did not start.")
      }
      await new Promise((resolve) => window.setTimeout(resolve, 500))
    }
  }

  async function downloadHuggingFaceModel(input) {
    const download = normalizeDownload({
      id: createId("download"),
      repository: input?.repository,
      file: input?.file,
      projectorFile: input?.projectorFile,
      projectorBytes: input?.projectorBytes,
      extraFiles: input?.extraFiles,
      bytes: input?.bytes,
      revision: input?.revision,
      status: "queued",
      addedAt: new Date().toISOString(),
    })
    if (!download) return
    await refreshDownloadStatuses()
    if (isDownloadedHuggingFaceFile(download.repository, download.file)) {
      setMessage("Model already downloaded.")
      render()
      return
    }
    if (activeDownloadFor(download.repository, download.file)) {
      setMessage("Model download already in progress.")
      render()
      return
    }
    try {
      await ensureHuggingFaceDownloadPermission()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Permission denied.")
      return
    }
    if (isDownloadedHuggingFaceFile(download.repository, download.file)) {
      setMessage("Model already downloaded.")
      render()
      return
    }
    if (activeDownloadFor(download.repository, download.file)) {
      setMessage("Model download already in progress.")
      render()
      return
    }
    const downloadKey = huggingFaceModelKey(download.repository, download.file)
    if (downloadKey) {
      const previousLength = state.values.downloads.length
      state.values.downloads = state.values.downloads.filter((item) => huggingFaceModelKey(item.repository, item.file) !== downloadKey)
      if (state.values.downloads.length !== previousLength) {
        void saveSettings().catch(() => {})
      }
    }
    setActiveDownload({
      id: download.id,
      repository: download.repository,
      file: download.file,
      projectorFile: download.projectorFile,
      projectorBytes: download.projectorBytes,
      extraFiles: download.extraFiles,
      bytes: downloadTotalBytes(download) || download.bytes,
      bytesDownloaded: 0,
      revision: download.revision,
      status: "starting",
    })
    updateDownloadRateSample(state.activeDownloads[download.id])
    render()
    try {
      await callLlamaAction("models-download", {
        id: download.id,
        modelRoot: state.values.modelRoot,
        repository: download.repository,
        file: download.file,
        extraFiles: download.projectorFile
          ? download.extraFiles.concat([{ file: download.projectorFile, bytes: download.projectorBytes, role: "projector" }])
          : download.extraFiles,
        bytes: download.bytes,
        revision: download.revision,
      })
      const completed = await waitForDownloadComplete(download.id)
      const completedStatus = normalizeString(completed?.status)
      if (completedStatus === "canceled") {
        const activeDownload = state.activeDownloads[download.id]
        const bytes = normalizeByteCount(completed?.bytesTotal, activeDownload?.bytes, downloadTotalBytes(download), download.bytes)
        const bytesDownloaded = normalizeByteCount(completed?.bytesDownloaded, activeDownload?.bytesDownloaded)
        state.values.downloads = [
          Object.assign({}, download, { bytes, bytesDownloaded, status: "canceled" }),
        ].concat(state.values.downloads.filter((item) => item.id !== download.id))
        await saveSettings()
        setMessage("Download canceled.")
        return
      }
      if (completedStatus === "failed") {
        throw new Error(normalizeString(completed?.error) || "Download failed.")
      }
      state.values.downloads = state.values.downloads.filter((item) => item.id !== download.id)
      await callLlamaAction("models-download-status", { id: download.id, remove: true }).catch(() => {})
      await refreshBackendModels()
      await saveSettings()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Download failed."
      const activeDownload = state.activeDownloads[download.id]
      state.values.downloads = [
        Object.assign({}, download, {
          bytesDownloaded: normalizeByteCount(activeDownload?.bytesDownloaded),
          status: "failed",
          error: message,
        }),
      ].concat(state.values.downloads.filter((item) => item.id !== download.id))
      void saveSettings().catch(() => {})
      setMessage(message)
    } finally {
      removeActiveDownload(download.id)
      render()
    }
  }

  async function cancelDownload(download) {
    const normalized = normalizeDownload(download)
    if (!normalized || !downloadIsActive(normalized)) return
    state.cancelingDownloads.add(normalized.id)
    render()
    try {
      const data = await callLlamaAction("models-download-status", { id: normalized.id, cancel: true })
      const progress = normalizeDownloadProgress(data.download)
      if (progress) {
        removeActiveDownload(progress.id)
        state.values.downloads = [
          Object.assign({}, normalized, progress, { status: "canceled" }),
        ].concat(state.values.downloads.filter((item) => item.id !== progress.id))
        await saveSettings()
      } else {
        await refreshDownloadStatuses()
      }
      setMessage("Download canceled.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Download cancel failed.")
    } finally {
      state.cancelingDownloads.delete(normalized.id)
      render()
    }
  }

  async function removeDownload(download) {
    const normalized = normalizeDownload(download)
    if (!normalized) return
    state.removingDownloads.add(normalized.id)
    render()
    try {
      const data = await callLlamaAction("models-download-status", { id: normalized.id, remove: true })
      if (data.removed !== true) {
        throw new Error("Download record was not removed.")
      }
      state.values.downloads = state.values.downloads.filter((item) => item.id !== normalized.id)
      await saveSettings()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Download remove failed.")
    } finally {
      state.removingDownloads.delete(normalized.id)
      render()
    }
  }

  async function removeLocalModel(model) {
    const normalized = normalizeModel(model)
    if (!normalized) return
    const removeKey = modelPathKey(normalized)
    if (!removeKey) return
    state.removingModels.add(removeKey)
    render()
    try {
      const data = await callLlamaAction("models-list", {
        modelRoot: state.values.modelRoot,
        modelPath: normalized.path,
        remove: true,
      })
      if (data.removed !== true) {
        throw new Error("Model file was not removed.")
      }
      removeModelLocalSettings(normalized)
      if (Array.isArray(data.models)) {
        state.backendModels = data.models.map(normalizeModel).filter(Boolean)
        state.resolvedModelRoot = normalizeString(data.modelRoot)
      } else {
        await refreshBackendModels()
      }
      await saveSettings()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Model remove failed.")
    } finally {
      state.removingModels.delete(removeKey)
      render()
    }
  }

  async function installRuntimePack(pack) {
    const runtime = normalizeRuntimePack(pack)
    if (!runtime || !runtime.installable) return
    try {
      await ensureRuntimeDownloadPermission(runtime)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Permission denied.")
      return
    }
    state.runtimeBusyId = runtime.id
    render()
    setMessage(`Downloading ${runtime.name}...`)
    try {
      const data = await callLlamaAction("runtimes-install", {
        runtimeId: runtime.id,
        version: runtime.version,
      })
      state.runtimePlatform = normalizeString(data.platform)
      state.selectedRuntimeId = normalizeString(data.selectedRuntimeId)
      state.runtimePacks = Array.isArray(data.runtimes)
        ? data.runtimes.map(normalizeRuntimePack).filter(Boolean)
        : []
      state.runtime = trackRuntimeActivity(data.status)
      state.values.runtimeId = runtime.id
      await saveSettings()
      setMessage("Runtime pack installed.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Runtime install failed.")
    } finally {
      state.runtimeBusyId = ""
      render()
    }
  }

  async function removeRuntimePack(runtimeId) {
    const id = normalizeString(runtimeId)
    if (!id) return
    state.runtimeBusyId = id
    render()
    setMessage("Removing runtime pack...")
    try {
      const data = await callLlamaAction("runtimes-remove", { runtimeId: id })
      state.runtimePlatform = normalizeString(data.platform)
      state.selectedRuntimeId = normalizeString(data.selectedRuntimeId)
      state.runtimePacks = Array.isArray(data.runtimes)
        ? data.runtimes.map(normalizeRuntimePack).filter(Boolean)
        : []
      state.runtime = trackRuntimeActivity(data.status)
      if (state.values.runtimeId === id) {
        state.values.runtimeId = ""
        await saveSettings()
      }
      await refreshRuntimePacks()
      setMessage("Runtime pack removed.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Runtime remove failed.")
    } finally {
      state.runtimeBusyId = ""
      render()
    }
  }

  async function selectRuntimePack(runtimeId) {
    const id = normalizeString(runtimeId)
    if (!id) return
    const pack = state.runtimePacks.find((entry) => runtimePackKey(entry.id) === runtimePackKey(id))
    if (!runtimePackIsSelectable(pack)) {
      setMessage("Install the runtime pack before selecting it.")
      render()
      return
    }
    const currentRuntimeId = normalizeString(state.values.runtimeId || state.selectedRuntimeId)
    const runtime = state.runtime || normalizeRuntime(null)
    const switchingRuntime = runtimePackKey(currentRuntimeId) !== runtimePackKey(id)
    let stoppedRuntime = false
    state.runtimeBusyId = id
    state.downloading = true
    render()
    setMessage(switchingRuntime && runtime.running ? "Stopping loaded model before switching runtime..." : "Selecting runtime pack...")
    try {
      if (switchingRuntime && runtime.running) {
        state.runtimeModelAction = "unload"
        state.runtimeModelActionPath = runtime.modelPath
        state.runtimeModelActionStartedAt = Date.now()
        state.runtimeModelActionToken += 1
        render()
        state.runtime = trackRuntimeActivity(await callLlamaAction("runtime-stop", {
          runtimeId: currentRuntimeId || runtime.runtimeId,
        }))
        stoppedRuntime = true
      }
      state.values.runtimeId = id
      await saveSettings()
      await refreshRuntimePacks()
      await refreshRuntimeStatus({ updateRuntimeMessage: false })
      setMessage(stoppedRuntime ? "Runtime pack selected. Loaded model was unloaded." : "Runtime pack selected.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Runtime selection failed.")
    } finally {
      state.downloading = false
      state.runtimeModelAction = ""
      state.runtimeModelActionPath = ""
      state.runtimeModelActionStartedAt = 0
      state.runtimeModelActionToken = 0
      state.runtimeBusyId = ""
      render()
    }
  }

  function startRuntimeLoadStatusPolling(token) {
    if (state.runtimeLoadStatusTimer) return
    state.runtimeLoadStatusTimer = window.setInterval(() => {
      if (state.runtimeModelAction !== "load" || state.runtimeModelActionToken !== token) {
        stopRuntimeLoadStatusPolling()
        return
      }
      void refreshRuntimeStatus({ runtimeModelActionToken: token, preserveModelList: true })
    }, RUNTIME_LOAD_STATUS_POLL_MS)
  }

  function stopRuntimeLoadStatusPolling(token = 0) {
    if (token > 0 && state.runtimeModelActionToken !== token) return
    if (!state.runtimeLoadStatusTimer) return
    window.clearInterval(state.runtimeLoadStatusTimer)
    state.runtimeLoadStatusTimer = 0
  }

  async function pollRuntimeStatus() {
    if (state.runtimeStatusPollInFlight || state.runtimeModelAction) return
    state.runtimeStatusPollInFlight = true
    try {
      await refreshRuntimeStatus({ updateRuntimeMessage: false, preserveModelList: true })
    } finally {
      state.runtimeStatusPollInFlight = false
    }
  }

  function startRuntimeStatusPolling() {
    if (state.runtimeStatusPollTimer) return
    state.runtimeStatusPollTimer = window.setInterval(() => {
      if (document.visibilityState === "hidden") return
      void pollRuntimeStatus()
    }, RUNTIME_STATUS_POLL_MS)
  }

  async function startRuntime(model) {
    const normalized = normalizeModel(model)
    if (!normalized) return
    const modelOptions = modelOptionsForModel(normalized)
    const body = {
      modelRoot: state.values.modelRoot,
      modelPath: normalized.path,
      runtimeId: state.values.runtimeId || state.selectedRuntimeId,
      gpuStrategy: state.values.gpuStrategy,
      enabledGpuIds: state.values.enabledGpuIds,
      limitDedicatedGpuMemory: state.values.limitDedicatedGpuMemory,
      defaultOffloadKvCache: state.values.offloadKvCache,
      modelGuardrail: state.values.modelGuardrail,
    }
    if (normalized.projectorPath) body.projectorPath = normalized.projectorPath
    if (modelOptions.contextSize > 0) body.contextSize = modelOptions.contextSize
    if (modelOptions.draftModelPath) body.draftModelPath = modelOptions.draftModelPath
    if (modelOptions.threads > 0) body.threads = modelOptions.threads
    if (modelOptions.gpuLayers >= 0) body.gpuLayers = modelOptions.gpuLayers
    if (modelOptions.evalBatchSize > 0) body.evalBatchSize = modelOptions.evalBatchSize
    if (modelOptions.seed !== undefined) body.seed = modelOptions.seed
    if (modelOptions.offloadKvCache === true || modelOptions.offloadKvCache === false) body.offloadKvCache = modelOptions.offloadKvCache
    if (modelOptions.cacheTypeK) body.cacheTypeK = modelOptions.cacheTypeK
    if (modelOptions.cacheTypeV) body.cacheTypeV = modelOptions.cacheTypeV
    if (modelOptions.topK >= 0) body.topK = modelOptions.topK
    if (modelOptions.topP !== undefined) body.topP = modelOptions.topP
    if (modelOptions.minP !== undefined) body.minP = modelOptions.minP
    if (modelOptions.presencePenalty !== undefined) body.presencePenalty = modelOptions.presencePenalty
    if (modelOptions.repeatPenalty !== undefined) body.repeatPenalty = modelOptions.repeatPenalty
    const actionToken = state.runtimeModelActionToken + 1
    state.downloading = true
    state.runtimeModelAction = "load"
    state.runtimeModelActionPath = normalized.path
    state.runtimeModelActionStartedAt = Date.now()
    state.runtimeModelActionToken = actionToken
    render()
    setMessage(runtimeLoadStatusText(state.runtime || normalizeRuntime(null)))
    startRuntimeLoadStatusPolling(actionToken)
    try {
      state.runtime = trackRuntimeActivity(await callLlamaAction("runtime-start", body))
      if (state.runtimeModelActionToken === actionToken) {
        completeRuntimeLoadAction(actionToken, "Model loaded.")
      }
    } catch (error) {
      if (state.runtimeModelActionToken === actionToken) {
        await refreshRuntimeStatus({
          runtimeModelActionToken: actionToken,
          updateRuntimeMessage: false,
        })
      }
      if (state.runtimeModelActionToken === actionToken) {
        setMessage(error instanceof Error ? error.message : "Runtime start failed.")
      }
    } finally {
      if (state.runtimeModelActionToken === actionToken) {
        stopRuntimeLoadStatusPolling(actionToken)
        state.downloading = false
        state.runtimeModelAction = ""
        state.runtimeModelActionPath = ""
        state.runtimeModelActionStartedAt = 0
        state.runtimeModelActionToken = 0
        render()
      }
    }
  }

  async function stopRuntime(model) {
    const normalized = normalizeModel(model)
    const runtime = state.runtime || normalizeRuntime(null)
    state.downloading = true
    state.runtimeModelAction = "unload"
    state.runtimeModelActionPath = normalized?.path || runtime.modelPath
    state.runtimeModelActionStartedAt = Date.now()
    state.runtimeModelActionToken += 1
    render()
    setMessage("Stopping runtime...")
    try {
      state.runtime = trackRuntimeActivity(await callLlamaAction("runtime-stop", {
        runtimeId: state.values.runtimeId || state.selectedRuntimeId,
      }))
      render()
      setMessage("Runtime stopped.")
    } catch (error) {
      await refreshRuntimeStatus()
      setMessage(error instanceof Error ? error.message : "Runtime stop failed.")
    } finally {
      state.downloading = false
      state.runtimeModelAction = ""
      state.runtimeModelActionPath = ""
      state.runtimeModelActionStartedAt = 0
      state.runtimeModelActionToken = 0
      render()
    }
  }

  function bindEvents() {
    on(els.runtimeCheckUpdates, "click", () => {
      void checkRuntimeUpdates()
    })

    on(els.copyHardware, "click", () => {
      const hardware = state.hardware || normalizeHardware(null)
      const lines = [
        `CPU: ${hardware.cpu.name || "Unavailable"}`,
        `Architecture: ${hardware.cpu.architecture || "Unavailable"}`,
        `RAM: ${formatGB(hardware.memory.ramBytes)}`,
        `GPUs: ${hardware.gpus.map((gpu) => `${gpu.name} (${formatGB(gpu.vramBytes)})`).join(", ") || "None"}`,
      ]
      void navigator.clipboard?.writeText(lines.join("\n")).then(() => {
        setMessage("Hardware info copied.")
      }).catch(() => {
        setMessage(lines.join(" | "))
      })
    })

    on(els.gpuStrategy, "change", () => {
      state.values.gpuStrategy = normalizeGpuStrategy(els.gpuStrategy.value)
      void saveAndRender("Hardware settings saved.")
    })

    on(els.limitDedicatedMemory, "change", () => {
      state.values.limitDedicatedGpuMemory = els.limitDedicatedMemory.checked
      void saveAndRender("Hardware settings saved.")
    })

    on(els.offloadKvCache, "change", () => {
      state.values.offloadKvCache = els.offloadKvCache.checked
      void saveAndRender("Hardware settings saved.")
    })

    els.guardrails.forEach((input) => {
      input.addEventListener("change", () => {
        if (!input.checked) return
        state.values.modelGuardrail = normalizeGuardrail(input.value)
        void saveAndRender("Hardware settings saved.")
      })
    })

    on(els.runtimeStop, "click", () => {
      void stopRuntime()
    })

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "hidden") {
        void pollRuntimeStatus()
      }
    })

    window.addEventListener("focus", () => {
      void pollRuntimeStatus()
    })

    on(els.openExtensionSettings, "click", () => {
      void openAppExtensionsSettings()
    })

    on(els.modelRootBrowse, "click", () => {
      void selectModelRootDirectory()
    })

    on(els.modelRootReset, "click", () => {
      void saveModelRoot("", { reset: true })
    })

    on(els.modelRoot, "change", () => {
      void saveModelRoot(els.modelRoot.value)
    })

    on(els.hfQuery, "input", () => {
      state.hf.query = normalizeString(els.hfQuery.value)
    })

    on(els.hfSearchForm, "submit", (event) => {
      event.preventDefault()
      void searchHuggingFaceModels()
    })
  }

  function initElements() {
    els.runtimePlatform = $("llama-runtime-platform")
    els.runtimeCheckUpdates = $("llama-runtime-check-updates")
    els.runtimePackList = $("llama-runtime-pack-list")
    els.copyHardware = $("llama-copy-hardware")
    els.cpuStatus = $("llama-cpu-status")
    els.cpuName = $("llama-cpu-name")
    els.cpuMeta = $("llama-cpu-meta")
    els.ramTotal = $("llama-ram-total")
    els.vramTotal = $("llama-vram-total")
    els.gpuStrategyRow = $("llama-gpu-strategy-row")
    els.gpuStrategy = $("llama-gpu-strategy")
    els.gpuList = $("llama-gpu-list")
    els.limitDedicatedRow = $("llama-limit-dedicated-row")
    els.limitDedicatedMemory = $("llama-limit-dedicated-memory")
    els.offloadKvRow = $("llama-offload-kv-row")
    els.offloadKvCache = $("llama-offload-kv-cache")
    els.guardrails = Array.from(document.querySelectorAll("input[name='llama-guardrail']"))
    els.runtimeStatus = $("llama-runtime-status")
    els.runtimeUrl = $("llama-runtime-url")
    els.runtimeStop = $("llama-runtime-stop")
    els.runtimeDetail = $("llama-runtime-detail")
    els.runtimeSetupNotice = $("llama-runtime-setup-notice")
    els.openExtensionSettings = $("llama-open-extension-settings")
    els.modelRoot = $("llama-model-root")
    els.modelRootBrowse = $("llama-model-root-browse")
    els.modelRootReset = $("llama-model-root-reset")
    els.modelList = $("llama-model-list")
    els.downloadView = $("llama-download-view")
    els.downloadsSection = $("llama-downloads-section")
    els.downloadsList = $("llama-downloads-list")
    els.hfSearchForm = $("llama-hf-search-form")
    els.hfQuery = $("llama-hf-query")
    els.hfStatus = $("llama-hf-status")
    els.hfResultsList = $("llama-hf-results-list")
    els.hfSearchSubmit = els.hfSearchForm?.querySelector("button[type='submit']") || null
    els.message = $("llama-message")
  }

  function init() {
    initElements()
    bindEvents()
    startRuntimeStatusPolling()
    void loadSettings()
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init)
  } else {
    init()
  }
})()
