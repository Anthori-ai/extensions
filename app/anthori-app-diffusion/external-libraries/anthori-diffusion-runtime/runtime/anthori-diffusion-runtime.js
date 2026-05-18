const ACTIONS = [
  "models-list",
  "models-download",
  "models-download-status",
  "runtimes-list",
  "hardware-info",
  "runtime-status",
  "text-to-image",
  "image-to-image",
  "text-to-video",
  "image-to-video",
]

function callNative(action, input, host) {
  if (!host || !host.native || typeof host.native.call !== "function") {
    throw new Error("Native Diffusion runtime bridge is unavailable.")
  }
  const result = host.native.call({ action, input })
  if (result && typeof result === "object" && Object.prototype.hasOwnProperty.call(result, "output")) {
    return result.output
  }
  return result || {}
}

const exported = {}

ACTIONS.forEach((action) => {
  exported[action] = function diffusionRuntimeAction(input, host) {
    return callNative(action, input, host)
  }
})

module.exports = exported
