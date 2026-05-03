var OPENAI_MODEL_METADATA = {
  "gpt-5": { maxContextTokens: 400000 },
  "gpt-5.1": { maxContextTokens: 400000 },
  "gpt-5.1-codex-max": { maxContextTokens: 400000 },
  "gpt-5.1-codex-mini": { maxContextTokens: 400000 },
  "gpt-5.2": { maxContextTokens: 400000 },
  "gpt-5.2-codex": { maxContextTokens: 400000 },
  "gpt-5.3-codex": { maxContextTokens: 400000 },
  "gpt-5.3-codex-spark": { maxContextTokens: 400000 },
  "gpt-5.4": { maxContextTokens: 400000 },
  "gpt-5.5": { maxContextTokens: 400000 }
};

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

function finiteNumber(value) {
  var number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function openAIModelMetadata(modelId) {
  var normalized = trim(modelId);
  if (normalized === "") {
    return null;
  }
  if (OPENAI_MODEL_METADATA[normalized]) {
    return copyObject(OPENAI_MODEL_METADATA[normalized]);
  }
  if (/^gpt-5(?:[.-]|$)/.test(normalized)) {
    return { maxContextTokens: 400000 };
  }
  return null;
}

function openAIModelItem(modelId) {
  var normalized = trim(modelId);
  if (normalized === "") {
    return null;
  }
  var item = { id: normalized };
  var metadata = openAIModelMetadata(normalized);
  if (metadata && finiteNumber(metadata.maxContextTokens) > 0) {
    item.maxContextTokens = finiteNumber(metadata.maxContextTokens);
  }
  return item;
}

function normalizeOpenAIUsage(value) {
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
  var completionDetails = plainObject(usage.completion_tokens_details || usage.completionTokensDetails);
  var inputDetails = plainObject(usage.input_tokens_details || usage.inputTokensDetails || usage.prompt_tokens_details || usage.promptTokensDetails);
  var reasoningTokens = finiteNumber(
    completionDetails.reasoning_tokens ?? completionDetails.reasoningTokens
  );
  var cacheReadTokens = finiteNumber(
    usage.cache_read_input_tokens ?? usage.cacheReadInputTokens ?? inputDetails.cached_tokens ?? inputDetails.cachedTokens
  );
  var cacheWriteTokens = finiteNumber(
    usage.cache_creation_input_tokens ?? usage.cacheCreationInputTokens ?? inputDetails.cache_creation_tokens ?? inputDetails.cacheCreationTokens
  );
  if (inputTokens > 0) result.inputTokens = inputTokens;
  if (outputTokens > 0) result.outputTokens = outputTokens;
  if (reasoningTokens > 0) result.reasoningTokens = reasoningTokens;
  if (cacheReadTokens > 0) result.cacheReadTokens = cacheReadTokens;
  if (cacheWriteTokens > 0) result.cacheWriteTokens = cacheWriteTokens;
  if (totalTokens > 0) {
    result.totalTokens = totalTokens;
  } else if (inputTokens > 0 || outputTokens > 0) {
    result.totalTokens = inputTokens + outputTokens;
  }
  return Object.keys(result).length > 0 ? result : null;
}

function providerConfig(input) {
  var provider = input && input.provider && typeof input.provider === "object" ? input.provider : {};
  return plainObject(provider.config);
}

function extensionUserSecrets(input) {
  var extension = input && input.extension && typeof input.extension === "object" ? input.extension : {};
  return plainObject(extension.userSecrets);
}

function effectiveCredentialConfig(input) {
  var config = copyObject(providerConfig(input));
  var secrets = extensionUserSecrets(input);
  if (trim(secrets.apiKey) !== "") {
    config.apiKey = trim(secrets.apiKey);
  }
  return config;
}

function apiBaseUrl(config) {
  var base = trim(config && config.apiBaseUrl);
  if (base !== "") {
    return base.replace(/\/+$/, "");
  }
  return "https://api.openai.com";
}

function chatCompletionsEndpoint(config) {
  return apiBaseUrl(config) + "/v1/chat/completions";
}

function responsesEndpoint(config) {
  return apiBaseUrl(config) + "/v1/responses";
}

function modelsEndpoint(config) {
  return apiBaseUrl(config) + "/v1/models";
}

function formEncode(pairs) {
  var keys = Object.keys(pairs || {}).sort();
  var parts = [];
  for (var i = 0; i < keys.length; i += 1) {
    var key = keys[i];
    var value = pairs[key];
    parts.push(encodeURIComponent(key) + "=" + encodeURIComponent(value === undefined || value === null ? "" : String(value)));
  }
  return parts.join("&");
}

function decodeJsonText(text, fallback) {
  try {
    return JSON.parse(text);
  } catch (_error) {
    return fallback;
  }
}

function looksLikeBrowserVerificationPage(text) {
  var sample = trim(text).toLowerCase();
  if (sample === "") {
    return false;
  }
  return sample.indexOf("cf_chl_opt") >= 0 ||
    sample.indexOf("enable javascript and cookies to continue") >= 0 ||
    sample.indexOf("<title>just a moment") >= 0 ||
    sample.indexOf("challenge-platform") >= 0 ||
    sample.indexOf("cloudflare") >= 0;
}

function chooseSystemPrompt(request) {
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
  if (prompts.length > 0) {
    return prompts.join("\n\n");
  }
  return "You are a concise software engineering assistant. Explain code changes clearly and practically.";
}

function looksLikeSchemaObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  var keys = ["type", "properties", "items", "enum", "anyOf", "oneOf", "allOf", "additionalProperties", "required", "description", "default", "format", "minimum", "maximum", "minItems", "maxItems", "minLength", "maxLength"];
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

function normalizeSchemaCombiners(list) {
  if (!Array.isArray(list)) {
    return [];
  }
  var normalized = [];
  for (var i = 0; i < list.length; i += 1) {
    normalized.push(normalizeSchemaFragment(list[i]));
  }
  return normalized;
}

function ensureArraySchemaItems(schema) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return schema;
  }
  if (!schemaTypeIncludes(schema.type, "array")) {
    return schema;
  }
  if (schema.items && typeof schema.items === "object" && !Array.isArray(schema.items)) {
    schema.items = normalizeSchemaFragment(schema.items);
    return schema;
  }
  // OpenAI rejects array tool-parameter schemas without an explicit `items`
  // object, so preserve unconstrained arrays as `items: {}` instead of
  // sending invalid schemas that hard-fail the provider call.
  schema.items = {};
  return schema;
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
  // OpenAI requires the top-level function-parameters schema to stay a plain
  // object with no top-level combiners, so rewrite variant unions into one
  // object schema and carry the mode-specific guidance into descriptions.
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
    if (Array.isArray(copy.anyOf)) {
      copy.anyOf = normalizeSchemaCombiners(copy.anyOf);
    }
    if (Array.isArray(copy.oneOf)) {
      copy.oneOf = normalizeSchemaCombiners(copy.oneOf);
    }
    if (Array.isArray(copy.allOf)) {
      copy.allOf = normalizeSchemaCombiners(copy.allOf);
    }
    copy = ensureArraySchemaItems(copy);
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

function buildChatTools(request) {
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
      name: name,
      description: trim(tool.description),
      parameters: normalizeToolParametersSchema(tool.parameters)
    });
  }
  return tools;
}

function buildChatToolCalls(raw) {
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
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".txt") return "text/plain";
  if (ext === ".md") return "text/markdown";
  if (ext === ".json") return "application/json";
  return "application/octet-stream";
}

function attachmentDataUri(mimeType, base64) {
  var resolvedMimeType = trim(mimeType) || "application/octet-stream";
  return "data:" + resolvedMimeType + ";base64," + trim(base64);
}

function readAttachmentBinary(attachment) {
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
    mimeType: trim(payload.mimeType) || inferAttachmentMimeType(attachment),
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

function requestHasAttachments(request) {
  if (!request || !Array.isArray(request.messages)) {
    return false;
  }
  for (var i = 0; i < request.messages.length; i += 1) {
    var attachments = normalizeMessageAttachments(request.messages[i]);
    if (attachments.length > 0) {
      return true;
    }
  }
  return false;
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

function openAIReasoningMetadata(part, config, model) {
  var metadata = plainObject(part && part.metadata);
  if (!providerSourceAllowsReplay(metadata, config || {}, model)) {
    return {};
  }
  return plainObject(metadata.openai);
}

function normalizeOpenAIResponsesReasoningItem(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  var item = cloneValue(value);
  if (trim(item.type) === "") {
    item.type = "reasoning";
  }
  if (trim(item.type) !== "reasoning") {
    return null;
  }
  return item;
}

function appendOpenAIResponsesReasoningItems(items, value) {
  if (Array.isArray(value)) {
    for (var i = 0; i < value.length; i += 1) {
      appendOpenAIResponsesReasoningItems(items, value[i]);
    }
    return;
  }
  var item = normalizeOpenAIResponsesReasoningItem(value);
  if (item) {
    items.push(item);
  }
}

function openAIResponsesReasoningItemsFromPart(part, config, model) {
  var items = [];
  var metadata = openAIReasoningMetadata(part, config, model);
  appendOpenAIResponsesReasoningItems(items, metadata.responses);
  appendOpenAIResponsesReasoningItems(items, metadata.responsesItems);
  appendOpenAIResponsesReasoningItems(items, metadata.responseItem);
  appendOpenAIResponsesReasoningItems(items, metadata.reasoningItems);
  appendOpenAIResponsesReasoningItems(items, metadata.reasoningItem);
  return items;
}

function collectOpenAIResponsesReasoningReplay(entry, config, model) {
  var items = [];
  if (!entry || typeof entry !== "object" || Array.isArray(entry) || !Array.isArray(entry.parts)) {
    return items;
  }
  for (var i = 0; i < entry.parts.length; i += 1) {
    var part = entry.parts[i];
    if (!part || typeof part !== "object" || Array.isArray(part)) {
      continue;
    }
    if (trim(part.kind).toLowerCase() !== "reasoning") {
      continue;
    }
    appendOpenAIResponsesReasoningItems(items, openAIResponsesReasoningItemsFromPart(part, config, model));
  }
  return items;
}

function requestHasOpenAIResponsesReasoningReplay(request, config, model) {
  if (!request || !Array.isArray(request.messages)) {
    return false;
  }
  for (var i = 0; i < request.messages.length; i += 1) {
    if (collectOpenAIResponsesReasoningReplay(request.messages[i], config, model).length > 0) {
      return true;
    }
  }
  return false;
}

function modelPrefersResponsesApi(model) {
  var normalized = trim(model).toLowerCase();
  return /^gpt-5(?:[.-]|$)/.test(normalized);
}

function requestUsesResponsesApi(request, model, config) {
  if (requestHasAttachments(request || {})) {
    return true;
  }
  if (requestHasOpenAIResponsesReasoningReplay(request || {}, config || {}, model)) {
    return true;
  }
  if (maybeReasoningPayload(request || {}, config || {}) !== "") {
    return true;
  }
  return modelPrefersResponsesApi(model);
}

function responsesContentTextType(role) {
  return trim(role).toLowerCase() === "assistant" ? "output_text" : "input_text";
}

function buildResponsesContent(entry) {
  var blocks = [];
  var textType = responsesContentTextType(entry && entry.role);
  var attachments = normalizeMessageAttachments(entry);
  var text = normalizeMessageText(entry);
  if (text !== "") {
    // OpenAI Responses accepts replayed assistant text as output_text, not
    // input_text. User/tool-originated content still uses input_text.
    blocks.push({ type: textType, text: text });
  }
  var fallbackAttachments = [];
  for (var i = 0; i < attachments.length; i += 1) {
    var attachment = attachments[i];
    var resolved = null;
    try {
      resolved = readAttachmentBinary(attachment);
    } catch (_error) {
      resolved = null;
    }
    if (!resolved) {
      fallbackAttachments.push(attachment);
      continue;
    }
    var mimeType = inferAttachmentMimeType(resolved);
    if (/^image\//.test(mimeType)) {
      blocks.push({
        type: "input_image",
        image_url: attachmentDataUri(mimeType, resolved.content)
      });
      continue;
    }
    blocks.push({
      type: "input_file",
      filename: resolved.name || "attachment",
      file_data: attachmentDataUri(mimeType, resolved.content)
    });
  }
  var fallbackLines = buildAttachmentContextLines(fallbackAttachments);
  if (fallbackLines.length > 0) {
    blocks.push({
      type: textType,
      text: "Attachments:\n" + fallbackLines.join("\n")
    });
  }
  return blocks;
}

function collectChatMessages(request) {
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
        var toolCalls = buildChatToolCalls(entry.toolCalls);
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
      var messageContent = appendAttachmentContext(normalizeMessageText(entry), normalizeMessageAttachments(entry));
      if (messageContent === "") {
        continue;
      }
      messages.push({
        role: role === "system" ? "developer" : role,
        content: messageContent
      });
    }
  }
  return messages;
}

function collectResponsesInput(request, includeAssistantContent, config, model) {
  var items = [];
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
        items.push({
          type: "function_call_output",
          call_id: toolCallId,
          output: normalizeMessageText(entry)
        });
        continue;
      }
      if (role === "system") {
        continue;
      }
      if (role === "assistant") {
        var reasoningItems = collectOpenAIResponsesReasoningReplay(entry, config, model);
        for (var reasoningIndex = 0; reasoningIndex < reasoningItems.length; reasoningIndex += 1) {
          items.push(reasoningItems[reasoningIndex]);
        }
      }
      var contentBlocks = buildResponsesContent(entry);
      if (contentBlocks.length > 0 && (role !== "assistant" || includeAssistantContent)) {
        items.push({
          type: "message",
          role: role,
          content: contentBlocks
        });
      }
      if (role === "assistant" && Array.isArray(entry.toolCalls)) {
        var toolCalls = buildChatToolCalls(entry.toolCalls);
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

function sanitizeResponsesInputForOpenAI(items) {
  if (!Array.isArray(items)) {
    return [];
  }
  var sanitized = [];
  for (var i = 0; i < items.length; i += 1) {
    var item = cloneValue(items[i]);
    if (item && typeof item === "object" && !Array.isArray(item)) {
      delete item.id;
    }
    sanitized.push(item);
  }
  return sanitized;
}

function maybeReasoningPayload(request, config) {
  var effort = selectedReasoningPreference(request, config);
  if (effort === "low" || effort === "medium" || effort === "high" || effort === "xhigh") {
    return effort;
  }
  return "";
}

function selectedReasoningPreference(request, config) {
  var effort = trim(request && request.reasoning).toLowerCase();
  if (effort === "none") {
    return "none";
  }
  if (effort === "low" || effort === "medium" || effort === "high" || effort === "xhigh") {
    return effort;
  }
  effort = trim(request && request.reasoningEffort).toLowerCase();
  if (effort === "none") {
    return "none";
  }
  if (effort === "low" || effort === "medium" || effort === "high" || effort === "xhigh") {
    return effort;
  }
  effort = trim(config && config.reasoningEffort).toLowerCase();
  if (effort === "none") {
    return "none";
  }
  if (effort === "low" || effort === "medium" || effort === "high" || effort === "xhigh") {
    return effort;
  }
  effort = trim(config && config.reasoning).toLowerCase();
  if (effort === "none") {
    return "none";
  }
  if (effort === "low" || effort === "medium" || effort === "high" || effort === "xhigh") {
    return effort;
  }
  return "";
}

function defaultResponsesReasoningEffort(model) {
  if (modelPrefersResponsesApi(model)) {
    return "low";
  }
  return "";
}

function buildResponsesReasoningPayload(request, model, config) {
  var selected = selectedReasoningPreference(request || {}, config || {});
  if (selected === "none") {
    return null;
  }
  var effort = selected;
  if (effort === "") {
    effort = defaultResponsesReasoningEffort(model);
  }
  if (effort !== "") {
    return { effort: effort, summary: "detailed" };
  }
  if (modelPrefersResponsesApi(model)) {
    return { summary: "detailed" };
  }
  return null;
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

function readOpenAIChatDeltaReasoning(delta) {
  return readRawField(delta, ["reasoning_content", "reasoningContent", "reasoning"]);
}

function emitChunkPart(kind, text) {
  if (!host || !host.stream || typeof host.stream.write !== "function") {
    return;
  }
  if (text === null || text === undefined || String(text) === "") {
    return;
  }
  var payload = {
    parts: [{
      kind: kind,
      text: String(text)
    }]
  };
  // First-party LLM chunk events intentionally use only `value.parts` so the
  // agent runtime can reject legacy text-only stream payloads instead of
  // silently normalizing them.
  host.stream.write({
    type: "chunk",
    value: payload
  });
}

function listOpenAIModelsApiKey(config) {
  var apiKey = trim(config && config.apiKey);
  if (apiKey === "") {
    return runtimeError("OpenAI apiKey is required");
  }
  var response = hostFetch({
    url: modelsEndpoint(config),
    method: "GET",
    headers: {
      authorization: "Bearer " + apiKey
    }
  });
  if (!response.ok) {
    return runtimeError(trim(response.body) || "Failed to list OpenAI models");
  }
  var parsed = decodeJsonText(response.body, {});
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !Array.isArray(parsed.data)) {
    return runtimeError("OpenAI returned an invalid model list");
  }
  var items = [];
  for (var i = 0; i < parsed.data.length; i += 1) {
    var id = trim(parsed.data[i] && parsed.data[i].id);
    if (id !== "") {
      var item = openAIModelItem(id);
      if (item) {
        items.push(item);
      }
    }
  }
  return {
    items: items,
    reachable: true
  };
}

function extractErrorMessage(body, fallback) {
  var text = trim(body);
  if (text === "") {
    return fallback;
  }
  var parsed = decodeJsonText(text, null);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    if (typeof parsed.error === "string" && trim(parsed.error) !== "") {
      return trim(parsed.error);
    }
    if (parsed.error && typeof parsed.error === "object" && trim(parsed.error.message) !== "") {
      return trim(parsed.error.message);
    }
  }
  return normalizeOpenAITransportErrorMessage(text, fallback);
}

function normalizeOpenAITransportErrorMessage(message, fallback) {
  var text = trim(message);
  if (text === "") {
    return trim(fallback) || "OpenAI request failed";
  }
  var normalized = text.toLowerCase();
  if (
    normalized.indexOf("stream error:") >= 0 ||
    normalized.indexOf("internal_error") >= 0 ||
    normalized.indexOf("received from peer") >= 0 ||
    normalized.indexOf("http2") >= 0 ||
    normalized.indexOf("eof") >= 0
  ) {
    return "OpenAI stream failed. The provider may be unavailable right now. Upstream error: " + text;
  }
  return text;
}

function collectCodexResponseText(response) {
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
  if (trim(text) !== "") {
    return trim(text);
  }
  var keys = ["output_text", "text", "content"];
  for (var k = 0; k < keys.length; k += 1) {
    if (typeof response[keys[k]] === "string" && trim(response[keys[k]]) !== "") {
      return trim(response[keys[k]]);
    }
  }
  return "";
}

function collectOpenAIReasoningParts(parts) {
  if (!Array.isArray(parts)) {
    return "";
  }
  var text = "";
  for (var i = 0; i < parts.length; i += 1) {
    var part = parts[i];
    if (!part || typeof part !== "object" || Array.isArray(part)) {
      continue;
    }
    var partType = trim(part.type);
    if (partType !== "summary_text" &&
      partType !== "reasoning_summary_text" &&
      partType !== "reasoning_text") {
      continue;
    }
    text += part.text || "";
  }
  return trim(text);
}

function collectOpenAIReasoningValue(value) {
  if (Array.isArray(value)) {
    return collectOpenAIReasoningParts(value);
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return collectOpenAIReasoningParts([value]);
  }
  return "";
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

function readResponsesOutputTextEvent(event) {
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
  if ((type === "response.content_part.added" || type === "response.content_part.done") &&
    event.part && typeof event.part === "object" && !Array.isArray(event.part)) {
    return { text: collectCodexResponseText({ output: [{ type: "message", content: [event.part] }] }), isDelta: false };
  }
  if ((type === "response.output_item.added" || type === "response.output_item.done") &&
    event.item && typeof event.item === "object" && !Array.isArray(event.item)) {
    return { text: collectCodexResponseText({ output: [event.item] }), isDelta: false };
  }
  if (type === "response.completed" && event.response && typeof event.response === "object") {
    return { text: collectCodexResponseText(event.response), isDelta: false };
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
  if ((type === "response.reasoning_summary_part.added" || type === "response.reasoning_summary_part.done" ||
    type === "response.content_part.added" || type === "response.content_part.done") &&
    event.part && typeof event.part === "object" && !Array.isArray(event.part)) {
    return { text: collectOpenAIReasoningParts([event.part]), isDelta: false };
  }
  if ((type === "response.output_item.added" || type === "response.output_item.done") &&
    event.item && typeof event.item === "object" && !Array.isArray(event.item)) {
    return { text: collectCodexResponseReasoning({ output: [event.item] }), isDelta: false };
  }
  if (type === "response.completed" && event.response && typeof event.response === "object") {
    return { text: collectCodexResponseReasoning(event.response), isDelta: false };
  }
  return { text: "", isDelta: false };
}

function collectCodexResponseReasoning(response) {
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    return "";
  }
  var reasoningText = "";
  if (Array.isArray(response.output)) {
    for (var i = 0; i < response.output.length; i += 1) {
      var item = response.output[i];
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        continue;
      }
      var type = trim(item.type);
      if (type === "reasoning") {
        reasoningText += collectOpenAIReasoningParts(item.summary);
        if (reasoningText === "") {
          reasoningText += collectOpenAIReasoningParts(item.content);
        }
        continue;
      }
      if (type === "message" && Array.isArray(item.content)) {
        reasoningText += collectOpenAIReasoningParts(item.content);
      }
    }
  }
  if (trim(reasoningText) !== "") {
    return trim(reasoningText);
  }
  var topLevel = plainObject(response.reasoning);
  var topLevelSummary = collectOpenAIReasoningValue(topLevel.summary);
  if (topLevelSummary !== "") {
    return topLevelSummary;
  }
  var topLevelContent = collectOpenAIReasoningValue(topLevel.content);
  if (topLevelContent !== "") {
    return topLevelContent;
  }
  if ((trim(topLevel.type) === "summary_text" || trim(topLevel.type) === "reasoning_text") &&
    typeof topLevel.text === "string") {
    return trim(topLevel.text);
  }
  return "";
}

function collectCodexResponseReasoningItems(response) {
  var items = [];
  if (!response || typeof response !== "object" || Array.isArray(response) || !Array.isArray(response.output)) {
    return items;
  }
  for (var i = 0; i < response.output.length; i += 1) {
    var item = response.output[i];
    if (!item || typeof item !== "object" || Array.isArray(item) || trim(item.type) !== "reasoning") {
      continue;
    }
    items.push(cloneValue(item));
  }
  return items;
}

function buildOpenAIReasoningParts(reasoningItems, reasoningText) {
  var parts = [];
  if (Array.isArray(reasoningItems)) {
    for (var i = 0; i < reasoningItems.length; i += 1) {
      var item = normalizeOpenAIResponsesReasoningItem(reasoningItems[i]);
      if (!item) {
        continue;
      }
      parts.push({
        kind: "reasoning",
        text: collectCodexResponseReasoning({ output: [item] }),
        metadata: {
          provider: "openai",
          openai: {
            responses: [item]
          }
        }
      });
    }
  }
  if (parts.length === 0 && trim(reasoningText) !== "") {
    parts.push({ kind: "reasoning", text: trim(reasoningText) });
  }
  return parts;
}

function collectCodexResponseToolCalls(response) {
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
      id: trim(item.call_id || item.id),
      name: name,
      arguments: trim(item.arguments) || "{}"
    });
  }
  return toolCalls;
}

function extractCodexOutput(body) {
  var trimmed = trim(body);
  if (/^data:/m.test(trimmed)) {
    var text = "";
    var reasoningText = "";
    var reasoningItems = [];
    var toolCalls = [];
    var usage = null;
    var lines = String(body || "").split(/\r?\n/);
    for (var i = 0; i < lines.length; i += 1) {
      var line = trim(lines[i]);
      if (line.indexOf("data:") !== 0) {
        continue;
      }
      var payload = trim(line.slice(5));
      if (payload === "" || payload === "[DONE]") {
        continue;
      }
      var event = decodeJsonText(payload, null);
      if (!event || typeof event !== "object" || Array.isArray(event)) {
        continue;
      }
      if (event.error) {
        return runtimeError(extractErrorMessage(payload, "OpenAI request failed"));
      }
      var nextText = readResponsesOutputTextEvent(event);
      if (nextText.text !== "") {
        if (nextText.isDelta) {
          text += nextText.text;
        } else {
          text = mergeCompletedStreamText(text, nextText.text).value;
        }
      }
      var nextReasoning = readResponsesReasoningEvent(event);
      if (nextReasoning.text !== "") {
        if (nextReasoning.isDelta) {
          reasoningText += nextReasoning.text;
        } else {
          reasoningText = mergeCompletedStreamText(reasoningText, nextReasoning.text).value;
        }
      }
      if (trim(event.type) === "response.completed" && event.response && typeof event.response === "object") {
        toolCalls = collectCodexResponseToolCalls(event.response);
        reasoningItems = collectCodexResponseReasoningItems(event.response);
        usage = normalizeOpenAIUsage(event.response.usage || event.response);
      }
    }
    return { text: trim(text), reasoningText: trim(reasoningText), reasoningItems: reasoningItems, toolCalls: toolCalls, usage: usage };
  }
  var parsed = decodeJsonText(body, null);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return runtimeError("OpenAI returned invalid JSON");
  }
  if (parsed.error) {
    return runtimeError(extractErrorMessage(body, "OpenAI request failed"));
  }
  var response = parsed.response && typeof parsed.response === "object" ? parsed.response : parsed;
  return {
    text: collectCodexResponseText(response),
    reasoningText: collectCodexResponseReasoning(response),
    reasoningItems: collectCodexResponseReasoningItems(response),
    toolCalls: collectCodexResponseToolCalls(response),
    usage: normalizeOpenAIUsage(response.usage || parsed.usage || response)
  };
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
    if (trim(item.id) !== "") {
      entry.id = trim(item.id);
    }
    if (trim(fn.name) !== "") {
      entry.name = trim(fn.name);
    }
    if (fn.arguments !== null && fn.arguments !== undefined && String(fn.arguments) !== "") {
      entry.arguments += String(fn.arguments);
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
    toolCalls.push({
      id: trim(item.id),
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
  if (index < 0) {
    return -1;
  }
  return index;
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
      if (trim(itemArguments) !== "") {
        if (type === "response.output_item.done" || itemEntry.arguments === "") {
          itemEntry.arguments = itemArguments;
        }
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

function extractRuntimeToolCallsFromChoice(choice) {
  var toolCalls = [];
  if (!choice || typeof choice !== "object" || Array.isArray(choice) || !choice.message || typeof choice.message !== "object") {
    return toolCalls;
  }
  var raw = choice.message.tool_calls;
  if (!Array.isArray(raw)) {
    return toolCalls;
  }
  for (var i = 0; i < raw.length; i += 1) {
    var item = raw[i];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    var fn = item.function && typeof item.function === "object" ? item.function : {};
    var name = trim(fn.name);
    if (name === "") {
      continue;
    }
    toolCalls.push({
      id: trim(item.id),
      name: name,
      arguments: trim(fn.arguments) || "{}"
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

function createOpenAIChatSSEState() {
  return {
    text: "",
    reasoningText: "",
    reasoningItems: [],
    toolCallAccumulator: [],
    usage: null,
    error: ""
  };
}

function applyOpenAIChatSSEPayload(state, payloadText, emitChunks) {
  var payload = trim(payloadText);
  if (payload === "" || payload === "[DONE]") {
    return;
  }
  var event = decodeJsonText(payload, null);
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    return;
  }
  if (event.error) {
    state.error = extractErrorMessage(payload, "OpenAI request failed");
    return;
  }
  if (event.usage && typeof event.usage === "object") {
    state.usage = normalizeOpenAIUsage(event.usage);
  }
  if (!Array.isArray(event.choices) || event.choices.length === 0) {
    return;
  }
  var first = event.choices[0];
  var delta = first && first.delta && typeof first.delta === "object" ? first.delta : null;
  if (!delta) {
    return;
  }
  var reasoningChunk = readOpenAIChatDeltaReasoning(delta);
  if (reasoningChunk !== "") {
    state.reasoningText += reasoningChunk;
    if (emitChunks) {
      emitChunkPart("reasoning", reasoningChunk);
    }
  }
  var chunk = delta.content;
  if (chunk !== null && chunk !== undefined && String(chunk) !== "") {
    chunk = String(chunk);
    state.text += chunk;
    if (emitChunks) {
      emitChunkPart("text", chunk);
    }
  }
  mergeOpenAIToolCallDelta(state.toolCallAccumulator, delta.tool_calls);
}

function createCodexSSEState() {
  return {
    text: "",
    reasoningText: "",
    toolCallAccumulator: [],
    toolCalls: [],
    usage: null,
    error: ""
  };
}

function applyCodexSSEPayload(state, payloadText, emitChunks) {
  var payload = trim(payloadText);
  if (payload === "" || payload === "[DONE]") {
    return;
  }
  var event = decodeJsonText(payload, null);
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    return;
  }
  if (event.error) {
    state.error = extractErrorMessage(payload, "OpenAI request failed");
    return;
  }
  if (event.usage && typeof event.usage === "object") {
    state.usage = normalizeOpenAIUsage(event.usage);
  }
  var textEvent = readResponsesOutputTextEvent(event);
  if (textEvent.text !== "") {
    if (textEvent.isDelta) {
      state.text += textEvent.text;
      if (emitChunks) {
        emitChunkPart("text", textEvent.text);
      }
    } else {
      var mergedText = mergeCompletedStreamText(state.text, textEvent.text);
      state.text = mergedText.value;
      if (emitChunks && mergedText.delta !== "") {
        emitChunkPart("text", mergedText.delta);
      }
    }
  }
  var reasoningEvent = readResponsesReasoningEvent(event);
  if (reasoningEvent.text !== "") {
    if (reasoningEvent.isDelta) {
      state.reasoningText += reasoningEvent.text;
      if (emitChunks) {
        emitChunkPart("reasoning", reasoningEvent.text);
      }
    } else {
      var mergedReasoning = mergeCompletedStreamText(state.reasoningText, reasoningEvent.text);
      state.reasoningText = mergedReasoning.value;
      if (emitChunks && mergedReasoning.delta !== "") {
        emitChunkPart("reasoning", mergedReasoning.delta);
      }
    }
  }
  // Capture streamed function-call events directly. Some Responses streams
  // expose tool calls on output_item/function_call_arguments events even when
  // response.completed does not carry the final output array.
  mergeResponsesToolCallEvent(state.toolCallAccumulator, event);
  if (trim(event.type) === "response.completed" && event.response && typeof event.response === "object") {
    state.toolCalls = collectCodexResponseToolCalls(event.response);
    state.reasoningItems = collectCodexResponseReasoningItems(event.response);
    state.usage = normalizeOpenAIUsage(event.response.usage || event.response);
  }
}

function consumeOpenAIChatSSE(body, emitChunks) {
  var state = createOpenAIChatSSEState();
  var parser = createSSEParser(function(_eventName, payloadText) {
    applyOpenAIChatSSEPayload(state, payloadText, emitChunks);
  });
  parser.write(String(body || ""));
  parser.finish();
  if (state.error !== "") {
    return runtimeError(state.error);
  }
  return {
    text: state.text,
    reasoningText: state.reasoningText,
    toolCalls: finalizeRuntimeToolCalls(state.toolCallAccumulator),
    usage: state.usage
  };
}

function consumeCodexSSE(body, emitChunks) {
  var state = createCodexSSEState();
  var parser = createSSEParser(function(_eventName, payloadText) {
    applyCodexSSEPayload(state, payloadText, emitChunks);
  });
  parser.write(String(body || ""));
  parser.finish();
  if (state.error !== "") {
    return runtimeError(state.error);
  }
  var resolvedToolCalls = state.toolCalls;
  if ((!Array.isArray(resolvedToolCalls) || resolvedToolCalls.length === 0) &&
    Array.isArray(state.toolCallAccumulator) && state.toolCallAccumulator.length > 0) {
    resolvedToolCalls = finalizeRuntimeToolCalls(state.toolCallAccumulator);
  }
  return {
    text: state.text,
    reasoningText: state.reasoningText,
    reasoningItems: state.reasoningItems,
    toolCalls: resolvedToolCalls,
    usage: state.usage
  };
}

function streamSSEFromFetch(request, onPayload) {
  var rawBody = "";
  var parser = createSSEParser(function(eventName, payloadText) {
    if (typeof onPayload === "function") {
      onPayload(eventName, payloadText);
    }
  });
  // Parse fetch chunks while the request is in flight so emitted stream chunks
  // reach chat immediately instead of replaying after the provider finishes.
  var response = hostFetch(request, function(event) {
    var chunkText = readFetchChunkText(event);
    if (chunkText === "") {
      return;
    }
    rawBody += chunkText;
    parser.write(chunkText);
  });
  parser.finish();
  return {
    response: response,
    rawBody: rawBody
  };
}

function respondTextApiKey(config, request) {
  var apiKey = trim(config && config.apiKey);
  if (apiKey === "") {
    return runtimeError("OpenAI apiKey is required");
  }
  var model = trim(request && request.model);
  if (model === "") {
    model = trim(config && config.llmModel);
  }
  if (model === "") {
    return runtimeError("provider model is required");
  }
  var text = "";
  var reasoningText = "";
  var reasoningItems = [];
  var toolCalls = [];
  var usage = null;
  var payload;
  var response;
  if (requestUsesResponsesApi(request || {}, model, config || {})) {
    payload = {
      model: model,
      instructions: chooseSystemPrompt(request || {}),
      input: sanitizeResponsesInputForOpenAI(collectResponsesInput(request || {}, true, config || {}, model)),
      store: false,
      stream: true
    };
    var responseTools = buildResponsesTools(request || {});
    if (responseTools.length > 0) {
      payload.tools = responseTools;
    }
    var responsesReasoning = buildResponsesReasoningPayload(request || {}, model, config || {});
    if (responsesReasoning) {
      payload.reasoning = responsesReasoning;
    }
    if (responsesReasoning || requestHasOpenAIResponsesReasoningReplay(request || {}, config || {}, model)) {
      payload.include = ["reasoning.encrypted_content"];
    }
    var streamedResponsesState = createCodexSSEState();
    var streamedResponses = streamSSEFromFetch({
      url: responsesEndpoint(config),
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer " + apiKey
      },
      body: JSON.stringify(payload)
    }, function(_eventName, payloadText) {
      applyCodexSSEPayload(streamedResponsesState, payloadText, true);
    });
    response = streamedResponses.response;
    if (!response || !response.ok) {
      return runtimeError(extractErrorMessage(streamedResponses.rawBody || (response && response.body), "OpenAI request failed"));
    }
    if (streamedResponsesState.error !== "") {
      return runtimeError(streamedResponsesState.error);
    }
    text = trim(streamedResponsesState.text);
    reasoningText = trim(streamedResponsesState.reasoningText);
    reasoningItems = Array.isArray(streamedResponsesState.reasoningItems) ? streamedResponsesState.reasoningItems : [];
    toolCalls = Array.isArray(streamedResponsesState.toolCalls) ? streamedResponsesState.toolCalls : [];
    if (toolCalls.length === 0) {
      toolCalls = finalizeRuntimeToolCalls(streamedResponsesState.toolCallAccumulator);
    }
    usage = normalizeOpenAIUsage(streamedResponsesState.usage);
    if (text === "" && reasoningText === "" && !toolCalls.length) {
      var extracted = extractCodexOutput(streamedResponses.rawBody || (response && response.body));
      if (extracted && extracted.error) {
        return extracted;
      }
      text = trim(extracted.text);
      reasoningText = trim(extracted.reasoningText);
      reasoningItems = Array.isArray(extracted.reasoningItems) ? extracted.reasoningItems : [];
      toolCalls = Array.isArray(extracted.toolCalls) ? extracted.toolCalls : [];
      usage = normalizeOpenAIUsage(extracted.usage);
    }
  } else {
    payload = {
      model: model,
      messages: collectChatMessages(request || {}),
      stream: true,
      stream_options: { include_usage: true }
    };
    var tools = buildChatTools(request || {});
    if (tools.length > 0) {
      payload.tools = tools;
      payload.tool_choice = "auto";
    }
    var effort = maybeReasoningPayload(request || {}, config || {});
    if (effort !== "") {
      payload.reasoning_effort = effort;
    }
    var streamedChatState = createOpenAIChatSSEState();
    var streamedChat = streamSSEFromFetch({
      url: chatCompletionsEndpoint(config),
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer " + apiKey
      },
      body: JSON.stringify(payload)
    }, function(_eventName, payloadText) {
      applyOpenAIChatSSEPayload(streamedChatState, payloadText, true);
    });
    response = streamedChat.response;
    if (!response || !response.ok) {
      return runtimeError(extractErrorMessage(streamedChat.rawBody || (response && response.body), "OpenAI request failed"));
    }
    if (streamedChatState.error !== "") {
      return runtimeError(streamedChatState.error);
    }
    text = streamedChatState.text;
    reasoningText = streamedChatState.reasoningText;
    toolCalls = finalizeRuntimeToolCalls(streamedChatState.toolCallAccumulator);
    usage = normalizeOpenAIUsage(streamedChatState.usage);
    if (text === "" && reasoningText === "" && !toolCalls.length && !/^data:/m.test(String(streamedChat.rawBody || ""))) {
      var fallback = decodeJsonText(streamedChat.rawBody || (response && response.body), {});
      if (!fallback || typeof fallback !== "object" || Array.isArray(fallback)) {
        return runtimeError("OpenAI returned invalid JSON");
      }
      if (Array.isArray(fallback.choices) && fallback.choices.length > 0) {
        var first = fallback.choices[0];
        var message = first && first.message && typeof first.message === "object" ? first.message : null;
        if (message) {
          text = trim(message.content);
          reasoningText = readTrimmedField(message, ["reasoning_content", "reasoningContent", "reasoning"]);
        }
        toolCalls = extractRuntimeToolCallsFromChoice(first);
      }
      usage = normalizeOpenAIUsage(fallback.usage);
    }
  }
  if (text === "" && reasoningText === "" && !toolCalls.length) {
    return runtimeError("model response was empty");
  }
  var output = {};
  if (text !== "") {
    output.text = text;
  }
  if (reasoningText !== "") {
    output.reasoningText = reasoningText;
  }
  var reasoningParts = buildOpenAIReasoningParts(reasoningItems, reasoningText);
  if (reasoningParts.length > 0) {
    output.parts = reasoningParts;
  }
  if (toolCalls.length > 0) {
    output.toolCalls = toolCalls;
  }
  if (usage) {
    output.usage = usage;
  }
  return output;
}

function hostFetch(request, onEvent) {
  try {
    if (typeof onEvent === "function") {
      return host.http.fetch(request, onEvent);
    }
    return host.http.fetch(request);
  } catch (error) {
    var message = normalizeOpenAITransportErrorMessage(error && error.message ? error.message : error, "OpenAI request failed");
    throw new Error(message);
  }
}

function hostStreamChunk(text) {
  emitChunkPart("text", text);
}

function runtimeError(message) {
  return { error: trim(message) || "provider runtime failed" };
}

module.exports = {
  "list-models": function (input, hostArg) {
    host = hostArg;
    var config = effectiveCredentialConfig(input);
    var output = listOpenAIModelsApiKey(config);
    if (output && output.error) {
      return output;
    }
    return { output: output };
  },
  "respond-text": function (input, hostArg) {
    host = hostArg;
    var config = effectiveCredentialConfig(input);
    var request = input && input.request && typeof input.request === "object" ? input.request : {};
    var output = respondTextApiKey(config, request);
    if (output && output.error) {
      return output;
    }
    return { output: output };
  }
};

var host = null;
