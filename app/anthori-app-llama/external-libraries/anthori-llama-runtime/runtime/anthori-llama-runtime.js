const ACTIONS = [
  "models-list",
  "models-download",
  "models-download-status",
  "runtimes-list",
  "runtimes-check-updates",
  "runtimes-install",
  "runtimes-remove",
  "hardware-info",
  "runtime-status",
  "runtime-start",
  "runtime-stop",
]

function callNative(action, input, host) {
  if (!host || !host.native || typeof host.native.call !== "function") {
    throw new Error("Native Llama runtime bridge is unavailable.")
  }
  const result = host.native.call({ action, input })
  if (result && typeof result === "object" && Object.prototype.hasOwnProperty.call(result, "output")) {
    return result.output
  }
  return result || {}
}

const exported = {}

ACTIONS.forEach((action) => {
  exported[action] = function llamaRuntimeAction(input, host) {
    return callNative(action, input, host)
  }
})

module.exports = exported
