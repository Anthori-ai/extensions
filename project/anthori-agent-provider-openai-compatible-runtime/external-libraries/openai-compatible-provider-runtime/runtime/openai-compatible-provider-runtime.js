var PROVIDER_DEFAULTS = {
  "google-provider": {
    providerKey: "google",
    providerLabel: "Google",
    apiBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-2.5-flash",
    supportsReasoningEffort: true,
    models: [
      { id: "gemini-3-flash-preview", maxContextTokens: 1048576 },
      { id: "gemini-2.5-pro", maxContextTokens: 1048576 },
      { id: "gemini-2.5-flash", maxContextTokens: 1048576 },
      { id: "gemini-2.5-flash-lite", maxContextTokens: 1048576 },
      { id: "gemini-2.0-flash", maxContextTokens: 1048576 }
    ]
  },
  "xai-provider": {
    providerKey: "xai",
    providerLabel: "xAI",
    apiBaseUrl: "https://api.x.ai/v1",
    defaultModel: "grok-4-fast",
    supportsResponsesApi: true,
    models: [
      { id: "grok-4-fast", maxContextTokens: 2000000 },
      { id: "grok-4-fast-non-reasoning", maxContextTokens: 2000000 },
      { id: "grok-4", maxContextTokens: 256000 },
      { id: "grok-code-fast-1", maxContextTokens: 256000 },
      { id: "grok-3", maxContextTokens: 131072 },
      { id: "grok-3-fast", maxContextTokens: 131072 },
      { id: "grok-3-mini", maxContextTokens: 131072 },
      { id: "grok-3-mini-fast", maxContextTokens: 131072 }
    ]
  },
  "mistral-provider": {
    providerKey: "mistral",
    providerLabel: "Mistral",
    apiBaseUrl: "https://api.mistral.ai/v1",
    defaultModel: "mistral-large-latest",
    models: [
      { id: "mistral-large-latest", maxContextTokens: 262144 },
      { id: "mistral-medium-latest", maxContextTokens: 128000 },
      { id: "mistral-small-latest", maxContextTokens: 256000 },
      { id: "devstral-medium-latest", maxContextTokens: 262144 },
      { id: "devstral-small-2507", maxContextTokens: 128000 },
      { id: "codestral-latest", maxContextTokens: 256000 },
      { id: "magistral-medium-latest", maxContextTokens: 128000 },
      { id: "magistral-small", maxContextTokens: 128000 },
      { id: "pixtral-large-latest", maxContextTokens: 128000 },
      { id: "ministral-8b-latest", maxContextTokens: 128000 },
      { id: "ministral-3b-latest", maxContextTokens: 128000 }
    ]
  },
  "moonshot-provider": {
    providerKey: "moonshot",
    providerLabel: "Moonshot",
    apiBaseUrl: "https://api.moonshot.ai/v1",
    defaultModel: "kimi-k2.5",
    models: [
      { id: "kimi-k2.5", maxContextTokens: 262144 },
      { id: "kimi-k2-thinking", maxContextTokens: 262144 },
      { id: "kimi-k2-thinking-turbo", maxContextTokens: 262144 },
      { id: "kimi-k2-turbo-preview", maxContextTokens: 262144 },
      { id: "kimi-k2-0905-preview", maxContextTokens: 262144 },
      { id: "kimi-k2-0711-preview", maxContextTokens: 131072 }
    ]
  },
  "zhipu-provider": {
    providerKey: "zhipu",
    providerLabel: "Zhipu",
    apiBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
    defaultModel: "glm-5.1",
    supportsThinkingType: true,
    models: [
      { id: "glm-5.1", maxContextTokens: 200000 },
      { id: "glm-5", maxContextTokens: 200000 },
      { id: "glm-5-turbo", maxContextTokens: 128000 },
      { id: "glm-5v-turbo", maxContextTokens: 128000 },
      { id: "glm-4.7", maxContextTokens: 203000 },
      { id: "glm-4.7-flash", maxContextTokens: 203000 },
      { id: "glm-4.7-flashx", maxContextTokens: 203000 },
      { id: "glm-4.6", maxContextTokens: 205000 },
      { id: "glm-4.6v", maxContextTokens: 128000 },
      { id: "glm-4.5", maxContextTokens: 128000 },
      { id: "glm-4.5-air", maxContextTokens: 128000 },
      { id: "glm-4.5-flash", maxContextTokens: 128000 },
      { id: "glm-4.5v", maxContextTokens: 128000 }
    ]
  },
  "alibaba-provider": {
    providerKey: "alibaba",
    providerLabel: "Alibaba",
    apiBaseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    defaultModel: "qwen-plus",
    models: [
      { id: "qwen-plus", maxContextTokens: 1000000 },
      { id: "qwen3.5-plus", maxContextTokens: 1000000 },
      { id: "qwen3-max", maxContextTokens: 262144 },
      { id: "qwen3-coder-plus", maxContextTokens: 1048576 },
      { id: "qwen3-coder-flash", maxContextTokens: 1000000 },
      { id: "qwen-flash", maxContextTokens: 1000000 },
      { id: "qwen-max", maxContextTokens: 32768 },
      { id: "qwq-plus", maxContextTokens: 131072 },
      { id: "qvq-max", maxContextTokens: 131072 }
    ]
  },
  "ollama-provider": {
    providerKey: "ollama",
    providerLabel: "Ollama",
    apiBaseUrl: "http://127.0.0.1:11434",
    defaultModel: "",
    defaultMaxContextTokens: 4096,
    requiresApiKey: false,
    supportsReasoningEffort: true,
    models: []
  },
  "unsloth-studio-provider": {
    providerKey: "unsloth-studio",
    providerLabel: "Unsloth Studio",
    apiBaseUrl: "http://127.0.0.1:8888/v1",
    defaultModel: "default",
    requiresApiKey: true,
    supportsReasoningEffort: true,
    models: []
  }
};

function trim(value)
{
  if (value === null || value === undefined)
  {
    return "";
  }
  return String(value).trim();
}

function truthy(value)
{
  if (value === null || value === undefined)
  {
    return false;
  }
  var normalized = trim(value).toLowerCase();
  return normalized !== "" && normalized !== "0" && normalized !== "false";
}

function plainObject(value)
{
  if (!value || typeof value !== "object" || Array.isArray(value))
  {
    return {};
  }
  return value;
}

function copyObject(value)
{
  var source = plainObject(value);
  var copy = {};
  var keys = Object.keys(source);
  for (var i = 0; i < keys.length; i += 1)
  {
    copy[keys[i]] = source[keys[i]];
  }
  return copy;
}

function cloneValue(value)
{
  return copySchemaValue(value);
}

function copySchemaValue(value)
{
  if (Array.isArray(value))
  {
    var list = [];
    for (var i = 0; i < value.length; i += 1)
    {
      list.push(copySchemaValue(value[i]));
    }
    return list;
  }
  if (!value || typeof value !== "object")
  {
    return value;
  }
  var copy = {};
  var keys = Object.keys(value);
  for (var j = 0; j < keys.length; j += 1)
  {
    copy[keys[j]] = copySchemaValue(value[keys[j]]);
  }
  return copy;
}

function finiteNumber(value)
{
  var number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function decodeJsonText(text, fallback)
{
  try
  {
    return JSON.parse(text);
  }
  catch (_error)
  {
    return fallback;
  }
}

function providerObject(input)
{
  return input && input.provider && typeof input.provider === "object" && !Array.isArray(input.provider)
    ? input.provider
    : {};
}

function providerConfig(input)
{
  return plainObject(providerObject(input).config);
}

function extensionUserSecrets(input)
{
  var extension = input && input.extension && typeof input.extension === "object" ? input.extension : {};
  return plainObject(extension.userSecrets);
}

function effectiveCredentialConfig(input)
{
  var config = copyObject(providerConfig(input));
  var secrets = extensionUserSecrets(input);
  if (trim(secrets.apiKey) !== "")
  {
    config.apiKey = trim(secrets.apiKey);
  }
  return config;
}

function providerDefaults(input, config)
{
  var explicitKey = trim(config && config.providerKey);
  var definitionId = trim(providerObject(input).definitionId);
  if (definitionId !== "" && PROVIDER_DEFAULTS[definitionId])
  {
    return PROVIDER_DEFAULTS[definitionId];
  }
  if (explicitKey !== "")
  {
    var keys = Object.keys(PROVIDER_DEFAULTS);
    for (var i = 0; i < keys.length; i += 1)
    {
      var candidate = PROVIDER_DEFAULTS[keys[i]];
      if (trim(candidate.providerKey) === explicitKey)
      {
        return candidate;
      }
    }
  }
  return {
    providerKey: "openai-compatible",
    providerLabel: "OpenAI-compatible",
    apiBaseUrl: "",
    defaultModel: "",
    models: []
  };
}

function providerSettings(input)
{
  var config = effectiveCredentialConfig(input);
  var defaults = providerDefaults(input, config);
  var settings = copyObject(defaults);
  var keys = Object.keys(config);
  for (var i = 0; i < keys.length; i += 1)
  {
    var key = keys[i];
    if (config[key] !== null && config[key] !== undefined && trim(config[key]) !== "")
    {
      settings[key] = config[key];
    }
  }
  settings.providerLabel = trim(settings.providerLabel) || "OpenAI-compatible";
  settings.apiBaseUrl = trim(settings.apiBaseUrl).replace(/\/+$/, "");
  settings.defaultModel = trim(settings.defaultModel);
  settings.requiresApiKey = Object.prototype.hasOwnProperty.call(defaults, "requiresApiKey")
    ? defaults.requiresApiKey
    : true;
  if (trim(settings.providerKey) === "ollama")
  {
    settings = normalizeOllamaSettings(settings);
  }
  if (trim(settings.providerKey) === "unsloth-studio")
  {
    settings = normalizeUnslothStudioSettings(settings);
  }
  return settings;
}

function apiKey(settings)
{
  return trim(settings && settings.apiKey);
}

function requiresApiKey(settings)
{
  if (settings && Object.prototype.hasOwnProperty.call(settings, "requiresApiKey"))
  {
    return truthy(settings.requiresApiKey);
  }
  return true;
}

function providerRequestHeaders(settings, includeJSON)
{
  var headers = {};
  if (includeJSON)
  {
    headers["content-type"] = "application/json";
  }
  var key = apiKey(settings);
  if (key !== "")
  {
    headers.authorization = "Bearer " + key;
  }
  return headers;
}

function normalizeOllamaSettings(settings)
{
  var next = copyObject(settings);
  var base = trim(next.ollamaBaseUrl || next.apiBaseUrl || next.llmBaseUrl).replace(/\/+$/, "");
  if (base.toLowerCase().slice(-3) === "/v1")
  {
    base = base.slice(0, -3).replace(/\/+$/, "");
  }
  next.ollamaBaseUrl = base;
  next.apiBaseUrl = base === "" ? "" : base + "/v1";
  return next;
}

function normalizeUnslothStudioSettings(settings)
{
  var next = copyObject(settings);
  var base = trim(next.apiBaseUrl || next.llmBaseUrl || next.baseUrl).replace(/\/+$/, "");
  var lower = base.toLowerCase();
  if (base !== "" && lower.slice(-3) !== "/v1" && lower.slice(-14) !== "/api/inference")
  {
    base += "/v1";
  }
  next.apiBaseUrl = base;
  return next;
}

function chatCompletionsEndpoint(settings)
{
  return trim(settings && settings.apiBaseUrl).replace(/\/+$/, "") + "/chat/completions";
}

function responsesEndpoint(settings)
{
  return trim(settings && settings.apiBaseUrl).replace(/\/+$/, "") + "/responses";
}

function modelsEndpoint(settings)
{
  return trim(settings && settings.apiBaseUrl).replace(/\/+$/, "") + "/models";
}

function googleNativeModelsBaseUrl(settings)
{
  var baseUrl = trim(settings && settings.apiBaseUrl).replace(/\/+$/, "");
  if (baseUrl.toLowerCase().slice(-7) === "/openai")
  {
    baseUrl = baseUrl.slice(0, -7);
  }
  return baseUrl || "https://generativelanguage.googleapis.com/v1beta";
}

function googleNativeModelsEndpoint(settings, pageToken)
{
  var url = googleNativeModelsBaseUrl(settings) + "/models?pageSize=1000";
  var token = trim(pageToken);
  if (token !== "")
  {
    url += "&pageToken=" + encodeURIComponent(token);
  }
  url += "&key=" + encodeURIComponent(apiKey(settings));
  return url;
}

function providerAdapter(settings)
{
  var key = trim(settings && settings.providerKey);
  return key !== "" && PROVIDER_ADAPTERS[key] && typeof PROVIDER_ADAPTERS[key] === "object"
    ? PROVIDER_ADAPTERS[key]
    : {};
}

function normalizeTransportErrorMessage(settings, message, fallback)
{
  var label = trim(settings && settings.providerLabel) || "OpenAI-compatible provider";
  var text = trim(message) || trim(fallback) || (label + " request failed");
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
  )
  {
    return label + " stream failed. The provider may be unavailable right now. Upstream error: " + text;
  }
  return text;
}

function googleProviderErrorMessage(settings, message)
{
  var text = trim(message);
  if (text === "")
  {
    return "";
  }
  var match = text.match(/function calling is not enabled for models\/([^\s"]+)/i);
  if (!match)
  {
    return "";
  }
  var model = trim(match[1]);
  if (model === "")
  {
    return 'Google model does not support function calling. Anthori Agent uses function calling for tools, so choose a Gemini model such as "gemini-2.5-flash" or another Google model with function calling enabled.';
  }
  return 'Google model "' + model + '" does not support function calling. Anthori Agent uses function calling for tools, so choose a Gemini model such as "gemini-2.5-flash" or another Google model with function calling enabled.';
}

function providerSpecificErrorMessage(settings, message)
{
  var adapter = providerAdapter(settings);
  return typeof adapter.errorMessage === "function" ? trim(adapter.errorMessage(settings, message)) : "";
}

function extractErrorMessage(settings, body, fallback)
{
  var text = trim(body);
  if (text === "")
  {
    return trim(fallback) || (trim(settings && settings.providerLabel) + " request failed");
  }
  var parsed = decodeJsonText(text, null);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
  {
    if (typeof parsed.error === "string" && trim(parsed.error) !== "")
    {
      return providerSpecificErrorMessage(settings, parsed.error) || trim(parsed.error);
    }
    if (parsed.error && typeof parsed.error === "object")
    {
      var type = trim(parsed.error.type);
      var code = trim(parsed.error.code);
      var message = trim(parsed.error.message);
      var providerMessage = providerSpecificErrorMessage(settings, message);
      if (providerMessage !== "")
      {
        return providerMessage;
      }
      var prefix = type || code;
      if (prefix !== "" && message !== "")
      {
        return prefix + ": " + message;
      }
      if (message !== "")
      {
        return message;
      }
    }
    if (trim(parsed.message) !== "")
    {
      return providerSpecificErrorMessage(settings, parsed.message) || trim(parsed.message);
    }
  }
  return providerSpecificErrorMessage(settings, text) || normalizeTransportErrorMessage(settings, text, fallback);
}

function hostFetch(host, settings, request, onEvent)
{
  try
  {
    if (typeof onEvent === "function")
    {
      return host.http.fetch(request, onEvent);
    }
    return host.http.fetch(request);
  }
  catch (error)
  {
    throw new Error(
      normalizeTransportErrorMessage(
        settings,
        error && error.message ? error.message : error,
        trim(settings && settings.providerLabel) + " request failed"
      )
    );
  }
}

function runtimeError(message)
{
  return { error: trim(message) || "provider runtime failed" };
}

function normalizeOpenAICompatibleUsage(value)
{
  var usage = value && typeof value === "object" && !Array.isArray(value) ? value : null;
  if (!usage)
  {
    return null;
  }
  var result = {};
  var inputTokens = finiteNumber(
    usage.input_tokens ?? usage.inputTokens ?? usage.prompt_tokens ?? usage.promptTokens
  );
  var outputTokens = finiteNumber(
    usage.output_tokens ?? usage.outputTokens ?? usage.completion_tokens ?? usage.completionTokens
  );
  var totalTokens = finiteNumber(usage.total_tokens ?? usage.totalTokens);
  var completionDetails = plainObject(usage.completion_tokens_details || usage.completionTokensDetails || usage.output_tokens_details || usage.outputTokensDetails);
  var inputDetails = plainObject(usage.input_tokens_details || usage.inputTokensDetails || usage.prompt_tokens_details || usage.promptTokensDetails);
  var reasoningTokens = finiteNumber(completionDetails.reasoning_tokens ?? completionDetails.reasoningTokens);
  if (reasoningTokens <= 0)
  {
    reasoningTokens = finiteNumber(usage.reasoning_tokens ?? usage.reasoningTokens);
  }
  var cacheReadTokens = finiteNumber(usage.cache_read_input_tokens ?? usage.cacheReadInputTokens ?? usage.cacheReadTokens ?? inputDetails.cached_tokens ?? inputDetails.cachedTokens);
  var cacheWriteTokens = finiteNumber(usage.cache_creation_input_tokens ?? usage.cacheCreationInputTokens ?? usage.cacheWriteTokens ?? inputDetails.cache_creation_tokens ?? inputDetails.cacheCreationTokens);
  if (inputTokens > 0) result.inputTokens = inputTokens;
  if (outputTokens > 0) result.outputTokens = outputTokens;
  if (reasoningTokens > 0) result.reasoningTokens = reasoningTokens;
  if (cacheReadTokens > 0) result.cacheReadTokens = cacheReadTokens;
  if (cacheWriteTokens > 0) result.cacheWriteTokens = cacheWriteTokens;
  if (totalTokens > 0)
  {
    result.totalTokens = totalTokens;
  }
  else if (inputTokens > 0 || outputTokens > 0)
  {
    result.totalTokens = inputTokens + outputTokens;
  }
  return Object.keys(result).length > 0 ? result : null;
}

function looksLikeSchemaObject(value)
{
  if (!value || typeof value !== "object" || Array.isArray(value))
  {
    return false;
  }
  var keys = ["type", "properties", "items", "enum", "anyOf", "oneOf", "allOf", "additionalProperties", "required", "description", "default", "format", "minimum", "maximum", "minItems", "maxItems", "minLength", "maxLength"];
  for (var i = 0; i < keys.length; i += 1)
  {
    if (Object.prototype.hasOwnProperty.call(value, keys[i]))
    {
      return true;
    }
  }
  return false;
}

function schemaTypeIncludes(typeValue, expected)
{
  var target = trim(expected).toLowerCase();
  if (target === "")
  {
    return false;
  }
  if (Array.isArray(typeValue))
  {
    for (var i = 0; i < typeValue.length; i += 1)
    {
      if (trim(typeValue[i]).toLowerCase() === target)
      {
        return true;
      }
    }
    return false;
  }
  return trim(typeValue).toLowerCase() === target;
}

function normalizeSchemaFragment(value)
{
  if (!value || typeof value !== "object" || Array.isArray(value))
  {
    return { type: "string" };
  }
  if (looksLikeSchemaObject(value))
  {
    var copy = copySchemaValue(value);
    if (copy.properties && typeof copy.properties === "object" && !Array.isArray(copy.properties))
    {
      var props = {};
      var propKeys = Object.keys(copy.properties).sort();
      for (var i = 0; i < propKeys.length; i += 1)
      {
        props[propKeys[i]] = normalizeSchemaFragment(copy.properties[propKeys[i]]);
      }
      copy.properties = props;
    }
    if (copy.items && typeof copy.items === "object" && !Array.isArray(copy.items))
    {
      copy.items = normalizeSchemaFragment(copy.items);
    }
    return copy;
  }

  var properties = {};
  var required = [];
  var keys = Object.keys(value).sort();
  for (var j = 0; j < keys.length; j += 1)
  {
    var key = keys[j];
    var entry = value[key];
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
    {
      continue;
    }
    var normalized = {};
    var entryKeys = Object.keys(entry);
    for (var k = 0; k < entryKeys.length; k += 1)
    {
      var entryKey = entryKeys[k];
      if (entryKey !== "required")
      {
        normalized[entryKey] = entry[entryKey];
      }
    }
    properties[key] = normalizeSchemaFragment(normalized);
    if (truthy(entry.required))
    {
      required.push(key);
    }
  }
  var schema = { type: "object", properties: properties };
  if (required.length > 0)
  {
    schema.required = required;
  }
  return schema;
}

function normalizeToolParametersSchema(value)
{
  var normalized = normalizeSchemaFragment(value);
  if (!normalized || typeof normalized !== "object" || Array.isArray(normalized))
  {
    return { type: "object", properties: {} };
  }
  if (!schemaTypeIncludes(normalized.type, "object"))
  {
    return { type: "object", properties: {} };
  }
  if (!normalized.properties || typeof normalized.properties !== "object" || Array.isArray(normalized.properties))
  {
    normalized.properties = {};
  }
  return normalized;
}

function buildOpenAITools(request)
{
  var tools = [];
  if (!request || !Array.isArray(request.tools))
  {
    return tools;
  }
  for (var i = 0; i < request.tools.length; i += 1)
  {
    var tool = request.tools[i];
    if (!tool || typeof tool !== "object" || Array.isArray(tool))
    {
      continue;
    }
    var name = trim(tool.name);
    if (name === "")
    {
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

function buildResponsesTools(request)
{
  var tools = [];
  if (!request || !Array.isArray(request.tools))
  {
    return tools;
  }
  for (var i = 0; i < request.tools.length; i += 1)
  {
    var tool = request.tools[i];
    if (!tool || typeof tool !== "object" || Array.isArray(tool))
    {
      continue;
    }
    var name = trim(tool.name);
    if (name === "")
    {
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

function googleThoughtSignatureFromValue(value)
{
  var source = value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
  var google = plainObject(source.google);
  return trim(google.thoughtSignature || google.thought_signature);
}

function extractGoogleToolCallMetadata(raw)
{
  var extraContent = plainObject(raw && (raw.extra_content || raw.extraContent));
  var signature = googleThoughtSignatureFromValue(extraContent);
  if (signature === "")
  {
    return null;
  }
  return { google: { thoughtSignature: signature } };
}

function buildGoogleToolCallExtraContent(metadata)
{
  var signature = googleThoughtSignatureFromValue(metadata);
  if (signature === "")
  {
    return null;
  }
  return {
    google: {
      thought_signature: signature
    }
  };
}

var PROVIDER_ADAPTERS = {
  google: {
    extractToolCallMetadata: extractGoogleToolCallMetadata,
    buildToolCallExtraContent: buildGoogleToolCallExtraContent,
    errorMessage: googleProviderErrorMessage,
    handleModels: handleGoogleModels
  },
  ollama: {
    handleModels: handleOllamaModels
  },
  "unsloth-studio": {
    handleModels: handleUnslothStudioModels
  }
};

function extractToolCallMetadata(raw, settings)
{
  var adapter = providerAdapter(settings);
  return typeof adapter.extractToolCallMetadata === "function"
    ? adapter.extractToolCallMetadata(raw, settings)
    : null;
}

function buildToolCallExtraContent(metadata, settings)
{
  var adapter = providerAdapter(settings);
  return typeof adapter.buildToolCallExtraContent === "function"
    ? adapter.buildToolCallExtraContent(metadata, settings)
    : null;
}

function buildOpenAIToolCalls(raw, settings)
{
  var toolCalls = [];
  if (!Array.isArray(raw))
  {
    return toolCalls;
  }
  for (var i = 0; i < raw.length; i += 1)
  {
    var call = raw[i];
    if (!call || typeof call !== "object" || Array.isArray(call))
    {
      continue;
    }
    var fn = call.function && typeof call.function === "object"
      ? call.function
      : (call.Function && typeof call.Function === "object" ? call.Function : {});
    var name = trim(fn.name || fn.Name || call.name || call.Name);
    if (name === "")
    {
      continue;
    }
    var argumentsText = trim(fn.arguments || fn.Arguments || call.arguments || call.Arguments);
    if (argumentsText === "")
    {
      argumentsText = "{}";
    }
    var next = {
      id: trim(call.id || call.ID),
      type: "function",
      function: {
        name: name,
        arguments: argumentsText
      }
    };
    var extraContent = buildToolCallExtraContent(plainObject(call && call.metadata), settings);
    if (extraContent)
    {
      next.extra_content = extraContent;
    }
    toolCalls.push(next);
  }
  return toolCalls;
}

function normalizeMessageText(entry)
{
  if (!entry || typeof entry !== "object" || Array.isArray(entry))
  {
    return "";
  }
  if (Array.isArray(entry.parts))
  {
    var text = "";
    for (var i = 0; i < entry.parts.length; i += 1)
    {
      var part = entry.parts[i];
      if (!part || typeof part !== "object" || Array.isArray(part))
      {
        continue;
      }
      var kind = trim(part.kind).toLowerCase();
      if (kind !== "text")
      {
        continue;
      }
      if (part.text !== null && part.text !== undefined)
      {
        text += String(part.text);
      }
    }
    if (trim(text) !== "")
    {
      return trim(text);
    }
  }
  if (entry.content !== null && entry.content !== undefined)
  {
    return trim(entry.content);
  }
  if (entry.text !== null && entry.text !== undefined)
  {
    return trim(entry.text);
  }
  return "";
}

function appendReasoningDetails(items, value)
{
  if (Array.isArray(value))
  {
    for (var i = 0; i < value.length; i += 1)
    {
      appendReasoningDetails(items, value[i]);
    }
    return;
  }
  if (value && typeof value === "object")
  {
    items.push(cloneValue(value));
  }
}

function providerSourceAllowsReplay(metadata, config, model)
{
  var source = plainObject(metadata && metadata.anthoriProvider);
  if (trim(source.providerRef) === "" && trim(source.providerDefinitionId) === "" && trim(source.model) === "")
  {
    return false;
  }
  if (trim(source.providerRef) !== "" && trim(config && config.providerRef) !== trim(source.providerRef))
  {
    return false;
  }
  if (trim(source.providerDefinitionId) !== "" && trim(config && config.providerDefinitionId) !== trim(source.providerDefinitionId))
  {
    return false;
  }
  if (trim(source.model) !== "" && trim(model) !== trim(source.model))
  {
    return false;
  }
  return true;
}

function openAICompatibleReasoningDetailsFromPart(part, settings, model)
{
  var items = [];
  var metadata = plainObject(part && part.metadata);
  if (!providerSourceAllowsReplay(metadata, settings || {}, model))
  {
    return items;
  }
  var compatible = plainObject(metadata.openaiCompatible);
  var openrouter = plainObject(metadata.openrouter);
  appendReasoningDetails(items, compatible.reasoningDetails);
  appendReasoningDetails(items, compatible.reasoning_details);
  appendReasoningDetails(items, compatible.details);
  appendReasoningDetails(items, openrouter.reasoningDetails);
  appendReasoningDetails(items, openrouter.reasoning_details);
  return items;
}

function collectOpenAICompatibleReasoningReplay(entry, settings, model)
{
  var items = [];
  if (!entry || typeof entry !== "object" || Array.isArray(entry) || !Array.isArray(entry.parts))
  {
    return items;
  }
  for (var i = 0; i < entry.parts.length; i += 1)
  {
    var part = entry.parts[i];
    if (!part || typeof part !== "object" || Array.isArray(part))
    {
      continue;
    }
    if (trim(part.kind).toLowerCase() !== "reasoning")
    {
      continue;
    }
    appendReasoningDetails(items, openAICompatibleReasoningDetailsFromPart(part, settings, model));
  }
  return items;
}

function normalizeResponsesReasoningItem(value)
{
  if (!value || typeof value !== "object" || Array.isArray(value))
  {
    return null;
  }
  var item = cloneValue(value);
  if (trim(item.type) === "")
  {
    item.type = "reasoning";
  }
  if (trim(item.type) !== "reasoning")
  {
    return null;
  }
  return item;
}

function appendResponsesReasoningItems(items, value)
{
  if (Array.isArray(value))
  {
    for (var i = 0; i < value.length; i += 1)
    {
      appendResponsesReasoningItems(items, value[i]);
    }
    return;
  }
  var item = normalizeResponsesReasoningItem(value);
  if (item)
  {
    items.push(item);
  }
}

function xAIResponsesReasoningItemsFromPart(part, settings, model)
{
  var items = [];
  var metadata = plainObject(part && part.metadata);
  if (!providerSourceAllowsReplay(metadata, settings || {}, model))
  {
    return items;
  }
  var xai = plainObject(metadata.xai);
  appendResponsesReasoningItems(items, xai.responses);
  appendResponsesReasoningItems(items, xai.responsesItems);
  appendResponsesReasoningItems(items, xai.responseItem);
  appendResponsesReasoningItems(items, xai.reasoningItems);
  appendResponsesReasoningItems(items, xai.reasoningItem);
  return items;
}

function collectXAIResponsesReasoningReplay(entry, settings, model)
{
  var items = [];
  if (!entry || typeof entry !== "object" || Array.isArray(entry) || !Array.isArray(entry.parts))
  {
    return items;
  }
  for (var i = 0; i < entry.parts.length; i += 1)
  {
    var part = entry.parts[i];
    if (!part || typeof part !== "object" || Array.isArray(part))
    {
      continue;
    }
    if (trim(part.kind).toLowerCase() !== "reasoning")
    {
      continue;
    }
    appendResponsesReasoningItems(items, xAIResponsesReasoningItemsFromPart(part, settings, model));
  }
  return items;
}

function normalizeMessageAttachments(entry)
{
  var items = [];
  if (!entry || typeof entry !== "object" || Array.isArray(entry))
  {
    return items;
  }
  var seen = {};
  var push = function(item)
  {
    if (!item || typeof item !== "object" || Array.isArray(item))
    {
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
    if (!attachment.name && !attachment.path && !attachment.ref)
    {
      return;
    }
    var key = [attachment.type, attachment.path, attachment.ref, attachment.name, attachment.mimeType].join("::");
    if (seen[key])
    {
      return;
    }
    seen[key] = true;
    items.push(attachment);
  };
  if (Array.isArray(entry.attachments))
  {
    for (var i = 0; i < entry.attachments.length; i += 1)
    {
      push(entry.attachments[i]);
    }
  }
  if (Array.isArray(entry.parts))
  {
    for (var j = 0; j < entry.parts.length; j += 1)
    {
      var part = entry.parts[j];
      if (!part || typeof part !== "object" || Array.isArray(part))
      {
        continue;
      }
      if (trim(part.kind).toLowerCase() !== "attachment")
      {
        continue;
      }
      var metadata = plainObject(part.metadata);
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

function fileExtension(value)
{
  var text = trim(value);
  if (text === "")
  {
    return "";
  }
  var normalized = text.replace(/\\/g, "/");
  var index = normalized.lastIndexOf(".");
  return index < 0 ? "" : normalized.slice(index).toLowerCase();
}

function inferAttachmentMimeType(attachment)
{
  var mimeType = trim(attachment && attachment.mimeType);
  if (mimeType !== "")
  {
    return mimeType;
  }
  var ext = fileExtension(attachment && attachment.name) || fileExtension(attachment && attachment.path) || fileExtension(attachment && attachment.ref);
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  return "";
}

function attachmentDataUri(mimeType, base64)
{
  return "data:" + (trim(mimeType) || "application/octet-stream") + ";base64," + trim(base64);
}

function readAttachmentBinary(attachment, host)
{
  if (!host || !host.attachments || typeof host.attachments.read !== "function")
  {
    return null;
  }
  var path = trim(attachment && attachment.path);
  if (path === "")
  {
    return null;
  }
  var mimeType = inferAttachmentMimeType(attachment);
  if (!/^image\//.test(mimeType))
  {
    return null;
  }
  var payload = host.attachments.read({
    path: path,
    name: trim(attachment.name),
    mimeType: mimeType,
    encoding: "base64"
  });
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || trim(payload.content) === "")
  {
    return null;
  }
  return {
    name: trim(payload.name) || trim(attachment.name) || "attachment",
    path: path,
    mimeType: trim(payload.mimeType) || mimeType,
    content: trim(payload.content)
  };
}

function buildAttachmentContextLines(attachments)
{
  var lines = [];
  if (!Array.isArray(attachments))
  {
    return lines;
  }
  for (var i = 0; i < attachments.length; i += 1)
  {
    var attachment = attachments[i];
    var label = trim(attachment && attachment.name);
    var reference = trim(attachment && attachment.path) || trim(attachment && attachment.ref);
    if (label !== "" && reference !== "") lines.push("- " + label + " (" + reference + ")");
    else if (reference !== "") lines.push("- " + reference);
    else if (label !== "") lines.push("- " + label);
  }
  return lines;
}

function appendAttachmentContext(content, attachments)
{
  var text = trim(content);
  var lines = buildAttachmentContextLines(attachments);
  if (lines.length === 0)
  {
    return text;
  }
  var suffix = "Attachments:\n" + lines.join("\n");
  return text !== "" ? text + "\n\n" + suffix : suffix;
}

function buildUserMessageContent(entry, host)
{
  var attachments = normalizeMessageAttachments(entry);
  if (attachments.length === 0)
  {
    return normalizeMessageText(entry);
  }
  var blocks = [];
  var text = normalizeMessageText(entry);
  if (text !== "")
  {
    blocks.push({ type: "text", text: text });
  }
  var fallbackAttachments = [];
  var nativeCount = 0;
  for (var i = 0; i < attachments.length; i += 1)
  {
    var resolved = null;
    try
    {
      resolved = readAttachmentBinary(attachments[i], host);
    }
    catch (_error)
    {
      resolved = null;
    }
    if (!resolved)
    {
      fallbackAttachments.push(attachments[i]);
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
  if (nativeCount === 0)
  {
    return appendAttachmentContext(text, attachments);
  }
  var fallbackLines = buildAttachmentContextLines(fallbackAttachments);
  if (fallbackLines.length > 0)
  {
    blocks.push({ type: "text", text: "Attachments:\n" + fallbackLines.join("\n") });
  }
  return blocks.length === 1 && blocks[0].type === "text" ? blocks[0].text : blocks;
}

function collectOpenAIMessages(request, host, settings, model)
{
  var messages = [];
  if (request && Array.isArray(request.messages) && request.messages.length > 0)
  {
    for (var i = 0; i < request.messages.length; i += 1)
    {
      var entry = request.messages[i];
      if (!entry || typeof entry !== "object" || Array.isArray(entry))
      {
        continue;
      }
      var role = trim(entry.role) || "user";
      if (role === "tool")
      {
        var toolCallId = trim(entry.toolCallId);
        if (toolCallId !== "")
        {
          messages.push({ role: "tool", tool_call_id: toolCallId, content: normalizeMessageText(entry) });
        }
        continue;
      }
      if (role === "assistant")
      {
        var content = appendAttachmentContext(normalizeMessageText(entry), normalizeMessageAttachments(entry));
        var toolCalls = buildOpenAIToolCalls(entry.toolCalls, settings);
        var reasoningDetails = collectOpenAICompatibleReasoningReplay(entry, settings, model);
        if (content === "" && toolCalls.length === 0 && reasoningDetails.length === 0)
        {
          continue;
        }
        var assistant = { role: "assistant" };
        if (content !== "") assistant.content = content;
        if (reasoningDetails.length > 0) assistant.reasoning_details = reasoningDetails;
        if (toolCalls.length > 0) assistant.tool_calls = toolCalls;
        messages.push(assistant);
        continue;
      }
      var messageContent = buildUserMessageContent(entry, host);
      if ((typeof messageContent === "string" && messageContent === "") || (Array.isArray(messageContent) && messageContent.length === 0))
      {
        continue;
      }
      messages.push({ role: role, content: messageContent });
    }
  }
  if (messages.length === 0)
  {
    var system = trim(request && request.system);
    if (system !== "")
    {
      messages.push({ role: "system", content: system });
    }
    messages.push({ role: "user", content: trim(request && request.prompt) });
  }
  return messages;
}

function responsesContentTextType(role)
{
  return trim(role).toLowerCase() === "assistant" ? "output_text" : "input_text";
}

function buildResponsesContent(entry, host)
{
  var blocks = [];
  var textType = responsesContentTextType(entry && entry.role);
  var text = normalizeMessageText(entry);
  if (text !== "")
  {
    blocks.push({ type: textType, text: text });
  }
  var attachments = normalizeMessageAttachments(entry);
  var fallbackAttachments = [];
  for (var i = 0; i < attachments.length; i += 1)
  {
    var resolved = null;
    try
    {
      resolved = readAttachmentBinary(attachments[i], host);
    }
    catch (_error)
    {
      resolved = null;
    }
    if (!resolved)
    {
      fallbackAttachments.push(attachments[i]);
      continue;
    }
    blocks.push({
      type: "input_image",
      image_url: attachmentDataUri(resolved.mimeType, resolved.content)
    });
  }
  var fallbackLines = buildAttachmentContextLines(fallbackAttachments);
  if (fallbackLines.length > 0)
  {
    blocks.push({
      type: textType,
      text: "Attachments:\n" + fallbackLines.join("\n")
    });
  }
  return blocks;
}

function collectResponsesInput(request, host, settings, model)
{
  var items = [];
  if (request && Array.isArray(request.messages) && request.messages.length > 0)
  {
    var system = trim(request && request.system);
    if (system !== "")
    {
      items.push({
        type: "message",
        role: "system",
        content: [{ type: "input_text", text: system }]
      });
    }
    for (var i = 0; i < request.messages.length; i += 1)
    {
      var entry = request.messages[i];
      if (!entry || typeof entry !== "object" || Array.isArray(entry))
      {
        continue;
      }
      var role = trim(entry.role) || "user";
      if (role === "tool")
      {
        var toolCallId = trim(entry.toolCallId);
        if (toolCallId !== "")
        {
          items.push({
            type: "function_call_output",
            call_id: toolCallId,
            output: normalizeMessageText(entry)
          });
        }
        continue;
      }
      if (role === "assistant")
      {
        var reasoningItems = collectXAIResponsesReasoningReplay(entry, settings, model);
        for (var reasoningIndex = 0; reasoningIndex < reasoningItems.length; reasoningIndex += 1)
        {
          items.push(reasoningItems[reasoningIndex]);
        }
      }
      var contentBlocks = buildResponsesContent(entry, host);
      if (contentBlocks.length > 0)
      {
        items.push({
          type: "message",
          role: role,
          content: contentBlocks
        });
      }
      if (role === "assistant" && Array.isArray(entry.toolCalls))
      {
        var toolCalls = buildOpenAIToolCalls(entry.toolCalls, settings);
        for (var j = 0; j < toolCalls.length; j += 1)
        {
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
  if (items.length === 0)
  {
    var prompt = trim(request && request.prompt);
    if (prompt !== "")
    {
      items.push({
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: prompt }]
      });
    }
  }
  return items;
}

function mergeOpenAIToolCallDelta(accumulator, raw, settings)
{
  if (!Array.isArray(raw))
  {
    return;
  }
  for (var i = 0; i < raw.length; i += 1)
  {
    var item = raw[i];
    if (!item || typeof item !== "object" || Array.isArray(item))
    {
      continue;
    }
    var index = Number(item.index);
    if (!Number.isFinite(index))
    {
      index = 0;
    }
    index = Math.floor(index);
    if (!accumulator[index])
    {
      accumulator[index] = { id: "", name: "", arguments: "", metadata: null };
    }
    var entry = accumulator[index];
    var fn = plainObject(item.function);
    if (trim(item.id) !== "") entry.id = trim(item.id);
    if (trim(fn.name) !== "") entry.name = trim(fn.name);
    if (fn.arguments !== null && fn.arguments !== undefined && String(fn.arguments) !== "") entry.arguments += String(fn.arguments);
    var metadata = extractToolCallMetadata(item, settings);
    if (metadata)
    {
      entry.metadata = Object.assign({}, plainObject(entry.metadata), metadata);
    }
  }
}

function finalizeRuntimeToolCalls(accumulator)
{
  var toolCalls = [];
  if (!Array.isArray(accumulator))
  {
    return toolCalls;
  }
  for (var i = 0; i < accumulator.length; i += 1)
  {
    var item = accumulator[i];
    if (!item || typeof item !== "object" || Array.isArray(item))
    {
      continue;
    }
    var name = trim(item.name);
    if (name === "")
    {
      continue;
    }
    var toolCall = {
      id: trim(item.id),
      name: name,
      arguments: trim(item.arguments) || "{}"
    };
    if (item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata))
    {
      toolCall.metadata = copySchemaValue(item.metadata);
    }
    toolCalls.push(toolCall);
  }
  return toolCalls;
}

function extractRuntimeToolCallsFromChoice(choice, settings)
{
  var toolCalls = [];
  var message = choice && choice.message && typeof choice.message === "object" ? choice.message : null;
  if (!message || !Array.isArray(message.tool_calls))
  {
    return toolCalls;
  }
  for (var i = 0; i < message.tool_calls.length; i += 1)
  {
    var item = message.tool_calls[i];
    var fn = plainObject(item && item.function);
    var name = trim(fn.name);
    if (name === "")
    {
      continue;
    }
    var toolCall = {
      id: trim(item.id),
      name: name,
      arguments: trim(fn.arguments) || "{}"
    };
    var metadata = extractToolCallMetadata(item, settings);
    if (metadata)
    {
      toolCall.metadata = metadata;
    }
    toolCalls.push(toolCall);
  }
  return toolCalls;
}

function readRawField(source, keys)
{
  if (!source || typeof source !== "object" || Array.isArray(source))
  {
    return "";
  }
  for (var i = 0; i < keys.length; i += 1)
  {
    var key = keys[i];
    if (!Object.prototype.hasOwnProperty.call(source, key))
    {
      continue;
    }
    var value = source[key];
    if (value !== null && value !== undefined && String(value) !== "")
    {
      return String(value);
    }
  }
  return "";
}

function readTextFromContent(value)
{
  if (typeof value === "string")
  {
    return value;
  }
  if (!Array.isArray(value))
  {
    return "";
  }
  var text = "";
  for (var i = 0; i < value.length; i += 1)
  {
    var part = value[i];
    if (!part || typeof part !== "object" || Array.isArray(part))
    {
      continue;
    }
    if (trim(part.type) === "text" || trim(part.type) === "output_text")
    {
      text += part.text || "";
    }
  }
  return text;
}

function reasoningDetailsText(value)
{
  if (Array.isArray(value))
  {
    var text = "";
    for (var i = 0; i < value.length; i += 1)
    {
      text += reasoningDetailsText(value[i]);
    }
    return text;
  }
  if (value && typeof value === "object" && !Array.isArray(value))
  {
    return readRawField(value, ["text", "content", "reasoning", "summary"]);
  }
  return "";
}

function readReasoningDetails(value)
{
  if (!value || typeof value !== "object" || Array.isArray(value))
  {
    return [];
  }
  var items = [];
  appendReasoningDetails(items, value.reasoning_details || value.reasoningDetails);
  return items;
}

function buildOpenAICompatibleReasoningParts(reasoningDetails, reasoningText)
{
  var parts = [];
  if (Array.isArray(reasoningDetails) && reasoningDetails.length > 0)
  {
    parts.push({
      kind: "reasoning",
      text: trim(reasoningDetailsText(reasoningDetails)),
      metadata: {
        provider: "openai-compatible",
        openaiCompatible: {
          reasoningDetails: cloneValue(reasoningDetails)
        }
      }
    });
  }
  if (parts.length === 0 && trim(reasoningText) !== "")
  {
    parts.push({ kind: "reasoning", text: trim(reasoningText) });
  }
  return parts;
}

function readDeltaText(delta)
{
  return readRawField(delta, ["content"]);
}

function readDeltaReasoning(delta)
{
  var direct = readRawField(delta, ["reasoning_content", "reasoningContent", "reasoning"]);
  if (direct !== "")
  {
    return direct;
  }
  return reasoningDetailsText(delta && (delta.reasoning_details || delta.reasoningDetails));
}

function readMessageText(message)
{
  return trim(readTextFromContent(message && message.content));
}

function readMessageReasoning(message)
{
  var direct = readRawField(message, ["reasoning_content", "reasoningContent", "reasoning"]);
  if (direct !== "")
  {
    return trim(direct);
  }
  return trim(reasoningDetailsText(message && (message.reasoning_details || message.reasoningDetails)));
}

function mergeCumulativeOrDelta(existing, incoming)
{
  var current = typeof existing === "string" ? existing : "";
  var next = typeof incoming === "string" ? incoming : "";
  if (next === "")
  {
    return { value: current, delta: "" };
  }
  if (current === "")
  {
    return { value: next, delta: next };
  }
  if (next === current)
  {
    return { value: current, delta: "" };
  }
  if (next.indexOf(current) === 0)
  {
    return { value: next, delta: next.slice(current.length) };
  }
  return { value: current + next, delta: next };
}

function emitChunkPart(host, kind, text)
{
  if (!host || !host.stream || typeof host.stream.write !== "function")
  {
    return;
  }
  if (text === null || text === undefined || String(text) === "")
  {
    return;
  }
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

function readFetchChunkText(event)
{
  if (!event || typeof event !== "object" || Array.isArray(event))
  {
    return "";
  }
  if (trim(event.type).toLowerCase() !== "chunk")
  {
    return "";
  }
  if (event.text !== null && event.text !== undefined)
  {
    return String(event.text);
  }
  if (typeof event.value === "string")
  {
    return event.value;
  }
  return "";
}

function createSSEParser(onPayload)
{
  var buffered = "";
  var currentEvent = "";
  var currentData = [];

  function dispatch()
  {
    if (typeof onPayload !== "function")
    {
      currentEvent = "";
      currentData = [];
      return;
    }
    if (currentEvent === "" && currentData.length === 0)
    {
      return;
    }
    var eventName = currentEvent;
    var payloadText = currentData.join("\n");
    currentEvent = "";
    currentData = [];
    onPayload(eventName, payloadText);
  }

  function consumeLine(rawLine)
  {
    var line = String(rawLine || "");
    if (line === "")
    {
      dispatch();
      return;
    }
    if (line.charAt(0) === ":")
    {
      return;
    }
    if (line.indexOf("event:") === 0)
    {
      currentEvent = trim(line.slice(6));
      return;
    }
    if (line.indexOf("data:") === 0)
    {
      var data = line.slice(5);
      if (data.indexOf(" ") === 0)
      {
        data = data.slice(1);
      }
      currentData.push(data);
    }
  }

  return {
    write: function(chunkText)
    {
      if (chunkText === null || chunkText === undefined || String(chunkText) === "")
      {
        return;
      }
      buffered += String(chunkText);
      var newlineIndex = buffered.indexOf("\n");
      while (newlineIndex >= 0)
      {
        var line = buffered.slice(0, newlineIndex);
        if (line.charAt(line.length - 1) === "\r")
        {
          line = line.slice(0, -1);
        }
        consumeLine(line);
        buffered = buffered.slice(newlineIndex + 1);
        newlineIndex = buffered.indexOf("\n");
      }
    },
    finish: function()
    {
      if (buffered !== "")
      {
        var line = buffered;
        if (line.charAt(line.length - 1) === "\r")
        {
          line = line.slice(0, -1);
        }
        consumeLine(line);
        buffered = "";
      }
      dispatch();
    }
  };
}

function createOpenAICompatibleSSEState()
{
  return {
    text: "",
    reasoningText: "",
    reasoningDetails: [],
    toolCallAccumulator: [],
    usage: null,
    finishReason: "",
    model: "",
    error: ""
  };
}

function applyOpenAICompatibleSSEPayload(state, payloadText, host, settings)
{
  var payload = trim(payloadText);
  if (payload === "" || payload === "[DONE]")
  {
    return;
  }
  var event = decodeJsonText(payload, null);
  if (!event || typeof event !== "object" || Array.isArray(event))
  {
    return;
  }
  if (event.error)
  {
    state.error = trim(event.error && event.error.message) || trim(event.error) || "provider request failed";
    return;
  }
  if (trim(event.model) !== "")
  {
    state.model = trim(event.model);
  }
  if (event.usage && typeof event.usage === "object")
  {
    state.usage = normalizeOpenAICompatibleUsage(event.usage);
  }
  if (!Array.isArray(event.choices) || event.choices.length === 0)
  {
    return;
  }
  var first = event.choices[0];
  if (trim(first && first.finish_reason) !== "")
  {
    state.finishReason = trim(first.finish_reason);
  }
  var delta = first && first.delta && typeof first.delta === "object" ? first.delta : null;
  if (!delta)
  {
    return;
  }
  var reasoningChunk = readDeltaReasoning(delta);
  if (reasoningChunk !== "")
  {
    var reasoningMerge = mergeCumulativeOrDelta(state.reasoningText, reasoningChunk);
    state.reasoningText = reasoningMerge.value;
    emitChunkPart(host, "reasoning", reasoningMerge.delta);
  }
  var reasoningDetails = readReasoningDetails(delta);
  if (reasoningDetails.length > 0)
  {
    state.reasoningDetails = reasoningDetails;
  }
  var textChunk = readDeltaText(delta);
  if (textChunk !== "")
  {
    var textMerge = mergeCumulativeOrDelta(state.text, textChunk);
    state.text = textMerge.value;
    emitChunkPart(host, "text", textMerge.delta);
  }
  mergeOpenAIToolCallDelta(state.toolCallAccumulator, delta.tool_calls, settings);
}

function collectResponsesText(response)
{
  if (!response || typeof response !== "object" || Array.isArray(response))
  {
    return "";
  }
  var text = "";
  if (Array.isArray(response.output))
  {
    for (var i = 0; i < response.output.length; i += 1)
    {
      var item = response.output[i];
      if (!item || typeof item !== "object" || Array.isArray(item))
      {
        continue;
      }
      if (trim(item.type) === "message" && Array.isArray(item.content))
      {
        for (var j = 0; j < item.content.length; j += 1)
        {
          var part = item.content[j];
          if (part && typeof part === "object" && trim(part.type) === "output_text")
          {
            text += part.text || "";
          }
        }
      }
      else if (trim(item.type) === "output_text")
      {
        text += item.text || "";
      }
    }
  }
  if (trim(text) !== "")
  {
    return trim(text);
  }
  return readRawField(response, ["output_text", "text", "content"]);
}

function collectResponsesReasoningParts(parts)
{
  if (!Array.isArray(parts))
  {
    return "";
  }
  var text = "";
  for (var i = 0; i < parts.length; i += 1)
  {
    var part = parts[i];
    if (!part || typeof part !== "object" || Array.isArray(part))
    {
      continue;
    }
    var partType = trim(part.type);
    if (partType !== "summary_text" && partType !== "reasoning_summary_text" && partType !== "reasoning_text")
    {
      continue;
    }
    text += part.text || "";
  }
  return trim(text);
}

function collectResponsesReasoningValue(value)
{
  if (Array.isArray(value))
  {
    return collectResponsesReasoningParts(value);
  }
  if (value && typeof value === "object" && !Array.isArray(value))
  {
    return collectResponsesReasoningParts([value]);
  }
  return "";
}

function collectResponsesReasoning(response)
{
  if (!response || typeof response !== "object" || Array.isArray(response))
  {
    return "";
  }
  var reasoningText = "";
  if (Array.isArray(response.output))
  {
    for (var i = 0; i < response.output.length; i += 1)
    {
      var item = response.output[i];
      if (!item || typeof item !== "object" || Array.isArray(item))
      {
        continue;
      }
      var type = trim(item.type);
      if (type === "reasoning")
      {
        reasoningText += collectResponsesReasoningParts(item.summary);
        if (reasoningText === "")
        {
          reasoningText += collectResponsesReasoningParts(item.content);
        }
        continue;
      }
      if (type === "message" && Array.isArray(item.content))
      {
        reasoningText += collectResponsesReasoningParts(item.content);
      }
    }
  }
  if (trim(reasoningText) !== "")
  {
    return trim(reasoningText);
  }
  var topLevel = plainObject(response.reasoning);
  var topLevelSummary = collectResponsesReasoningValue(topLevel.summary);
  if (topLevelSummary !== "")
  {
    return topLevelSummary;
  }
  var topLevelContent = collectResponsesReasoningValue(topLevel.content);
  if (topLevelContent !== "")
  {
    return topLevelContent;
  }
  if ((trim(topLevel.type) === "summary_text" || trim(topLevel.type) === "reasoning_text") && typeof topLevel.text === "string")
  {
    return trim(topLevel.text);
  }
  return "";
}

function collectResponsesReasoningItems(response)
{
  var items = [];
  if (!response || typeof response !== "object" || Array.isArray(response) || !Array.isArray(response.output))
  {
    return items;
  }
  for (var i = 0; i < response.output.length; i += 1)
  {
    var item = response.output[i];
    if (!item || typeof item !== "object" || Array.isArray(item) || trim(item.type) !== "reasoning")
    {
      continue;
    }
    items.push(cloneValue(item));
  }
  return items;
}

function buildXAIResponsesReasoningParts(reasoningItems, reasoningText)
{
  var parts = [];
  if (Array.isArray(reasoningItems))
  {
    for (var i = 0; i < reasoningItems.length; i += 1)
    {
      var item = normalizeResponsesReasoningItem(reasoningItems[i]);
      if (!item)
      {
        continue;
      }
      parts.push({
        kind: "reasoning",
        text: collectResponsesReasoning({ output: [item] }),
        metadata: {
          provider: "xai",
          xai: {
            responses: [item]
          }
        }
      });
    }
  }
  if (parts.length === 0 && trim(reasoningText) !== "")
  {
    parts.push({ kind: "reasoning", text: trim(reasoningText) });
  }
  return parts;
}

function collectResponsesToolCalls(response)
{
  var toolCalls = [];
  if (!response || typeof response !== "object" || Array.isArray(response) || !Array.isArray(response.output))
  {
    return toolCalls;
  }
  for (var i = 0; i < response.output.length; i += 1)
  {
    var item = response.output[i];
    if (!item || typeof item !== "object" || Array.isArray(item) || trim(item.type) !== "function_call")
    {
      continue;
    }
    var name = trim(item.name);
    if (name === "")
    {
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

function mergeCompletedStreamText(current, completed)
{
  var existing = typeof current === "string" ? current : "";
  var next = typeof completed === "string" ? completed : "";
  if (next === "")
  {
    return { value: existing, delta: "" };
  }
  if (existing === "")
  {
    return { value: next, delta: next };
  }
  if (next === existing)
  {
    return { value: existing, delta: "" };
  }
  if (next.indexOf(existing) === 0)
  {
    return { value: next, delta: next.slice(existing.length) };
  }
  return { value: next, delta: "" };
}

function readResponsesOutputTextEvent(event)
{
  if (!event || typeof event !== "object" || Array.isArray(event))
  {
    return { text: "", isDelta: false };
  }
  var type = trim(event.type);
  if (type === "response.output_text.delta")
  {
    return { text: event.delta || "", isDelta: true };
  }
  if (type === "response.output_text.done")
  {
    return { text: event.text || "", isDelta: false };
  }
  if ((type === "response.content_part.added" || type === "response.content_part.done") && event.part && typeof event.part === "object" && !Array.isArray(event.part))
  {
    return { text: collectResponsesText({ output: [{ type: "message", content: [event.part] }] }), isDelta: false };
  }
  if ((type === "response.output_item.added" || type === "response.output_item.done") && event.item && typeof event.item === "object" && !Array.isArray(event.item))
  {
    return { text: collectResponsesText({ output: [event.item] }), isDelta: false };
  }
  if (type === "response.completed" && event.response && typeof event.response === "object")
  {
    return { text: collectResponsesText(event.response), isDelta: false };
  }
  return { text: "", isDelta: false };
}

function readResponsesReasoningEvent(event)
{
  if (!event || typeof event !== "object" || Array.isArray(event))
  {
    return { text: "", isDelta: false };
  }
  var type = trim(event.type);
  if (type === "response.reasoning_summary_text.delta" || type === "response.reasoning_text.delta")
  {
    return { text: event.delta || "", isDelta: true };
  }
  if (type === "response.reasoning_summary_text.done" || type === "response.reasoning_text.done")
  {
    return { text: event.text || "", isDelta: false };
  }
  if ((type === "response.reasoning_summary_part.added" || type === "response.reasoning_summary_part.done" || type === "response.content_part.added" || type === "response.content_part.done") && event.part && typeof event.part === "object" && !Array.isArray(event.part))
  {
    return { text: collectResponsesReasoningParts([event.part]), isDelta: false };
  }
  if ((type === "response.output_item.added" || type === "response.output_item.done") && event.item && typeof event.item === "object" && !Array.isArray(event.item))
  {
    return { text: collectResponsesReasoning({ output: [event.item] }), isDelta: false };
  }
  if (type === "response.completed" && event.response && typeof event.response === "object")
  {
    return { text: collectResponsesReasoning(event.response), isDelta: false };
  }
  return { text: "", isDelta: false };
}

function coerceNonNegativeIndex(value)
{
  var index = Number(value);
  if (!Number.isFinite(index))
  {
    return -1;
  }
  index = Math.floor(index);
  return index < 0 ? -1 : index;
}

function findRuntimeToolCallIndexByRefs(accumulator, refs)
{
  if (!Array.isArray(accumulator))
  {
    return -1;
  }
  var itemID = trim(refs && refs.itemID);
  var callID = trim(refs && refs.callID);
  if (itemID === "" && callID === "")
  {
    return -1;
  }
  for (var i = 0; i < accumulator.length; i += 1)
  {
    var entry = accumulator[i];
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
    {
      continue;
    }
    if (itemID !== "" && trim(entry.itemID) === itemID)
    {
      return i;
    }
    if (callID !== "" && trim(entry.id) === callID)
    {
      return i;
    }
  }
  return -1;
}

function ensureRuntimeToolCallEntry(accumulator, preferredIndex, refs)
{
  if (!Array.isArray(accumulator))
  {
    return null;
  }
  var index = coerceNonNegativeIndex(preferredIndex);
  if (index < 0)
  {
    index = findRuntimeToolCallIndexByRefs(accumulator, refs);
  }
  if (index < 0)
  {
    index = accumulator.length;
  }
  if (!accumulator[index] || typeof accumulator[index] !== "object" || Array.isArray(accumulator[index]))
  {
    accumulator[index] = { id: "", itemID: "", name: "", arguments: "" };
  }
  return accumulator[index];
}

function mergeResponsesToolCallEvent(accumulator, event)
{
  if (!Array.isArray(accumulator) || !event || typeof event !== "object" || Array.isArray(event))
  {
    return;
  }
  var type = trim(event.type);
  var isOutputItemEvent = type === "response.output_item.added" || type === "response.output_item.done";
  if (isOutputItemEvent)
  {
    var item = event.item;
    if (!item || typeof item !== "object" || Array.isArray(item) || trim(item.type) !== "function_call")
    {
      return;
    }
    var itemRefs = {
      itemID: trim(item.id),
      callID: trim(item.call_id || item.callId || event.call_id || event.callId)
    };
    var itemEntry = ensureRuntimeToolCallEntry(accumulator, event.output_index, itemRefs);
    if (!itemEntry)
    {
      return;
    }
    if (itemRefs.callID !== "") itemEntry.id = itemRefs.callID;
    if (itemRefs.itemID !== "") itemEntry.itemID = itemRefs.itemID;
    var itemName = trim(item.name || event.name);
    if (itemName !== "") itemEntry.name = itemName;
    if (item.arguments !== null && item.arguments !== undefined)
    {
      var itemArguments = String(item.arguments);
      if (trim(itemArguments) !== "" && (type === "response.output_item.done" || itemEntry.arguments === ""))
      {
        itemEntry.arguments = itemArguments;
      }
    }
    return;
  }
  var isFunctionArgumentEvent = type === "response.function_call_arguments.delta" || type === "response.function_call_arguments.done";
  if (!isFunctionArgumentEvent)
  {
    return;
  }
  var argumentRefs = {
    itemID: trim(event.item_id || event.itemId),
    callID: trim(event.call_id || event.callId)
  };
  var argumentEntry = ensureRuntimeToolCallEntry(accumulator, event.output_index, argumentRefs);
  if (!argumentEntry)
  {
    return;
  }
  if (argumentRefs.callID !== "") argumentEntry.id = argumentRefs.callID;
  if (argumentRefs.itemID !== "") argumentEntry.itemID = argumentRefs.itemID;
  var argumentName = trim(event.name);
  if (argumentName !== "") argumentEntry.name = argumentName;
  if (type === "response.function_call_arguments.delta")
  {
    if (event.delta !== null && event.delta !== undefined && String(event.delta) !== "")
    {
      argumentEntry.arguments += String(event.delta);
    }
    return;
  }
  if (event.arguments !== null && event.arguments !== undefined && trim(String(event.arguments)) !== "")
  {
    argumentEntry.arguments = String(event.arguments);
  }
}

function createResponsesSSEState()
{
  return {
    text: "",
    reasoningText: "",
    reasoningItems: [],
    toolCallAccumulator: [],
    toolCalls: [],
    usage: null,
    finishReason: "",
    model: "",
    responseId: "",
    error: ""
  };
}

function applyResponsesSSEPayload(state, payloadText, host, settings)
{
  var payload = trim(payloadText);
  if (payload === "" || payload === "[DONE]")
  {
    return;
  }
  var event = decodeJsonText(payload, null);
  if (!event || typeof event !== "object" || Array.isArray(event))
  {
    return;
  }
  if (event.error)
  {
    state.error = extractErrorMessage(settings, payload, settings.providerLabel + " request failed");
    return;
  }
  if (event.usage && typeof event.usage === "object")
  {
    state.usage = normalizeOpenAICompatibleUsage(event.usage);
  }
  if (event.response && typeof event.response === "object" && !Array.isArray(event.response))
  {
    if (trim(event.response.id) !== "") state.responseId = trim(event.response.id);
    if (trim(event.response.model) !== "") state.model = trim(event.response.model);
    if (trim(event.response.status) !== "") state.finishReason = trim(event.response.status);
  }
  if (trim(event.id) !== "") state.responseId = trim(event.id);
  var textEvent = readResponsesOutputTextEvent(event);
  if (textEvent.text !== "")
  {
    if (textEvent.isDelta)
    {
      state.text += textEvent.text;
      emitChunkPart(host, "text", textEvent.text);
    }
    else
    {
      var mergedText = mergeCompletedStreamText(state.text, textEvent.text);
      state.text = mergedText.value;
      emitChunkPart(host, "text", mergedText.delta);
    }
  }
  var reasoningEvent = readResponsesReasoningEvent(event);
  if (reasoningEvent.text !== "")
  {
    if (reasoningEvent.isDelta)
    {
      state.reasoningText += reasoningEvent.text;
      emitChunkPart(host, "reasoning", reasoningEvent.text);
    }
    else
    {
      var mergedReasoning = mergeCompletedStreamText(state.reasoningText, reasoningEvent.text);
      state.reasoningText = mergedReasoning.value;
      emitChunkPart(host, "reasoning", mergedReasoning.delta);
    }
  }
  mergeResponsesToolCallEvent(state.toolCallAccumulator, event);
  if (trim(event.type) === "response.completed" && event.response && typeof event.response === "object")
  {
    state.toolCalls = collectResponsesToolCalls(event.response);
    state.reasoningItems = collectResponsesReasoningItems(event.response);
    state.usage = normalizeOpenAICompatibleUsage(event.response.usage || event.response);
  }
}

function selectedReasoningPreference(request, config)
{
  var effort = trim(request && request.reasoning).toLowerCase();
  if (effort === "none")
  {
    return "none";
  }
  if (effort === "low" || effort === "medium" || effort === "high" || effort === "xhigh")
  {
    return effort;
  }
  effort = trim(request && request.reasoningEffort).toLowerCase();
  if (effort === "none")
  {
    return "none";
  }
  if (effort === "low" || effort === "medium" || effort === "high" || effort === "xhigh")
  {
    return effort;
  }
  effort = trim(config && config.reasoningEffort).toLowerCase();
  if (effort === "none")
  {
    return "none";
  }
  if (effort === "low" || effort === "medium" || effort === "high" || effort === "xhigh")
  {
    return effort;
  }
  return "";
}

function selectedThinkingType(request, config)
{
  var effort = trim(request && request.reasoning).toLowerCase();
  if (effort === "none")
  {
    return "disabled";
  }
  if (effort === "low" || effort === "medium" || effort === "high" || effort === "xhigh")
  {
    return "enabled";
  }
  effort = trim(request && request.reasoningEffort).toLowerCase();
  if (effort === "none")
  {
    return "disabled";
  }
  if (effort === "low" || effort === "medium" || effort === "high" || effort === "xhigh")
  {
    return "enabled";
  }
  var configured = trim(config && config.thinking).toLowerCase();
  if (configured === "enabled" || configured === "disabled")
  {
    return configured;
  }
  var reasoning = selectedReasoningPreference({}, config || {});
  if (reasoning === "none")
  {
    return "disabled";
  }
  if (reasoning !== "")
  {
    return "enabled";
  }
  return "";
}

function resolveModel(settings, request)
{
  var model = trim(request && request.model);
  if (model !== "")
  {
    return model;
  }
  model = trim(settings && settings.llmModel);
  if (model !== "")
  {
    return model;
  }
  return trim(settings && settings.defaultModel);
}

function buildChatPayload(settings, request, host, includeStreamOptions)
{
  var model = resolveModel(settings, request);
  var payload = {
    model: model,
    messages: collectOpenAIMessages(request || {}, host, settings, model),
    stream: true
  };
  if (includeStreamOptions)
  {
    payload.stream_options = { include_usage: true };
  }
  var tools = buildOpenAITools(request || {});
  if (tools.length > 0)
  {
    payload.tools = tools;
    payload.tool_choice = "auto";
  }
  var reasoning = selectedReasoningPreference(request || {}, settings || {});
  if (truthy(settings && settings.supportsReasoningEffort) && reasoning !== "" && reasoning !== "none")
  {
    payload.reasoning_effort = reasoning;
  }
  if (truthy(settings && settings.supportsThinkingType))
  {
    var thinkingType = selectedThinkingType(request || {}, settings || {});
    if (thinkingType !== "")
    {
      payload.thinking = { type: thinkingType };
    }
  }
  if (truthy(settings && settings.reasoningSplit))
  {
    payload.reasoning_split = true;
  }
  return payload;
}

function shouldRetryWithoutStreamOptions(response, rawBody)
{
  var body = trim(rawBody || (response && response.body)).toLowerCase();
  var status = finiteNumber(response && (response.status || response.statusCode));
  return (status === 400 || status === 404 || status === 422 || status === 500) &&
    (body.indexOf("stream_options") >= 0 || body.indexOf("include_usage") >= 0 || body.indexOf("extra fields") >= 0);
}

function streamChatRequest(settings, payload, host)
{
  var rawBody = "";
  var state = createOpenAICompatibleSSEState();
  var parser = createSSEParser(function(_eventName, payloadText)
  {
    applyOpenAICompatibleSSEPayload(state, payloadText, host, settings);
  });
  var response = hostFetch(host, settings, {
    url: chatCompletionsEndpoint(settings),
    method: "POST",
    headers: providerRequestHeaders(settings, true),
    body: JSON.stringify(payload)
  }, function(event)
  {
    var chunkText = readFetchChunkText(event);
    if (chunkText === "")
    {
      return;
    }
    rawBody += chunkText;
    parser.write(chunkText);
  });
  parser.finish();
  return {
    response: response,
    rawBody: rawBody,
    state: state
  };
}

function buildResponsesPayload(settings, request, host, model)
{
  var payload = {
    model: model,
    input: collectResponsesInput(request || {}, host, settings || {}, model),
    stream: true,
    store: false,
    include: ["reasoning.encrypted_content"]
  };
  var tools = buildResponsesTools(request || {});
  if (tools.length > 0)
  {
    payload.tools = tools;
    payload.tool_choice = "auto";
  }
  var reasoning = selectedReasoningPreference(request || {}, settings || {});
  if (reasoning !== "" && reasoning !== "none" && trim(model).toLowerCase().indexOf("multi-agent") >= 0)
  {
    payload.reasoning = { effort: reasoning };
  }
  return payload;
}

function streamResponsesRequest(settings, payload, host)
{
  var rawBody = "";
  var state = createResponsesSSEState();
  var parser = createSSEParser(function(_eventName, payloadText)
  {
    applyResponsesSSEPayload(state, payloadText, host, settings);
  });
  var response = hostFetch(host, settings, {
    url: responsesEndpoint(settings),
    method: "POST",
    headers: providerRequestHeaders(settings, true),
    body: JSON.stringify(payload)
  }, function(event)
  {
    var chunkText = readFetchChunkText(event);
    if (chunkText === "")
    {
      return;
    }
    rawBody += chunkText;
    parser.write(chunkText);
  });
  parser.finish();
  return {
    response: response,
    rawBody: rawBody,
    state: state
  };
}

function extractResponsesOutputFromJSONBody(body, settings)
{
  var parsed = decodeJsonText(body, null);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
  {
    return runtimeError(settings.providerLabel + " returned invalid JSON");
  }
  if (parsed.error)
  {
    return runtimeError(extractErrorMessage(settings, body, settings.providerLabel + " request failed"));
  }
  var response = parsed.response && typeof parsed.response === "object" ? parsed.response : parsed;
  return {
    text: collectResponsesText(response),
    reasoningText: collectResponsesReasoning(response),
    reasoningItems: collectResponsesReasoningItems(response),
    toolCalls: collectResponsesToolCalls(response),
    usage: normalizeOpenAICompatibleUsage(response.usage || parsed.usage || response),
    finishReason: trim(response.status),
    model: trim(response.model),
    responseId: trim(response.id)
  };
}

function extractOutputFromJSONBody(body, settings)
{
  var parsed = decodeJsonText(body, null);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
  {
    return runtimeError("provider returned invalid JSON");
  }
  if (parsed.error)
  {
    return runtimeError(trim(parsed.error && parsed.error.message) || trim(parsed.error) || "provider request failed");
  }
  var text = "";
  var reasoningText = "";
  var reasoningDetails = [];
  var toolCalls = [];
  var finishReason = "";
  if (Array.isArray(parsed.choices) && parsed.choices.length > 0)
  {
    var first = parsed.choices[0];
    finishReason = trim(first && first.finish_reason);
    var message = first && first.message && typeof first.message === "object" ? first.message : null;
    if (message)
    {
      text = readMessageText(message);
      reasoningText = readMessageReasoning(message);
      reasoningDetails = readReasoningDetails(message);
      toolCalls = extractRuntimeToolCallsFromChoice(first, settings);
    }
  }
  return {
    text: trim(text),
    reasoningText: trim(reasoningText),
    reasoningDetails: reasoningDetails,
    toolCalls: toolCalls,
    usage: normalizeOpenAICompatibleUsage(parsed.usage),
    finishReason: finishReason,
    model: trim(parsed.model)
  };
}

function buildRespondOutput(text, reasoningText, reasoningDetails, toolCalls, usage, finishReason, model)
{
  var output = {};
  if (trim(text) !== "") output.text = trim(text);
  if (trim(reasoningText) !== "") output.reasoningText = trim(reasoningText);
  var parts = buildOpenAICompatibleReasoningParts(reasoningDetails, reasoningText);
  if (parts.length > 0) output.parts = parts;
  if (Array.isArray(toolCalls) && toolCalls.length > 0) output.toolCalls = toolCalls;
  if (usage) output.usage = usage;
  if (trim(finishReason) !== "") output.finishReason = trim(finishReason);
  if (trim(model) !== "") output.model = trim(model);
  return output;
}

function buildResponsesRespondOutput(text, reasoningText, reasoningItems, toolCalls, usage, finishReason, model)
{
  var output = {};
  if (trim(text) !== "") output.text = trim(text);
  if (trim(reasoningText) !== "") output.reasoningText = trim(reasoningText);
  var parts = buildXAIResponsesReasoningParts(reasoningItems, reasoningText);
  if (parts.length > 0) output.parts = parts;
  if (Array.isArray(toolCalls) && toolCalls.length > 0) output.toolCalls = toolCalls;
  if (usage) output.usage = usage;
  if (trim(finishReason) !== "") output.finishReason = trim(finishReason);
  if (trim(model) !== "") output.model = trim(model);
  return output;
}

function handleRespond(input, host)
{
  var settings = providerSettings(input);
  if (requiresApiKey(settings) && apiKey(settings) === "")
  {
    return runtimeError(settings.providerLabel + " API key is required");
  }
  if (settings.apiBaseUrl === "")
  {
    return runtimeError(settings.providerLabel + " API base URL is required");
  }
  var request = input && input.request && typeof input.request === "object" ? input.request : {};
  var model = resolveModel(settings, request);
  if (model === "")
  {
    return runtimeError("provider model is required");
  }

  if (truthy(settings && settings.supportsResponsesApi))
  {
    var responsesPayload = buildResponsesPayload(settings, request, host, model);
    var streamedResponses = streamResponsesRequest(settings, responsesPayload, host);
    var responsesResponse = streamedResponses.response;
    if (!responsesResponse || !responsesResponse.ok)
    {
      return runtimeError(extractErrorMessage(settings, streamedResponses.rawBody || (responsesResponse && responsesResponse.body), settings.providerLabel + " request failed"));
    }
    if (streamedResponses.state.error !== "")
    {
      return runtimeError(streamedResponses.state.error);
    }
    var responsesText = trim(streamedResponses.state.text);
    var responsesReasoningText = trim(streamedResponses.state.reasoningText);
    var responsesReasoningItems = Array.isArray(streamedResponses.state.reasoningItems) ? streamedResponses.state.reasoningItems : [];
    var responsesToolCalls = Array.isArray(streamedResponses.state.toolCalls) && streamedResponses.state.toolCalls.length > 0
      ? streamedResponses.state.toolCalls
      : finalizeRuntimeToolCalls(streamedResponses.state.toolCallAccumulator);
    var responsesUsage = normalizeOpenAICompatibleUsage(streamedResponses.state.usage);
    var responsesFinishReason = trim(streamedResponses.state.finishReason);
    var responsesModel = trim(streamedResponses.state.model);
    if (responsesText === "" && responsesReasoningText === "" && responsesToolCalls.length === 0 && streamedResponses.rawBody.indexOf("data:") === -1)
    {
      var extractedResponses = extractResponsesOutputFromJSONBody(streamedResponses.rawBody || (responsesResponse && responsesResponse.body), settings);
      if (extractedResponses && extractedResponses.error)
      {
        return extractedResponses;
      }
      responsesText = trim(extractedResponses.text);
      responsesReasoningText = trim(extractedResponses.reasoningText);
      responsesReasoningItems = Array.isArray(extractedResponses.reasoningItems) ? extractedResponses.reasoningItems : [];
      responsesToolCalls = Array.isArray(extractedResponses.toolCalls) ? extractedResponses.toolCalls : [];
      responsesUsage = normalizeOpenAICompatibleUsage(extractedResponses.usage);
      responsesFinishReason = trim(extractedResponses.finishReason);
      responsesModel = trim(extractedResponses.model);
    }
    if (responsesText === "" && responsesReasoningText === "" && responsesToolCalls.length === 0)
    {
      return runtimeError(settings.providerLabel + " response did not include text, reasoning, or tool calls");
    }
    return { output: buildResponsesRespondOutput(responsesText, responsesReasoningText, responsesReasoningItems, responsesToolCalls, responsesUsage, responsesFinishReason, responsesModel) };
  }

  var payload = buildChatPayload(settings, request, host, true);
  var streamed = streamChatRequest(settings, payload, host);
  if ((!streamed.response || !streamed.response.ok) && shouldRetryWithoutStreamOptions(streamed.response, streamed.rawBody))
  {
    payload = buildChatPayload(settings, request, host, false);
    streamed = streamChatRequest(settings, payload, host);
  }
  var response = streamed.response;
  if (!response || !response.ok)
  {
    return runtimeError(extractErrorMessage(settings, streamed.rawBody || (response && response.body), settings.providerLabel + " request failed"));
  }
  if (streamed.state.error !== "")
  {
    return runtimeError(streamed.state.error);
  }

  var text = trim(streamed.state.text);
  var reasoningText = trim(streamed.state.reasoningText);
  var reasoningDetails = Array.isArray(streamed.state.reasoningDetails) ? streamed.state.reasoningDetails : [];
  var toolCalls = finalizeRuntimeToolCalls(streamed.state.toolCallAccumulator);
  var usage = normalizeOpenAICompatibleUsage(streamed.state.usage);
  var finishReason = streamed.state.finishReason;
  var responseModel = streamed.state.model;

  if (text === "" && reasoningText === "" && toolCalls.length === 0 && streamed.rawBody.indexOf("data:") === -1)
  {
    var extracted = extractOutputFromJSONBody(streamed.rawBody || (response && response.body), settings);
    if (extracted && extracted.error)
    {
      return extracted;
    }
    text = trim(extracted.text);
    reasoningText = trim(extracted.reasoningText);
    reasoningDetails = Array.isArray(extracted.reasoningDetails) ? extracted.reasoningDetails : [];
    toolCalls = Array.isArray(extracted.toolCalls) ? extracted.toolCalls : [];
    usage = normalizeOpenAICompatibleUsage(extracted.usage);
    finishReason = trim(extracted.finishReason);
    responseModel = trim(extracted.model);
  }

  if (text === "" && reasoningText === "" && toolCalls.length === 0)
  {
    return runtimeError(settings.providerLabel + " response did not include text, reasoning, or tool calls");
  }
  return { output: buildRespondOutput(text, reasoningText, reasoningDetails, toolCalls, usage, finishReason, responseModel) };
}

function staticModelItems(settings)
{
  var items = [];
  var seen = {};
  var models = Array.isArray(settings && settings.models) ? settings.models : [];
  for (var i = 0; i < models.length; i += 1)
  {
    var id = trim(models[i] && models[i].id);
    if (id === "" || seen[id])
    {
      continue;
    }
    seen[id] = true;
    var item = { id: id };
    var maxContextTokens = finiteNumber(models[i].maxContextTokens);
    if (maxContextTokens > 0)
    {
      item.maxContextTokens = maxContextTokens;
    }
    items.push(item);
  }
  return items;
}

function staticModelMetadata(settings, modelId)
{
  var id = trim(modelId);
  var models = Array.isArray(settings && settings.models) ? settings.models : [];
  for (var i = 0; i < models.length; i += 1)
  {
    if (trim(models[i] && models[i].id) === id)
    {
      return models[i];
    }
  }
  return {};
}

function modelIdFromEntry(entry)
{
  var id = trim(entry && (entry.id || entry.key || entry.name || entry.model));
  if (id.indexOf("models/") === 0)
  {
    id = id.slice("models/".length);
  }
  return id;
}

function modelContextTokens(entry)
{
  var direct = finiteNumber(
    entry && (
      entry.maxContextTokens ??
      entry.max_context_tokens ??
      entry.max_context_length ??
      entry.maxContextLength ??
      entry.context_length ??
      entry.contextLength ??
      entry.context_window ??
      entry.contextWindow ??
      entry.inputTokenLimit ??
      entry.input_token_limit
    )
  );
  if (direct > 0)
  {
    return direct;
  }
  if (Array.isArray(entry && entry.loaded_instances))
  {
    for (var i = 0; i < entry.loaded_instances.length; i += 1)
    {
      var config = plainObject(entry.loaded_instances[i] && entry.loaded_instances[i].config);
      var loaded = finiteNumber(config.context_length ?? config.contextLength);
      if (loaded > 0)
      {
        return loaded;
      }
    }
  }
  return 0;
}

function supportsGoogleGenerateContent(entry)
{
  var methods = Array.isArray(entry && entry.supportedGenerationMethods) ? entry.supportedGenerationMethods : [];
  for (var i = 0; i < methods.length; i += 1)
  {
    if (trim(methods[i]).toLowerCase() === "generatecontent")
    {
      return true;
    }
  }
  return false;
}

function googleModelIdFromEntry(entry)
{
  return trim(entry && entry.baseModelId) || modelIdFromEntry(entry);
}

function parseModelItems(settings, parsed)
{
  var source = [];
  if (parsed && Array.isArray(parsed.data))
  {
    source = parsed.data;
  }
  else if (parsed && Array.isArray(parsed.models))
  {
    source = parsed.models;
  }
  var items = [];
  var seen = {};
  for (var i = 0; i < source.length; i += 1)
  {
    var entry = source[i] && typeof source[i] === "object" ? source[i] : {};
    var id = modelIdFromEntry(entry);
    if (id === "" || seen[id])
    {
      continue;
    }
    seen[id] = true;
    var item = { id: id };
    var maxContextTokens = modelContextTokens(entry) || finiteNumber(staticModelMetadata(settings, id).maxContextTokens);
    if (maxContextTokens > 0)
    {
      item.maxContextTokens = maxContextTokens;
    }
    items.push(item);
  }
  return items;
}

function parseGoogleNativeModelItems(settings, parsed)
{
  var source = parsed && Array.isArray(parsed.models) ? parsed.models : [];
  var items = [];
  var seen = {};
  for (var i = 0; i < source.length; i += 1)
  {
    var entry = source[i] && typeof source[i] === "object" ? source[i] : {};
    if (!supportsGoogleGenerateContent(entry))
    {
      continue;
    }
    var id = googleModelIdFromEntry(entry);
    if (id === "" || seen[id])
    {
      continue;
    }
    var maxContextTokens = modelContextTokens(entry) || finiteNumber(staticModelMetadata(settings, id).maxContextTokens);
    if (maxContextTokens <= 0)
    {
      continue;
    }
    seen[id] = true;
    items.push({
      id: id,
      maxContextTokens: maxContextTokens
    });
  }
  return items;
}

function mergeModelItems(liveItems, fallbackItems)
{
  var items = [];
  var seen = {};
  var fallbackById = {};
  for (var i = 0; i < fallbackItems.length; i += 1)
  {
    var fallbackItem = fallbackItems[i] && typeof fallbackItems[i] === "object" ? fallbackItems[i] : {};
    var fallbackId = trim(fallbackItem.id);
    if (fallbackId !== "")
    {
      fallbackById[fallbackId] = fallbackItem;
    }
  }
  for (var j = 0; j < liveItems.length; j += 1)
  {
    var liveItem = liveItems[j] && typeof liveItems[j] === "object" ? liveItems[j] : {};
    var id = trim(liveItem.id);
    if (id === "" || seen[id])
    {
      continue;
    }
    seen[id] = true;
    items.push(Object.assign({}, fallbackById[id] || {}, liveItem, { id: id }));
  }
  return items;
}

function handleGoogleModels(settings, host, fallbackItems)
{
  var liveItems = [];
  var nextPageToken = "";
  var pageCount = 0;
  while (pageCount < 10)
  {
    pageCount += 1;
    var response;
    try
    {
      response = hostFetch(host, settings, {
        url: googleNativeModelsEndpoint(settings, nextPageToken),
        method: "GET"
      });
    }
    catch (error)
    {
      return {
        output: {
          items: fallbackItems,
          defaultModel: trim(settings && settings.defaultModel),
          reachable: false,
          reason: normalizeTransportErrorMessage(settings, error && error.message ? error.message : error, settings.providerLabel + " model listing failed")
        }
      };
    }
    if (!response || !response.ok)
    {
      return {
        output: {
          items: fallbackItems,
          defaultModel: trim(settings && settings.defaultModel),
          reachable: false,
          reason: extractErrorMessage(settings, response && response.body, settings.providerLabel + " model listing failed")
        }
      };
    }
    var parsed = decodeJsonText(response.body || "{}", null);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    {
      return {
        output: {
          items: fallbackItems,
          defaultModel: trim(settings && settings.defaultModel),
          reachable: false,
          reason: settings.providerLabel + " returned an invalid model list."
        }
      };
    }
    var pageItems = parseGoogleNativeModelItems(settings, parsed);
    liveItems = mergeModelItems(liveItems.concat(pageItems), []);
    nextPageToken = trim(parsed.nextPageToken);
    if (nextPageToken === "")
    {
      break;
    }
  }
  if (liveItems.length === 0)
  {
    return {
      output: {
        items: fallbackItems,
        defaultModel: trim(settings && settings.defaultModel),
        reachable: false,
        reason: settings.providerLabel + " returned no generateContent models with known context limits."
      }
    };
  }
  return {
    output: {
      items: mergeModelItems(liveItems, fallbackItems),
      defaultModel: trim(settings && settings.defaultModel),
      reachable: true
    }
  };
}

function ollamaModelsEndpoint(settings)
{
  return trim(settings && settings.ollamaBaseUrl).replace(/\/+$/, "") + "/api/tags";
}

function ollamaShowEndpoint(settings)
{
  return trim(settings && settings.ollamaBaseUrl).replace(/\/+$/, "") + "/api/show";
}

function ollamaFallbackContextTokens(settings)
{
  return finiteNumber(
    settings && (
      settings.maxContextTokens ??
      settings.max_context_tokens ??
      settings.contextTokens ??
      settings.context_tokens ??
      settings.contextLength ??
      settings.context_length ??
      settings.defaultMaxContextTokens
    )
  ) || 4096;
}

function ollamaContextFromParameters(parameters)
{
  var text = trim(parameters);
  if (text === "")
  {
    return 0;
  }
  var match = text.match(/(?:^|\n)\s*num_ctx\s+([0-9]+)/i);
  return match ? finiteNumber(match[1]) : 0;
}

function ollamaContextFromModelInfo(modelInfo)
{
  var info = plainObject(modelInfo);
  var keys = Object.keys(info);
  for (var i = 0; i < keys.length; i += 1)
  {
    var key = keys[i];
    if (key.toLowerCase().slice(-15) === ".context_length" || key.toLowerCase() === "context_length")
    {
      var value = finiteNumber(info[key]);
      if (value > 0)
      {
        return value;
      }
    }
  }
  return 0;
}

function ollamaShowContextTokens(settings, host, model)
{
  var response;
  try
  {
    response = hostFetch(host, settings, {
      url: ollamaShowEndpoint(settings),
      method: "POST",
      headers: providerRequestHeaders(settings, true),
      body: JSON.stringify({ model: model })
    });
  }
  catch (_error)
  {
    return 0;
  }
  if (!response || !response.ok)
  {
    return 0;
  }
  var parsed = decodeJsonText(response.body || "{}", null);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
  {
    return 0;
  }
  var configured = ollamaContextFromParameters(parsed.parameters);
  if (configured > 0)
  {
    return configured;
  }
  return ollamaContextFromModelInfo(parsed.model_info || parsed.modelInfo);
}

function enrichOllamaModelItems(settings, host, items)
{
  var fallbackContext = ollamaFallbackContextTokens(settings);
  var list = Array.isArray(items) ? items : [];
  for (var i = 0; i < list.length; i += 1)
  {
    var item = list[i] && typeof list[i] === "object" && !Array.isArray(list[i]) ? list[i] : {};
    if (finiteNumber(item.maxContextTokens) > 0)
    {
      continue;
    }
    var contextTokens = ollamaShowContextTokens(settings, host, trim(item.id));
    item.maxContextTokens = contextTokens > 0 ? contextTokens : fallbackContext;
    list[i] = item;
  }
  return list;
}

function handleOllamaModels(settings, host, fallbackItems)
{
  var response;
  try
  {
    response = hostFetch(host, settings, {
      url: ollamaModelsEndpoint(settings),
      method: "GET"
    });
  }
  catch (error)
  {
    return {
      output: {
        items: fallbackItems,
        defaultModel: trim(settings && settings.defaultModel),
        reachable: false,
        reason: normalizeTransportErrorMessage(settings, error && error.message ? error.message : error, settings.providerLabel + " model listing failed")
      }
    };
  }
  if (!response || !response.ok)
  {
    return {
      output: {
        items: fallbackItems,
        defaultModel: trim(settings && settings.defaultModel),
        reachable: false,
        reason: extractErrorMessage(settings, response && response.body, settings.providerLabel + " model listing failed")
      }
    };
  }
  var parsed = decodeJsonText(response.body || "{}", null);
  var liveItems = enrichOllamaModelItems(settings, host, parseModelItems(settings, parsed));
  if (liveItems.length === 0)
  {
    return {
      output: {
        items: fallbackItems,
        defaultModel: trim(settings && settings.defaultModel),
        reachable: false,
        reason: settings.providerLabel + " returned an empty or unrecognized model list."
      }
    };
  }
  return {
    output: {
      items: mergeModelItems(liveItems, fallbackItems),
      defaultModel: trim(settings && settings.defaultModel),
      reachable: true
    }
  };
}

function unslothStudioStatusEndpoint(settings)
{
  return trim(settings && settings.apiBaseUrl).replace(/\/+$/, "") + "/status";
}

function unslothStudioActiveModel(status)
{
  return trim(status && (status.active_model ?? status.activeModel ?? status.model));
}

function unslothStudioContextTokens(status)
{
  return finiteNumber(
    status && (
      status.max_context_length ??
      status.maxContextLength ??
      status.context_length ??
      status.contextLength ??
      status.native_context_length ??
      status.nativeContextLength
    )
  );
}

function loadUnslothStudioStatus(settings, host)
{
  try
  {
    var response = hostFetch(host, settings, {
      url: unslothStudioStatusEndpoint(settings),
      method: "GET",
      headers: providerRequestHeaders(settings, false)
    });
    if (!response || !response.ok)
    {
      return {};
    }
    var parsed = decodeJsonText(response.body || "{}", null);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  }
  catch (_error)
  {
    return {};
  }
}

function enrichUnslothStudioModelItems(settings, status, items)
{
  var source = Array.isArray(items) ? items : [];
  var list = [];
  var seen = {};
  var activeModel = unslothStudioActiveModel(status);
  var contextTokens = unslothStudioContextTokens(status);
  for (var i = 0; i < source.length; i += 1)
  {
    var item = source[i] && typeof source[i] === "object" && !Array.isArray(source[i]) ? copyObject(source[i]) : {};
    var id = trim(item.id);
    if (id === "" || seen[id])
    {
      continue;
    }
    if (finiteNumber(item.maxContextTokens) <= 0 && contextTokens > 0 && (activeModel === "" || activeModel === id || source.length === 1))
    {
      item.maxContextTokens = contextTokens;
    }
    seen[id] = true;
    list.push(item);
  }
  if (activeModel !== "" && !seen[activeModel])
  {
    var activeItem = { id: activeModel };
    if (contextTokens > 0)
    {
      activeItem.maxContextTokens = contextTokens;
    }
    list.push(activeItem);
  }
  return list;
}

function handleUnslothStudioModels(settings, host, fallbackItems)
{
  var response;
  try
  {
    response = hostFetch(host, settings, {
      url: modelsEndpoint(settings),
      method: "GET",
      headers: providerRequestHeaders(settings, false)
    });
  }
  catch (error)
  {
    return {
      output: {
        items: fallbackItems,
        defaultModel: trim(settings && settings.defaultModel),
        reachable: false,
        reason: normalizeTransportErrorMessage(settings, error && error.message ? error.message : error, settings.providerLabel + " model listing failed")
      }
    };
  }
  if (!response || !response.ok)
  {
    return {
      output: {
        items: fallbackItems,
        defaultModel: trim(settings && settings.defaultModel),
        reachable: false,
        reason: extractErrorMessage(settings, response && response.body, settings.providerLabel + " model listing failed")
      }
    };
  }
  var parsed = decodeJsonText(response.body || "{}", null);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
  {
    return {
      output: {
        items: fallbackItems,
        defaultModel: trim(settings && settings.defaultModel),
        reachable: false,
        reason: settings.providerLabel + " returned an invalid model list."
      }
    };
  }
  var status = loadUnslothStudioStatus(settings, host);
  var liveItems = enrichUnslothStudioModelItems(settings, status, parseModelItems(settings, parsed));
  var activeModel = unslothStudioActiveModel(status);
  var defaultModel = activeModel !== "" ? activeModel : trim(settings && settings.defaultModel);
  if (liveItems.length === 0)
  {
    return {
      output: {
        items: fallbackItems,
        defaultModel: defaultModel,
        reachable: false,
        reason: settings.providerLabel + " returned no loaded models. Load a model in Unsloth Studio, then refresh models."
      }
    };
  }
  return {
    output: {
      items: mergeModelItems(liveItems, fallbackItems),
      defaultModel: defaultModel,
      reachable: true
    }
  };
}

function handleModels(input, host)
{
  var settings = providerSettings(input);
  var fallbackItems = staticModelItems(settings);
  if (requiresApiKey(settings) && apiKey(settings) === "")
  {
    return {
      output: {
        items: fallbackItems,
        defaultModel: trim(settings && settings.defaultModel),
        reachable: false,
        reason: settings.providerLabel + " API key is required for live model listing."
      }
    };
  }
  if (settings.apiBaseUrl === "")
  {
    return {
      output: {
        items: fallbackItems,
        defaultModel: trim(settings && settings.defaultModel),
        reachable: false,
        reason: settings.providerLabel + " API base URL is required."
      }
    };
  }
  var adapter = providerAdapter(settings);
  if (typeof adapter.handleModels === "function")
  {
    return adapter.handleModels(settings, host, fallbackItems);
  }
  var response;
  try
  {
    response = hostFetch(host, settings, {
      url: modelsEndpoint(settings),
      method: "GET",
      headers: providerRequestHeaders(settings, false)
    });
  }
  catch (error)
  {
    return {
      output: {
        items: fallbackItems,
        defaultModel: trim(settings && settings.defaultModel),
        reachable: false,
        reason: normalizeTransportErrorMessage(settings, error && error.message ? error.message : error, settings.providerLabel + " model listing failed")
      }
    };
  }
  if (!response || !response.ok)
  {
    return {
      output: {
        items: fallbackItems,
        defaultModel: trim(settings && settings.defaultModel),
        reachable: false,
        reason: extractErrorMessage(settings, response && response.body, settings.providerLabel + " model listing failed")
      }
    };
  }
  var parsed = decodeJsonText(response.body || "{}", null);
  var liveItems = parseModelItems(settings, parsed);
  if (liveItems.length === 0)
  {
    return {
      output: {
        items: fallbackItems,
        defaultModel: trim(settings && settings.defaultModel),
        reachable: false,
        reason: settings.providerLabel + " returned an empty or unrecognized model list."
      }
    };
  }
  return {
    output: {
      items: mergeModelItems(liveItems, fallbackItems),
      defaultModel: trim(settings && settings.defaultModel),
      reachable: true
    }
  };
}

module.exports = {
  "list-models": function(input, host)
  {
    return handleModels(input || {}, host);
  },
  "respond-text": function(input, host)
  {
    return handleRespond(input || {}, host);
  }
};
