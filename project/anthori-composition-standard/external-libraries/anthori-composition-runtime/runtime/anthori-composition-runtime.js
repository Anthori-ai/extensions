"use strict";

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === "object") {
    const next = {};
    for (const [key, entry] of Object.entries(value)) next[key] = clone(entry);
    return next;
  }
  return value;
}

function configValue(config, key) {
  if (!config || typeof config !== "object") return undefined;
  return config[key];
}

function stringValue(value) {
  return String(value == null ? "" : value).trim();
}

function hasOwn(object, key) {
  return !!object && typeof object === "object" && Object.prototype.hasOwnProperty.call(object, key);
}

function inputValue(payload) {
  if (!payload || typeof payload !== "object" || !hasOwn(payload, "input")) return null;
  return clone(payload.input);
}

function detailsRequested(payload) {
  return !!(payload && typeof payload === "object" && payload.details === true);
}

function metadataRequested(payload) {
  return !!(payload && typeof payload === "object" && payload.metadata === true);
}

function configControlTargetList(config, key) {
  const raw = configValue(config, key);
  if (!Array.isArray(raw)) return [];
  const items = [];
  for (const entry of raw) {
    const id = stringValue(entry);
    if (id) items.push(id);
  }
  return items;
}

function graphControl(host, controlId) {
  const graph = host && host.graph ? host.graph : null;
  if (!graph || typeof graph.control !== "function") {
    throw new Error("host.graph.control unavailable");
  }
  const control = graph.control(stringValue(controlId));
  if (!control || typeof control !== "object" || Array.isArray(control)) {
    throw new Error("graph control info unavailable for " + stringValue(controlId));
  }
  return control;
}

function invokeGraphControl(host, controlId, input, details, metadata, fields) {
  const graph = host && host.graph ? host.graph : null;
  if (!graph || typeof graph.invoke !== "function") {
    throw new Error("host.graph.invoke unavailable");
  }
  const request = { controlId: stringValue(controlId), input: clone(input) };
  if (details === true) request.details = true;
  if (metadata === true) request.metadata = true;
  if (fields && typeof fields === "object" && !Array.isArray(fields) && Object.keys(fields).length > 0) {
    request.fields = clone(fields);
  }
  return graph.invoke(request);
}

function normalizeForwardedDetails(details) {
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return null;
  }
  const entries = Object.entries(details);
  if (entries.length === 0) {
    return null;
  }
  const version = Number(details.version);
  if (!Number.isFinite(version) || version < 1) {
    throw new Error("forwarded details.version must be a positive integer");
  }
  const normalized = clone(details);
  normalized.version = Math.trunc(version);
  return normalized;
}

function normalizeForwardedMetadata(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const entries = Object.entries(metadata);
  if (entries.length === 0) {
    return null;
  }
  return clone(metadata);
}

function invokedErrorMessage(invoked, fallback) {
  if (invoked && typeof invoked === "object" && invoked.error && typeof invoked.error === "object" && !Array.isArray(invoked.error)) {
    const message = stringValue(invoked.error.message);
    if (message) return message;
  }
  const direct = stringValue(invoked && invoked.error);
  if (direct) return direct;
  return stringValue(fallback) || "control invoke failed";
}

function unwrapInvokedGraphResult(invoked) {
  const output = invoked && typeof invoked === "object" && hasOwn(invoked, "output")
    ? invoked.output
    : null;
  if (output && typeof output === "object" && !Array.isArray(output) && hasOwn(output, "value")) {
    return {
      output: clone(output.value),
      // Forward requested output metadata so wrapper controls like Selector do
      // not strip runtime metadata such as streamWrote from the selected target.
      // This intentionally uses metadata instead of fields because fields are
      // reserved for input overrides, not output-side sideband data.
      metadata: normalizeForwardedMetadata(output.metadata),
      details: normalizeForwardedDetails(output.details),
    };
  }
  return {
    output: clone(output),
    metadata: null,
    details: null,
  };
}

function controlDescriptor(control) {
  if (!control || typeof control !== "object") return null;
  const direct = control.control;
  if (direct == null) return null;
  if (typeof direct === "object" && !Array.isArray(direct)) return direct;
  throw new Error("graph control control descriptor invalid for " + stringValue(control && control.id));
  return null;
}

function optionalControlObject(control, key) {
  if (!control || typeof control !== "object") return null;
  const value = control[key];
  if (value == null) return null;
  if (typeof value === "object" && !Array.isArray(value)) return value;
  throw new Error("graph control " + key + " invalid for " + stringValue(control.id));
}

function requiredControlString(control, key) {
  const value = control && control[key];
  if (typeof value !== "string") {
    throw new Error("graph control " + key + " missing for " + stringValue(control && control.id));
  }
  const text = stringValue(value);
  if (!text) {
    throw new Error("graph control " + key + " empty for " + stringValue(control && control.id));
  }
  return text;
}

function optionalControlString(control, key) {
  const value = control && control[key];
  if (value == null) return "";
  if (typeof value !== "string") {
    throw new Error("graph control " + key + " invalid for " + stringValue(control && control.id));
  }
  return stringValue(value);
}

function stringList(value) {
  if (!Array.isArray(value)) return [];
  const items = [];
  for (const entry of value) {
    const text = stringValue(entry);
    if (!text) continue;
    items.push(text);
  }
  return items;
}

function canonicalControlInfo(control) {
  const descriptor = controlDescriptor(control);
  const contracts = optionalControlObject(control, "contracts");
  const info = {
    kind: "control",
    id: requiredControlString(control, "id"),
    title: optionalControlString(control, "title"),
    name: requiredControlString(control, "name"),
    description: optionalControlString(control, "description"),
  };
  if (contracts) info.contracts = clone(contracts);
  const docs = controlDocs(descriptor);
  if (docs) info.docs = docs;
  return info;
}

function controlDocs(control) {
  if (!control || typeof control !== "object") return null;
  const docs = control.docs;
  if (docs && typeof docs === "object" && !Array.isArray(docs) && Array.isArray(docs.sections)) {
    return clone(docs);
  }
  const info = control.info && typeof control.info === "object" && !Array.isArray(control.info) ? control.info : null;
  if (info && Array.isArray(info.sections)) {
    return { sections: clone(info.sections) };
  }
  const ui = control.ui && typeof control.ui === "object" && !Array.isArray(control.ui) ? control.ui : null;
  const uiInfo = ui && ui.info && typeof ui.info === "object" && !Array.isArray(ui.info) ? ui.info : null;
  if (uiInfo && Array.isArray(uiInfo.sections)) {
    return { sections: clone(uiInfo.sections) };
  }
  return null;
}

function bindingFieldTargets(host, controlId, fieldKey) {
  const info = graphControl(host, controlId);
  const bindings = optionalControlObject(info, "bindings");
  const fieldBindings = bindings && bindings.field && typeof bindings.field === "object" && !Array.isArray(bindings.field)
    ? bindings.field
    : null;
  const entry = fieldBindings && fieldBindings[fieldKey] && typeof fieldBindings[fieldKey] === "object" && !Array.isArray(fieldBindings[fieldKey])
    ? fieldBindings[fieldKey]
    : null;
  return entry && Array.isArray(entry.targets) ? entry.targets.slice() : [];
}

function resolveBundleTargets(payload, host) {
  const control = payload && payload.control && typeof payload.control === "object" && !Array.isArray(payload.control)
    ? payload.control
    : null;
  const currentControlId = stringValue(control && control.id);
  if (currentControlId) {
    const boundTargets = bindingFieldTargets(host, currentControlId, "controls");
    if (boundTargets.length > 0) return boundTargets;
  }
  const config = payload && payload.config && typeof payload.config === "object" ? payload.config : {};
  const controlIds = configControlTargetList(config, "controls");
  const targets = [];
  for (const id of controlIds) {
    targets.push(graphControl(host, id));
  }
  return targets;
}

function bundleInvokeInput(control, args) {
  const invokePath = stringList(control && control.invokePath);
  if (invokePath.length > 0) {
    return {
      id: invokePath[0],
      path: invokePath.slice(1),
      args: clone(args),
    };
  }
  return clone(args);
}

function buildBundleSummary(info) {
  return {
    id: info.id,
    title: info.title,
    name: info.name,
    description: info.description,
  };
}

function resolveSelectedSelectorControlID(config) {
  const options = configControlTargetList(config, "options");
  if (options.length === 0) {
    throw new Error("selector has no options");
  }
  const selected = stringValue(configValue(config, "selectedOption"));
  if (!selected) {
    return options[0];
  }
  if (options.includes(selected)) {
    return selected;
  }
  throw new Error("selected option is not connected");
}

function passthroughInvokeRequest(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("passthrough input must be an object");
  }
  const targetID = stringValue(input.id);
  if (!targetID) {
    throw new Error("passthrough id is required");
  }
  const path = [];
  if (Array.isArray(input.path)) {
    for (const entry of input.path) {
      const id = stringValue(entry);
      if (id) path.push(id);
    }
  }
  return {
    targetID,
    path,
    args: hasOwn(input, "args") ? clone(input.args) : null,
  };
}

function bundleControl(payload, host) {
  const request = inputValue(payload);
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    throw new Error("bundle input must be an object");
  }

  const action = stringValue(request.action).toLowerCase();
  if (!action) {
    throw new Error("bundle action is required");
  }

  const controls = resolveBundleTargets(payload, host);

  if (action === "list") {
    if (hasOwn(request, "id") || hasOwn(request, "args")) {
      throw new Error("bundle list does not accept id or args");
    }
    const summaries = [];
    for (const control of controls) {
      summaries.push(buildBundleSummary(canonicalControlInfo(control)));
    }
    return { output: { controls: summaries }, stop: true };
  }

  if (action !== "inspect" && action !== "invoke") {
    throw new Error("unknown bundle action: " + action);
  }

  const targetID = stringValue(request.id);
  if (!targetID) {
    throw new Error("bundle " + action + " requires id");
  }
  const targetControl = controls.find(function (entry) {
    return stringValue(entry && entry.id) === targetID;
  });
  if (!targetControl) {
    return {
      output: {
        error: {
          message: "control not found",
        },
      },
      stop: true,
    };
  }
  if (action === "inspect") {
    if (hasOwn(request, "args")) {
      throw new Error("bundle inspect does not accept args");
    }
    return { output: canonicalControlInfo(targetControl), stop: true };
  }

  const invokeControlId = optionalControlString(targetControl, "invokeControlId") || targetID;
  const invokeInput = hasOwn(request, "args") ? bundleInvokeInput(targetControl, request.args) : bundleInvokeInput(targetControl, null);
  const invoked = invokeGraphControl(host, invokeControlId, invokeInput, detailsRequested(payload), metadataRequested(payload));
  if (!invoked || invoked.ok === false) {
    return {
      output: {
        error: invoked && invoked.error ? clone(invoked.error) : { message: "control invoke failed" },
      },
      stop: true,
    };
  }
  const forwarded = unwrapInvokedGraphResult(invoked);
  const result = { output: forwarded.output, stop: true };
  if (forwarded.metadata) result.metadata = forwarded.metadata;
  if (forwarded.details) result.details = forwarded.details;
  return result;
}

function passthroughControl(payload, host) {
  const config = payload && payload.config && typeof payload.config === "object" ? payload.config : {};
  const controlIds = configControlTargetList(config, "controls");
  const request = passthroughInvokeRequest(inputValue(payload));
  if (!controlIds.includes(request.targetID)) {
    return {
      output: {
        error: {
          message: "control not found",
        },
      },
      stop: true,
    };
  }

  const invokeInput = request.path.length > 0
    ? {
        id: request.path[0],
        path: request.path.slice(1),
        args: clone(request.args),
      }
    : clone(request.args);
  const invoked = invokeGraphControl(host, request.targetID, invokeInput, detailsRequested(payload), metadataRequested(payload));
  if (!invoked || invoked.ok === false) {
    return {
      output: {
        error: invoked && invoked.error ? clone(invoked.error) : { message: "control invoke failed" },
      },
      stop: true,
    };
  }
  const forwarded = unwrapInvokedGraphResult(invoked);
  const result = { output: forwarded.output, stop: true };
  if (forwarded.metadata) result.metadata = forwarded.metadata;
  if (forwarded.details) result.details = forwarded.details;
  return result;
}

function selectorControl(payload, host) {
  const config = payload && payload.config && typeof payload.config === "object" ? payload.config : {};
  const targetID = resolveSelectedSelectorControlID(config);
  // Selector forwards explicit Poll lifecycle inputs unchanged. Poll semantics
  // belong in public contracts and normal input values, not hidden field
  // transport on wrapper controls.
  const invoked = invokeGraphControl(host, targetID, inputValue(payload), detailsRequested(payload), metadataRequested(payload));
  if (!invoked || invoked.ok === false) {
    // Selector is a transparent pass-through; propagate selected-control failures as
    // real control errors so wrapper output validation does not misreport them
    // as selector output-contract mismatches.
    throw new Error(invokedErrorMessage(invoked, "selected control invoke failed"));
  }
  const forwarded = unwrapInvokedGraphResult(invoked);
  const result = { output: forwarded.output, stop: true };
  if (forwarded.metadata) result.metadata = forwarded.metadata;
  if (forwarded.details) result.details = forwarded.details;
  return result;
}

module.exports = {
  "bundle-control": bundleControl,
  "passthrough-control": passthroughControl,
  "selector-control": selectorControl,
};
