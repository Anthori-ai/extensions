function trim(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

function truthy(value) {
  var normalized = trim(value).toLowerCase();
  if (value === null || value === undefined) {
    return false;
  }
  if (normalized === "" || normalized === "0" || normalized === "false") {
    return false;
  }
  return !!value;
}

function plainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value;
}

function copyObject(value) {
  var source = plainObject(value);
  var copy = {};
  var keys = Object.keys(source);
  for (var i = 0; i < keys.length; i += 1) {
    copy[keys[i]] = source[keys[i]];
  }
  return copy;
}

function cloneValue(value) {
  if (Array.isArray(value)) {
    var items = [];
    for (var i = 0; i < value.length; i += 1) {
      items.push(cloneValue(value[i]));
    }
    return items;
  }
  if (value && typeof value === "object") {
    var next = {};
    var keys = Object.keys(value);
    for (var j = 0; j < keys.length; j += 1) {
      next[keys[j]] = cloneValue(value[keys[j]]);
    }
    return next;
  }
  return value;
}

function messagesEndpoint(config) {
  var base = trim(config && config.apiBaseUrl);
  if (base === "") {
    return "https://api.anthropic.com/v1/messages";
  }
  base = base.replace(/\/+$/, "");
  if (/\/messages$/.test(base)) {
    return base;
  }
  if (/\/v1$/.test(base)) {
    return base + "/messages";
  }
  return base + "/v1/messages";
}

function modelsEndpoint(config) {
  var base = trim(config && config.apiBaseUrl);
  if (base === "") {
    return "https://api.anthropic.com/v1/models";
  }
  base = base.replace(/\/+$/, "");
  if (/\/models$/.test(base)) {
    return base;
  }
  if (/\/messages$/.test(base)) {
    return base.replace(/\/messages$/, "/models");
  }
  if (/\/v1$/.test(base)) {
    return base + "/models";
  }
  return base + "/v1/models";
}

function decodeJsonText(text, fallback) {
  try {
    return JSON.parse(text);
  } catch (_error) {
    return fallback;
  }
}

function anthropicErrorInfo(body, fallback, label) {
  var parsed = decodeJsonText(trim(body), null);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      type: "",
      message: normalizeAnthropicTransportErrorMessage(trim(body), fallback, label)
    };
  }
  var errorType = "";
  var message = "";
  if (parsed.error && typeof parsed.error === "object" && !Array.isArray(parsed.error)) {
    errorType = trim(parsed.error.type);
    message = trim(parsed.error.message);
  }
  if (message === "") {
    message = trim(parsed.message);
  }
  return {
    type: errorType,
    message: normalizeAnthropicTransportErrorMessage(message || trim(body), fallback, label)
  };
}

function extractErrorMessage(body, fallback, label) {
  var info = anthropicErrorInfo(body, fallback, label);
  if (trim(info.type) !== "" && trim(info.message) !== "") {
    return trim(info.type) + ": " + trim(info.message);
  }
  return trim(info.message) || fallback;
}

function normalizeAnthropicTransportErrorMessage(message, fallback, label) {
  var providerLabel = trim(label) || "Anthropic";
  var text = trim(message) || fallback;
  var normalized = text.toLowerCase();
  if (
    normalized.indexOf("stream error:") >= 0 ||
    normalized.indexOf("internal_error") >= 0 ||
    normalized.indexOf("received from peer") >= 0 ||
    normalized.indexOf("unexpected eof") >= 0 ||
    normalized.indexOf("http2") >= 0 ||
    normalized.indexOf("dial tcp") >= 0 ||
    normalized.indexOf("connect: connection refused") >= 0 ||
    normalized.indexOf("no such host") >= 0 ||
    normalized.indexOf("i/o timeout") >= 0 ||
    normalized.indexOf("context deadline exceeded") >= 0 ||
    normalized.indexOf("connection reset by peer") >= 0 ||
    normalized.indexOf("transport is closing") >= 0 ||
    normalized.indexOf("tls:") >= 0 ||
    normalized === "eof"
  ) {
    return providerLabel + " stream failed. The provider may be unavailable right now. Upstream error: " + text;
  }
  return text || fallback;
}

function hostFetch(host, request, onEvent, label) {
  try {
    return host.http.fetch(request, onEvent);
  } catch (error) {
    throw new Error(
      normalizeAnthropicTransportErrorMessage(
        error && error.message ? error.message : error,
        "anthropic request failed",
        label
      )
    );
  }
}

var PROVIDER_DEFAULTS = {
  "anthropic-provider": {
    providerKey: "anthropic",
    providerLabel: "Anthropic",
    defaultModel: "",
    models: []
  },
  "minimax-provider": {
    providerKey: "minimax",
    providerLabel: "MiniMax",
    apiBaseUrl: "https://api.minimax.io/anthropic",
    defaultModel: "MiniMax-M2.7",
    models: [
      { id: "MiniMax-M2.7", label: "MiniMax M2.7", maxContextTokens: 204800 },
      { id: "MiniMax-M2.7-highspeed", label: "MiniMax M2.7 Highspeed", maxContextTokens: 204800 },
      { id: "MiniMax-M2.5", label: "MiniMax M2.5", maxContextTokens: 204800 },
      { id: "MiniMax-M2.5-highspeed", label: "MiniMax M2.5 Highspeed", maxContextTokens: 204800 },
      { id: "MiniMax-M2.1", label: "MiniMax M2.1", maxContextTokens: 204800 },
      { id: "MiniMax-M2", label: "MiniMax M2", maxContextTokens: 196608 }
    ]
  }
};

function providerObject(input) {
  return input && input.provider && typeof input.provider === "object" && !Array.isArray(input.provider)
    ? input.provider
    : {};
}

function providerDefaults(input, config) {
  var definitionId = trim(providerObject(input).definitionId);
  if (definitionId !== "" && PROVIDER_DEFAULTS[definitionId]) {
    return PROVIDER_DEFAULTS[definitionId];
  }
  var providerKey = trim(config && config.providerKey);
  if (providerKey !== "") {
    var keys = Object.keys(PROVIDER_DEFAULTS);
    for (var i = 0; i < keys.length; i += 1) {
      var candidate = PROVIDER_DEFAULTS[keys[i]];
      if (trim(candidate.providerKey) === providerKey) {
        return candidate;
      }
    }
  }
  return PROVIDER_DEFAULTS["anthropic-provider"];
}

function effectiveProviderConfig(input) {
  var provider = providerObject(input);
  var config = copyObject(provider.config);
  var defaults = providerDefaults(input, config);
  var settings = copyObject(defaults);
  var keys = Object.keys(config);
  for (var i = 0; i < keys.length; i += 1) {
    var key = keys[i];
    if (config[key] !== null && config[key] !== undefined && trim(config[key]) !== "") {
      settings[key] = config[key];
    }
  }
  settings.providerLabel = trim(settings.providerLabel) || "Anthropic";
  settings.apiBaseUrl = trim(settings.apiBaseUrl).replace(/\/+$/, "");
  settings.defaultModel = trim(settings.defaultModel);
  return settings;
}

function providerFallbackModels(config) {
  var models = Array.isArray(config && config.models) ? config.models : [];
  var items = [];
  var seen = {};
  for (var i = 0; i < models.length; i += 1) {
    var id = trim(models[i] && models[i].id);
    if (id === "" || seen[id]) {
      continue;
    }
    seen[id] = true;
    var item = {
      id: id,
      label: trim(models[i].label) || id
    };
    var maxContextTokens = finiteNumber(models[i].maxContextTokens);
    if (maxContextTokens > 0) {
      item.maxContextTokens = maxContextTokens;
    }
    items.push(item);
  }
  return items;
}

function anthropicModelItem(config, id, fallbackLabel) {
  var cleanID = trim(id);
  if (cleanID === "") {
    return null;
  }
  var models = Array.isArray(config && config.models) ? config.models : [];
  for (var i = 0; i < models.length; i += 1) {
    if (trim(models[i].id) === cleanID) {
      return {
        id: cleanID,
        label: trim(models[i].label) || cleanID,
        maxContextTokens: finiteNumber(models[i].maxContextTokens)
      };
    }
  }
  var item = {
    id: cleanID,
    label: trim(fallbackLabel) || cleanID
  };
  return item;
}

function liveModelNumber(entry, key) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return 0;
  }
  return finiteNumber(entry[key]);
}

function liveModelNestedNumber(entry, parentKey, childKey) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return 0;
  }
  var parent = entry[parentKey];
  if (!parent || typeof parent !== "object" || Array.isArray(parent)) {
    return 0;
  }
  return finiteNumber(parent[childKey]);
}

function liveModelContextTokens(entry) {
  var keys = [
    "max_input_tokens",
    "maxInputTokens",
    "max_context_tokens",
    "maxContextTokens",
    "context_window",
    "contextWindow",
    "input_token_limit",
    "inputTokenLimit",
    "token_limit",
    "tokenLimit"
  ];
  for (var i = 0; i < keys.length; i += 1) {
    var value = liveModelNumber(entry, keys[i]);
    if (value > 0) {
      return value;
    }
  }
  var parents = ["capabilities", "limits"];
  for (var p = 0; p < parents.length; p += 1) {
    for (var k = 0; k < keys.length; k += 1) {
      var nested = liveModelNestedNumber(entry, parents[p], keys[k]);
      if (nested > 0) {
        return nested;
      }
    }
  }
  return 0;
}

function liveAnthropicModelItem(config, entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return null;
  }
  var id = trim(entry.id);
  if (id === "") {
    return null;
  }
  var item = anthropicModelItem(config, id, trim(entry.display_name) || trim(entry.name));
  var liveMaxContextTokens = liveModelContextTokens(entry);
  if (liveMaxContextTokens > 0) {
    item.maxContextTokens = liveMaxContextTokens;
  }
  return item;
}

function finiteNumber(value) {
  var number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function selectedReasoningPreference(request, config) {
  var candidates = [
    request && request.reasoning,
    request && request.reasoningEffort,
    config && config.reasoningEffort,
    config && config.reasoning
  ];
  for (var i = 0; i < candidates.length; i += 1) {
    var effort = trim(candidates[i]).toLowerCase();
    if (effort === "none") {
      return "none";
    }
    if (effort === "low" || effort === "medium" || effort === "high" || effort === "xhigh" || effort === "max") {
      return effort;
    }
  }
  return "";
}

function buildAnthropicThinkingPayload(request, config, maxTokens) {
  var effort = selectedReasoningPreference(request, config);
  if (effort === "" || effort === "none") {
    return null;
  }
  var tokenLimit = Math.floor(finiteNumber(maxTokens));
  if (tokenLimit <= 1024) {
    return null;
  }
  var requestedBudget = 1024;
  if (effort === "medium") {
    requestedBudget = 2048;
  } else if (effort === "high") {
    requestedBudget = 4096;
  } else if (effort === "xhigh" || effort === "max") {
    requestedBudget = 8192;
  }
  var maxBudget = Math.max(1024, Math.floor(tokenLimit * 0.75));
  var budget = Math.min(requestedBudget, maxBudget);
  if (budget >= tokenLimit) {
    budget = tokenLimit - 1;
  }
  if (budget < 1024) {
    return null;
  }
  return { type: "enabled", budget_tokens: budget };
}

function normalizeAnthropicUsage(value) {
  var usage = value && typeof value === "object" && !Array.isArray(value) ? value : null;
  if (!usage) {
    return null;
  }
  var result = {};
  var inputTokens = finiteNumber(usage.input_tokens ?? usage.inputTokens);
  var outputTokens = finiteNumber(usage.output_tokens ?? usage.outputTokens);
  var cacheReadTokens = finiteNumber(usage.cache_read_input_tokens ?? usage.cacheReadInputTokens);
  var cacheWriteTokens = finiteNumber(usage.cache_creation_input_tokens ?? usage.cacheCreationInputTokens);
  if (inputTokens > 0) result.inputTokens = inputTokens;
  if (outputTokens > 0) result.outputTokens = outputTokens;
  if (cacheReadTokens > 0) result.cacheReadTokens = cacheReadTokens;
  if (cacheWriteTokens > 0) result.cacheWriteTokens = cacheWriteTokens;
  if (inputTokens > 0 || outputTokens > 0) {
    result.totalTokens = inputTokens + outputTokens;
  }
  return Object.keys(result).length > 0 ? result : null;
}

function looksLikeSchemaObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  var keys = [
    "type",
    "properties",
    "items",
    "enum",
    "anyOf",
    "oneOf",
    "allOf",
    "additionalProperties",
    "required",
    "description",
    "default",
    "format",
    "minimum",
    "maximum",
    "minItems",
    "maxItems",
    "minLength",
    "maxLength"
  ];
  for (var i = 0; i < keys.length; i += 1) {
    if (Object.prototype.hasOwnProperty.call(value, keys[i])) {
      return true;
    }
  }
  return false;
}

function schemaTypeIncludes(typeValue, expected) {
  var target = trim(expected).toLowerCase();
  if (target === "") {
    return false;
  }
  if (Array.isArray(typeValue)) {
    for (var i = 0; i < typeValue.length; i += 1) {
      if (trim(typeValue[i]).toLowerCase() === target) {
        return true;
      }
    }
    return false;
  }
  return trim(typeValue).toLowerCase() === target;
}

function topLevelSchemaCombinerVariants(schema) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return [];
  }
  var keys = ["anyOf", "oneOf", "allOf"];
  for (var i = 0; i < keys.length; i += 1) {
    var variants = schema[keys[i]];
    if (Array.isArray(variants) && variants.length > 0) {
      return variants;
    }
  }
  return [];
}

function plainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value;
}

function copySchemaValue(value) {
  if (Array.isArray(value)) {
    var list = [];
    for (var i = 0; i < value.length; i += 1) {
      list.push(copySchemaValue(value[i]));
    }
    return list;
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  var copy = {};
  var keys = Object.keys(value);
  for (var j = 0; j < keys.length; j += 1) {
    copy[keys[j]] = copySchemaValue(value[keys[j]]);
  }
  return copy;
}

function schemaComparableValue(value) {
  if (Array.isArray(value)) {
    var list = [];
    for (var i = 0; i < value.length; i += 1) {
      list.push(schemaComparableValue(value[i]));
    }
    return list;
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  var copy = {};
  var keys = Object.keys(value).sort();
  for (var j = 0; j < keys.length; j += 1) {
    var key = keys[j];
    if (key === "description" || key === "enum") {
      continue;
    }
    copy[key] = schemaComparableValue(value[key]);
  }
  return copy;
}

function schemaComparableSignature(schema) {
  return JSON.stringify(schemaComparableValue(schema));
}

function uniqueStringList(values) {
  var result = [];
  var seen = {};
  if (!Array.isArray(values)) {
    return result;
  }
  for (var i = 0; i < values.length; i += 1) {
    var text = trim(values[i]);
    if (text === "" || seen[text]) {
      continue;
    }
    seen[text] = true;
    result.push(text);
  }
  return result;
}

function intersectStringLists(left, right) {
  var result = [];
  var allowed = {};
  var other = Array.isArray(right) ? right : [];
  for (var i = 0; i < other.length; i += 1) {
    var text = trim(other[i]);
    if (text !== "") {
      allowed[text] = true;
    }
  }
  var source = Array.isArray(left) ? left : [];
  for (var j = 0; j < source.length; j += 1) {
    var entry = trim(source[j]);
    if (entry !== "" && allowed[entry]) {
      result.push(entry);
    }
  }
  return result;
}

function differenceStringLists(left, right) {
  var result = [];
  var blocked = {};
  var exclusions = Array.isArray(right) ? right : [];
  for (var i = 0; i < exclusions.length; i += 1) {
    var text = trim(exclusions[i]);
    if (text !== "") {
      blocked[text] = true;
    }
  }
  var source = Array.isArray(left) ? left : [];
  for (var j = 0; j < source.length; j += 1) {
    var entry = trim(source[j]);
    if (entry !== "" && !blocked[entry]) {
      result.push(entry);
    }
  }
  return result;
}

function detectToolParameterDiscriminatorKey(variants) {
  if (!Array.isArray(variants) || variants.length === 0) {
    return "";
  }
  var counts = {};
  var enumValues = {};
  for (var i = 0; i < variants.length; i += 1) {
    var props = plainObject(variants[i] && variants[i].properties);
    var keys = Object.keys(props);
    for (var j = 0; j < keys.length; j += 1) {
      var key = keys[j];
      var schema = props[key];
      if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
        continue;
      }
      if (!schemaTypeIncludes(schema.type, "string")) {
        continue;
      }
      if (!Array.isArray(schema.enum) || schema.enum.length !== 1) {
        continue;
      }
      var enumValue = trim(schema.enum[0]);
      if (enumValue === "") {
        continue;
      }
      counts[key] = (counts[key] || 0) + 1;
      if (!enumValues[key]) {
        enumValues[key] = {};
      }
      enumValues[key][enumValue] = true;
    }
  }
  var preferred = ["mode", "action", "kind", "type"];
  for (var p = 0; p < preferred.length; p += 1) {
    var candidate = preferred[p];
    if (
      counts[candidate] === variants.length &&
      Object.keys(enumValues[candidate] || {}).length === variants.length
    ) {
      return candidate;
    }
  }
  var keys2 = Object.keys(counts).sort();
  for (var k = 0; k < keys2.length; k += 1) {
    var name = keys2[k];
    if (
      counts[name] === variants.length &&
      Object.keys(enumValues[name] || {}).length === variants.length
    ) {
      return name;
    }
  }
  return "";
}

function toolParameterVariantLabel(variant, discriminatorKey, index) {
  var props = plainObject(variant && variant.properties);
  if (discriminatorKey !== "") {
    var discriminator = props[discriminatorKey];
    if (
      discriminator &&
      typeof discriminator === "object" &&
      !Array.isArray(discriminator) &&
      Array.isArray(discriminator.enum) &&
      discriminator.enum.length === 1
    ) {
      var enumValue = trim(discriminator.enum[0]);
      if (enumValue !== "") {
        return enumValue;
      }
    }
  }
  var description = trim(variant && variant.description);
  if (description !== "") {
    return description;
  }
  return "variant " + String(index + 1);
}

function formatToolVariantSelector(discriminatorKey, label) {
  if (discriminatorKey !== "") {
    return "`" + discriminatorKey + "` is `" + label + "`";
  }
  return "`" + label + "`";
}

function joinToolVariantSelectors(discriminatorKey, labels) {
  var unique = uniqueStringList(labels);
  if (unique.length === 0) {
    return "";
  }
  var items = [];
  for (var i = 0; i < unique.length; i += 1) {
    items.push(formatToolVariantSelector(discriminatorKey, unique[i]));
  }
  if (items.length === 1) {
    return items[0];
  }
  if (items.length === 2) {
    return items[0] + " or " + items[1];
  }
  return items.slice(0, items.length - 1).join(", ") + ", or " + items[items.length - 1];
}

function synthesizeMergedPropertyDescription(accumulator, discriminatorKey, allLabels) {
  var parts = [];
  var descriptions = [];
  var seenDescriptions = {};
  var rawDescriptions = Array.isArray(accumulator.descriptions) ? accumulator.descriptions : [];
  for (var i = 0; i < rawDescriptions.length; i += 1) {
    var entry = rawDescriptions[i];
    var label = trim(entry && entry.label);
    var text = trim(entry && entry.text);
    if (label === "" || text === "") {
      continue;
    }
    var key = label + "\n" + text;
    if (seenDescriptions[key]) {
      continue;
    }
    seenDescriptions[key] = true;
    descriptions.push({ label: label, text: text });
  }
  var uniqueTexts = {};
  var uniqueTextCount = 0;
  for (var j = 0; j < descriptions.length; j += 1) {
    var descriptionText = descriptions[j].text;
    if (uniqueTexts[descriptionText]) {
      continue;
    }
    uniqueTexts[descriptionText] = true;
    uniqueTextCount += 1;
  }
  if (descriptions.length > 0) {
    if (uniqueTextCount === 1) {
      parts.push(descriptions[0].text);
    } else {
      for (var k = 0; k < descriptions.length; k += 1) {
        parts.push("When " + formatToolVariantSelector(discriminatorKey, descriptions[k].label) + ": " + descriptions[k].text);
      }
    }
  }

  var presentLabels = uniqueStringList(accumulator.presentLabels);
  var requiredLabels = uniqueStringList(accumulator.requiredLabels);
  if (presentLabels.length > 0 && presentLabels.length < allLabels.length) {
    parts.push("Allowed when " + joinToolVariantSelectors(discriminatorKey, presentLabels) + ".");
    var blocked = differenceStringLists(allLabels, presentLabels);
    if (blocked.length > 0) {
      parts.push("Not allowed when " + joinToolVariantSelectors(discriminatorKey, blocked) + ".");
    }
  }
  if (requiredLabels.length > 0 && requiredLabels.length < allLabels.length) {
    parts.push("Required when " + joinToolVariantSelectors(discriminatorKey, requiredLabels) + ".");
  } else if (requiredLabels.length > 0 && presentLabels.length > requiredLabels.length) {
    parts.push("Required when " + joinToolVariantSelectors(discriminatorKey, requiredLabels) + ".");
  }
  return trim(parts.join(" "));
}

function mergeToolParameterPropertySchema(accumulator, discriminatorKey, allLabels) {
  var representativeSchemas = {};
  var uniqueComparables = [];
  var mergedEnum = [];
  var seenEnum = {};
  var rawSchemas = Array.isArray(accumulator.schemas) ? accumulator.schemas : [];
  for (var i = 0; i < rawSchemas.length; i += 1) {
    var schema = rawSchemas[i];
    var signature = schemaComparableSignature(schema);
    if (!representativeSchemas[signature]) {
      representativeSchemas[signature] = copySchemaValue(schema);
      uniqueComparables.push(signature);
    }
    if (Array.isArray(schema && schema.enum)) {
      for (var j = 0; j < schema.enum.length; j += 1) {
        var enumKey = JSON.stringify(schema.enum[j]);
        if (seenEnum[enumKey]) {
          continue;
        }
        seenEnum[enumKey] = true;
        mergedEnum.push(copySchemaValue(schema.enum[j]));
      }
    }
  }

  var result;
  if (uniqueComparables.length === 1) {
    result = copySchemaValue(representativeSchemas[uniqueComparables[0]]);
    if (mergedEnum.length > 0) {
      result.enum = mergedEnum;
    }
  } else {
    var variants = [];
    for (var k = 0; k < uniqueComparables.length; k += 1) {
      variants.push(copySchemaValue(representativeSchemas[uniqueComparables[k]]));
    }
    result = { anyOf: variants };
  }

  var description = synthesizeMergedPropertyDescription(accumulator, discriminatorKey, allLabels);
  if (description !== "") {
    result.description = description;
  }
  return result;
}

function normalizeSchemaFragment(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { type: "string" };
  }
  if (looksLikeSchemaObject(value)) {
    var copy = {};
    var keys = Object.keys(value);
    for (var i = 0; i < keys.length; i += 1) {
      copy[keys[i]] = value[keys[i]];
    }
    if (copy.properties && typeof copy.properties === "object" && !Array.isArray(copy.properties)) {
      var props = {};
      var propKeys = Object.keys(copy.properties).sort();
      for (var j = 0; j < propKeys.length; j += 1) {
        var propKey = propKeys[j];
        props[propKey] = normalizeSchemaFragment(copy.properties[propKey]);
      }
      copy.properties = props;
    }
    if (copy.items && typeof copy.items === "object" && !Array.isArray(copy.items)) {
      copy.items = normalizeSchemaFragment(copy.items);
    }
    return copy;
  }

  var properties = {};
  var required = [];
  var keys2 = Object.keys(value).sort();
  for (var k = 0; k < keys2.length; k += 1) {
    var key = keys2[k];
    var entry = value[key];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }
    var normalized = {};
    var entryKeys = Object.keys(entry);
    for (var m = 0; m < entryKeys.length; m += 1) {
      var entryKey = entryKeys[m];
      if (entryKey === "required") {
        continue;
      }
      normalized[entryKey] = entry[entryKey];
    }
    properties[key] = normalizeSchemaFragment(normalized);
    if (truthy(entry.required)) {
      required.push(key);
    }
  }
  var schema = {
    type: "object",
    properties: properties
  };
  if (required.length > 0) {
    schema.required = required;
  }
  return schema;
}

function rewriteTopLevelToolParameterCombiners(schema) {
  var rawVariants = topLevelSchemaCombinerVariants(schema);
  var variants = [];
  for (var i = 0; i < rawVariants.length; i += 1) {
    var normalized = normalizeSchemaFragment(rawVariants[i]);
    if (
      normalized &&
      typeof normalized === "object" &&
      !Array.isArray(normalized) &&
      (schemaTypeIncludes(normalized.type, "object") || (normalized.properties && typeof normalized.properties === "object" && !Array.isArray(normalized.properties)))
    ) {
      variants.push(normalized);
    }
  }
  if (variants.length === 0) {
    return { type: "object", properties: {} };
  }

  var discriminatorKey = detectToolParameterDiscriminatorKey(variants);
  var allLabels = [];
  var variantLabels = [];
  for (var j = 0; j < variants.length; j += 1) {
    var label = toolParameterVariantLabel(variants[j], discriminatorKey, j);
    variantLabels.push(label);
    allLabels.push(label);
  }
  allLabels = uniqueStringList(allLabels);

  var propertyAccumulators = {};
  var propertyOrder = [];
  var required = null;
  var additionalPropertiesFalse = true;
  for (var index = 0; index < variants.length; index += 1) {
    var variant = variants[index];
    var variantLabel = variantLabels[index];
    var variantRequired = uniqueStringList(Array.isArray(variant.required) ? variant.required : []);
    required = required === null ? variantRequired.slice() : intersectStringLists(required, variantRequired);
    if (variant.additionalProperties !== false) {
      additionalPropertiesFalse = false;
    }
    var variantOrder = Array.isArray(variant.propertyOrder) ? variant.propertyOrder : [];
    for (var orderIndex = 0; orderIndex < variantOrder.length; orderIndex += 1) {
      var orderedKey = trim(variantOrder[orderIndex]);
      if (orderedKey !== "" && propertyOrder.indexOf(orderedKey) === -1) {
        propertyOrder.push(orderedKey);
      }
    }
    var props = plainObject(variant.properties);
    var propKeys = Object.keys(props);
    for (var propIndex = 0; propIndex < propKeys.length; propIndex += 1) {
      var propKey = propKeys[propIndex];
      if (propertyOrder.indexOf(propKey) === -1) {
        propertyOrder.push(propKey);
      }
      if (!propertyAccumulators[propKey]) {
        propertyAccumulators[propKey] = {
          schemas: [],
          descriptions: [],
          presentLabels: [],
          requiredLabels: []
        };
      }
      var accumulator = propertyAccumulators[propKey];
      var propSchema = normalizeSchemaFragment(props[propKey]);
      accumulator.schemas.push(propSchema);
      accumulator.presentLabels.push(variantLabel);
      if (variantRequired.indexOf(propKey) !== -1) {
        accumulator.requiredLabels.push(variantLabel);
      }
      var propDescription = trim(propSchema.description);
      if (propDescription !== "") {
        accumulator.descriptions.push({ label: variantLabel, text: propDescription });
      }
    }
  }

  var properties = {};
  for (var propertyIndex = 0; propertyIndex < propertyOrder.length; propertyIndex += 1) {
    var key = propertyOrder[propertyIndex];
    var propertyAccumulator = propertyAccumulators[key];
    if (!propertyAccumulator) {
      continue;
    }
    properties[key] = mergeToolParameterPropertySchema(propertyAccumulator, discriminatorKey, allLabels);
  }

  var descriptionParts = [];
  var baseDescription = trim(schema.description);
  if (baseDescription !== "") {
    descriptionParts.push(baseDescription);
  }
  // Anthropic rejects any top-level anyOf/oneOf/allOf on custom.input_schema,
  // so rewrite variant unions into one object schema and keep the
  // mode-specific guidance in descriptions.
  if (discriminatorKey !== "" && allLabels.length > 1) {
    descriptionParts.push("Choose `" + discriminatorKey + "` first. Field descriptions below say which values allow or require each field.");
  } else if (variants.length > 1) {
    descriptionParts.push("This tool accepts multiple input variants. Field descriptions below say which variants allow or require each field.");
  }
  var variantLines = [];
  for (var lineIndex = 0; lineIndex < variants.length; lineIndex += 1) {
    var variantDescription = trim(variants[lineIndex].description);
    var line = "When " + formatToolVariantSelector(discriminatorKey, variantLabels[lineIndex]) + ":";
    if (variantDescription !== "") {
      line += " " + variantDescription;
    }
    var variantRequiredFields = uniqueStringList(Array.isArray(variants[lineIndex].required) ? variants[lineIndex].required : []);
    if (variantRequiredFields.length > 0) {
      line += " Required fields: `" + variantRequiredFields.join("`, `") + "`.";
    }
    variantLines.push(line);
  }
  if (variantLines.length > 0) {
    descriptionParts.push(variantLines.join("\n"));
  }

  var result = {
    type: "object",
    properties: properties
  };
  if (required && required.length > 0) {
    result.required = required;
  }
  if (additionalPropertiesFalse) {
    result.additionalProperties = false;
  }
  var description = trim(descriptionParts.join("\n\n"));
  if (description !== "") {
    result.description = description;
  }
  return result;
}

function normalizeToolParametersSchema(value) {
  var normalized = normalizeSchemaFragment(value);
  if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) {
    return { type: "object", properties: {} };
  }
  if (topLevelSchemaCombinerVariants(normalized).length > 0) {
    return rewriteTopLevelToolParameterCombiners(normalized);
  }
  if (!schemaTypeIncludes(normalized.type, "object")) {
    return { type: "object", properties: {} };
  }
  return normalized;
}

function emitChunkPart(host, kind, text) {
  if (!host || !host.stream || typeof host.stream.write !== "function") {
    return;
  }
  if (text === null || text === undefined || String(text) === "") {
    return;
  }
  // First-party LLM chunk events intentionally use only `value.parts` so the
  // agent runtime can reject legacy text-only stream payloads instead of
  // silently normalizing them.
  host.stream.write({
    type: "chunk",
    value: {
      parts: [{
        kind: kind,
        text: String(text)
      }]
    }
  });
}

function buildTools(request) {
  var tools = [];
  if (!request || !Array.isArray(request.tools)) {
    return tools;
  }
  for (var i = 0; i < request.tools.length; i += 1) {
    var tool = request.tools[i];
    if (!tool || typeof tool !== "object" || Array.isArray(tool)) {
      continue;
    }
    var name = trim(tool.name);
    if (name === "") {
      continue;
    }
    tools.push({
      name: name,
      description: trim(tool.description),
      input_schema: normalizeToolParametersSchema(tool.parameters)
    });
  }
  return tools;
}

function decodeToolInput(argumentsText) {
  var cleaned = trim(argumentsText);
  if (cleaned === "") {
    return {};
  }
  var decoded = decodeJsonText(cleaned, null);
  if (!decoded || typeof decoded !== "object") {
    return {};
  }
  return decoded;
}

function normalizeMessageText(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return "";
  }
  if (Array.isArray(entry.parts)) {
    var text = "";
    for (var i = 0; i < entry.parts.length; i += 1) {
      var part = entry.parts[i];
      if (!part || typeof part !== "object" || Array.isArray(part)) {
        continue;
      }
      var kind = trim(part.kind).toLowerCase();
      if (kind !== "text") {
        continue;
      }
      if (part.text !== null && part.text !== undefined) {
        text += String(part.text);
      }
    }
    text = trim(text);
    if (text !== "") {
      return text;
    }
  }
  return "";
}

function normalizeAnthropicThinkingBlock(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  var block = cloneValue(value);
  var type = trim(block.type);
  if (type !== "thinking" && type !== "redacted_thinking") {
    return null;
  }
  block.type = type;
  return block;
}

function providerSourceAllowsReplay(metadata, config, model) {
  var source = plainObject(metadata && metadata.anthoriProvider);
  if (trim(source.providerRef) === "" && trim(source.providerDefinitionId) === "" && trim(source.model) === "") {
    return false;
  }
  if (trim(source.providerRef) !== "" && trim(config && config.providerRef) !== trim(source.providerRef)) {
    return false;
  }
  if (trim(source.providerDefinitionId) !== "" && trim(config && config.providerDefinitionId) !== trim(source.providerDefinitionId)) {
    return false;
  }
  if (trim(source.model) !== "" && trim(model) !== trim(source.model)) {
    return false;
  }
  return true;
}

function appendAnthropicThinkingBlocks(blocks, value) {
  if (Array.isArray(value)) {
    for (var i = 0; i < value.length; i += 1) {
      appendAnthropicThinkingBlocks(blocks, value[i]);
    }
    return;
  }
  var block = normalizeAnthropicThinkingBlock(value);
  if (block) {
    blocks.push(block);
  }
}

function anthropicThinkingBlocksFromPart(part, config, model) {
  var blocks = [];
  var metadata = plainObject(part && part.metadata);
  if (!providerSourceAllowsReplay(metadata, config || {}, model)) {
    return blocks;
  }
  var anthropic = plainObject(metadata.anthropic);
  appendAnthropicThinkingBlocks(blocks, anthropic.blocks);
  appendAnthropicThinkingBlocks(blocks, anthropic.content);
  appendAnthropicThinkingBlocks(blocks, anthropic.block);
  return blocks;
}

function collectAnthropicThinkingReplay(entry, config, model) {
  var blocks = [];
  if (!entry || typeof entry !== "object" || Array.isArray(entry) || !Array.isArray(entry.parts)) {
    return blocks;
  }
  for (var i = 0; i < entry.parts.length; i += 1) {
    var part = entry.parts[i];
    if (!part || typeof part !== "object" || Array.isArray(part)) {
      continue;
    }
    if (trim(part.kind).toLowerCase() !== "reasoning") {
      continue;
    }
    appendAnthropicThinkingBlocks(blocks, anthropicThinkingBlocksFromPart(part, config, model));
  }
  return blocks;
}

function normalizeMessageAttachments(entry) {
  var items = [];
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return items;
  }
  var seen = {};
  var push = function(item) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return;
    }
    var attachment = {};
    var name = trim(item.name || item.label || item.text);
    var path = trim(item.path);
    var ref = trim(item.ref);
    var mimeType = trim(item.mimeType);
    var type = trim(item.type) || "file";
    if (name !== "") attachment.name = name;
    if (path !== "") attachment.path = path;
    if (ref !== "") attachment.ref = ref;
    if (mimeType !== "") attachment.mimeType = mimeType;
    attachment.type = type;
    if (!attachment.name && !attachment.path && !attachment.ref) {
      return;
    }
    var key = [attachment.type, attachment.path, attachment.ref, attachment.name, attachment.mimeType].join("::");
    if (seen[key]) {
      return;
    }
    seen[key] = true;
    items.push(attachment);
  };
  if (Array.isArray(entry.attachments)) {
    for (var i = 0; i < entry.attachments.length; i += 1) {
      push(entry.attachments[i]);
    }
  }
  if (Array.isArray(entry.parts)) {
    for (var j = 0; j < entry.parts.length; j += 1) {
      var part = entry.parts[j];
      if (!part || typeof part !== "object" || Array.isArray(part)) {
        continue;
      }
      if (trim(part.kind).toLowerCase() !== "attachment") {
        continue;
      }
      var metadata = part.metadata && typeof part.metadata === "object" && !Array.isArray(part.metadata)
        ? part.metadata
        : {};
      push({
        type: metadata.type,
        path: metadata.path,
        ref: metadata.ref,
        mimeType: metadata.mimeType,
        name: metadata.name || part.text,
        text: part.text
      });
    }
  }
  return items;
}

function fileExtension(value) {
  var text = trim(value);
  if (text === "") {
    return "";
  }
  var normalized = text.replace(/\\/g, "/");
  var index = normalized.lastIndexOf(".");
  if (index < 0) {
    return "";
  }
  return normalized.slice(index).toLowerCase();
}

function stripAttachmentCacheSuffix(value) {
  var text = trim(value);
  if (text === "") {
    return "";
  }
  return text.replace(/(\.[A-Za-z0-9]+)-\d+$/i, "$1");
}

function inferAttachmentMimeType(attachment) {
  var mimeType = trim(attachment && attachment.mimeType);
  if (mimeType !== "") {
    return mimeType;
  }
  var ext = fileExtension(attachment && attachment.name);
  if (ext === "") {
    ext = fileExtension(stripAttachmentCacheSuffix(attachment && attachment.path));
  }
  if (ext === "") {
    ext = fileExtension(attachment && attachment.path);
  }
  if (ext === "") {
    ext = fileExtension(attachment && attachment.ref);
  }
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".txt" || ext === ".md" || ext === ".markdown" || ext === ".json" || ext === ".yaml" || ext === ".yml" || ext === ".csv" || ext === ".log") return "text/plain";
  return "";
}

function readAttachment(host, attachment, encoding) {
  if (!host || !host.attachments || typeof host.attachments.read !== "function") {
    return null;
  }
  if (!attachment || typeof attachment !== "object" || Array.isArray(attachment)) {
    return null;
  }
  var path = trim(attachment.path);
  if (path === "") {
    return null;
  }
  var payload = host.attachments.read({
    path: path,
    name: trim(attachment.name),
    mimeType: inferAttachmentMimeType(attachment),
    encoding: encoding || "base64"
  });
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  var content = trim(payload.content);
  if (content === "") {
    return null;
  }
  return {
    name: trim(payload.name) || trim(attachment.name) || "attachment",
    path: path,
    mimeType: trim(payload.mimeType) || inferAttachmentMimeType(attachment),
    content: content,
    encoding: trim(payload.encoding) || trim(encoding || "base64")
  };
}

function buildAttachmentContextLines(attachments) {
  var lines = [];
  if (!Array.isArray(attachments)) {
    return lines;
  }
  for (var i = 0; i < attachments.length; i += 1) {
    var attachment = attachments[i];
    if (!attachment || typeof attachment !== "object" || Array.isArray(attachment)) {
      continue;
    }
    var label = trim(attachment.name);
    var reference = trim(attachment.path) || trim(attachment.ref);
    if (label !== "" && reference !== "") {
      lines.push("- " + label + " (" + reference + ")");
      continue;
    }
    if (reference !== "") {
      lines.push("- " + reference);
      continue;
    }
    if (label !== "") {
      lines.push("- " + label);
    }
  }
  return lines;
}

function appendAttachmentContext(content, attachments) {
  var text = trim(content);
  var lines = buildAttachmentContextLines(attachments);
  if (lines.length === 0) {
    return text;
  }
  var suffix = "Attachments:\n" + lines.join("\n");
  return text !== "" ? text + "\n\n" + suffix : suffix;
}

function buildAnthropicUserContent(entry, host) {
  var blocks = [];
  var text = normalizeMessageText(entry);
  if (text !== "") {
    blocks.push({
      type: "text",
      text: text
    });
  }
  var attachments = normalizeMessageAttachments(entry);
  var fallbackAttachments = [];
  for (var i = 0; i < attachments.length; i += 1) {
    var attachment = attachments[i];
    var mimeType = inferAttachmentMimeType(attachment);
    var resolved = null;
    try {
      resolved = readAttachment(host, attachment, mimeType === "text/plain" ? "utf8" : "base64");
    } catch (_error) {
      resolved = null;
    }
    if (!resolved) {
      fallbackAttachments.push(attachment);
      continue;
    }
    if (/^image\//.test(mimeType)) {
      blocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: mimeType,
          data: resolved.content
        }
      });
      continue;
    }
    if (mimeType === "application/pdf") {
      blocks.push({
        type: "document",
        source: {
          type: "base64",
          media_type: mimeType,
          data: resolved.content
        }
      });
      continue;
    }
    if (mimeType === "text/plain") {
      blocks.push({
        type: "document",
        source: {
          type: "text",
          media_type: "text/plain",
          data: resolved.content
        }
      });
      continue;
    }
    fallbackAttachments.push(attachment);
  }
  var fallbackLines = buildAttachmentContextLines(fallbackAttachments);
  if (fallbackLines.length > 0) {
    blocks.push({
      type: "text",
      text: "Attachments:\n" + fallbackLines.join("\n")
    });
  }
  return blocks;
}

function buildMessages(request, host, config, model) {
  var messages = [];
  var system = "";

  if (request && Array.isArray(request.messages) && request.messages.length > 0) {
    for (var i = 0; i < request.messages.length; i += 1) {
      var entry = request.messages[i];
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        continue;
      }
      var role = trim(entry.role) || "user";
      if (role === "agent") role = "assistant";

      if (role === "system") {
        var systemContent = appendAttachmentContext(normalizeMessageText(entry), normalizeMessageAttachments(entry));
        if (systemContent === "") {
          continue;
        }
        if (system !== "") {
          system += "\n\n";
        }
        system += systemContent;
        continue;
      }

      if (role === "tool") {
        var toolCallId = trim(entry.toolCallId);
        if (toolCallId === "") {
          continue;
        }
        messages.push({
          role: "user",
          content: [{
            type: "tool_result",
            tool_use_id: toolCallId,
            content: normalizeMessageText(entry)
          }]
        });
        continue;
      }

      if (role === "assistant") {
        var blocks = [];
        appendAnthropicThinkingBlocks(blocks, collectAnthropicThinkingReplay(entry, config, model));
        var assistantContent = appendAttachmentContext(normalizeMessageText(entry), normalizeMessageAttachments(entry));
        if (assistantContent !== "") {
          blocks.push({
            type: "text",
            text: assistantContent
          });
        }

        if (Array.isArray(entry.toolCalls)) {
          for (var j = 0; j < entry.toolCalls.length; j += 1) {
            var call = entry.toolCalls[j];
            if (!call || typeof call !== "object" || Array.isArray(call)) {
              continue;
            }
            var fn = call.function && typeof call.function === "object"
              ? call.function
              : (call.Function && typeof call.Function === "object" ? call.Function : {});
            var name = trim(fn.name || fn.Name || call.name || call.Name);
            if (name === "") {
              continue;
            }
            var callId = trim(call.id || call.ID);
            if (callId === "") {
              callId = name;
            }
            var argumentsText = trim(fn.arguments || fn.Arguments || call.arguments || call.Arguments);
            blocks.push({
              type: "tool_use",
              id: callId,
              name: name,
              input: decodeToolInput(argumentsText)
            });
          }
        }

        if (blocks.length === 0) {
          continue;
        }
        messages.push({
          role: "assistant",
          content: blocks
        });
        continue;
      }

      var contentBlocks = buildAnthropicUserContent(entry, host);
      if (contentBlocks.length === 0) {
        continue;
      }
      messages.push({
        role: role,
        content: contentBlocks
      });
    }
  }

  return {
    messages: messages,
    system: system
  };
}

function collectResponseText(response) {
  if (!response || typeof response !== "object" || Array.isArray(response) || !Array.isArray(response.content)) {
    return "";
  }
  var parts = [];
  for (var i = 0; i < response.content.length; i += 1) {
    var item = response.content[i];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    if (trim(item.type) !== "text") {
      continue;
    }
    var text = trim(item.text);
    if (text !== "") {
      parts.push(text);
    }
  }
  return parts.join("\n\n");
}

function collectResponseReasoning(response) {
  if (!response || typeof response !== "object" || Array.isArray(response) || !Array.isArray(response.content)) {
    return "";
  }
  var parts = [];
  for (var i = 0; i < response.content.length; i += 1) {
    var item = response.content[i];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    if (trim(item.type) !== "thinking") {
      continue;
    }
    var text = trim(item.thinking || item.text);
    if (text !== "") {
      parts.push(text);
    }
  }
  return parts.join("\n\n");
}

function collectResponseReasoningParts(response) {
  var parts = [];
  if (!response || typeof response !== "object" || Array.isArray(response) || !Array.isArray(response.content)) {
    return parts;
  }
  for (var i = 0; i < response.content.length; i += 1) {
    var block = normalizeAnthropicThinkingBlock(response.content[i]);
    if (!block) {
      continue;
    }
    parts.push({
      kind: "reasoning",
      text: trim(block.thinking || block.text),
      metadata: {
        provider: "anthropic",
        anthropic: {
          blocks: [block]
        }
      }
    });
  }
  return parts;
}

function collectResponseToolCalls(response) {
  var toolCalls = [];
  if (!response || typeof response !== "object" || Array.isArray(response) || !Array.isArray(response.content)) {
    return toolCalls;
  }
  for (var i = 0; i < response.content.length; i += 1) {
    var item = response.content[i];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    if (trim(item.type) !== "tool_use") {
      continue;
    }
    var name = trim(item.name);
    if (name === "") {
      continue;
    }
    var argumentsText = "{}";
    if (item.input && typeof item.input === "object") {
      argumentsText = JSON.stringify(item.input);
    } else if (trim(item.input) !== "") {
      argumentsText = trim(item.input);
    }
    toolCalls.push({
      id: trim(item.id),
      name: name,
      arguments: argumentsText
    });
  }
  return toolCalls;
}

function finalizeStreamToolCalls(contentBlocks) {
  var toolCalls = [];
  if (!Array.isArray(contentBlocks)) {
    return toolCalls;
  }
  for (var i = 0; i < contentBlocks.length; i += 1) {
    var block = contentBlocks[i];
    if (!block || typeof block !== "object" || Array.isArray(block)) {
      continue;
    }
    if (trim(block.type) !== "tool_use") {
      continue;
    }
    var name = trim(block.name);
    if (name === "") {
      continue;
    }
    var argumentsText = trim(block.input_json);
    if (argumentsText === "") {
      argumentsText = "{}";
    }
    toolCalls.push({
      id: trim(block.id),
      name: name,
      arguments: argumentsText
    });
  }
  return toolCalls;
}

function readFetchChunkText(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    return "";
  }
  if (trim(event.type).toLowerCase() !== "chunk") {
    return "";
  }
  if (event.text !== null && event.text !== undefined) {
    return String(event.text);
  }
  if (typeof event.value === "string") {
    return event.value;
  }
  return "";
}

function createSSEParser(onPayload) {
  var buffered = "";
  var currentEvent = "";
  var currentData = [];

  function dispatch() {
    if (typeof onPayload !== "function") {
      currentEvent = "";
      currentData = [];
      return;
    }
    if (currentEvent === "" && currentData.length === 0) {
      return;
    }
    var eventName = currentEvent;
    var payloadText = currentData.join("\n");
    currentEvent = "";
    currentData = [];
    onPayload(eventName, payloadText);
  }

  function consumeLine(rawLine) {
    var line = String(rawLine || "");
    if (line === "") {
      dispatch();
      return;
    }
    if (line.charAt(0) === ":") {
      return;
    }
    if (line.indexOf("event:") === 0) {
      currentEvent = trim(line.slice(6));
      return;
    }
    if (line.indexOf("data:") === 0) {
      var data = line.slice(5);
      if (data.indexOf(" ") === 0) {
        data = data.slice(1);
      }
      currentData.push(data);
    }
  }

  return {
    write: function(chunkText) {
      if (chunkText === null || chunkText === undefined || String(chunkText) === "") {
        return;
      }
      buffered += String(chunkText);
      var newlineIndex = buffered.indexOf("\n");
      while (newlineIndex >= 0) {
        var line = buffered.slice(0, newlineIndex);
        if (line.charAt(line.length - 1) === "\r") {
          line = line.slice(0, -1);
        }
        consumeLine(line);
        buffered = buffered.slice(newlineIndex + 1);
        newlineIndex = buffered.indexOf("\n");
      }
    },
    finish: function() {
      if (buffered !== "") {
        var line = buffered;
        if (line.charAt(line.length - 1) === "\r") {
          line = line.slice(0, -1);
        }
        consumeLine(line);
        buffered = "";
      }
      dispatch();
    }
  };
}

function handleStreamEvent(eventName, event, contentBlocks, state, host) {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    return;
  }

  var nextUsage = normalizeAnthropicUsage(event.usage);
  if (nextUsage) {
    state.usage = nextUsage;
  }

  if (eventName === "error" || trim(event.type) === "error") {
    state.error = trim(event.error && event.error.message) || "anthropic request failed";
    return;
  }

  var type = trim(event.type);
  var index = Number(event.index);
  if (!Number.isFinite(index)) {
    index = 0;
  }
  index = Math.floor(index);

  if (eventName === "content_block_start" || type === "content_block_start") {
    var contentBlock = event.content_block && typeof event.content_block === "object" ? event.content_block : {};
    var blockType = trim(contentBlock.type);
    if (blockType === "text") {
      var text = contentBlock.text === null || contentBlock.text === undefined ? "" : String(contentBlock.text);
      contentBlocks[index] = {
        type: "text",
        text: text
      };
      if (text !== "") {
        state.text += text;
        emitChunkPart(host, "text", text);
      }
      return;
    }
    if (blockType === "thinking") {
      var thinking = contentBlock.thinking === null || contentBlock.thinking === undefined ? "" : String(contentBlock.thinking);
      contentBlocks[index] = {
        type: "thinking",
        thinking: thinking
      };
      if (trim(contentBlock.signature) !== "") {
        contentBlocks[index].signature = trim(contentBlock.signature);
      }
      if (thinking !== "") {
        state.reasoningText += thinking;
        emitChunkPart(host, "reasoning", thinking);
      }
      return;
    }
    if (blockType === "redacted_thinking") {
      contentBlocks[index] = {
        type: "redacted_thinking",
        data: trim(contentBlock.data)
      };
      return;
    }
    if (blockType === "tool_use") {
      var inputJson = "";
      if (contentBlock.input && typeof contentBlock.input === "object") {
        inputJson = JSON.stringify(contentBlock.input);
      } else if (trim(contentBlock.input) !== "") {
        inputJson = trim(contentBlock.input);
      }
      contentBlocks[index] = {
        type: "tool_use",
        id: trim(contentBlock.id),
        name: trim(contentBlock.name),
        input_json: inputJson
      };
    }
    return;
  }

  if (eventName !== "content_block_delta" && type !== "content_block_delta") {
    return;
  }
  var delta = event.delta && typeof event.delta === "object" ? event.delta : {};
  var deltaType = trim(delta.type);
  if (deltaType === "text_delta") {
    var partialText = delta.text === null || delta.text === undefined ? "" : String(delta.text);
    if (partialText === "") {
      return;
    }
    if (!contentBlocks[index]) {
      contentBlocks[index] = { type: "text", text: "" };
    }
    contentBlocks[index].type = "text";
    contentBlocks[index].text += partialText;
    state.text += partialText;
    emitChunkPart(host, "text", partialText);
    return;
  }
  if (deltaType === "thinking_delta") {
    var partialThinking = delta.thinking === null || delta.thinking === undefined ? "" : String(delta.thinking);
    if (partialThinking === "") {
      return;
    }
    if (!contentBlocks[index]) {
      contentBlocks[index] = { type: "thinking", thinking: "" };
    }
    contentBlocks[index].type = "thinking";
    contentBlocks[index].thinking += partialThinking;
    state.reasoningText += partialThinking;
    emitChunkPart(host, "reasoning", partialThinking);
    return;
  }
  if (deltaType === "signature_delta") {
    var signature = delta.signature === null || delta.signature === undefined ? "" : String(delta.signature);
    if (signature === "") {
      return;
    }
    if (!contentBlocks[index]) {
      contentBlocks[index] = { type: "thinking", thinking: "" };
    }
    contentBlocks[index].type = "thinking";
    contentBlocks[index].signature = String(contentBlocks[index].signature || "") + signature;
    return;
  }
  if (deltaType === "input_json_delta") {
    var partialJson = delta.partial_json === null || delta.partial_json === undefined ? "" : String(delta.partial_json);
    if (partialJson === "") {
      return;
    }
    if (!contentBlocks[index]) {
      contentBlocks[index] = {
        type: "tool_use",
        id: "",
        name: "",
        input_json: ""
      };
    }
    contentBlocks[index].type = "tool_use";
    contentBlocks[index].input_json += partialJson;
  }
}

function createAnthropicSSEStream(host) {
  var state = {
    text: "",
    reasoningText: "",
    error: "",
    usage: null
  };
  var contentBlocks = [];
  var parser = createSSEParser(function(eventName, payloadText) {
    if (trim(payloadText) === "") {
      return;
    }
    var event = decodeJsonText(payloadText, null);
    if (!event || typeof event !== "object" || Array.isArray(event)) {
      return;
    }
    handleStreamEvent(eventName, event, contentBlocks, state, host);
  });
  return {
    state: state,
    contentBlocks: contentBlocks,
    parser: parser
  };
}

function finalizeAnthropicSSEStream(stream) {
  var response = { content: stream.contentBlocks };
  return {
    text: stream.state.text,
    reasoningText: stream.state.reasoningText,
    parts: collectResponseReasoningParts(response),
    toolCalls: finalizeStreamToolCalls(stream.contentBlocks),
    error: stream.state.error,
    usage: stream.state.usage
  };
}

function consumeSSEBody(rawBody, host) {
  var stream = createAnthropicSSEStream(host);
  stream.parser.write(String(rawBody || ""));
  stream.parser.finish();
  return finalizeAnthropicSSEStream(stream);
}

function handleRespond(config, request, host) {
  var providerLabel = trim(config && config.providerLabel) || "Anthropic";
  var apiKey = trim(config && config.apiKey);
  if (apiKey === "") {
    return { error: providerLabel + " apiKey is required" };
  }

  var model = trim(request && request.model);
  if (model === "") {
    model = trim(config && config.llmModel);
  }
  if (model === "") {
    model = trim(config && config.defaultModel);
  }
  if (model === "") {
    return { error: "provider model is required" };
  }

  var messageState = buildMessages(request || {}, host, config || {}, model);
  var maxTokens = finiteNumber(request && (request.maxTokens ?? request.maxOutputTokens)) ||
    finiteNumber(config && (config.maxTokens ?? config.maxOutputTokens)) ||
    2048;
  var body = {
    model: model,
    max_tokens: maxTokens,
    messages: messageState.messages,
    stream: true
  };
  if (messageState.system !== "") {
    body.system = messageState.system;
  }
  var tools = buildTools(request || {});
  if (tools.length > 0) {
    body.tools = tools;
  }
  var thinking = buildAnthropicThinkingPayload(request || {}, config || {}, maxTokens);
  if (thinking) {
    body.thinking = thinking;
  }

  var rawBody = "";
  var stream = createAnthropicSSEStream(host);
  // Parse SSE chunks as they arrive so chunk events are delivered live.
  var response = hostFetch(host, {
    url: messagesEndpoint(config || {}),
    method: "POST",
    // Timeout is owned by execution/control runtime budget, not provider config.
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14"
    },
    body: JSON.stringify(body)
  }, function(event) {
    var chunkText = readFetchChunkText(event);
    if (chunkText === "") {
      return;
    }
    rawBody += chunkText;
    stream.parser.write(chunkText);
  }, providerLabel);
  stream.parser.finish();
  if (!response || !response.ok) {
    return { error: extractErrorMessage(rawBody || (response && response.body), providerLabel + " request failed", providerLabel) };
  }

  var streamed = finalizeAnthropicSSEStream(stream);
  if (streamed.error !== "") {
    return { error: streamed.error };
  }
  var text = streamed.text;
  var reasoningText = streamed.reasoningText;
  var parts = Array.isArray(streamed.parts) ? streamed.parts : [];
  var toolCalls = streamed.toolCalls;
  var usage = normalizeAnthropicUsage(streamed.usage);

  if (text === "" && reasoningText === "" && toolCalls.length === 0 && rawBody.indexOf("event:") === -1 && rawBody.indexOf("data:") === -1) {
    var parsed = decodeJsonText(rawBody || "{}", null);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { error: providerLabel + " returned invalid JSON" };
    }
    text = collectResponseText(parsed);
    reasoningText = collectResponseReasoning(parsed);
    parts = collectResponseReasoningParts(parsed);
    toolCalls = collectResponseToolCalls(parsed);
    usage = normalizeAnthropicUsage(parsed.usage);
  }

  if (trim(text) === "" && trim(reasoningText) === "" && toolCalls.length === 0) {
    return { error: "model response was empty" };
  }

  var output = {};
  if (trim(text) !== "") {
    output.text = trim(text);
  }
  if (trim(reasoningText) !== "") {
    output.reasoningText = trim(reasoningText);
  }
  if (parts.length > 0) {
    output.parts = parts;
  }
  if (toolCalls.length > 0) {
    output.toolCalls = toolCalls;
  }
  if (usage) {
    output.usage = usage;
  }
  return { output: output };
}

function mergeModelItems(liveItems, fallbackItems) {
  var items = [];
  var seen = {};
  var fallbackById = {};
  for (var i = 0; i < fallbackItems.length; i += 1) {
    var fallbackItem = fallbackItems[i] && typeof fallbackItems[i] === "object" ? fallbackItems[i] : {};
    var fallbackId = trim(fallbackItem.id);
    if (fallbackId !== "") {
      fallbackById[fallbackId] = fallbackItem;
    }
  }
  for (var j = 0; j < liveItems.length; j += 1) {
    var liveItem = liveItems[j] && typeof liveItems[j] === "object" ? liveItems[j] : {};
    var id = trim(liveItem.id);
    if (id === "" || seen[id]) {
      continue;
    }
    seen[id] = true;
    items.push(Object.assign({}, fallbackById[id] || {}, liveItem, { id: id }));
  }
  return items;
}

function handleModels(config, host) {
  var providerLabel = trim(config && config.providerLabel) || "Anthropic";
  var providerKey = trim(config && config.providerKey);
  var fallbackItems = providerFallbackModels(config);
  var apiKey = trim(config && config.apiKey);
  if (apiKey === "") {
    return {
      output: {
        items: fallbackItems,
        defaultModel: trim(config && config.defaultModel),
        reachable: false,
        reason: providerLabel + " API key is required for live model listing."
      }
    };
  }

  var response;
  try {
    response = hostFetch(host, {
      url: modelsEndpoint(config || {}),
      method: "GET",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      }
    }, null, providerLabel);
  } catch (error) {
    if (providerKey === "anthropic") {
      throw error;
    }
    return {
      output: {
        items: fallbackItems,
        defaultModel: trim(config && config.defaultModel),
        reachable: false,
        reason: normalizeAnthropicTransportErrorMessage(error && error.message ? error.message : error, providerLabel + " model listing failed", providerLabel)
      }
    };
  }
  if (!response || !response.ok) {
    var responseError = extractErrorMessage(response && response.body, "failed to list " + providerLabel + " models", providerLabel);
    if (providerKey === "anthropic") {
      return { error: responseError };
    }
    return {
      output: {
        items: fallbackItems,
        defaultModel: trim(config && config.defaultModel),
        reachable: false,
        reason: responseError
      }
    };
  }

  var parsed = decodeJsonText(response.body, null);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !Array.isArray(parsed.data)) {
    var invalidMessage = providerLabel + " returned an invalid model list";
    if (providerKey === "anthropic") {
      return { error: invalidMessage };
    }
    return {
      output: {
        items: fallbackItems,
        defaultModel: trim(config && config.defaultModel),
        reachable: false,
        reason: invalidMessage
      }
    };
  }

  var items = [];
  for (var i = 0; i < parsed.data.length; i += 1) {
    var entry = parsed.data[i];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }
    var item = liveAnthropicModelItem(config, entry);
    if (item) {
      items.push(item);
    }
  }
  return {
    output: {
      items: providerKey === "anthropic" ? items : mergeModelItems(items, fallbackItems),
      defaultModel: trim(config && config.defaultModel),
      reachable: true
    }
  };
}

module.exports = {
  "list-models": function (input, host) {
    var config = effectiveProviderConfig(input || {});
    return handleModels(config, host);
  },
  "respond-text": function (input, host) {
    var config = effectiveProviderConfig(input || {});
    var request = input && input.request && typeof input.request === "object" ? input.request : {};
    return handleRespond(config, request, host);
  }
};
