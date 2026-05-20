(function () {
  "use strict"

  const DIFFUSION_RUNTIME_LIBRARY_ID = "anthori-diffusion-runtime"
  const DOWNLOAD_STATUS_POLL_MS = 1000
  const SUPPORTED_MODEL_EXTENSIONS = [".safetensors", ".gguf", ".ckpt"]
  const HUGGING_FACE_SEARCH_LIMIT = "20"
  const OPERATION_FILTERS = [
    {
      id: "text-to-image",
      label: "Text to Image",
      controls: ["TextToImage"],
      search: "stable diffusion checkpoint",
    },
    {
      id: "image-to-image",
      label: "Image to Image",
      controls: ["ImageToImage"],
      search: "stable diffusion image to image checkpoint",
    },
    {
      id: "text-to-video",
      label: "Text to Video",
      controls: ["TextToVideo"],
      search: "text to video gguf",
    },
    {
      id: "image-to-video",
      label: "Image to Video",
      controls: ["ImageToVideo"],
      search: "image to video gguf",
    },
    {
      id: "all",
      label: "All",
      controls: [],
      search: "stable diffusion gguf safetensors",
    },
  ]
  const DEFAULTS = {
    modelRoot: "",
    runtimeId: "",
  }
  const CURATED_MODEL_BUNDLES = [
    {
      id: "sd15-fp16-starter",
      name: "Stable Diffusion 1.5 FP16",
      description: "Starter single-file checkpoint for image generation.",
      operations: ["text-to-image", "image-to-image"],
      tags: ["Starter", "Stable Diffusion", "2.13 GB"],
      slots: [
        {
          id: "checkpoint",
          label: "Checkpoint",
          role: "Checkpoint",
          fixed: true,
          variants: [
            {
              id: "v1-5-pruned-emaonly-fp16",
              label: "FP16",
              repository: "Comfy-Org/stable-diffusion-v1-5-archive",
              file: "v1-5-pruned-emaonly-fp16.safetensors",
              bytes: 2130000000,
            },
          ],
        },
      ],
    },
    {
      id: "wan2.2-t2v-a14b",
      name: "Wan 2.2 T2V A14B",
      description: "Text-to-video Wan 2.2 MoE package for stable-diffusion.cpp.",
      operations: ["text-to-video"],
      tags: ["Advanced", "Video", "Multi-file"],
      slots: [
        {
          id: "highNoise",
          label: "High-noise model",
          role: "High Noise",
          defaultVariantId: "q4_k_m",
          variants: [
            {
              id: "q4_k_m",
              label: "Q4_K_M",
              repository: "QuantStack/Wan2.2-T2V-A14B-GGUF",
              file: "HighNoise/Wan2.2-T2V-A14B-HighNoise-Q4_K_M.gguf",
              bytes: 9650000000,
            },
            {
              id: "q3_k_m",
              label: "Q3_K_M",
              repository: "QuantStack/Wan2.2-T2V-A14B-GGUF",
              file: "HighNoise/Wan2.2-T2V-A14B-HighNoise-Q3_K_M.gguf",
              bytes: 7170000000,
            },
            {
              id: "q5_k_m",
              label: "Q5_K_M",
              repository: "QuantStack/Wan2.2-T2V-A14B-GGUF",
              file: "HighNoise/Wan2.2-T2V-A14B-HighNoise-Q5_K_M.gguf",
              bytes: 11000000000,
            },
            {
              id: "q6",
              label: "Q6_K",
              repository: "QuantStack/Wan2.2-T2V-A14B-GGUF",
              file: "HighNoise/Wan2.2-T2V-A14B-HighNoise-Q6_K.gguf",
              bytes: 12000000000,
            },
            {
              id: "q8",
              label: "Q8_0",
              repository: "QuantStack/Wan2.2-T2V-A14B-GGUF",
              file: "HighNoise/Wan2.2-T2V-A14B-HighNoise-Q8_0.gguf",
              bytes: 15400000000,
            },
          ],
        },
        {
          id: "lowNoise",
          label: "Low-noise model",
          role: "Low Noise",
          defaultVariantId: "q4_k_m",
          variants: [
            {
              id: "q4_k_m",
              label: "Q4_K_M",
              repository: "QuantStack/Wan2.2-T2V-A14B-GGUF",
              file: "LowNoise/Wan2.2-T2V-A14B-LowNoise-Q4_K_M.gguf",
              bytes: 9650000000,
            },
            {
              id: "q3_k_m",
              label: "Q3_K_M",
              repository: "QuantStack/Wan2.2-T2V-A14B-GGUF",
              file: "LowNoise/Wan2.2-T2V-A14B-LowNoise-Q3_K_M.gguf",
              bytes: 7170000000,
            },
            {
              id: "q5_k_m",
              label: "Q5_K_M",
              repository: "QuantStack/Wan2.2-T2V-A14B-GGUF",
              file: "LowNoise/Wan2.2-T2V-A14B-LowNoise-Q5_K_M.gguf",
              bytes: 11000000000,
            },
            {
              id: "q6",
              label: "Q6_K",
              repository: "QuantStack/Wan2.2-T2V-A14B-GGUF",
              file: "LowNoise/Wan2.2-T2V-A14B-LowNoise-Q6_K.gguf",
              bytes: 12000000000,
            },
            {
              id: "q8",
              label: "Q8_0",
              repository: "QuantStack/Wan2.2-T2V-A14B-GGUF",
              file: "LowNoise/Wan2.2-T2V-A14B-LowNoise-Q8_0.gguf",
              bytes: 15400000000,
            },
          ],
        },
        {
          id: "textEncoder",
          label: "T5 text encoder",
          role: "T5 Encoder",
          defaultVariantId: "q4_k_m",
          variants: [
            {
              id: "q4_k_m",
              label: "Q4_K_M",
              repository: "city96/umt5-xxl-encoder-gguf",
              file: "umt5-xxl-encoder-Q4_K_M.gguf",
              bytes: 3660000000,
            },
            {
              id: "q3_k_m",
              label: "Q3_K_M",
              repository: "city96/umt5-xxl-encoder-gguf",
              file: "umt5-xxl-encoder-Q3_K_M.gguf",
              bytes: 3060000000,
            },
            {
              id: "q5_k_m",
              label: "Q5_K_M",
              repository: "city96/umt5-xxl-encoder-gguf",
              file: "umt5-xxl-encoder-Q5_K_M.gguf",
              bytes: 4120000000,
            },
            {
              id: "q6",
              label: "Q6_K",
              repository: "city96/umt5-xxl-encoder-gguf",
              file: "umt5-xxl-encoder-Q6_K.gguf",
              bytes: 4670000000,
            },
            {
              id: "q8",
              label: "Q8_0",
              repository: "city96/umt5-xxl-encoder-gguf",
              file: "umt5-xxl-encoder-Q8_0.gguf",
              bytes: 6040000000,
            },
            {
              id: "f16",
              label: "F16",
              repository: "city96/umt5-xxl-encoder-gguf",
              file: "umt5-xxl-encoder-F16.gguf",
              bytes: 11400000000,
            },
          ],
        },
        {
          id: "vae",
          label: "VAE",
          role: "VAE",
          fixed: true,
          variants: [
            {
              id: "wan2.1-vae",
              label: "Wan2.1 VAE",
              repository: "QuantStack/Wan2.2-T2V-A14B-GGUF",
              file: "VAE/Wan2.1_VAE.safetensors",
              bytes: 254000000,
            },
          ],
        },
      ],
    },
  ]

  const state = {
    surface: "",
    values: { ...DEFAULTS },
    models: [],
    modelRoots: [],
    runtime: null,
    runtimePlatform: "",
    runtimePacks: [],
    activeDownloads: {},
    bundleBusyId: "",
    bundleSelections: {},
    selectedOperation: "text-to-image",
    expandedHuggingFaceRepositories: new Set(),
    selectedRuntimeId: "",
    runtimeBusyId: "",
    hardware: null,
    busy: false,
    message: "",
    draftTimer: 0,
    downloadStatusPollTimer: 0,
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

  function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value)
  }

  function normalizeString(value) {
    return String(value ?? "").trim()
  }

  function basename(path) {
    const value = normalizeString(path)
    if (!value) return ""
    const parts = value.split(/[\\/]+/).filter(Boolean)
    return parts[parts.length - 1] || value
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

  function normalizeValues(value) {
    const source = value && typeof value === "object" ? value : {}
    return {
      modelRoot: normalizeString(source.modelRoot),
      runtimeId: normalizeString(source.runtimeId),
    }
  }

  function formatBytes(value) {
    const bytes = Number(value) || 0
    if (bytes <= 0) return ""
    const units = ["B", "KB", "MB", "GB", "TB"]
    let size = bytes
    let index = 0
    while (size >= 1024 && index < units.length - 1) {
      size /= 1024
      index += 1
    }
    return `${size.toFixed(index === 0 ? 0 : 1)} ${units[index]}`
  }

  function normalizeByteCount(...values) {
    for (const value of values) {
      const number = Number(value)
      if (Number.isFinite(number) && number > 0) return Math.floor(number)
    }
    return 0
  }

  function operationInfo(value) {
    const id = normalizeString(value) || "text-to-image"
    return OPERATION_FILTERS.find((entry) => entry.id === id) || OPERATION_FILTERS[0]
  }

  function selectedOperationInfo() {
    return operationInfo(state.selectedOperation)
  }

  function selectedOperationId() {
    const info = selectedOperationInfo()
    return info ? info.id : "text-to-image"
  }

  function operationLabel(value) {
    const info = operationInfo(value)
    return info ? info.label : normalizeString(value)
  }

  function packageOperationIds(modelPackage) {
    const operations = Array.isArray(modelPackage && modelPackage.operations)
      ? modelPackage.operations.map(normalizeString).filter(Boolean)
      : []
    return operations.length ? operations : ["text-to-image", "image-to-image"]
  }

  function packageMatchesSelectedOperation(modelPackage) {
    const operation = selectedOperationId()
    if (operation === "all") return true
    return packageOperationIds(modelPackage).includes(operation)
  }

  function packageControlLabels(modelPackage) {
    const controls = []
    packageOperationIds(modelPackage).forEach((operation) => {
      const info = operationInfo(operation)
      if (!info || !Array.isArray(info.controls)) return
      info.controls.forEach((control) => {
        if (control && !controls.includes(control)) controls.push(control)
      })
    })
    return controls
  }

  function packageTotalBytes(entries) {
    return entries.reduce((total, entry) => total + normalizeByteCount(entry && entry.bytes), 0)
  }

  function operationSearchPlaceholder() {
    const info = selectedOperationInfo()
    return info && info.search ? info.search : "stable diffusion gguf safetensors"
  }
  function createId(prefix) {
    const random = window.crypto && typeof window.crypto.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`
    return `${prefix}-${random}`
  }

  function encodePathSegments(value) {
    return normalizeString(value)
      .split("/")
      .filter(Boolean)
      .map((part) => encodeURIComponent(part))
      .join("/")
  }

  function huggingFaceUrl(path, query = {}) {
    const url = new URL(path, "https://huggingface.co")
    Object.entries(query).forEach(([key, value]) => {
      const normalized = normalizeString(value)
      if (normalized) url.searchParams.set(key, normalized)
    })
    return url.toString()
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

  function supportedModelFile(file) {
    const lower = normalizeString(file).toLowerCase()
    return SUPPORTED_MODEL_EXTENSIONS.some((extension) => lower.endsWith(extension))
  }

  function diffusionFileRole(file) {
    const lower = normalizeString(file).toLowerCase()
    const parts = lower.split("/").filter(Boolean)
    const joined = parts.join("/")
    const name = basename(lower)
    if (joined.includes("highnoise") || joined.includes("high-noise") || joined.includes("high_noise")) return "High Noise"
    if (joined.includes("lownoise") || joined.includes("low-noise") || joined.includes("low_noise")) return "Low Noise"
    if (name.includes("umt5") || name.includes("t5xxl") || parts.includes("text_encoder") || parts.includes("text-encoder")) return "T5 Encoder"
    if (joined.includes("clip_vision") || joined.includes("clip-vision") || joined.includes("clipvision")) return "CLIP Vision"
    if (parts.some((part) => part.includes("taesd") || part === "tae") || lower.includes("taesd")) return "TAESD"
    if (parts.includes("vae") || basename(lower).includes("vae")) return "VAE"
    if (parts.includes("lora") || parts.includes("loras") || basename(lower).includes("lora")) return "LoRA"
    if (parts.includes("controlnet") || parts.includes("control")) return "ControlNet"
    return "Checkpoint"
  }

  function activeDownloadFor(repository, file) {
    const target = huggingFaceModelKey(repository, file)
    if (!target) return null
    return activeDownloadItems().find((download) => huggingFaceModelKey(download.repository, download.file) === target) || null
  }

  function downloadedModelKeys() {
    const keys = new Set()
    state.models.forEach((model) => {
      const id = normalizeString(model.id || model.relativePath)
      if (id) keys.add(normalizeModelLookupKey(id))
      const repository = normalizeString(model.repository)
      const file = normalizeString(model.file)
      if (repository && file) keys.add(huggingFaceModelKey(repository, file))
    })
    return keys
  }

  function isDownloadedHuggingFaceFile(repository, file) {
    const key = huggingFaceModelKey(repository, file)
    return key ? downloadedModelKeys().has(key) : false
  }

  function normalizeDownload(value) {
    if (!value || typeof value !== "object") return null
    const id = normalizeString(value.id)
    if (!id) return null
    return {
      id,
      repository: normalizeString(value.repository),
      file: normalizeString(value.file),
      revision: normalizeString(value.revision) || "main",
      status: normalizeString(value.status) || "starting",
      error: normalizeString(value.error),
      bytesTotal: normalizeByteCount(value.bytesTotal, value.bytes),
      bytesDownloaded: normalizeByteCount(value.bytesDownloaded),
      startedAt: normalizeString(value.startedAt),
      updatedAt: normalizeString(value.updatedAt),
    }
  }

  function activeDownloadItems() {
    return Object.values(state.activeDownloads || {}).map(normalizeDownload).filter(Boolean)
  }

  function downloadIsActive(download) {
    const status = normalizeString(download && download.status)
    return status === "starting" || status === "downloading"
  }

  function downloadIsTerminal(download) {
    const status = normalizeString(download && download.status)
    return status === "complete" || status === "failed" || status === "canceled"
  }

  function downloadProgressPercent(download) {
    const total = normalizeByteCount(download && download.bytesTotal)
    const downloaded = normalizeByteCount(download && download.bytesDownloaded)
    if (total <= 0 || downloaded <= 0) return 0
    return Math.max(0, Math.min(100, Math.round((downloaded / total) * 100)))
  }

  function formatDownloadProgress(download) {
    const total = normalizeByteCount(download && download.bytesTotal)
    const downloaded = normalizeByteCount(download && download.bytesDownloaded)
    if (total > 0 && downloaded > 0) return `${formatBytes(downloaded)} / ${formatBytes(total)} (${downloadProgressPercent(download)}%)`
    if (downloadIsActive(download) && total > 0) return `0 B / ${formatBytes(total)} (0%)`
    if (downloaded > 0) return `${formatBytes(downloaded)} downloaded`
    return downloadIsActive(download) ? "Connecting..." : ""
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
    updateDownloadStatusPolling()
  }

  function normalizeRuntimePack(value) {
    if (!value || typeof value !== "object") return null
    const id = normalizeString(value.id)
    if (!id) return null
    return {
      id,
      name: normalizeString(value.name) || id,
      description: normalizeString(value.description),
      type: normalizeString(value.type),
      variant: normalizeString(value.variant),
      backend: normalizeString(value.backend),
      paramsBackend: normalizeString(value.paramsBackend),
      platform: normalizeString(value.platform),
      installed: value.installed === true || value.available === true,
      available: value.available === true || value.installed === true,
      compatible: value.compatible !== false,
      configured: value.configured === true || value.selected === true,
      selected: value.selected === true,
      installable: value.installable === true,
      reason: normalizeString(value.reason),
      binaryPath: normalizeString(value.binaryPath || value.path),
      candidates: Array.isArray(value.candidates) ? value.candidates.map(normalizeString).filter(Boolean) : [],
    }
  }

  function runtimePackKey(value) {
    return normalizeString(value).toLowerCase()
  }

  function runtimePackIsSelectable(pack) {
    return Boolean(pack && pack.compatible !== false && pack.available === true)
  }

  function adoptSelectedRuntimeFromPacks() {
    if (normalizeString(state.values.runtimeId)) return false
    const selected = state.runtimePacks.find((pack) => pack.selected && runtimePackIsSelectable(pack)) ||
      state.runtimePacks.find(runtimePackIsSelectable)
    if (!selected) return false
    state.values.runtimeId = selected.id
    return true
  }

  function setMessage(message) {
    state.message = normalizeString(message)
    if (els.message) els.message.textContent = state.message
  }

  async function callDiffusionAction(actionId, input = {}) {
    const api = window.anthoriExtension && window.anthoriExtension.actions
    if (!api || typeof api.call !== "function") {
      throw new Error("Extension actions are unavailable.")
    }
    const response = await api.call({
      libraryId: DIFFUSION_RUNTIME_LIBRARY_ID,
      actionId,
      input: input && typeof input === "object" ? input : {},
    })
    return response && typeof response.output === "object" && response.output !== null ? response.output : {}
  }

  async function fetchHuggingFaceJson(url) {
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
    const status = Number(response && response.status)
    const body = normalizeString(response && response.body)
    if (normalizeString(response && response.bodyEncoding)) {
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
      const message = normalizeString(parsed && (parsed.error || parsed.message)) || `Hugging Face returned ${status || "an error"}.`
      throw new Error(message)
    }
    return parsed
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
          reason: "To browse and download diffusion model files from Hugging Face.",
        },
        {
          capability: "network",
          access: "connect",
          scope: "https://cdn-lfs.hf.co",
          scopeLabel: "https://cdn-lfs.hf.co",
          reason: "To download diffusion model file blobs from Hugging Face.",
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
    if (!file || !supportedModelFile(file)) return null
    const lfs = isPlainObject(entry.lfs) ? entry.lfs : {}
    const blobLfs = isPlainObject(entry.blobLfs) ? entry.blobLfs : {}
    return {
      file,
      bytes: normalizeByteCount(entry.size, lfs.size, blobLfs.size),
      role: diffusionFileRole(file),
    }
  }

  function sortHuggingFaceFiles(left, right) {
    const roleOrder = new Map([
      ["Checkpoint", 0],
      ["High Noise", 1],
      ["Low Noise", 2],
      ["T5 Encoder", 3],
      ["VAE", 4],
      ["TAESD", 5],
      ["CLIP Vision", 6],
      ["LoRA", 7],
      ["ControlNet", 8],
    ])
    const leftRole = roleOrder.has(left && left.role) ? roleOrder.get(left.role) : 99
    const rightRole = roleOrder.has(right && right.role) ? roleOrder.get(right.role) : 99
    if (leftRole !== rightRole) return leftRole - rightRole
    const leftBytes = normalizeByteCount(left && left.bytes)
    const rightBytes = normalizeByteCount(right && right.bytes)
    if (leftBytes > 0 && rightBytes > 0 && leftBytes !== rightBytes) return leftBytes - rightBytes
    if (leftBytes > 0 && rightBytes <= 0) return -1
    if (leftBytes <= 0 && rightBytes > 0) return 1
    return normalizeString(left && left.file).localeCompare(normalizeString(right && right.file))
  }

  function normalizeHuggingFaceFiles(detail) {
    const siblings = Array.isArray(detail && detail.siblings) ? detail.siblings : []
    return siblings
      .map(normalizeHuggingFaceFile)
      .filter(Boolean)
      .sort(sortHuggingFaceFiles)
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

  function selectedPathValue(selected) {
    if (typeof selected === "string") return normalizeString(selected)
    if (!selected || typeof selected !== "object") return ""
    return normalizeString(selected.path || selected.value || selected.filePath || selected.directoryPath)
  }

  async function browseModelRoot() {
    const api = window.anthoriExtension && window.anthoriExtension.host
    if (!api || typeof api.selectPath !== "function") {
      setMessage("Path picker bridge is unavailable.")
      return
    }
    try {
      const selected = await api.selectPath({
        title: "Choose Model Directory",
        message: "Choose the folder Anthori should scan for local diffusion model files.",
        selection: "directory",
        initialPath:
          normalizeString(els.modelRoot && els.modelRoot.value) ||
          state.values.modelRoot ||
          state.modelRoots[state.modelRoots.length - 1] ||
          "",
        selectLabel: "Use Folder",
        showFiles: false,
        allowCreate: true,
      })
      const path = selectedPathValue(selected)
      if (!path) return
      if (els.modelRoot) els.modelRoot.value = path
      await saveSettingsDraft()
      await refreshAll()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to choose model directory.")
    }
  }

  function collectSettings() {
    return normalizeValues({
      modelRoot: els.modelRoot ? els.modelRoot.value : state.values.modelRoot,
      runtimeId: state.values.runtimeId || state.selectedRuntimeId,
    })
  }

  function syncSettingsFields() {
    if (els.modelRoot) els.modelRoot.value = state.values.modelRoot
  }

  function syncDetectedPlaceholders() {
    if (els.modelRoot && !state.values.modelRoot && state.modelRoots.length > 0) {
      els.modelRoot.placeholder = state.modelRoots[state.modelRoots.length - 1]
    }
  }

  async function loadSettings() {
    const api = window.anthoriExtension && window.anthoriExtension.settings
    if (!api || typeof api.get !== "function") {
      state.values = normalizeValues(DEFAULTS)
      setMessage("Extension settings are unavailable.")
      return
    }
    try {
      const rawValues = await api.get(DEFAULTS)
      state.values = normalizeValues(rawValues)
    } catch (error) {
      state.values = normalizeValues(DEFAULTS)
      setMessage(error instanceof Error ? error.message : "Extension settings are unavailable.")
    }
  }

  async function saveSettingsDraft() {
    const api = window.anthoriExtension && window.anthoriExtension.settings
    if (!api || typeof api.setDraft !== "function") {
      throw new Error("Extension settings are unavailable.")
    }
    state.values = collectSettings()
    state.values = await persistSettingsValues(state.values)
    syncSettingsFields()
  }

  async function persistSettingsValues(values) {
    const api = window.anthoriExtension && window.anthoriExtension.settings
    if (!api || typeof api.setDraft !== "function") {
      throw new Error("Extension settings are unavailable.")
    }
    let nextValues = normalizeValues(await api.setDraft(normalizeValues(values), { replace: true }))
    if (typeof api.commit === "function") {
      nextValues = normalizeValues(await api.commit())
    }
    return nextValues
  }

  function scheduleSettingsDraftSave() {
    if (state.surface !== "settings") return
    state.values = collectSettings()
    if (state.draftTimer) {
      window.clearTimeout(state.draftTimer)
    }
    state.draftTimer = window.setTimeout(async () => {
      state.draftTimer = 0
      try {
        await saveSettingsDraft()
        await refreshAll()
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Save failed.")
      }
    }, 250)
  }

  function actionInput() {
    return {
      modelRoot: state.values.modelRoot,
      runtimeId: state.values.runtimeId || state.selectedRuntimeId,
    }
  }

  async function refreshRuntimePacks() {
    const data = await callDiffusionAction("runtimes-list", actionInput())
    state.runtimePlatform = normalizeString(data.platform)
    state.selectedRuntimeId = normalizeString(data.selectedRuntimeId)
    state.runtimePacks = Array.isArray(data.runtimes)
      ? data.runtimes.map(normalizeRuntimePack).filter(Boolean)
      : []
    state.runtime = data.status && typeof data.status === "object"
      ? data.status
      : (data.runtime && typeof data.runtime === "object" ? data.runtime : null)
    if (adoptSelectedRuntimeFromPacks()) {
      state.values = await persistSettingsValues(state.values)
      state.selectedRuntimeId = state.values.runtimeId
    }
  }

  async function refreshModels() {
    const data = await callDiffusionAction("models-list", actionInput())
    state.models = Array.isArray(data.models) ? data.models : []
    state.modelRoots = Array.isArray(data.modelRoots) ? data.modelRoots.map(normalizeString).filter(Boolean) : []
  }

  function updateDownloadStatusPolling() {
    const hasActiveDownloads = activeDownloadItems().length > 0
    if (hasActiveDownloads && !state.downloadStatusPollTimer) {
      state.downloadStatusPollTimer = window.setInterval(() => {
        void refreshDownloadStatuses({ renderAfter: true })
      }, DOWNLOAD_STATUS_POLL_MS)
    } else if (!hasActiveDownloads && state.downloadStatusPollTimer) {
      window.clearInterval(state.downloadStatusPollTimer)
      state.downloadStatusPollTimer = 0
    }
  }

  async function refreshDownloadStatuses(options = {}) {
    try {
      const data = await callDiffusionAction("models-download-status", {})
      const items = Array.isArray(data.downloads) ? data.downloads.map(normalizeDownload).filter(Boolean) : []
      let completed = false
      items.forEach((download) => {
        if (downloadIsActive(download)) {
          setActiveDownload(download)
        } else if (downloadIsTerminal(download)) {
          if (state.activeDownloads[download.id]) {
            removeActiveDownload(download.id)
            if (download.status === "complete") completed = true
          }
        }
      })
      Object.keys(state.activeDownloads).forEach((id) => {
        if (!items.some((download) => download.id === id)) removeActiveDownload(id)
      })
      if (completed) await refreshModels()
    } catch (error) {
      if (!options.silent) setMessage(error instanceof Error ? error.message : "Download status refresh failed.")
    }
    updateDownloadStatusPolling()
    if (options.renderAfter) render()
  }

  async function refreshHardware() {
    try {
      state.hardware = await callDiffusionAction("hardware-info", {})
    } catch (_error) {
      state.hardware = null
    }
  }

  async function refreshAll(options = {}) {
    try {
      await Promise.all([refreshRuntimePacks(), refreshModels(), refreshHardware(), refreshDownloadStatuses({ silent: true })])
      if (options.notify) setMessage("Diffusion refreshed.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Diffusion refresh failed.")
    }
    render()
  }

  function runtimeLabel() {
    if (!state.runtime) return "Checking"
    return state.runtime.available ? "Ready" : "Not configured"
  }

  function renderRuntime() {
    const label = runtimeLabel()
    if (els.runtimeStatus) {
      els.runtimeStatus.textContent = label
      els.runtimeStatus.classList.toggle("muted", label !== "Ready")
    }
    if (els.panelStatus) {
      els.panelStatus.textContent = `${label}${state.models.length ? ` - ${state.models.length} models` : ""}`
      els.panelStatus.classList.toggle("muted", label !== "Ready")
    }
    if (els.setupNotice) {
      els.setupNotice.hidden = Boolean(state.runtime && state.runtime.available)
    }
    if (els.runtimeDetail) {
      if (state.runtime && state.runtime.available) {
        const version = normalizeString(state.runtime.version)
        const engine = normalizeString(state.runtime.name || state.runtime.variant || state.runtime.runtimeId)
        els.runtimeDetail.textContent = [
          engine ? `Engine: ${engine}` : "",
          `Using: ${state.runtime.runtimePath}`,
          version,
        ].filter(Boolean).join("\n")
      } else if (state.runtime && Array.isArray(state.runtime.candidates)) {
        const reason = normalizeString(state.runtime.reason)
        els.runtimeDetail.textContent = [
          reason,
          `Checked ${state.runtime.candidates.length} runtime paths.`,
        ].filter(Boolean).join("\n")
      } else {
        els.runtimeDetail.textContent = ""
      }
    }
    syncDetectedPlaceholders()
  }

  function renderRuntimePacks() {
    if (!els.runtimePackList) return
    const packs = state.runtimePacks.filter((pack) => pack.compatible !== false)
    if (els.runtimePlatform) els.runtimePlatform.textContent = state.runtimePlatform
    els.runtimePackList.replaceChildren()
    if (packs.length === 0) {
      const empty = document.createElement("div")
      empty.className = "diffusion-empty"
      empty.textContent = "No runtime engines found."
      els.runtimePackList.appendChild(empty)
      return
    }
    packs.forEach((pack) => {
      const card = document.createElement("article")
      card.className = "diffusion-item diffusion-runtime-card"

      const main = document.createElement("div")
      main.className = "diffusion-runtime-card-main"
      const title = document.createElement("div")
      title.className = "diffusion-item-title"
      title.textContent = pack.name
      const meta = document.createElement("div")
      meta.className = "diffusion-item-meta"
      meta.textContent = [
        pack.description,
        pack.backend ? `Backend ${pack.backend}` : "",
        pack.binaryPath,
        !pack.available && pack.reason ? pack.reason : "",
      ].filter(Boolean).join(" - ")
      const badges = document.createElement("div")
      badges.className = "diffusion-chip-row"
      const statusBadge = document.createElement("span")
      statusBadge.className = `diffusion-badge${pack.available ? " ok" : ""}`
      statusBadge.textContent = pack.available ? "Installed" : "Runtime missing"
      badges.appendChild(statusBadge)
      if (pack.selected) {
        const selected = document.createElement("span")
        selected.className = "diffusion-badge ok"
        selected.textContent = "Selected"
        badges.appendChild(selected)
      } else if (pack.configured) {
        const configured = document.createElement("span")
        configured.className = "diffusion-badge"
        configured.textContent = "Configured"
        badges.appendChild(configured)
      }
      main.append(title, meta, badges)

      const actions = document.createElement("div")
      actions.className = "diffusion-inline-actions"
      const primary = document.createElement("button")
      primary.className = "diffusion-button"
      primary.type = "button"
      const busy = state.runtimeBusyId === pack.id
      if (runtimePackIsSelectable(pack) && !pack.selected) {
        primary.textContent = busy ? "Selecting" : "Use"
        primary.addEventListener("click", () => {
          void selectRuntimePack(pack.id)
        })
      } else {
        primary.textContent = pack.selected ? "In use" : pack.configured ? "Missing" : pack.installable ? "Install" : "Install manually"
        primary.disabled = true
      }
      primary.disabled = primary.disabled || state.busy || Boolean(state.runtimeBusyId)
      actions.appendChild(primary)

      card.append(main, actions)
      els.runtimePackList.appendChild(card)
    })
  }

  function renderHardware() {
    if (!els.hardware) return
    const hardware = state.hardware || {}
    const memory = formatBytes(hardware.memoryBytes)
    els.hardware.textContent = [
      hardware.platform || "",
      hardware.cpuCount ? `${hardware.cpuCount} CPU threads` : "",
      memory ? `${memory} RAM` : "",
    ].filter(Boolean).join("\n")
  }

  function renderEmpty(container, text) {
    if (!(container instanceof HTMLElement)) return
    const empty = document.createElement("div")
    empty.className = "diffusion-empty"
    empty.textContent = text
    container.appendChild(empty)
  }


  function renderOperationTabs() {
    if (!els.operationTabs) return
    els.operationTabs.replaceChildren()
    const selected = selectedOperationId()
    OPERATION_FILTERS.forEach((operation) => {
      const button = document.createElement("button")
      button.type = "button"
      button.className = `diffusion-operation-button${operation.id === selected ? " is-active" : ""}`
      button.textContent = operation.label
      button.setAttribute("aria-pressed", operation.id === selected ? "true" : "false")
      button.addEventListener("click", () => {
        if (state.selectedOperation === operation.id) return
        state.selectedOperation = operation.id
        state.expandedHuggingFaceRepositories.clear()
        state.hf.query = ""
        state.hf.results = []
        state.hf.filesByRepository = {}
        state.hf.error = ""
        if (els.hfQuery) els.hfQuery.value = ""
        render()
      })
      els.operationTabs.appendChild(button)
    })
  }

  function renderModels() {
    if (els.modelCount) {
      els.modelCount.textContent = state.models.length ? `${state.models.length} found` : "None found"
    }
    if (!els.modelList) return
    els.modelList.replaceChildren()
    if (!state.models.length) {
      const empty = document.createElement("div")
      empty.className = "diffusion-empty"
      empty.textContent = "No local diffusion models found."
      els.modelList.appendChild(empty)
      return
    }
    state.models.forEach((model) => {
      const item = document.createElement("article")
      item.className = "diffusion-item"

      const title = document.createElement("div")
      title.className = "diffusion-item-title"
      title.textContent = normalizeString(model.name) || normalizeString(model.path)
      item.appendChild(title)

      const meta = document.createElement("div")
      meta.className = "diffusion-item-meta"
      meta.textContent = [
        normalizeString(model.role),
        formatBytes(model.sizeBytes),
        normalizeString(model.relativePath),
      ].filter(Boolean).join(" - ")
      item.appendChild(meta)

      const path = document.createElement("div")
      path.className = "diffusion-item-meta"
      path.textContent = normalizeString(model.path)
      item.appendChild(path)

      els.modelList.appendChild(item)
    })
  }

  function selectedBundleVariant(bundle, slot) {
    const variants = Array.isArray(slot && slot.variants) ? slot.variants : []
    if (variants.length === 0) return null
    if (slot.fixed) return variants[0]
    const bundleSelections = state.bundleSelections[bundle.id] || {}
    const selectedId = normalizeString(bundleSelections[slot.id])
    const defaultId = normalizeString(slot.defaultVariantId)
    return variants.find((variant) => normalizeString(variant.id) === selectedId) ||
      variants.find((variant) => normalizeString(variant.id) === defaultId) ||
      variants[0]
  }

  function bundleDownloadEntries(bundle) {
    return (Array.isArray(bundle && bundle.slots) ? bundle.slots : [])
      .map((slot) => {
        const variant = selectedBundleVariant(bundle, slot)
        if (!variant) return null
        return {
          packageId: bundle.id,
          slotId: slot.id,
          slotLabel: slot.label,
          role: slot.role,
          repository: normalizeString(variant.repository),
          file: normalizeString(variant.file),
          revision: normalizeString(variant.revision) || "main",
          bytes: normalizeByteCount(variant.bytes),
          label: normalizeString(variant.label),
        }
      })
      .filter((entry) => entry.repository && entry.file)
  }

  function bundleEntryStatus(entry) {
    const activeDownload = activeDownloadFor(entry.repository, entry.file)
    if (activeDownload) return { label: "Downloading", activeDownload }
    if (isDownloadedHuggingFaceFile(entry.repository, entry.file)) return { label: "Downloaded", downloaded: true }
    return { label: "Missing" }
  }

  function bundleInstallSummary(entries) {
    let active = 0
    let downloaded = 0
    entries.forEach((entry) => {
      const status = bundleEntryStatus(entry)
      if (status.activeDownload) active += 1
      if (status.downloaded) downloaded += 1
    })
    if (downloaded === entries.length && entries.length > 0) return { label: "Installed", active, downloaded, missing: 0 }
    return {
      label: active > 0 ? "Downloading" : downloaded > 0 ? "Partial" : "Not downloaded",
      active,
      downloaded,
      missing: Math.max(0, entries.length - downloaded - active),
    }
  }

  function renderBundles() {
    if (!els.bundleList) return
    els.bundleList.replaceChildren()
    const packages = CURATED_MODEL_BUNDLES.filter(packageMatchesSelectedOperation)
    if (packages.length === 0) {
      renderEmpty(els.bundleList, `No curated ${operationLabel(selectedOperationId()).toLowerCase()} packages are available.`)
      return
    }
    packages.forEach((bundle) => {
      const entries = bundleDownloadEntries(bundle)
      const summary = bundleInstallSummary(entries)
      const totalBytes = packageTotalBytes(entries)
      const fileLabel = entries.length === 1 ? "1 file" : `${entries.length} files`
      const card = document.createElement("article")
      card.className = "diffusion-item diffusion-bundle-card"

      const header = document.createElement("div")
      header.className = "diffusion-row"
      const titleGroup = document.createElement("div")
      titleGroup.className = "diffusion-runtime-card-main"
      const title = document.createElement("div")
      title.className = "diffusion-item-title"
      title.textContent = bundle.name
      const meta = document.createElement("div")
      meta.className = "diffusion-item-meta"
      meta.textContent = [bundle.description, fileLabel, formatBytes(totalBytes)].filter(Boolean).join(" - ")
      titleGroup.append(title, meta)
      const controlLabels = packageControlLabels(bundle)
      if (controlLabels.length > 0) {
        const use = document.createElement("div")
        use.className = "diffusion-item-meta"
        use.textContent = `Controls: ${controlLabels.join(", ")}`
        titleGroup.appendChild(use)
      }
      const tags = [...(Array.isArray(bundle.tags) ? bundle.tags : []), ...packageOperationIds(bundle).map(operationLabel)]
      if (tags.length > 0) {
        const chips = document.createElement("div")
        chips.className = "diffusion-chip-row"
        tags.forEach((tag) => {
          const chip = document.createElement("span")
          chip.className = "diffusion-badge"
          chip.textContent = tag
          chips.appendChild(chip)
        })
        titleGroup.appendChild(chips)
      }

      const badge = document.createElement("span")
      badge.className = `diffusion-badge${summary.downloaded === entries.length && entries.length > 0 ? " ok" : ""}`
      badge.textContent = summary.label
      header.append(titleGroup, badge)
      card.appendChild(header)

      const controls = document.createElement("div")
      controls.className = "diffusion-bundle-controls"
      const slots = Array.isArray(bundle.slots) ? bundle.slots : []
      slots.forEach((slot) => {
        const field = document.createElement("label")
        field.className = "diffusion-field diffusion-bundle-field"
        const label = document.createElement("span")
        label.textContent = slot.label
        field.appendChild(label)
        const variants = Array.isArray(slot.variants) ? slot.variants : []
        const selected = selectedBundleVariant(bundle, slot)
        if (slot.fixed || variants.length <= 1) {
          const value = document.createElement("div")
          value.className = "diffusion-bundle-fixed-value"
          value.textContent = normalizeString(selected && selected.label) || normalizeString(selected && selected.file) || "Default"
          field.appendChild(value)
        } else {
          const select = document.createElement("select")
          select.value = normalizeString(selected && selected.id)
          variants.forEach((variant) => {
            const option = document.createElement("option")
            option.value = normalizeString(variant.id)
            option.textContent = normalizeString(variant.label) || normalizeString(variant.file)
            select.appendChild(option)
          })
          select.addEventListener("change", () => {
            state.bundleSelections = Object.assign({}, state.bundleSelections, {
              [bundle.id]: Object.assign({}, state.bundleSelections[bundle.id] || {}, {
                [slot.id]: select.value,
              }),
            })
            render()
          })
          field.appendChild(select)
        }
        controls.appendChild(field)
      })
      card.appendChild(controls)

      const fileList = document.createElement("div")
      fileList.className = "diffusion-bundle-file-list"
      entries.forEach((entry) => {
        const status = bundleEntryStatus(entry)
        const row = document.createElement("div")
        row.className = "diffusion-bundle-file"
        const name = document.createElement("div")
        name.className = "diffusion-file-name"
        name.textContent = entry.file
        const detail = document.createElement("div")
        detail.className = "diffusion-file-meta"
        const progress = status.activeDownload ? formatDownloadProgress(status.activeDownload) : ""
        detail.textContent = [
          entry.role,
          entry.label,
          formatBytes(entry.bytes),
          status.label,
          progress,
        ].filter(Boolean).join(" - ")
        row.append(name, detail)
        fileList.appendChild(row)
      })
      card.appendChild(fileList)

      const actions = document.createElement("div")
      actions.className = "diffusion-inline-actions"
      const download = document.createElement("button")
      download.className = "diffusion-button"
      download.type = "button"
      const busy = state.bundleBusyId === bundle.id || summary.active > 0
      download.textContent = busy
        ? "Downloading"
        : summary.missing > 0
        ? `Download ${summary.missing} files`
        : "Downloaded"
      download.disabled = state.busy || Boolean(state.bundleBusyId) || summary.active > 0 || summary.missing === 0
      download.addEventListener("click", () => {
        void startBundleDownload(bundle.id)
      })
      actions.appendChild(download)
      card.appendChild(actions)

      els.bundleList.appendChild(card)
    })
  }

  function renderHuggingFaceResults() {
    if (!els.hfResultsList) return
    els.hfResultsList.replaceChildren()
    const networkAvailable = Boolean(window.anthoriExtension && window.anthoriExtension.network && window.anthoriExtension.network.fetch)
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
    if (!normalizeString(state.hf.query)) return
    if (state.hf.results.length === 0) {
      renderEmpty(els.hfResultsList, "No diffusion model repositories found.")
      return
    }
    state.hf.results.forEach((model) => {
      const card = document.createElement("article")
      const isExpanded = state.expandedHuggingFaceRepositories.has(model.repository)
      card.className = `diffusion-model-row${isExpanded ? " is-expanded" : ""}`

      const row = document.createElement("div")
      row.className = "diffusion-model-row-header"
      const main = document.createElement("button")
      main.className = "diffusion-model-row-main"
      main.type = "button"
      main.setAttribute("aria-expanded", isExpanded ? "true" : "false")
      const chevron = document.createElement("span")
      chevron.className = "diffusion-model-chevron"
      chevron.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>'
      const body = document.createElement("div")
      body.className = "diffusion-runtime-card-main"
      const title = document.createElement("div")
      title.className = "diffusion-item-title"
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
      const visibleTags = model.tags
        .filter((tag) => !["safetensors", "diffusers", "stable-diffusion"].includes(tag))
        .slice(0, 4)
      if (visibleTags.length > 0) metaParts.push(visibleTags.join(", "))
      const meta = document.createElement("div")
      meta.className = "diffusion-item-meta"
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
        list.className = "diffusion-file-list"
        if (isLoading && !files) {
          renderEmpty(list, "Loading files...")
        } else if (!files) {
          renderEmpty(list, "Files unavailable.")
        } else if (files.length === 0) {
          renderEmpty(list, "No supported model files found.")
        } else {
          files.forEach((file) => {
            const activeDownload = activeDownloadFor(model.repository, file.file)
            const isActiveDownload = Boolean(activeDownload)
            const isDownloaded = isDownloadedHuggingFaceFile(model.repository, file.file)
            const fileRow = document.createElement("div")
            fileRow.className = "diffusion-file-row"

            const main = document.createElement("div")
            main.className = "diffusion-file-main"
            const name = document.createElement("div")
            name.className = "diffusion-file-name"
            name.textContent = file.file
            const meta = document.createElement("div")
            meta.className = "diffusion-file-meta"
            meta.textContent = [file.role, formatBytes(file.bytes) || "Size unavailable"].filter(Boolean).join(" - ")
            main.append(name, meta)

            const download = document.createElement("button")
            download.className = "diffusion-button"
            download.type = "button"
            const progress = downloadProgressPercent(activeDownload)
            download.textContent = isActiveDownload
              ? (progress > 0 ? `${progress}%` : "Downloading")
              : isDownloaded
              ? "Downloaded"
              : "Download"
            download.disabled = state.busy || isActiveDownload || isDownloaded
            download.addEventListener("click", () => {
              void startModelDownload({
                repository: model.repository,
                file: file.file,
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
    const downloads = activeDownloadItems()
    els.downloadsList.replaceChildren()
    if (downloads.length === 0) {
      if (els.downloadsSection) els.downloadsSection.hidden = true
      return
    }
    if (els.downloadsSection) els.downloadsSection.hidden = false
    downloads.forEach((download) => {
      const item = document.createElement("article")
      item.className = "diffusion-item"

      const row = document.createElement("div")
      row.className = "diffusion-row"
      const title = document.createElement("div")
      title.className = "diffusion-item-title"
      title.textContent = `${download.repository}/${download.file}`
      const cancel = document.createElement("button")
      cancel.className = "diffusion-button secondary"
      cancel.type = "button"
      cancel.textContent = "Cancel"
      cancel.addEventListener("click", () => {
        void cancelDownload(download)
      })
      row.append(title, cancel)
      item.appendChild(row)

      const meta = document.createElement("div")
      meta.className = "diffusion-item-meta"
      meta.textContent = [download.revision, download.status, formatDownloadProgress(download), download.error]
        .filter(Boolean)
        .join(" - ")
      item.appendChild(meta)

      const progress = document.createElement("div")
      progress.className = "diffusion-progress"
      const fill = document.createElement("div")
      fill.className = "diffusion-progress-fill"
      fill.style.width = `${downloadProgressPercent(download)}%`
      progress.appendChild(fill)
      item.appendChild(progress)

      els.downloadsList.appendChild(item)
    })
  }

  function renderModelRoots() {
    if (!els.modelDetail) return
    if (state.modelRoots.length === 0) {
      els.modelDetail.textContent = ""
      return
    }
    els.modelDetail.textContent = `Search roots:\n${state.modelRoots.join("\n")}`
    syncDetectedPlaceholders()
  }

  function render() {
    renderRuntimePacks()
    renderRuntime()
    renderHardware()
    renderOperationTabs()
    renderBundles()
    renderHuggingFaceResults()
    renderDownloads()
    renderModels()
    renderModelRoots()
    if (els.message) els.message.textContent = state.message
    if (els.refreshModels) els.refreshModels.disabled = state.busy
    if (els.hfQuery) {
      els.hfQuery.value = state.hf.query
      els.hfQuery.placeholder = operationSearchPlaceholder()
    }
    if (els.hfSearchSubmit) {
      els.hfSearchSubmit.disabled = state.busy || state.hf.searching || !(window.anthoriExtension && window.anthoriExtension.network && window.anthoriExtension.network.fetch)
    }
    if (els.hfStatus) {
      const active = activeDownloadItems()
      els.hfStatus.textContent = active.length === 1
        ? `Downloading ${active[0].file}${formatDownloadProgress(active[0]) ? ` - ${formatDownloadProgress(active[0])}` : "..."}`
        : active.length > 1
        ? `Downloading ${active.length} models`
        : state.hf.searching
        ? "Searching Hugging Face..."
        : (state.hf.results.length > 0 ? `${state.hf.results.length} repositories` : "")
    }
  }

  async function searchHuggingFaceModels() {
    const query = normalizeString(els.hfQuery && els.hfQuery.value)
    if (!query) return
    state.hf.query = query
    state.hf.searching = true
    state.hf.error = ""
    setMessage("")
    render()
    try {
      const searchParams = {
        search: query,
        sort: "downloads",
        direction: "-1",
        limit: HUGGING_FACE_SEARCH_LIMIT,
      }
      const operation = selectedOperationId()
      if (operation !== "all") searchParams.pipeline_tag = operation
      const data = await fetchHuggingFaceJson(huggingFaceUrl("/api/models", searchParams))
      const items = Array.isArray(data) ? data : (Array.isArray(data && data.models) ? data.models : [])
      state.hf.results = items.map(normalizeHuggingFaceModel).filter(Boolean)
      state.hf.filesByRepository = {}
      state.expandedHuggingFaceRepositories.clear()
      if (state.hf.results.length === 0) {
        state.hf.error = "No diffusion model repositories found."
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
      const detail = await fetchHuggingFaceJson(huggingFaceUrl(`/api/models/${encodePathSegments(normalizedRepository)}`, {
        blobs: "true",
      }))
      state.hf.filesByRepository = Object.assign({}, state.hf.filesByRepository, {
        [normalizedRepository]: normalizeHuggingFaceFiles(detail),
      })
    } catch (error) {
      state.hf.error = error instanceof Error ? error.message : "Failed to load model files."
    } finally {
      state.hf.loadingRepository = ""
      render()
    }
  }

  async function startModelDownload(input, options = {}) {
    const repository = normalizeString(input && input.repository)
    const file = normalizeString(input && input.file)
    const revision = normalizeString(input && input.revision) || "main"
    const bytes = normalizeByteCount(input && input.bytes)
    const quiet = options && options.quiet === true
    if (!repository || !file) {
      if (!quiet) setMessage("Repository and file are required.")
      return false
    }
    await refreshDownloadStatuses({ silent: true })
    if (isDownloadedHuggingFaceFile(repository, file)) {
      if (!quiet) setMessage("Model already downloaded.")
      render()
      return false
    }
    if (activeDownloadFor(repository, file)) {
      if (!quiet) setMessage("Model download already in progress.")
      render()
      return false
    }
    if (!options || options.ensurePermission !== false) {
      try {
        await ensureHuggingFaceDownloadPermission()
      } catch (error) {
        if (!quiet) setMessage(error instanceof Error ? error.message : "Permission denied.")
        return false
      }
    }
    const download = {
      id: createId("download"),
      repository,
      file,
      revision,
      status: "starting",
      bytesDownloaded: 0,
      bytesTotal: bytes,
    }
    setActiveDownload(download)
    if (!quiet) setMessage(`Downloading ${file}...`)
    render()
    try {
      const result = await callDiffusionAction("models-download", {
        ...actionInput(),
        id: download.id,
        repository,
        file,
        revision,
        bytes,
      })
      if (result.download) setActiveDownload(Object.assign({}, download, result.download))
      await refreshDownloadStatuses({ renderAfter: true })
      return true
    } catch (error) {
      removeActiveDownload(download.id)
      if (!quiet) setMessage(error instanceof Error ? error.message : "Download failed.")
      render()
      return false
    }
  }

  async function startBundleDownload(packageId) {
    const id = normalizeString(packageId)
    const bundle = CURATED_MODEL_BUNDLES.find((entry) => entry.id === id)
    if (!bundle) return
    state.bundleBusyId = id
    setMessage("")
    render()
    try {
      await refreshDownloadStatuses({ silent: true })
      const entries = bundleDownloadEntries(bundle)
      const pending = entries.filter((entry) => !isDownloadedHuggingFaceFile(entry.repository, entry.file) && !activeDownloadFor(entry.repository, entry.file))
      if (pending.length === 0) {
        setMessage(`${bundle.name} is already downloaded.`)
        return
      }
      await ensureHuggingFaceDownloadPermission()
      let started = 0
      for (const entry of pending) {
        if (await startModelDownload(entry, { ensurePermission: false, quiet: true })) {
          started += 1
        }
      }
      setMessage(started > 0 ? `Started ${started} downloads for ${bundle.name}.` : `No new downloads started for ${bundle.name}.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Model package download failed.")
    } finally {
      state.bundleBusyId = ""
      render()
    }
  }

  async function cancelDownload(download) {
    const normalized = normalizeDownload(download)
    if (!normalized) return
    try {
      await callDiffusionAction("models-download-status", { id: normalized.id, cancel: true })
      removeActiveDownload(normalized.id)
      setMessage("Download canceled.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Download cancel failed.")
    }
    render()
  }

  async function selectRuntimePack(runtimeId) {
    const id = normalizeString(runtimeId)
    if (!id) return
    const pack = state.runtimePacks.find((entry) => runtimePackKey(entry.id) === runtimePackKey(id))
    if (!runtimePackIsSelectable(pack)) {
      setMessage("Install or build the runtime engine before selecting it.")
      render()
      return
    }
    state.runtimeBusyId = id
    render()
    try {
      state.values.runtimeId = id
      state.values = await persistSettingsValues(state.values)
      await refreshRuntimePacks()
      setMessage("Runtime engine selected.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Runtime selection failed.")
    } finally {
      state.runtimeBusyId = ""
      render()
    }
  }

  function bindElements() {
    state.surface = normalizeString(document.body.getAttribute("data-diffusion-surface"))
    els.message = $("diffusion-message")
    els.runtimePlatform = $("diffusion-runtime-platform")
    els.runtimePackList = $("diffusion-runtime-pack-list")
    els.runtimeStatus = $("diffusion-runtime-status")
    els.runtimeDetail = $("diffusion-runtime-detail")
    els.panelStatus = $("diffusion-panel-status")
    els.modelCount = $("diffusion-model-count")
    els.modelDetail = $("diffusion-model-detail")
    els.modelList = $("diffusion-model-list")
    els.hardware = $("diffusion-hardware")
    els.setupNotice = $("diffusion-setup-notice")
    els.modelRoot = $("diffusion-model-root")
    els.modelRootBrowse = $("diffusion-model-root-browse")
    els.refreshModels = $("diffusion-refresh-models")
    els.openSettings = $("diffusion-open-settings")
    els.operationTabs = $("diffusion-operation-tabs")
    els.bundleList = $("diffusion-bundle-list")
    els.hfSearchForm = $("diffusion-hf-search-form")
    els.hfQuery = $("diffusion-hf-query")
    els.hfSearchSubmit = $("diffusion-hf-search-submit")
    els.hfStatus = $("diffusion-hf-status")
    els.hfResultsList = $("diffusion-hf-results-list")
    els.downloadsSection = $("diffusion-downloads-section")
    els.downloadsList = $("diffusion-downloads-list")
  }

  function bindEvents() {
    const settingsInputs = [
      els.modelRoot,
    ].filter(Boolean)
    settingsInputs.forEach((input) => {
      input.addEventListener("input", scheduleSettingsDraftSave)
      input.addEventListener("change", scheduleSettingsDraftSave)
    })
    if (els.modelRootBrowse) {
      els.modelRootBrowse.addEventListener("click", browseModelRoot)
    }
    if (els.refreshModels) {
      els.refreshModels.addEventListener("click", () => refreshAll({ notify: true }))
    }
    if (els.openSettings) {
      els.openSettings.addEventListener("click", openAppExtensionsSettings)
    }
    if (els.hfQuery) {
      els.hfQuery.addEventListener("input", () => {
        state.hf.query = normalizeString(els.hfQuery.value)
        render()
      })
    }
    if (els.hfSearchForm) {
      els.hfSearchForm.addEventListener("submit", (event) => {
        event.preventDefault()
        void searchHuggingFaceModels()
      })
    }
  }

  async function init() {
    bindElements()
    bindEvents()
    await loadSettings()
    syncSettingsFields()
    render()
    await refreshAll()
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init)
  } else {
    init()
  }
})()
