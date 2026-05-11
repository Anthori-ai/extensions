function trim(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

function normalizeLMStudioTransportErrorMessage(message, fallback) {
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
    return "LM Studio stream failed. The provider may be unavailable right now. Upstream error: " + text;
  }
  return text || fallback;
}

function hostFetch(host, request, onEvent) {
  try {
    return host.http.fetch(request, onEvent);
  } catch (error) {
    throw new Error(
      normalizeLMStudioTransportErrorMessage(
        error && error.message ? error.message : error,
        "LM Studio request failed"
      )
    );
  }
}

function maybeReasoningPayload(request, config) {
  var effort = selectedReasoningPreference(request, config);
  if (effort === "low" || effort === "medium" || effort === "high") {
    return effort;
  }
  return "";
}

function normalizeReasoningPreference(value) {
  var effort = trim(value).toLowerCase();
  if (effort === "none" || effort === "off") {
    return "none";
  }
  if (effort === "low" || effort === "medium" || effort === "high") {
    return effort;
  }
  if (effort === "xhigh") {
    return "high";
  }
  return "";
}

function selectedReasoningPreference(request, config) {
  var effort = normalizeReasoningPreference(request && request.reasoning);
  if (effort !== "") return effort;
  effort = normalizeReasoningPreference(request && request.reasoningEffort);
  if (effort !== "") return effort;
  effort = normalizeReasoningPreference(config && config.reasoningEffort);
  if (effort !== "") return effort;
  effort = normalizeReasoningPreference(config && config.reasoning);
  if (effort !== "") return effort;
  return "";
}

function baseUrl(config) {
  return trim(config && config.llmBaseUrl).replace(/\/+$/, "");
}

function truthy(value) {
  if (value === null || value === undefined) {
    return false;
  }
  return !!value;
}

function finiteNumber(value) {
  var number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizeOpenAICompatibleUsage(value) {
  var usage = value && typeof value === "object" && !Array.isArray(value) ? value : null;
  if (!usage) {
    return null;
  }
  var result = {};
  var inputTokens = finiteNumber(
    usage.input_tokens ?? usage.inputTokens ?? usage.prompt_tokens ?? usage.promptTokens
  );
  var outputTokens = finiteNumber(
    usage.output_tokens ?? usage.outputTokens ?? usage.completion_tokens ?? usage.completionTokens
  );
  var totalTokens = finiteNumber(
    usage.total_tokens ?? usage.totalTokens
  );
  var completionDetails = usage.completion_tokens_details && typeof usage.completion_tokens_details === "object"
    ? usage.completion_tokens_details
    : (usage.completionTokensDetails && typeof usage.completionTokensDetails === "object" ? usage.completionTokensDetails : {});
  var reasoningTokens = finiteNumber(
    completionDetails.reasoning_tokens ?? completionDetails.reasoningTokens ?? usage.reasoning_tokens ?? usage.reasoningTokens
  );
  if (inputTokens > 0) result.inputTokens = inputTokens;
  if (outputTokens > 0) result.outputTokens = outputTokens;
  if (reasoningTokens > 0) result.reasoningTokens = reasoningTokens;
  if (totalTokens > 0) {
    result.totalTokens = totalTokens;
  } else if (inputTokens > 0 || outputTokens > 0) {
    result.totalTokens = inputTokens + outputTokens;
  }
  return Object.keys(result).length > 0 ? result : null;
}

function modelContextLength(entry) {
  var item = entry && typeof entry === "object" && !Array.isArray(entry) ? entry : {};
  if (Array.isArray(item.loaded_instances)) {
    for (var i = 0; i < item.loaded_instances.length; i += 1) {
      var instance = item.loaded_instances[i];
      var config = instance && typeof instance === "object" && instance.config && typeof instance.config === "object"
        ? instance.config
        : {};
      var loadedContext = finiteNumber(config.context_length ?? config.contextLength);
      if (loadedContext > 0) {
        return loadedContext;
      }
    }
  }
  return finiteNumber(item.max_context_length ?? item.maxContextLength);
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
    "maxLength",
    "$ref",
    "$defs",
    "definitions"
  ];
  for (var i = 0; i < keys.length; i += 1) {
    if (Object.prototype.hasOwnProperty.call(value, keys[i])) {
      return true;
    }
  }
  return false;
}

function plainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value;
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

function providerSourceMetadata(config, model) {
  var source = {};
  var providerRef = trim(config && config.providerRef);
  var providerDefinitionId = trim(config && config.providerDefinitionId);
  if (providerRef !== "") source.providerRef = providerRef;
  if (providerDefinitionId !== "") source.providerDefinitionId = providerDefinitionId;
  if (trim(model) !== "") source.model = trim(model);
  return source;
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
  // LM Studio's OpenAI-compatible validator expects a top-level object schema
  // with concrete `properties`, so rewrite variant unions into one object and
  // keep the discriminator-specific guidance in descriptions.
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
    if (copy.$defs && typeof copy.$defs === "object" && !Array.isArray(copy.$defs)) {
      var defs = {};
      var defKeys = Object.keys(copy.$defs).sort();
      for (var d = 0; d < defKeys.length; d += 1) {
        var defKey = defKeys[d];
        defs[defKey] = normalizeSchemaFragment(copy.$defs[defKey]);
      }
      copy.$defs = defs;
    }
    if (copy.definitions && typeof copy.definitions === "object" && !Array.isArray(copy.definitions)) {
      var definitions = {};
      var definitionKeys = Object.keys(copy.definitions).sort();
      for (var n = 0; n < definitionKeys.length; n += 1) {
        var definitionKey = definitionKeys[n];
        definitions[definitionKey] = normalizeSchemaFragment(copy.definitions[definitionKey]);
      }
      copy.definitions = definitions;
    }
    return copy;
  }

  var properties = {};
  var required = [];
  var keys = Object.keys(value).sort();
  for (var k = 0; k < keys.length; k += 1) {
    var key = keys[k];
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

function buildOpenAITools(request) {
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
      type: "function",
      function: {
        name: name,
        description: trim(tool.description),
        parameters: normalizeToolParametersSchema(tool.parameters)
      }
    });
  }
  return tools;
}

function buildResponsesTools(request) {
  var tools = [];
  var chatTools = buildOpenAITools(request);
  for (var i = 0; i < chatTools.length; i += 1) {
    var tool = chatTools[i];
    var fn = tool && tool.function && typeof tool.function === "object" ? tool.function : {};
    var name = trim(fn.name);
    if (name === "") {
      continue;
    }
    tools.push({
      type: "function",
      name: name,
      description: trim(fn.description),
      parameters: normalizeToolParametersSchema(fn.parameters)
    });
  }
  return tools;
}

function buildOpenAIToolCalls(raw) {
  var toolCalls = [];
  if (!Array.isArray(raw)) {
    return toolCalls;
  }
  for (var i = 0; i < raw.length; i += 1) {
    var call = raw[i];
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
    var argumentsText = trim(fn.arguments || fn.Arguments || call.arguments || call.Arguments);
    if (argumentsText === "") {
      argumentsText = "{}";
    }
    toolCalls.push({
      id: trim(call.id || call.ID),
      type: "function",
      function: {
        name: name,
        arguments: argumentsText
      }
    });
  }
  return toolCalls;
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
  return "";
}

function attachmentDataUri(mimeType, base64) {
  var resolvedMimeType = trim(mimeType) || "application/octet-stream";
  return "data:" + resolvedMimeType + ";base64," + trim(base64);
}

function readAttachmentBinary(attachment, host) {
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
  var mimeType = inferAttachmentMimeType(attachment);
  if (!/^image\//.test(mimeType)) {
    return null;
  }
  var payload = host.attachments.read({
    path: path,
    name: trim(attachment.name),
    mimeType: mimeType,
    encoding: "base64"
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
    mimeType: trim(payload.mimeType) || mimeType,
    content: content
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

function buildUserMessageContent(entry, host) {
  var attachments = normalizeMessageAttachments(entry);
  if (attachments.length === 0) {
    return normalizeMessageText(entry);
  }
  var blocks = [];
  var nativeCount = 0;
  var text = normalizeMessageText(entry);
  if (text !== "") {
    blocks.push({ type: "text", text: text });
  }
  var fallbackAttachments = [];
  for (var i = 0; i < attachments.length; i += 1) {
    var attachment = attachments[i];
    var resolved = null;
    try {
      resolved = readAttachmentBinary(attachment, host);
    } catch (_error) {
      resolved = null;
    }
    if (!resolved) {
      fallbackAttachments.push(attachment);
      continue;
    }
    nativeCount += 1;
    blocks.push({
      type: "image_url",
      image_url: {
        url: attachmentDataUri(resolved.mimeType, resolved.content)
      }
    });
  }
  var fallbackLines = buildAttachmentContextLines(fallbackAttachments);
  if (nativeCount === 0) {
    return appendAttachmentContext(text, attachments);
  }
  if (fallbackLines.length > 0) {
    blocks.push({
      type: "text",
      text: "Attachments:\n" + fallbackLines.join("\n")
    });
  }
  if (blocks.length === 0) {
    return "";
  }
  if (blocks.length === 1 && blocks[0].type === "text") {
    return blocks[0].text;
  }
  return blocks;
}

function collectOpenAIMessages(request, host) {
  var messages = [];
  if (request && Array.isArray(request.messages) && request.messages.length > 0) {
    for (var i = 0; i < request.messages.length; i += 1) {
      var entry = request.messages[i];
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        continue;
      }
      var role = trim(entry.role) || "user";
      if (role === "agent") role = "assistant";
      if (role === "tool") {
        var toolCallId = trim(entry.toolCallId);
        if (toolCallId === "") {
          continue;
        }
        messages.push({
          role: "tool",
          tool_call_id: toolCallId,
          content: normalizeMessageText(entry)
        });
        continue;
      }
      if (role === "assistant") {
        var content = appendAttachmentContext(normalizeMessageText(entry), normalizeMessageAttachments(entry));
        var toolCalls = buildOpenAIToolCalls(entry.toolCalls);
        if (content === "" && toolCalls.length === 0) {
          continue;
        }
        var assistant = { role: "assistant" };
        if (content !== "") {
          assistant.content = content;
        }
        if (toolCalls.length > 0) {
          assistant.tool_calls = toolCalls;
        }
        messages.push(assistant);
        continue;
      }
      var messageContent = buildUserMessageContent(entry, host);
      if ((typeof messageContent === "string" && messageContent === "") || (Array.isArray(messageContent) && messageContent.length === 0)) {
        continue;
      }
      messages.push({ role: role, content: messageContent });
    }
  }
  return messages;
}

function lmstudioResponseMetadata(responseId, config, model) {
  var id = trim(responseId);
  if (id === "") {
    return null;
  }
  return {
    provider: "lmstudio",
    anthoriProvider: providerSourceMetadata(config || {}, model),
    lmstudio: {
      responseId: id
    }
  };
}

function responseIdFromMetadata(metadata, config, model) {
  if (!providerSourceAllowsReplay(metadata, config || {}, model)) {
    return "";
  }
  var lmstudio = plainObject(metadata.lmstudio);
  return trim(lmstudio.responseId || lmstudio.responseID || lmstudio.previousResponseId || lmstudio.previous_response_id);
}

function responseIdFromPart(part, config, model) {
  return responseIdFromMetadata(plainObject(part && part.metadata), config, model);
}

function responseIdFromToolCall(toolCall, config, model) {
  return responseIdFromMetadata(plainObject(toolCall && toolCall.metadata), config, model);
}

function previousLMStudioResponseAnchor(request, config, model) {
  if (!request || !Array.isArray(request.messages)) {
    return { responseId: "", index: -1 };
  }
  for (var i = request.messages.length - 1; i >= 0; i -= 1) {
    var entry = request.messages[i];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }
    if (Array.isArray(entry.parts)) {
      for (var j = entry.parts.length - 1; j >= 0; j -= 1) {
        var partId = responseIdFromPart(entry.parts[j], config, model);
        if (partId !== "") {
          return { responseId: partId, index: i };
        }
      }
    }
    if (Array.isArray(entry.toolCalls)) {
      for (var k = entry.toolCalls.length - 1; k >= 0; k -= 1) {
        var toolId = responseIdFromToolCall(entry.toolCalls[k], config, model);
        if (toolId !== "") {
          return { responseId: toolId, index: i };
        }
      }
    }
  }
  return { responseId: "", index: -1 };
}

function previousLMStudioResponseId(request, config, model) {
  return previousLMStudioResponseAnchor(request, config, model).responseId;
}

function buildResponsesContent(entry, host) {
  var role = trim(entry && entry.role) || "user";
  if (role === "agent") role = "assistant";
  var text = role === "assistant"
    ? appendAttachmentContext(normalizeMessageText(entry), normalizeMessageAttachments(entry))
    : buildUserMessageContent(entry, host);
  var type = role === "assistant" ? "output_text" : "input_text";
  if (typeof text === "string") {
    return trim(text) === "" ? [] : [{ type: type, text: text }];
  }
  if (!Array.isArray(text)) {
    return [];
  }
  var blocks = [];
  for (var i = 0; i < text.length; i += 1) {
    var block = text[i];
    if (!block || typeof block !== "object" || Array.isArray(block)) {
      continue;
    }
    if (trim(block.type) === "text") {
      blocks.push({ type: type, text: String(block.text || "") });
      continue;
    }
    blocks.push(cloneValue(block));
  }
  return blocks;
}

function collectSystemPrompt(request) {
  var messages = request && Array.isArray(request.messages) ? request.messages : [];
  var prompts = [];
  for (var i = 0; i < messages.length; i += 1) {
    var entry = messages[i];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }
    if (trim(entry.role) !== "system") {
      continue;
    }
    var text = normalizeMessageText(entry);
    if (text !== "") {
      prompts.push(text);
    }
  }
  return prompts.join("\n\n");
}

function collectResponsesInput(request, host, startIndex) {
  var items = [];
  var firstIndex = Number(startIndex);
  if (!Number.isFinite(firstIndex) || firstIndex < 0) {
    firstIndex = 0;
  }
  firstIndex = Math.floor(firstIndex);
  if (request && Array.isArray(request.messages) && request.messages.length > 0) {
    for (var i = firstIndex; i < request.messages.length; i += 1) {
      var entry = request.messages[i];
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        continue;
      }
      var role = trim(entry.role) || "user";
      if (role === "agent") role = "assistant";
      if (role === "system") {
        continue;
      }
      if (role === "tool") {
        var toolCallId = trim(entry.toolCallId);
        if (toolCallId !== "") {
          items.push({
            type: "function_call_output",
            call_id: toolCallId,
            output: normalizeMessageText(entry)
          });
        }
        continue;
      }
      var content = buildResponsesContent(entry, host);
      if (content.length > 0) {
        items.push({
          type: "message",
          role: role,
          content: content
        });
      }
      if (role === "assistant" && Array.isArray(entry.toolCalls)) {
        var toolCalls = buildOpenAIToolCalls(entry.toolCalls);
        for (var j = 0; j < toolCalls.length; j += 1) {
          var call = toolCalls[j];
          items.push({
            type: "function_call",
            call_id: trim(call.id),
            name: trim(call.function && call.function.name),
            arguments: trim(call.function && call.function.arguments) || "{}"
          });
        }
      }
    }
  }
  return items;
}

function requestHasAttachments(request) {
  if (!request || !Array.isArray(request.messages)) {
    return false;
  }
  for (var i = 0; i < request.messages.length; i += 1) {
    if (normalizeMessageAttachments(request.messages[i]).length > 0) {
      return true;
    }
  }
  return false;
}

function mergeOpenAIToolCallDelta(accumulator, raw) {
  if (!Array.isArray(raw)) {
    return;
  }
  for (var i = 0; i < raw.length; i += 1) {
    var item = raw[i];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    var index = Number(item.index);
    if (!Number.isFinite(index)) {
      index = 0;
    }
    index = Math.floor(index);
    if (!accumulator[index]) {
      accumulator[index] = { id: "", name: "", arguments: "" };
    }
    var entry = accumulator[index];
    var fn = item.function && typeof item.function === "object" ? item.function : {};
    var id = trim(item.id);
    var name = trim(fn.name);
    var argumentsText = fn.arguments;
    if (id !== "") {
      entry.id = id;
    }
    if (name !== "") {
      entry.name = name;
    }
    if (argumentsText !== null && argumentsText !== undefined && String(argumentsText) !== "") {
      entry.arguments += String(argumentsText);
    }
  }
}

function finalizeRuntimeToolCalls(accumulator) {
  var toolCalls = [];
  if (!Array.isArray(accumulator)) {
    return toolCalls;
  }
  for (var i = 0; i < accumulator.length; i += 1) {
    var item = accumulator[i];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    var name = trim(item.name);
    if (name === "") {
      continue;
    }
    var argumentsText = trim(item.arguments);
    if (argumentsText === "") {
      argumentsText = "{}";
    }
    toolCalls.push({
      id: trim(item.id),
      name: name,
      arguments: argumentsText
    });
  }
  return toolCalls;
}

function extractRuntimeToolCallsFromChoice(choice) {
  var toolCalls = [];
  if (!choice || typeof choice !== "object" || Array.isArray(choice)) {
    return toolCalls;
  }
  var message = choice.message && typeof choice.message === "object" ? choice.message : null;
  if (!message || !Array.isArray(message.tool_calls)) {
    return toolCalls;
  }
  for (var i = 0; i < message.tool_calls.length; i += 1) {
    var item = message.tool_calls[i];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    var fn = item.function && typeof item.function === "object" ? item.function : {};
    var name = trim(fn.name);
    if (name === "") {
      continue;
    }
    var argumentsText = trim(fn.arguments);
    if (argumentsText === "") {
      argumentsText = "{}";
    }
    toolCalls.push({
      id: trim(item.id),
      name: name,
      arguments: argumentsText
    });
  }
  return toolCalls;
}

function readRawField(source, keys) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return "";
  }
  for (var i = 0; i < keys.length; i += 1) {
    var key = keys[i];
    if (!Object.prototype.hasOwnProperty.call(source, key)) {
      continue;
    }
    var value = source[key];
    if (value === null || value === undefined) {
      continue;
    }
    var text = String(value);
    if (text !== "") {
      return text;
    }
  }
  return "";
}

function readTrimmedField(source, keys) {
  var value = readRawField(source, keys);
  return value === "" ? "" : trim(value);
}

function readDeltaText(delta) {
  return readRawField(delta, ["content"]);
}

function readDeltaReasoning(delta) {
  return readRawField(delta, ["reasoning_content", "reasoningContent", "reasoning"]);
}

function readMessageText(message) {
  return readTrimmedField(message, ["content"]);
}

function readMessageReasoning(message) {
  return readTrimmedField(message, ["reasoning_content", "reasoningContent", "reasoning"]);
}

function emitChunkPart(host, kind, text, metadata) {
  if (!host || !host.stream || typeof host.stream.write !== "function") {
    return;
  }
  if (text === null || text === undefined || String(text) === "") {
    return;
  }
  var part = {
    kind: kind,
    text: String(text)
  };
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata) && Object.keys(metadata).length > 0) {
    part.metadata = cloneValue(metadata);
  }
  var payload = {
    parts: [part]
  };
  // First-party LLM chunk events intentionally use only `value.parts` so the
  // agent runtime can reject legacy text-only stream payloads instead of
  // silently normalizing them.
  host.stream.write({
    type: "chunk",
    value: payload
  });
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

function createLMStudioSSEState() {
  return {
    text: "",
    reasoningText: "",
    responseId: "",
    toolCallAccumulator: [],
    toolCalls: [],
    usage: null,
    error: ""
  };
}

function applyLMStudioSSEPayload(state, payloadText, host) {
  var payload = trim(payloadText);
  if (payload === "" || payload === "[DONE]") {
    return;
  }
  var event;
  try {
    event = JSON.parse(payload);
  } catch (_error) {
    return;
  }
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    return;
  }
  if (event.error) {
    state.error = trim(event.error && event.error.message) || trim(event.error) || "LM Studio request failed";
    return;
  }
  if (event.usage && typeof event.usage === "object") {
    state.usage = normalizeOpenAICompatibleUsage(event.usage);
  }
  if (!Array.isArray(event.choices) || event.choices.length === 0) {
    return;
  }
  var first = event.choices[0];
  var delta = first && first.delta && typeof first.delta === "object" ? first.delta : null;
  if (!delta) {
    return;
  }
  var reasoningChunk = readDeltaReasoning(delta);
  if (reasoningChunk !== "") {
    state.reasoningText += reasoningChunk;
    emitChunkPart(host, "reasoning", reasoningChunk);
  }
  var textChunk = readDeltaText(delta);
  if (textChunk !== null && textChunk !== undefined && String(textChunk) !== "") {
    textChunk = String(textChunk);
    state.text += textChunk;
    emitChunkPart(host, "text", textChunk);
  }
  mergeOpenAIToolCallDelta(state.toolCallAccumulator, delta.tool_calls);
}

function mergeCompletedStreamText(current, completed) {
  var existing = typeof current === "string" ? current : "";
  var next = typeof completed === "string" ? completed : "";
  if (next === "") {
    return { value: existing, delta: "" };
  }
  if (existing === "") {
    return { value: next, delta: next };
  }
  if (next === existing) {
    return { value: existing, delta: "" };
  }
  if (next.indexOf(existing) === 0) {
    return { value: next, delta: next.slice(existing.length) };
  }
  return { value: next, delta: "" };
}

function collectResponsesText(response) {
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    return "";
  }
  var text = "";
  if (Array.isArray(response.output)) {
    for (var i = 0; i < response.output.length; i += 1) {
      var item = response.output[i];
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        continue;
      }
      if (trim(item.type) === "message" && Array.isArray(item.content)) {
        for (var j = 0; j < item.content.length; j += 1) {
          var part = item.content[j];
          if (part && typeof part === "object" && trim(part.type) === "output_text") {
            text += part.text || "";
          }
        }
      } else if (trim(item.type) === "output_text") {
        text += item.text || "";
      }
    }
  }
  return trim(text || response.output_text || response.text || response.content);
}

function collectResponsesReasoningParts(parts) {
  if (!Array.isArray(parts)) {
    return "";
  }
  var text = "";
  for (var i = 0; i < parts.length; i += 1) {
    var part = parts[i];
    if (!part || typeof part !== "object" || Array.isArray(part)) {
      continue;
    }
    var type = trim(part.type);
    if (type === "summary_text" || type === "reasoning_summary_text" || type === "reasoning_text") {
      text += part.text || "";
    }
  }
  return trim(text);
}

function collectResponsesReasoning(response) {
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    return "";
  }
  var text = "";
  if (Array.isArray(response.output)) {
    for (var i = 0; i < response.output.length; i += 1) {
      var item = response.output[i];
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        continue;
      }
      if (trim(item.type) === "reasoning") {
        text += collectResponsesReasoningParts(item.summary);
        if (text === "") {
          text += collectResponsesReasoningParts(item.content);
        }
      }
    }
  }
  return trim(text);
}

function collectResponsesToolCalls(response) {
  var toolCalls = [];
  if (!response || typeof response !== "object" || Array.isArray(response) || !Array.isArray(response.output)) {
    return toolCalls;
  }
  for (var i = 0; i < response.output.length; i += 1) {
    var item = response.output[i];
    if (!item || typeof item !== "object" || Array.isArray(item) || trim(item.type) !== "function_call") {
      continue;
    }
    var name = trim(item.name);
    if (name === "") {
      continue;
    }
    toolCalls.push({
      id: trim(item.call_id || item.callId || item.id),
      name: name,
      arguments: trim(item.arguments) || "{}"
    });
  }
  return toolCalls;
}

function coerceNonNegativeIndex(value) {
  var index = Number(value);
  if (!Number.isFinite(index)) {
    return -1;
  }
  index = Math.floor(index);
  return index < 0 ? -1 : index;
}

function findRuntimeToolCallIndexByRefs(accumulator, refs) {
  if (!Array.isArray(accumulator)) {
    return -1;
  }
  var itemID = trim(refs && refs.itemID);
  var callID = trim(refs && refs.callID);
  if (itemID === "" && callID === "") {
    return -1;
  }
  for (var i = 0; i < accumulator.length; i += 1) {
    var entry = accumulator[i];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }
    if (itemID !== "" && trim(entry.itemID) === itemID) {
      return i;
    }
    if (callID !== "" && trim(entry.id) === callID) {
      return i;
    }
  }
  return -1;
}

function ensureRuntimeToolCallEntry(accumulator, preferredIndex, refs) {
  if (!Array.isArray(accumulator)) {
    return null;
  }
  var index = coerceNonNegativeIndex(preferredIndex);
  if (index < 0) {
    index = findRuntimeToolCallIndexByRefs(accumulator, refs);
  }
  if (index < 0) {
    index = accumulator.length;
  }
  if (!accumulator[index] || typeof accumulator[index] !== "object" || Array.isArray(accumulator[index])) {
    accumulator[index] = { id: "", itemID: "", name: "", arguments: "" };
  }
  return accumulator[index];
}

function mergeResponsesToolCallEvent(accumulator, event) {
  if (!Array.isArray(accumulator) || !event || typeof event !== "object" || Array.isArray(event)) {
    return;
  }
  var type = trim(event.type);
  var isOutputItemEvent = type === "response.output_item.added" || type === "response.output_item.done";
  if (isOutputItemEvent) {
    var item = event.item;
    if (!item || typeof item !== "object" || Array.isArray(item) || trim(item.type) !== "function_call") {
      return;
    }
    var itemRefs = {
      itemID: trim(item.id),
      callID: trim(item.call_id || item.callId || event.call_id || event.callId)
    };
    var itemEntry = ensureRuntimeToolCallEntry(accumulator, event.output_index, itemRefs);
    if (!itemEntry) {
      return;
    }
    if (itemRefs.callID !== "") {
      itemEntry.id = itemRefs.callID;
    }
    if (itemRefs.itemID !== "") {
      itemEntry.itemID = itemRefs.itemID;
    }
    var itemName = trim(item.name || event.name);
    if (itemName !== "") {
      itemEntry.name = itemName;
    }
    if (item.arguments !== null && item.arguments !== undefined) {
      var itemArguments = String(item.arguments);
      if (trim(itemArguments) !== "" && (type === "response.output_item.done" || itemEntry.arguments === "")) {
        itemEntry.arguments = itemArguments;
      }
    }
    return;
  }
  var isFunctionArgumentEvent = type === "response.function_call_arguments.delta" ||
    type === "response.function_call_arguments.done";
  if (!isFunctionArgumentEvent) {
    return;
  }
  var argumentRefs = {
    itemID: trim(event.item_id || event.itemId),
    callID: trim(event.call_id || event.callId)
  };
  var argumentEntry = ensureRuntimeToolCallEntry(accumulator, event.output_index, argumentRefs);
  if (!argumentEntry) {
    return;
  }
  if (argumentRefs.callID !== "") {
    argumentEntry.id = argumentRefs.callID;
  }
  if (argumentRefs.itemID !== "") {
    argumentEntry.itemID = argumentRefs.itemID;
  }
  var argumentName = trim(event.name);
  if (argumentName !== "") {
    argumentEntry.name = argumentName;
  }
  if (type === "response.function_call_arguments.delta") {
    if (event.delta !== null && event.delta !== undefined && String(event.delta) !== "") {
      argumentEntry.arguments += String(event.delta);
    }
    return;
  }
  if (event.arguments !== null && event.arguments !== undefined && trim(String(event.arguments)) !== "") {
    argumentEntry.arguments = String(event.arguments);
  }
}

function readResponsesTextEvent(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    return { text: "", isDelta: false };
  }
  var type = trim(event.type);
  if (type === "response.output_text.delta") {
    return { text: event.delta || "", isDelta: true };
  }
  if (type === "response.output_text.done") {
    return { text: event.text || "", isDelta: false };
  }
  if (type === "response.completed" && event.response && typeof event.response === "object") {
    return { text: collectResponsesText(event.response), isDelta: false };
  }
  return { text: "", isDelta: false };
}

function readResponsesReasoningEvent(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    return { text: "", isDelta: false };
  }
  var type = trim(event.type);
  if (type === "response.reasoning_summary_text.delta" || type === "response.reasoning_text.delta") {
    return { text: event.delta || "", isDelta: true };
  }
  if (type === "response.reasoning_summary_text.done" || type === "response.reasoning_text.done") {
    return { text: event.text || "", isDelta: false };
  }
  if (type === "response.completed" && event.response && typeof event.response === "object") {
    return { text: collectResponsesReasoning(event.response), isDelta: false };
  }
  return { text: "", isDelta: false };
}

function applyLMStudioResponsesSSEPayload(state, payloadText, host) {
  var payload = trim(payloadText);
  if (payload === "" || payload === "[DONE]") {
    return;
  }
  var event;
  try {
    event = JSON.parse(payload);
  } catch (_error) {
    return;
  }
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    return;
  }
  if (event.error) {
    state.error = trim(event.error && event.error.message) || trim(event.error) || "LM Studio request failed";
    return;
  }
  if (event.response && typeof event.response === "object") {
    if (trim(event.response.id) !== "") state.responseId = trim(event.response.id);
    if (event.response.usage && typeof event.response.usage === "object") {
      state.usage = normalizeOpenAICompatibleUsage(event.response.usage);
    }
  }
  if (trim(event.id) !== "") {
    state.responseId = trim(event.id);
  }
  if (event.usage && typeof event.usage === "object") {
    state.usage = normalizeOpenAICompatibleUsage(event.usage);
  }
  mergeResponsesToolCallEvent(state.toolCallAccumulator, event);
  var reasoning = readResponsesReasoningEvent(event);
  if (reasoning.text !== "") {
    if (reasoning.isDelta) {
      state.reasoningText += reasoning.text;
      emitChunkPart(host, "reasoning", reasoning.text);
    } else {
      var mergedReasoning = mergeCompletedStreamText(state.reasoningText, reasoning.text);
      state.reasoningText = mergedReasoning.value;
      if (mergedReasoning.delta !== "") {
        emitChunkPart(host, "reasoning", mergedReasoning.delta);
      }
    }
  }
  var output = readResponsesTextEvent(event);
  if (output.text !== "") {
    if (output.isDelta) {
      state.text += output.text;
      emitChunkPart(host, "text", output.text);
    } else {
      var mergedText = mergeCompletedStreamText(state.text, output.text);
      state.text = mergedText.value;
      if (mergedText.delta !== "") {
        emitChunkPart(host, "text", mergedText.delta);
      }
    }
  }
  if (trim(event.type) === "response.completed" && event.response && typeof event.response === "object") {
    state.toolCalls = collectResponsesToolCalls(event.response);
  }
}

function handleModels(config, host) {
  var base = baseUrl(config);
  if (base === "") {
    return {
      output: {
        items: [],
        reachable: false,
        reason: "LM Studio base URL is required."
      }
    };
  }
  var response = hostFetch(host, {
    url: base + "/api/v1/models",
    method: "GET"
  });
  if (!response || !response.ok) {
    return {
      output: {
        items: [],
        reachable: false,
        reason: normalizeLMStudioTransportErrorMessage(trim(response && response.body), "Failed to reach LM Studio.")
      }
    };
  }
  var parsed;
  try {
    parsed = JSON.parse(response.body || "{}");
  } catch (err) {
    parsed = null;
  }
  var rawModels = parsed && Array.isArray(parsed.models)
    ? parsed.models
    : (parsed && Array.isArray(parsed.data) ? parsed.data : null);
  if (!rawModels) {
    return {
      output: {
        items: [],
        reachable: false,
        reason: "LM Studio returned an invalid model list."
      }
    };
  }
  var items = [];
  for (var i = 0; i < rawModels.length; i += 1) {
    var entry = rawModels[i] && typeof rawModels[i] === "object" ? rawModels[i] : {};
    var id = trim(entry.key) || trim(entry.id);
    if (id !== "") {
      var item = { id: id };
      var maxContextTokens = modelContextLength(entry);
      if (maxContextTokens > 0) {
        item.maxContextTokens = maxContextTokens;
      }
      items.push(item);
    }
  }
  return {
    output: {
      items: items,
      reachable: true
    }
  };
}

function consumeSSEBody(rawBody, host) {
  var state = createLMStudioSSEState();
  var parser = createSSEParser(function(_eventName, payloadText) {
    applyLMStudioSSEPayload(state, payloadText, host);
  });
  parser.write(String(rawBody || ""));
  parser.finish();
  if (state.error !== "") {
    return {
      text: "",
      reasoningText: "",
      toolCalls: [],
      usage: null,
      error: state.error
    };
  }
  return {
    text: state.text,
    reasoningText: state.reasoningText,
    toolCalls: finalizeRuntimeToolCalls(state.toolCallAccumulator),
    usage: state.usage,
    error: ""
  };
}

function buildLMStudioResponseParts(text, reasoningText, responseId, config, model) {
  var parts = [];
  var metadata = lmstudioResponseMetadata(responseId, config, model);
  if (!metadata) {
    return parts;
  }
  if (trim(reasoningText) !== "") {
    parts.push({
      kind: "reasoning",
      text: trim(reasoningText),
      metadata: cloneValue(metadata)
    });
  }
  if (trim(text) !== "") {
    parts.push({
      kind: "text",
      text: trim(text),
      metadata: cloneValue(metadata)
    });
  }
  return parts;
}

function withLMStudioToolCallMetadata(toolCalls, responseId, config, model) {
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
    return [];
  }
  var metadata = lmstudioResponseMetadata(responseId, config, model);
  if (!metadata) {
    return toolCalls.map(function(toolCall) {
      return cloneValue(toolCall);
    });
  }
  return toolCalls.map(function(toolCall) {
    var next = cloneValue(toolCall);
    var existing = plainObject(next.metadata);
    next.metadata = Object.assign({}, existing, cloneValue(metadata));
    return next;
  });
}

function handleRespond(config, request, host) {
  var base = baseUrl(config);
  if (base === "") {
    return { error: "provider llmBaseUrl is required" };
  }

  var model = trim(request && request.model);
  if (model === "") {
    model = trim(config && config.llmModel);
  }
  if (model === "") {
    return { error: "provider model is required" };
  }

  var tools = buildOpenAITools(request || {});
  var responseTools = buildResponsesTools(request || {});
  var reasoning = maybeReasoningPayload(request || {}, config || {});
  var hasAttachments = requestHasAttachments(request || {});
  var responseAnchor = previousLMStudioResponseAnchor(request || {}, config || {}, model);
  if (!hasAttachments) {
    var responsesPayload = {
      model: model,
      input: collectResponsesInput(request || {}, host, responseAnchor.index + 1),
      stream: true
    };
    var system = collectSystemPrompt(request || {});
    if (system !== "") {
      responsesPayload.instructions = system;
    }
    if (reasoning !== "") {
      responsesPayload.reasoning = { effort: reasoning };
    }
    if (responseTools.length > 0) {
      responsesPayload.tools = responseTools;
      responsesPayload.tool_choice = "auto";
    }
    var previousResponseId = responseAnchor.responseId;
    if (previousResponseId !== "") {
      responsesPayload.previous_response_id = previousResponseId;
    }

    var responsesRawBody = "";
    var responsesState = createLMStudioSSEState();
    var responsesParser = createSSEParser(function(_eventName, payloadText) {
      applyLMStudioResponsesSSEPayload(responsesState, payloadText, host);
    });
    var responsesResponse = hostFetch(host, {
      url: base + "/v1/responses",
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(responsesPayload)
    }, function(event) {
      var chunkText = readFetchChunkText(event);
      if (chunkText === "") {
        return;
      }
      responsesRawBody += chunkText;
      responsesParser.write(chunkText);
    });
    responsesParser.finish();
    if (!responsesResponse || !responsesResponse.ok) {
      return {
        error: normalizeLMStudioTransportErrorMessage(
          trim(responsesRawBody) || trim(responsesResponse && responsesResponse.body),
          "LM Studio request failed"
        )
      };
    }
    if (responsesState.error !== "") {
      return { error: responsesState.error };
    }
    var responsesText = responsesState.text;
    var responsesReasoningText = responsesState.reasoningText;
    var responsesToolCalls = responsesState.toolCalls.length > 0
      ? responsesState.toolCalls
      : finalizeRuntimeToolCalls(responsesState.toolCallAccumulator);
    var responsesUsage = normalizeOpenAICompatibleUsage(responsesState.usage);
    var responsesResponseId = responsesState.responseId;
    if (responsesText === "" && responsesReasoningText === "" && responsesToolCalls.length === 0 && responsesRawBody.indexOf("data:") === -1) {
      var responsesParsed;
      try {
        responsesParsed = JSON.parse(responsesRawBody || "{}");
      } catch (responsesErr) {
        return { error: "LM Studio returned invalid JSON" };
      }
      if (!responsesParsed || typeof responsesParsed !== "object" || Array.isArray(responsesParsed)) {
        return { error: "LM Studio returned invalid JSON" };
      }
      responsesResponseId = trim(responsesParsed.id);
      responsesText = collectResponsesText(responsesParsed);
      responsesReasoningText = collectResponsesReasoning(responsesParsed);
      responsesToolCalls = collectResponsesToolCalls(responsesParsed);
      responsesUsage = normalizeOpenAICompatibleUsage(responsesParsed.usage);
    }
    responsesToolCalls = withLMStudioToolCallMetadata(responsesToolCalls, responsesResponseId, config || {}, model);
    if (responsesText === "" && responsesReasoningText === "" && responsesToolCalls.length === 0) {
      return { error: "LM Studio response did not include text, reasoning, or tool calls" };
    }
    var responsesOutput = {};
    if (responsesText !== "") {
      responsesOutput.text = responsesText;
    }
    if (responsesReasoningText !== "") {
      responsesOutput.reasoningText = responsesReasoningText;
    }
    if (responsesToolCalls.length > 0) {
      responsesOutput.toolCalls = responsesToolCalls;
    }
    var responseParts = buildLMStudioResponseParts(responsesText, responsesReasoningText, responsesResponseId, config || {}, model);
    if (responseParts.length > 0) {
      responsesOutput.parts = responseParts;
    }
    if (responsesUsage) {
      responsesOutput.usage = responsesUsage;
    }
    return { output: responsesOutput };
  }

  var messages = collectOpenAIMessages(request || {}, host);
  var payload = {
    model: model,
    messages: messages,
    stream: true,
    stream_options: { include_usage: true }
  };
  if (reasoning !== "") {
    payload.reasoning_effort = reasoning;
  }
  if (tools.length > 0) {
    payload.tools = tools;
    payload.tool_choice = "auto";
  }

  var rawBody = "";
  var sseState = createLMStudioSSEState();
  var parser = createSSEParser(function(_eventName, payloadText) {
    applyLMStudioSSEPayload(sseState, payloadText, host);
  });
  // Parse provider SSE frames directly from fetch chunk callbacks so visible
  // chat chunks are emitted while the model is still generating.
  var response = hostFetch(host, {
    url: base + "/v1/chat/completions",
    method: "POST",
    // Timeout is owned by execution/control runtime budget, not provider config.
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  }, function(event) {
    var chunkText = readFetchChunkText(event);
    if (chunkText === "") {
      return;
    }
    rawBody += chunkText;
    parser.write(chunkText);
  });
  parser.finish();
  if (!response || !response.ok) {
    return {
      error: normalizeLMStudioTransportErrorMessage(
        trim(rawBody) || trim(response && response.body),
        "LM Studio request failed"
      )
    };
  }

  if (sseState.error !== "") {
    return { error: sseState.error };
  }
  var text = sseState.text;
  var reasoningText = sseState.reasoningText;
  var toolCalls = finalizeRuntimeToolCalls(sseState.toolCallAccumulator);
  var usage = normalizeOpenAICompatibleUsage(sseState.usage);

  if (text === "" && toolCalls.length === 0 && rawBody.indexOf("data:") === -1) {
    var parsed;
    try {
      parsed = JSON.parse(rawBody || "{}");
    } catch (err) {
      return { error: "LM Studio returned invalid JSON" };
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { error: "LM Studio returned invalid JSON" };
    }
    if (Array.isArray(parsed.choices) && parsed.choices.length > 0) {
      var first = parsed.choices[0];
      var message = first && first.message && typeof first.message === "object" ? first.message : null;
      if (message) {
        text = readMessageText(message);
        reasoningText = readMessageReasoning(message);
      }
      toolCalls = extractRuntimeToolCallsFromChoice(first);
    }
    usage = normalizeOpenAICompatibleUsage(parsed.usage);
  }

  if (text === "" && reasoningText === "" && toolCalls.length === 0) {
    return { error: "LM Studio response did not include text, reasoning, or tool calls" };
  }
  var output = {};
  if (text !== "") {
    output.text = text;
  }
  if (reasoningText !== "") {
    output.reasoningText = reasoningText;
  }
  if (toolCalls.length > 0) {
    output.toolCalls = toolCalls;
  }
  if (usage) {
    output.usage = usage;
  }
  return { output: output };
}

module.exports = {
  "list-models": function (input, host) {
    var provider = input && input.provider && typeof input.provider === "object" ? input.provider : {};
    var config = provider && provider.config && typeof provider.config === "object" ? provider.config : {};
    return handleModels(config, host);
  },
  "respond-text": function (input, host) {
    var provider = input && input.provider && typeof input.provider === "object" ? input.provider : {};
    var config = provider && provider.config && typeof provider.config === "object" ? provider.config : {};
    var request = input && input.request && typeof input.request === "object" ? input.request : {};
    return handleRespond(config, request, host);
  }
};
