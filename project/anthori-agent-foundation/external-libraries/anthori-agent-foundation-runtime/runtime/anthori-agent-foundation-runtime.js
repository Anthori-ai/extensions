"use strict";

function normalizeString(value) {
  return String(value == null ? "" : value).trim();
}

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === "object") {
    const next = {};
    for (const [key, entry] of Object.entries(value)) next[key] = clone(entry);
    return next;
  }
  return value;
}

function isStreamCancelledError(error) {
  return !!(error && typeof error === "object" && normalizeString(error.code).toLowerCase() === "stream_cancelled");
}

function streamCancelledOutput(error) {
  if (!error || typeof error !== "object") return undefined;
  return Object.prototype.hasOwnProperty.call(error, "output") ? error.output : undefined;
}

function configValue(config, key) {
  if (!config || typeof config !== "object") return undefined;
  return config[key];
}

function configString(config, key) {
  return normalizeString(configValue(config, key));
}

function configNumber(config, key, fallback) {
  const raw = configValue(config, key);
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  return fallback;
}

function finiteNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function hasOverrideValue(value) {
  if (value == null) return false;
  if (typeof value === "string") return normalizeString(value) !== "";
  return true;
}

function payloadProvider(payload) {
  const provider = payload && payload.provider;
  if (!provider || typeof provider !== "object" || Array.isArray(provider)) return {};
  return provider;
}

function providerDefinitionId(provider) {
  return configString(provider, "definitionId");
}

function providerInterfaces(provider) {
  const raw = provider && provider.interfaces;
  return Array.isArray(raw) ? clone(raw) : [];
}

function providerRef(provider) {
  return configString(provider, "ref");
}

function providerConfig(provider) {
  const raw = provider && provider.config;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return clone(raw);
}

function providerRefFromConfig(config) {
  return configString(config, "providerRef");
}

function providerMetaFromPayload(config, payload) {
  const raw = payloadProvider(payload);
  const provider = cloneObject(raw);
  const ref = providerRef(raw) || providerRefFromConfig(config);
  if (ref && !normalizeString(provider.ref)) provider.ref = ref;
  if (!provider.config && config && typeof config === "object" && !Array.isArray(config)) {
    provider.config = clone(config);
  }
  return provider;
}

function cloneObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? clone(value) : {};
}

function withProviderResultMetadata(result, provider) {
  if (!result || typeof result !== "object" || Array.isArray(result)) return result;
  const next = clone(result);
  const ref = providerRef(provider);
  const definitionId = providerDefinitionId(provider);
  const interfaces = providerInterfaces(provider);
  if (ref && !normalizeString(next.providerRef)) next.providerRef = ref;
  if (definitionId && !normalizeString(next.providerDefinitionId)) next.providerDefinitionId = definitionId;
  if (interfaces.length > 0 && !Array.isArray(next.providerInterfaces)) next.providerInterfaces = interfaces;
  return withReasoningProviderSource(next, providerSourceFromProvider(provider, next));
}

function providerSourceFromProvider(provider, result) {
  const config = providerConfig(provider);
  const source = {};
  const ref = providerRef(provider) || providerRefFromConfig(config) || normalizeString(result && result.providerRef);
  const definitionId = providerDefinitionId(provider) || configString(config, "providerDefinitionId") || normalizeString(result && result.providerDefinitionId);
  const model = normalizeString(result && (result.model || result.responseModel)) || normalizeString(config.llmModel);
  if (ref) source.providerRef = ref;
  if (definitionId) source.providerDefinitionId = definitionId;
  if (model) source.model = model;
  return source;
}

function providerSourceFromTarget(target, result) {
  const config = optionalControlObject(target, "config") || {};
  const source = {};
  const ref = configString(config, "providerRef") || normalizeString(result && result.providerRef);
  const definitionId = configString(config, "providerDefinitionId") || normalizeString(result && result.providerDefinitionId);
  const model = normalizeString(result && (result.model || result.responseModel)) || normalizeString(config.llmModel);
  if (ref) source.providerRef = ref;
  if (definitionId) source.providerDefinitionId = definitionId;
  if (model) source.model = model;
  return source;
}

function providerSourceHasValues(source) {
  return !!(source && typeof source === "object" && !Array.isArray(source) &&
    (normalizeString(source.providerRef) || normalizeString(source.providerDefinitionId) || normalizeString(source.model)));
}

function withReasoningProviderSourcePart(part, source) {
  if (!part || typeof part !== "object" || Array.isArray(part)) return part;
  if (normalizeString(part.kind).toLowerCase() !== "reasoning") return part;
  if (!providerSourceHasValues(source)) return part;
  const next = clone(part);
  const metadata = cloneObject(next.metadata);
  const existing = cloneObject(metadata.anthoriProvider);
  if (!normalizeString(existing.providerRef) && normalizeString(source.providerRef)) existing.providerRef = normalizeString(source.providerRef);
  if (!normalizeString(existing.providerDefinitionId) && normalizeString(source.providerDefinitionId)) existing.providerDefinitionId = normalizeString(source.providerDefinitionId);
  if (!normalizeString(existing.model) && normalizeString(source.model)) existing.model = normalizeString(source.model);
  metadata.anthoriProvider = existing;
  next.metadata = metadata;
  return next;
}

function withReasoningProviderSource(result, source) {
  if (!result || typeof result !== "object" || Array.isArray(result) || !providerSourceHasValues(source)) return result;
  if (!Array.isArray(result.parts)) return result;
  const next = clone(result);
  next.parts = result.parts.map((part) => withReasoningProviderSourcePart(part, source));
  return next;
}

function isProviderCallCancelledResult(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return value.cancelled === true;
}

function providerCallCancelledOutput(value) {
  if (!isProviderCallCancelledResult(value)) return undefined;
  return Object.prototype.hasOwnProperty.call(value, "output") ? value.output : undefined;
}

function resolveSpeakerName(config, payload) {
  const nickname = configString(config, "nickname");
  if (nickname) return nickname;
  const control = payload && payload.control && typeof payload.control === "object" ? payload.control : {};
  return normalizeString(control.title);
}

function configControlTargetList(config, key) {
  const raw = configValue(config, key);
  if (!Array.isArray(raw)) return [];
  const result = [];
  for (const entry of raw) {
    if (typeof entry === "string") {
      const targetId = normalizeString(entry);
      if (targetId) {
        result.push(targetId);
      }
      continue;
    }
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }
    const targetId = normalizeString(entry.target);
    if (targetId) {
      result.push(targetId);
    }
  }
  return result;
}

function attachmentTypeFromPathLike(value) {
  const text = normalizeString(value).toLowerCase();
  if (text === "") return "file";
  if (/\.(png|jpe?g|gif|webp|bmp|svg)$/.test(text)) return "image";
  return "file";
}

function attachmentFromValue(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const path = normalizeString(value.path);
  const ref = normalizeString(value.ref);
  const name = normalizeString(value.name) || normalizeString(value.text) || normalizeString(value.label);
  const type = normalizeString(value.type) || attachmentTypeFromPathLike(path || ref || name);
  const mimeType = normalizeString(value.mimeType);
  if (!path && !ref && !name) return null;
  const next = { type };
  if (name) next.name = name;
  if (path) next.path = path;
  if (ref) next.ref = ref;
  if (mimeType) next.mimeType = mimeType;
  return next;
}

function attachmentPartFromValue(value) {
  const attachment = attachmentFromValue(value);
  if (!attachment) return null;
  return {
    kind: "attachment",
    text: attachment.name || attachment.path || attachment.ref || "attachment",
    attachment: clone(attachment),
  };
}

function normalizeMessageParts(parts, attachments) {
  const normalized = [];
  const push = (part) => {
    if (!part || typeof part !== "object" || Array.isArray(part)) return;
    const kind = normalizeString(part.kind) || "text";
    const text = part.text == null ? "" : String(part.text);
    const metadata = part.metadata && typeof part.metadata === "object" && !Array.isArray(part.metadata)
      ? clone(part.metadata)
      : null;
    const attachment = part.attachment && typeof part.attachment === "object" && !Array.isArray(part.attachment)
      ? clone(part.attachment)
      : null;
    const toolCall = part.toolCall && typeof part.toolCall === "object" && !Array.isArray(part.toolCall)
      ? clone(part.toolCall)
      : null;
    const error = part.error && typeof part.error === "object" && !Array.isArray(part.error)
      ? clone(part.error)
      : null;
    if (text === "" && !metadata && !attachment && !toolCall && !error) return;
    const next = { kind: kind, text: text };
    if (metadata) next.metadata = metadata;
    if (attachment) next.attachment = attachment;
    if (toolCall) next.toolCall = toolCall;
    if (error) next.error = error;
    const last = normalized.length > 0 ? normalized[normalized.length - 1] : null;
    const hasStructuredValue = !!(next.attachment || next.toolCall || next.error);
    const lastHasStructuredValue = !!(last && (last.attachment || last.toolCall || last.error));
    if (last && !lastHasStructuredValue && !hasStructuredValue && last.kind === next.kind && JSON.stringify(last.metadata || null) === JSON.stringify(next.metadata || null)) {
      last.text += next.text;
      return;
    }
    normalized.push(next);
  };
  if (Array.isArray(parts)) {
    for (const entry of parts) {
      push(entry);
    }
  }
  if (Array.isArray(attachments)) {
    for (const attachment of attachments) {
      push(attachmentPartFromValue(attachment));
    }
  }
  return normalized;
}

function asMessages(input, label) {
  const sourceLabel = normalizeString(label) || "agent input";
  function normalizeConversationRole(role, fallbackRole) {
    const normalizedRole = normalizeString(role).toLowerCase();
    if (normalizedRole === "assistant") {
      return "agent";
    }
    if (normalizedRole === "user" || normalizedRole === "agent" || normalizedRole === "system" || normalizedRole === "tool") {
      return normalizedRole;
    }
    const fallback = normalizeString(fallbackRole).toLowerCase();
    if (fallback === "assistant") {
      return "agent";
    }
    return fallback || "user";
  }
  function normalizeMessageEntry(entry, fallbackRole) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const role = normalizeConversationRole(entry.role, fallbackRole || "user");
    const parts = normalizeMessageParts(entry.parts, entry.attachments);
    if (parts.length === 0 && !normalizeString(entry.toolCallId)) {
      return null;
    }
    const next = { role };
    if (parts.length > 0) next.parts = parts;
    if (entry.turn != null && Number.isFinite(Number(entry.turn))) next.turn = Number(entry.turn);
    if (entry.participantId) next.participantId = normalizeString(entry.participantId);
    if (entry.toolCallId) next.toolCallId = normalizeString(entry.toolCallId);
    if (entry.name) next.name = normalizeString(entry.name);
    if (entry.speaker) next.speaker = normalizeString(entry.speaker);
    if (entry.usage && typeof entry.usage === "object" && !Array.isArray(entry.usage)) next.usage = clone(entry.usage);
    if (entry.finishReason) next.finishReason = normalizeString(entry.finishReason);
    if (entry.model) next.model = normalizeString(entry.model);
    return next;
  }

  if (Array.isArray(input)) {
    const normalized = input
      .map((entry) => normalizeMessageEntry(entry, "user"))
      .filter(Boolean);
    if (normalized.length === 0) {
      throw new Error(sourceLabel + " must contain at least one message");
    }
    return normalized;
  }
  throw new Error(sourceLabel + " must be a message history array");
}

function isAgentConversationRole(role) {
  const normalizedRole = normalizeString(role).toLowerCase();
  return normalizedRole === "agent" || normalizedRole === "assistant";
}

function withSystemPrompt(messages, systemPrompt) {
  const prompt = normalizeString(systemPrompt);
  if (!prompt) return messages;
  return [{ role: "system", parts: [{ kind: "text", text: prompt }] }, ...messages];
}

function clampMaxContextPercent(value) {
  const parsed = finiteNumber(value, 90);
  if (!Number.isFinite(parsed)) return 90;
  return Math.max(1, Math.min(99, Math.round(parsed)));
}

function resolveMaxContextPercent(config) {
  const direct = configValue(config, "maxContextPercent");
  if (direct !== undefined && direct !== null && direct !== "") {
    return clampMaxContextPercent(direct);
  }
  const legacyReplySpace = configValue(config, "replySpacePercent");
  if (legacyReplySpace !== undefined && legacyReplySpace !== null && legacyReplySpace !== "") {
    return clampMaxContextPercent(100 - finiteNumber(legacyReplySpace, 25));
  }
  const legacyResponseReserve = configValue(config, "responseReservePercent");
  if (legacyResponseReserve !== undefined && legacyResponseReserve !== null && legacyResponseReserve !== "") {
    return clampMaxContextPercent(100 - finiteNumber(legacyResponseReserve, 25));
  }
  return 90;
}

function findProviderModelMetadata(result, modelId) {
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;
  const items = Array.isArray(result.items) ? result.items : [];
  const normalizedModelId = normalizeString(modelId) || normalizeString(result.defaultModel);
  if (!normalizedModelId) {
    return items.length === 1 && items[0] && typeof items[0] === "object" && !Array.isArray(items[0]) ? items[0] : null;
  }
  for (const item of items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    if (normalizeString(item.id) !== normalizedModelId) continue;
    return item;
  }
  return null;
}

function providerModelListHasItems(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) return false;
  return Array.isArray(result.items) && result.items.length > 0;
}

function metadataRequestValue(request) {
  if (!request || typeof request !== "object" || Array.isArray(request)) return null;
  if (!Object.prototype.hasOwnProperty.call(request, "metadata")) return null;
  if (request.metadata !== true) {
    throw new Error("provider metadata request must set metadata to true");
  }
  return request;
}

function buildProviderMetadata(effectiveConfig, provider, metadataRequest, host) {
  const metadata = {
    providerRef: providerRefFromConfig(effectiveConfig) || providerRef(provider),
    providerDefinitionId: configString(effectiveConfig, "providerDefinitionId") || providerDefinitionId(provider),
    providerInterfaces: providerInterfaces(provider),
    model: normalizeString((metadataRequest && metadataRequest.model) || effectiveConfig.llmModel),
  };
  if (metadata.providerInterfaces.length === 0 && Array.isArray(effectiveConfig.providerInterfaces)) {
    metadata.providerInterfaces = clone(effectiveConfig.providerInterfaces);
  }
  if (!(metadata.providerRef || metadata.providerDefinitionId)) {
    throw new Error("provider must be configured before Agent can size Context");
  }
  const models = host.providerRuntime.call({
    providerRef: metadata.providerRef,
    definitionId: metadata.providerDefinitionId,
    config: clone(effectiveConfig),
    action: "listModels",
    payload: {},
  });
  const modelMetadata = findProviderModelMetadata(models, metadata.model);
  const resolvedModel = normalizeString(modelMetadata && modelMetadata.id);
  if (!metadata.model && resolvedModel) {
    metadata.model = resolvedModel;
  }
  const modelListAvailable = Boolean(models && models.reachable === true) || providerModelListHasItems(models);
  if (!modelMetadata && metadata.model && modelListAvailable) {
    throw new Error('model "' + metadata.model + '" is not available from this provider. Pick a model from the provider model list.');
  }
  const maxContextTokens = finiteNumber(modelMetadata && modelMetadata.maxContextTokens, 0);
  if (maxContextTokens <= 0) {
    if (!metadata.model) {
      throw new Error("model must be selected before Agent can size Context");
    }
    throw new Error('provider must expose a context limit for model "' + metadata.model + '" before Agent can size Context');
  }
  metadata.maxContextTokens = maxContextTokens;
  return metadata;
}

function resolveProviderMetadata(providerTarget, host) {
  const invoked = invokeProviderControl(providerTarget, { metadata: true }, host);
  const metadata = invoked && typeof invoked.output === "object" && !Array.isArray(invoked.output) ? invoked.output : null;
  if (!metadata) {
    throw new Error("provider control must return metadata before Agent can size Context");
  }
  const maxContextTokens = finiteNumber(metadata.maxContextTokens, 0);
  if (maxContextTokens <= 0) {
    const model = normalizeString(metadata.model);
    if (!model) {
      throw new Error("provider control must return maxContextTokens before Agent can size Context");
    }
    throw new Error('provider must expose a context limit for model "' + model + '" before Agent can size Context');
  }
  return {
    maxContextTokens: maxContextTokens,
    model: normalizeString(metadata.model),
    providerRef: normalizeString(metadata.providerRef),
    providerDefinitionId: normalizeString(metadata.providerDefinitionId),
    providerInterfaces: Array.isArray(metadata.providerInterfaces) ? clone(metadata.providerInterfaces) : [],
  };
}

function buildContextRequest(messages, phase, round, config, providerContext, host) {
  const request = {
    messages: clone(messages),
    phase: normalizeString(phase) || "initial",
  };
  if (providerContext && typeof providerContext === "object") {
    const maxContextTokens = finiteNumber(providerContext.maxContextTokens, 0);
    if (maxContextTokens > 0) {
      const maxContextPercent = resolveMaxContextPercent(config);
      const availableInputTokens = Math.max(0, Math.floor(maxContextTokens * (maxContextPercent / 100)));
      request.maxChars = availableInputTokens * 4;
    }
  }
  return request;
}

function availableInputCharsForProviderContext(providerContext, config) {
  if (!providerContext || typeof providerContext !== "object") return 0;
  const maxContextTokens = finiteNumber(providerContext.maxContextTokens, 0);
  if (maxContextTokens <= 0) return 0;
  const maxContextPercent = resolveMaxContextPercent(config);
  const availableInputTokens = Math.max(0, Math.floor(maxContextTokens * (maxContextPercent / 100)));
  return availableInputTokens * 4;
}

function estimateMessageChars(message) {
  if (!message || typeof message !== "object" || Array.isArray(message)) return 0;
  let total = 0;
  total += normalizeString(message.role).length;
  total += normalizeString(message.name).length;
  total += normalizeString(message.speaker).length;
  total += normalizeString(message.toolCallId).length;
  total += normalizeString(message.finishReason).length;
  total += normalizeString(message.model).length;
  if (message.usage && typeof message.usage === "object" && !Array.isArray(message.usage)) {
    total += JSON.stringify(message.usage).length;
  }
  if (Array.isArray(message.parts)) {
    for (const part of message.parts) {
      if (!part || typeof part !== "object" || Array.isArray(part)) continue;
      total += normalizeString(part.kind).length;
      if (part.text != null) total += String(part.text).length;
      if (part.metadata && typeof part.metadata === "object" && !Array.isArray(part.metadata)) {
        total += JSON.stringify(part.metadata).length;
      }
      if (part.attachment && typeof part.attachment === "object" && !Array.isArray(part.attachment)) {
        total += JSON.stringify(part.attachment).length;
      }
      if (part.toolCall && typeof part.toolCall === "object" && !Array.isArray(part.toolCall)) {
        total += JSON.stringify(part.toolCall).length;
      }
      if (part.error && typeof part.error === "object" && !Array.isArray(part.error)) {
        total += JSON.stringify(part.error).length;
      }
    }
  }
  return total;
}

function estimateToolDefinitionChars(definition) {
  if (!definition || typeof definition !== "object" || Array.isArray(definition)) return 0;
  let total = 0;
  total += normalizeString(definition.id).length;
  total += normalizeString(definition.title).length;
  total += normalizeString(definition.name).length;
  total += normalizeString(definition.description).length;
  if (definition.parameters && typeof definition.parameters === "object" && !Array.isArray(definition.parameters)) {
    total += JSON.stringify(definition.parameters).length;
  }
  return total;
}

function validateProviderRequestBudget(messages, toolDefinitions, config, providerContext) {
  const availableChars = availableInputCharsForProviderContext(providerContext, config);
  if (availableChars <= 0) return;

  const systemPromptChars = configString(config, "systemPrompt").length;
  const messageChars = Array.isArray(messages)
    ? messages.reduce((sum, message) => sum + estimateMessageChars(message), 0)
    : 0;
  const tools = Array.isArray(toolDefinitions) ? toolDefinitions : [];
  const toolChars = tools.reduce((sum, definition) => sum + estimateToolDefinitionChars(definition), 0);
  const estimatedChars = systemPromptChars + messageChars + toolChars;

  if (estimatedChars <= availableChars) return;

  const details = [];
  if (systemPromptChars > 0) details.push("system prompt " + systemPromptChars + " chars");
  if (messageChars > 0) details.push("messages " + messageChars + " chars");
  if (tools.length > 0) details.push(tools.length + " tools " + toolChars + " chars");

  const maxContextTokens = finiteNumber(providerContext && providerContext.maxContextTokens, 0);
  const model = normalizeString(providerContext && providerContext.model);
  let suffix = ".";
  if (details.length > 0) {
    suffix = " Current breakdown: " + details.join(", ") + ".";
  }
  throw new Error(
    "Agent request exceeds configured provider context budget before generation. Estimated prompt size is about " +
      estimatedChars + " chars, but the current input budget is about " + availableChars + " chars" +
      (maxContextTokens > 0 ? " for a " + maxContextTokens + "-token provider context" : "") +
      (model ? ' on model "' + model + '"' : "") +
      ". System prompt, current context messages, and tool definitions all count toward the provider input budget." +
      suffix +
      " Reduce tool surface or system prompt, or raise the provider context length."
  );
}

function resolveContextMessages(messages, phase, round, config, providerContext, host) {
  const contextControl = configString(config, "contextControl");
  if (!contextControl) return messages;
  const invoked = host.graph.invoke({
    controlId: contextControl,
    input: buildContextRequest(messages, phase, round, config, providerContext, host),
  });
  if (!invoked || !invoked.ok) {
    throw new Error(normalizeString(invoked && invoked.error && invoked.error.message) || "context control failed");
  }
  return asMessages(invoked.output, "context control output");
}

function appendHistoryMessages(messages, config, host) {
  const historyControl = configString(config, "historyControl");
  if (!historyControl) return;
  if (!Array.isArray(messages) || messages.length === 0) return;
  let normalized = null;
  try {
    normalized = asMessages(messages, "history messages");
  } catch (error) {
    if (normalizeString(error && error.message) === "history messages must contain at least one message") {
      return;
    }
    throw error;
  }
  // Agent owns durable message creation. Writing only the new round messages
  // here fixes the duplicated-history loop that happened when graphs were
  // forced to persist full context arrays inside Context itself.
  const invoked = host.graph.invoke({
    controlId: historyControl,
    input: clone(normalized),
  });
  if (!invoked || !invoked.ok) {
    throw new Error(normalizeString(invoked && invoked.error && invoked.error.message) || "history control failed");
  }
}

function invokeTargetControl(target, input, host, options) {
  const invokeControlId = targetInvokeControlID(target);
  if (!invokeControlId) {
    throw new Error("target invoke control id unavailable");
  }
  return graphInvoke(
    invokeControlId,
    targetInvokeInput(target, input),
    host,
    options,
  );
}

function invokeProviderControl(providerTarget, request, host) {
  const invoked = invokeTargetControl(providerTarget, request, host, {
    // Request output metadata explicitly so provider-side runtime metadata such
    // as streamWrote stays separate from input fields and survives wrappers.
    metadata: true,
  });
  if (!invoked || !invoked.ok) {
    throw new Error(normalizeString(invoked && invoked.error && invoked.error.message) || "provider control failed");
  }
  const invokedOutput = invoked && typeof invoked.output === "object" && invoked.output && !Array.isArray(invoked.output)
    ? invoked.output
    : null;
  const providerOutput = invokedOutput && Object.prototype.hasOwnProperty.call(invokedOutput, "value")
    ? clone(invokedOutput.value)
    : invoked.output;
  const providerSource = providerSourceFromTarget(providerTarget, providerOutput);
  return {
    output: withReasoningProviderSource(providerOutput, providerSource),
    metadata: invokedOutput && Object.prototype.hasOwnProperty.call(invokedOutput, "metadata")
      ? cloneObject(invokedOutput.metadata)
      : null,
    providerSource: providerSource,
  };
}

function definitionSupportsPulling(definition) {
  if (definition && typeof definition === "object" && typeof definition.supportsPulling === "boolean") {
    return definition.supportsPulling;
  }
  const capabilities = Array.isArray(definition && definition.capabilities) ? definition.capabilities : [];
  for (let index = 0; index < capabilities.length; index += 1) {
    if (normalizeString(capabilities[index]).toLowerCase() === "pullable") {
      return true;
    }
  }
  const contracts = definition && definition.contracts && typeof definition.contracts === "object" && !Array.isArray(definition.contracts)
    ? definition.contracts
    : null;
  const caller = contracts && contracts.caller && typeof contracts.caller === "object" && !Array.isArray(contracts.caller)
    ? contracts.caller
    : null;
  const variants = Array.isArray(caller && caller.contracts) ? caller.contracts : [];
  let hasStart = false;
  let hasStep = false;
  let hasCancel = false;
  for (const variant of variants) {
    const id = normalizeString(variant && variant.id).toLowerCase();
    if (id === "start") hasStart = true;
    if (id === "step") hasStep = true;
    if (id === "cancel") hasCancel = true;
  }
  return hasStart && hasStep && hasCancel;
}

function controlSupportsPulling(controlId, host) {
  try {
    const info = graphControlInfo(controlId, host);
    return definitionSupportsPulling(info);
  } catch (_error) {
    return false;
  }
}

function targetSupportsPulling(target, host) {
  if (target && typeof target === "object" && !Array.isArray(target)) {
    const hasTargetPullingHints = Array.isArray(target.capabilities)
      || (target.contracts && typeof target.contracts === "object" && !Array.isArray(target.contracts))
      || typeof target.controlRef === "string"
      || typeof target.baseControlRef === "string";
    if (hasTargetPullingHints) {
      return definitionSupportsPulling(target);
    }
  }
  return controlSupportsPulling(targetInvokeControlID(target), host);
}

function singletonToolSchemaValue(schema) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return undefined;
  if (Object.prototype.hasOwnProperty.call(schema, "const")) {
    return clone(schema.const);
  }
  if (Array.isArray(schema.enum) && schema.enum.length === 1) {
    return clone(schema.enum[0]);
  }
  return undefined;
}

function callerContractLifecycleInfo(variant) {
  const input = variant && variant.input && typeof variant.input === "object" && !Array.isArray(variant.input)
    ? variant.input
    : null;
  const properties = input && input.properties && typeof input.properties === "object" && !Array.isArray(input.properties)
    ? input.properties
    : null;
  if (!properties) return null;
  const pull = normalizeString(singletonToolSchemaValue(properties.pull)).toLowerCase();
  if (pull === "start" || pull === "step" || pull === "cancel") {
    return { transport: "pull", phase: pull };
  }
  const push = normalizeString(singletonToolSchemaValue(properties.push)).toLowerCase();
  if (push === "start" || push === "step" || push === "end" || push === "cancel") {
    return { transport: "push", phase: push };
  }
  return null;
}

function callerContractIsProviderToolVisible(variant) {
  if (!variant || typeof variant !== "object" || Array.isArray(variant)) return false;
  if (variant.toolVisible !== false) return true;
  return !!callerContractLifecycleInfo(variant);
}

function explicitPullStartInput(input, ownerInvocationId) {
  const start = {
    pull: "start",
    ownerInvocationId: normalizeString(ownerInvocationId),
  };
  if (Array.isArray(input)) {
    start.messages = clone(input);
    return start;
  }
  if (!input || typeof input !== "object") {
    start.input = clone(input);
    return start;
  }
  const payload = clone(input);
  delete payload.pull;
  delete payload.taskId;
  delete payload.ownerInvocationId;
  delete payload.reason;
  return Object.assign(start, payload);
}

const defaultPullLoopDelayMs = 100;

function projectPullLoopDelayMs(host) {
  const raw = host && host.project ? finiteNumber(host.project.pullInterval, defaultPullLoopDelayMs) : defaultPullLoopDelayMs;
  return raw >= 0 ? raw : 0;
}

function explicitPullStepInput(taskId) {
  return {
    pull: "step",
    taskId: normalizeString(taskId),
  };
}

function explicitPullCancelInput(taskId, reason) {
  const input = {
    pull: "cancel",
    taskId: normalizeString(taskId),
  };
  if (normalizeString(reason)) input.reason = normalizeString(reason);
  return input;
}

function invokeControlPullStart(target, input, ownerInvocationId, host) {
  return invokeTargetControl(target, explicitPullStartInput(input, ownerInvocationId), host);
}

function invokeControlPullStep(target, taskId, host) {
  return invokeTargetControl(target, explicitPullStepInput(taskId), host);
}

function delayPullLoop(host) {
  if (!host || !host.execution || typeof host.execution.delay !== "function") {
    return;
  }
  // Purposeful: pull start no longer advertises cadence. The caller side owns
  // pulling pace entirely and uses the current project's configured interval.
  host.execution.delay(projectPullLoopDelayMs(host));
}

function invokeControlPullCancel(target, taskId, reason, host) {
  return invokeTargetControl(target, explicitPullCancelInput(taskId, reason), host);
}

function pullInvokeOutput(invoked) {
  if (!invoked || !invoked.ok) {
    throw new Error(normalizeString(invoked && invoked.error && invoked.error.message) || "pullable control failed");
  }
  return invoked.output && typeof invoked.output === "object" && !Array.isArray(invoked.output)
    ? clone(invoked.output)
    : {};
}

function pullResultValue(result, keys) {
  if (!result || typeof result !== "object" || Array.isArray(result)) return undefined;
  // Attached-task results can cross the JS bridge as Go-exported structs, which
  // exposes PascalCase fields like TaskID/Status instead of taskId/status. Keep
  // both shapes accepted here so Agent stays on the pull path and does not
  // silently fall back to a direct long-running provider invoke.
  for (let index = 0; index < keys.length; index += 1) {
    const key = normalizeString(keys[index]);
    if (!key) continue;
    if (Object.prototype.hasOwnProperty.call(result, key)) {
      return result[key];
    }
  }
  return undefined;
}

function pullResultString(result, keys) {
  return normalizeString(pullResultValue(result, keys));
}

function pullResultBoolean(result, keys) {
  const value = pullResultValue(result, keys);
  if (typeof value === "boolean") return value;
  return normalizeString(value).toLowerCase() === "true";
}

function pullResultNumber(result, keys) {
  const value = pullResultValue(result, keys);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function pullResultData(result, keys) {
  const value = pullResultValue(result, keys);
  return value === undefined ? undefined : clone(value);
}

function pullResultHasKey(result, keys) {
  if (!result || typeof result !== "object" || Array.isArray(result)) return false;
  for (let index = 0; index < keys.length; index += 1) {
    const key = normalizeString(keys[index]);
    if (key && Object.prototype.hasOwnProperty.call(result, key)) {
      return true;
    }
  }
  return false;
}

function requirePullTaskID(result, action, expectedTaskId) {
  const taskId = pullResultString(result, ["taskId", "TaskID"]);
  if (!taskId) {
    throw new Error("pull " + action + " must return taskId");
  }
  if (expectedTaskId && taskId !== expectedTaskId) {
    throw new Error("pull " + action + " returned mismatched taskId");
  }
  return taskId;
}

function cancelPullTask(target, taskId, reason, host) {
  if (!taskId) return;
  try {
    pullInvokeOutput(invokeControlPullCancel(target, taskId, reason, host));
  } catch (_error) {}
}

function normalizePullStepEvent(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;
  // Pull now returns at most one event per round. Normalize the top-level
  // phase/content fields here so Agent consumes the same explicit lifecycle
  // model regardless of whether the bridge exposed Go-style PascalCase names.
  const normalized = {};
  const sequence = pullResultNumber(result, ["sequence", "Sequence"]);
  if (sequence !== undefined) normalized.sequence = sequence;
  const phase = normalizeString(pullResultValue(result, ["phase", "Phase"])).toLowerCase();
  if (phase === "chunk" || phase === "end" || phase === "error" || phase === "cancel") {
    normalized.phase = phase;
  }
  const reason = normalizeString(pullResultValue(result, ["reason", "Reason"]));
  if ((phase === "error" || phase === "cancel") && reason) {
    normalized.reason = reason;
  }
  const content = pullResultData(result, ["content", "Content"]);
  if (content !== undefined) normalized.content = content;
  const metadata = pullResultValue(result, ["metadata", "Metadata"]);
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    normalized.metadata = clone(metadata);
  }
  return normalized;
}

function normalizeAttachedTaskStepOutput(result, requestedTaskId) {
  const normalizedResult = result && typeof result === "object" && !Array.isArray(result)
    ? result
    : null;
  if (!normalizedResult) {
    throw new Error("pull step must return an object");
  }
  const taskId = pullResultString(normalizedResult, ["taskId", "TaskID"]);
  if (!taskId) {
    throw new Error("pull step must return taskId");
  }
  if (normalizeString(requestedTaskId) && taskId !== normalizeString(requestedTaskId)) {
    throw new Error("pull step returned mismatched taskId");
  }
  const next = {
    taskId: taskId,
  };
  const sequence = pullResultNumber(normalizedResult, ["sequence", "Sequence"]);
  if (sequence !== undefined) next.sequence = sequence;
  const phase = normalizeString(pullResultValue(normalizedResult, ["phase", "Phase"])).toLowerCase();
  if (phase === "chunk" || phase === "end" || phase === "error" || phase === "cancel") {
    next.phase = phase;
  }
  const reason = normalizeString(pullResultValue(normalizedResult, ["reason", "Reason"]));
  if ((phase === "error" || phase === "cancel") && reason) {
    next.reason = reason;
  }
  if (pullResultHasKey(normalizedResult, ["content", "Content"])) {
    next.content = pullResultData(normalizedResult, ["content", "Content"]);
  }
  const metadata = pullResultValue(normalizedResult, ["metadata", "Metadata"]);
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    next.metadata = clone(metadata);
  }
  return next;
}

function isTerminalPullPhase(phase) {
  return phase === "end" || phase === "error" || phase === "cancel";
}

function pullTerminalMessage(event, fallback) {
  if (!event || typeof event !== "object") return fallback;
  const reason = normalizeString(event.reason);
  if (reason) return reason;
  return fallback;
}

function normalizeToolArguments(raw) {
  const text = normalizeString(raw);
  if (!text) return null;
  const parsed = JSON.parse(text);
  if (parsed == null) return null;
  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("tool arguments must decode to an object");
  }
  return parsed;
}

function isVoidInputSchema(input) {
  return !!input && typeof input === "object" && !Array.isArray(input) && normalizeString(input.type) === "void";
}

function isEmptyPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0;
}

function normalizeGraphInvokeArgs(input, definition) {
  if (!definition || definition.expectsVoidInput !== true) {
    return clone(input);
  }
  if (input == null || isEmptyPlainObject(input)) {
    return null;
  }
  return clone(input);
}

function normalizeToolName(value) {
  const text = normalizeString(value).toLowerCase();
  if (!text) return "";
  return text.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function buildToolTransportName(controlId, title, contractId) {
  const label = normalizeToolName(title) || "tool";
  const variant = normalizeToolName(contractId);
  const id = normalizeToolName(controlId) || "control";
  // Keep provider-visible tool names inside OpenAI-compatible function-name
  // constraints: underscores/dashes only and a hard max length of 64 chars.
  const suffix = variant ? "__" + variant + "__" + id : "__" + id;
  const maxLength = 64;
  let prefix = label;
  if (prefix.length + suffix.length > maxLength) {
    prefix = prefix.slice(0, Math.max(1, maxLength - suffix.length)).replace(/_+$/g, "");
  }
  if (!prefix) prefix = "tool";
  return prefix + suffix;
}

function graphControlInfo(controlId, host) {
  if (!host || !host.graph || typeof host.graph.control !== "function") {
    throw new Error("host.graph.control unavailable");
  }
  const info = host.graph.control(controlId);
  if (!info || typeof info !== "object" || Array.isArray(info)) {
    throw new Error("graph control info unavailable for " + normalizeString(controlId));
  }
  return info;
}

function graphInvoke(controlId, input, host, options) {
  if (!host || !host.graph || typeof host.graph.invoke !== "function") {
    throw new Error("host.graph.invoke unavailable");
  }
  const request = {
    controlId: controlId,
    input: clone(input),
  };
  if (options && options.fields && typeof options.fields === "object" && !Array.isArray(options.fields)) {
    request.fields = clone(options.fields);
  }
  if (options && options.details === true) {
    request.details = true;
  }
  if (options && options.metadata === true) {
    request.metadata = true;
  }
  if (options && options.quiet === true) {
    request.quiet = true;
  }
  return host.graph.invoke(request);
}

function graphInvokeOutput(invoked, fallback) {
  if (!invoked || invoked.ok !== true) {
    throw new Error(normalizeString(invoked && invoked.error && invoked.error.message) || normalizeString(invoked && invoked.error) || normalizeString(fallback) || "graph invoke failed");
  }
  return Object.prototype.hasOwnProperty.call(invoked, "output") ? clone(invoked.output) : undefined;
}

function signalCheckResult(value) {
  if (value === false || value == null) {
    return { ready: false };
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const readyKey = Object.prototype.hasOwnProperty.call(value, "ready")
      ? "ready"
      : Object.prototype.hasOwnProperty.call(value, "Ready")
        ? "Ready"
        : "";
    if (readyKey) {
      const ready = value[readyKey] === true || normalizeString(value[readyKey]).toLowerCase() === "true";
      const valueKey = Object.prototype.hasOwnProperty.call(value, "value")
        ? "value"
        : Object.prototype.hasOwnProperty.call(value, "Value")
          ? "Value"
          : "";
      return {
        ready: ready,
        value: valueKey ? clone(value[valueKey]) : undefined,
      };
    }
  }
  return {
    ready: true,
    value: value === true ? true : clone(value),
  };
}

function normalizeAgentSignalEvent(bindingId, targetId, raw) {
  const base = {
    id: normalizeString(targetId),
    alias: normalizeString(bindingId),
  };
  const wrapped = clone(base);
  wrapped.value = raw && typeof raw === "object" && !Array.isArray(raw) ? clone(raw) : raw;
  return wrapped;
}

function probeAgentSignalControl(controlId, host) {
  const output = graphInvokeOutput(
    graphInvoke(controlId, { action: "probe" }, host, { quiet: true }),
    "signal probe failed",
  );
  return signalCheckResult(output).ready;
}

function consumeAgentSignalControl(bindingId, targetId, host) {
  const output = graphInvokeOutput(
    graphInvoke(targetId, { action: "check" }, host),
    "signal check failed",
  );
  const result = signalCheckResult(output);
  if (!result.ready) {
    return null;
  }
  return normalizeAgentSignalEvent(bindingId, targetId, result.value);
}

function configuredSignalEntries(config) {
  return scriptHookConfigEntries(configValue(config, "signals"));
}

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const agentSignalScriptCache = new Map();
const agentMessageScriptCache = new Map();

function compileAgentSignalScript(source, asyncEnabled) {
  const key = String(asyncEnabled ? "async:" : "sync:") + source;
  if (agentSignalScriptCache.has(key)) {
    return agentSignalScriptCache.get(key);
  }
  const wrappedSource = `with ({ signal: __anthoriSignal, context: __anthoriContext, alert: __anthoriAlert }) {\n${source}\n}`;
  const compiled = asyncEnabled
    ? new AsyncFunction("__anthoriSignal", "__anthoriContext", "__anthoriAlert", wrappedSource)
    : new Function("__anthoriSignal", "__anthoriContext", "__anthoriAlert", wrappedSource);
  agentSignalScriptCache.set(key, compiled);
  return compiled;
}

function compileAgentMessageScript(source, asyncEnabled) {
  const key = String(asyncEnabled ? "async:" : "sync:") + source;
  if (agentMessageScriptCache.has(key)) {
    return agentMessageScriptCache.get(key);
  }
  const wrappedSource = `with ({ message: __anthoriMessage, context: __anthoriContext, alert: __anthoriAlert }) {\n${source}\n}`;
  const compiled = asyncEnabled
    ? new AsyncFunction("__anthoriMessage", "__anthoriContext", "__anthoriAlert", wrappedSource)
    : new Function("__anthoriMessage", "__anthoriContext", "__anthoriAlert", wrappedSource);
  agentMessageScriptCache.set(key, compiled);
  return compiled;
}

function normalizeAgentSignalMessages(value) {
  if (!Array.isArray(value)) {
    throw new Error("Agent On Signal messages must be a Message[] array");
  }
  return asMessages(value, "Agent On Signal messages");
}

function normalizeAgentMessageSource(value) {
  const source = normalizeString(value).toLowerCase();
  if (source === "input" || source === "signal" || source === "tool") {
    return source;
  }
  throw new Error('Agent On Message source must be "input", "signal", or "tool"');
}

function normalizeAgentMessageTool(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Agent On Message tool must be an object");
  }
  const normalized = {};
  const id = normalizeString(value.id);
  if (id) normalized.id = id;
  const name = normalizeString(value.name);
  if (name) normalized.name = name;
  const toolCallId = normalizeString(value.toolCallId);
  if (toolCallId) normalized.toolCallId = toolCallId;
  return normalized;
}

function normalizeAgentMessageEntry(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Agent On Message input must be an object");
  }
  const normalized = {
    source: normalizeAgentMessageSource(value.source),
    messages: asMessages(value.messages, "Agent On Message messages"),
  };
  if (Object.prototype.hasOwnProperty.call(value, "signal")) {
    const signal = value.signal;
    if (!signal || typeof signal !== "object" || Array.isArray(signal)) {
      throw new Error("Agent On Message signal must be an object");
    }
    normalized.signal = normalizeAgentSignalEvent(signal.alias, signal.id, signal.value);
  }
  if (Object.prototype.hasOwnProperty.call(value, "tool")) {
    normalized.tool = normalizeAgentMessageTool(value.tool);
  }
  return normalized;
}

function normalizeAgentSignalDecision(value) {
  if (value == null) {
    return { action: "ignore" };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Agent On Signal must return an object");
  }
  const action = normalizeString(value.action).toLowerCase();
  switch (action) {
    case "":
    case "ignore":
      return { action: "ignore" };
    case "queue":
    case "interrupt":
      return {
        action: action,
        messages: normalizeAgentSignalMessages(value.messages),
      };
    case "cancel":
      return {
        action: "cancel",
        reason: normalizeString(value.reason),
      };
    default:
      throw new Error('Agent On Signal action must be "ignore", "queue", "interrupt", or "cancel"');
  }
}

function normalizeAgentMessageDecision(value) {
  if (value == null) {
    return { action: "pass" };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Agent On Message must return an object");
  }
  const action = normalizeString(value.action).toLowerCase();
  switch (action) {
    case "":
    case "pass":
      return { action: "pass" };
    case "replace":
      return {
        action: "replace",
        messages: asMessages(value.messages, "Agent On Message replacement messages"),
      };
    case "drop":
      return { action: "drop" };
    case "cancel":
      return {
        action: "cancel",
        reason: normalizeString(value.reason),
      };
    default:
      throw new Error('Agent On Message action must be "pass", "replace", "drop", or "cancel"');
  }
}

async function runAgentSignalScript(currentControlId, config, signal, state, host) {
  const source = configString(config, "onSignal");
  if (!source) {
    return { action: "ignore" };
  }
  const asyncEnabled = configValue(config, "onSignalAsync") === true;
  const context = buildAgentHookContext(currentControlId, config, state, host);
  const alertFn = function(message) {
    if (!host || !host.debug || typeof host.debug.alert !== "function") {
      return;
    }
    host.debug.alert(message, {
      scriptKey: "onSignal",
      direction: "signal",
    });
  };
  let output;
  try {
    const runner = compileAgentSignalScript(source, asyncEnabled);
    output = runner(signal, context, alertFn);
  } catch (error) {
    throw new Error("Agent On Signal failed: " + (normalizeString(error && error.message) || String(error)));
  }
  if (!asyncEnabled && output && typeof output.then === "function") {
    throw new Error("Agent On Signal returned a Promise; enable Await On Signal");
  }
  try {
    return normalizeAgentSignalDecision(asyncEnabled ? await output : output);
  } catch (error) {
    throw new Error("Agent On Signal failed: " + (normalizeString(error && error.message) || String(error)));
  }
}

async function runAgentMessageScript(currentControlId, config, message, state, host) {
  const normalizedMessage = normalizeAgentMessageEntry(message);
  const source = configString(config, "onMessage");
  if (!source) {
    return normalizedMessage.messages;
  }
  const asyncEnabled = configValue(config, "onMessageAsync") === true;
  const context = buildAgentHookContext(currentControlId, config, state, host);
  const alertFn = function(value) {
    if (!host || !host.debug || typeof host.debug.alert !== "function") {
      return;
    }
    host.debug.alert(value, {
      scriptKey: "onMessage",
      direction: "message",
    });
  };
  let output;
  try {
    const runner = compileAgentMessageScript(source, asyncEnabled);
    output = runner(normalizedMessage, context, alertFn);
  } catch (error) {
    throw new Error("Agent On Message failed: " + (normalizeString(error && error.message) || String(error)));
  }
  if (!asyncEnabled && output && typeof output.then === "function") {
    throw new Error("Agent On Message returned a Promise; enable Await On Message");
  }
  let decision;
  try {
    decision = normalizeAgentMessageDecision(asyncEnabled ? await output : output);
  } catch (error) {
    throw new Error("Agent On Message failed: " + (normalizeString(error && error.message) || String(error)));
  }
  switch (decision.action) {
    case "pass":
      return normalizedMessage.messages;
    case "replace":
      return decision.messages;
    case "drop":
      return [];
    case "cancel":
      throw createAgentMessageCancelError(decision.reason);
    default:
      throw new Error("unsupported Agent On Message action");
  }
}

function createAgentSignalInterruptError() {
  const error = new Error("agent interrupted by signal");
  error.code = "agent_signal_interrupt";
  return error;
}

function isAgentSignalInterruptError(error) {
  return !!(error && typeof error === "object" && normalizeString(error.code).toLowerCase() === "agent_signal_interrupt");
}

function createAgentSignalCancelError(reason) {
  const error = new Error(normalizeString(reason) || "agent cancelled by signal");
  error.code = "agent_signal_cancel";
  error.reason = normalizeString(reason);
  return error;
}

function isAgentSignalCancelError(error) {
  return !!(error && typeof error === "object" && normalizeString(error.code).toLowerCase() === "agent_signal_cancel");
}

function createAgentMessageCancelError(reason) {
  const error = new Error(normalizeString(reason) || "agent cancelled by message hook");
  error.code = "agent_message_cancel";
  error.reason = normalizeString(reason);
  return error;
}

function isAgentMessageCancelError(error) {
  return !!(error && typeof error === "object" && normalizeString(error.code).toLowerCase() === "agent_message_cancel");
}

function queueAgentSignalMessages(signalState, messages) {
  if (!signalState || !Array.isArray(signalState.pendingMessages) || !Array.isArray(messages) || messages.length === 0) {
    return;
  }
  for (const message of messages) {
    signalState.pendingMessages.push(clone(message));
  }
}

function drainAgentSignalMessages(signalState) {
  if (!signalState || !Array.isArray(signalState.pendingMessages) || signalState.pendingMessages.length === 0) {
    return [];
  }
  const drained = signalState.pendingMessages.map((message) => clone(message));
  signalState.pendingMessages = [];
  return drained;
}

function hasPendingAgentSignalMessages(signalState) {
  return !!(signalState && Array.isArray(signalState.pendingMessages) && signalState.pendingMessages.length > 0);
}

async function checkpointAgentSignals(currentControlId, config, state, signalState, host) {
  const signalEntries = configuredSignalEntries(config);
  if (signalEntries.length === 0 || !configString(config, "onSignal")) {
    return { action: "ignore" };
  }
  for (const entry of signalEntries) {
    const bindingId = normalizeString(entry && entry.bindingId);
    const targetId = normalizeString(entry && entry.targetId);
    if (!bindingId || !targetId) {
      continue;
    }
    // Purposeful: Agent should not visibly hit signal controls on every pull
    // checkpoint. Probe quietly first, then do one visible consume only when a
    // signal is actually ready so graph traversal stays readable.
    if (!probeAgentSignalControl(targetId, host)) {
      continue;
    }
    const signal = consumeAgentSignalControl(bindingId, targetId, host);
    if (!signal) {
      continue;
    }
    const decision = await runAgentSignalScript(currentControlId, config, signal, {
      phase: normalizeString(state && state.phase),
      round: finiteNumber(state && state.round, 0),
      canInterrupt: !!(state && state.canInterrupt),
      queuedMessages: signalState && Array.isArray(signalState.pendingMessages)
        ? signalState.pendingMessages.length
        : 0,
      active: state && state.active && typeof state.active === "object" && !Array.isArray(state.active)
        ? clone(state.active)
        : null,
    }, host);
    if (decision.action === "queue" || decision.action === "interrupt") {
      let nextMessages = [];
      try {
        nextMessages = await runAgentMessageScript(currentControlId, config, {
          source: "signal",
          messages: decision.messages,
          signal: signal,
        }, {
          phase: normalizeString(state && state.phase),
          round: finiteNumber(state && state.round, 0),
          canInterrupt: !!(state && state.canInterrupt),
          queuedMessages: signalState && Array.isArray(signalState.pendingMessages)
            ? signalState.pendingMessages.length
            : 0,
          active: state && state.active && typeof state.active === "object" && !Array.isArray(state.active)
            ? clone(state.active)
            : null,
        }, host);
      } catch (error) {
        if (isAgentMessageCancelError(error)) {
          return {
            action: "cancel",
            reason: normalizeString(error.reason) || normalizeString(error.message),
          };
        }
        throw error;
      }
      queueAgentSignalMessages(signalState, nextMessages);
      return {
        action: decision.action,
        messages: nextMessages,
      };
    }
    return decision;
  }
  return { action: "ignore" };
}

function controlDescriptor(info) {
  if (!info || typeof info !== "object") return null;
  const direct = info.control;
  if (direct == null) return null;
  if (typeof direct === "object" && !Array.isArray(direct)) return direct;
  throw new Error("graph control descriptor invalid for " + normalizeString(info && info.id));
  return null;
}

function optionalControlObject(info, key) {
  if (!info || typeof info !== "object") return null;
  const value = info[key];
  if (value == null) return null;
  if (typeof value === "object" && !Array.isArray(value)) return value;
  throw new Error("graph control " + key + " invalid for " + normalizeString(info.id));
}

function requiredControlString(info, key) {
  const value = info && info[key];
  if (typeof value !== "string") {
    throw new Error("graph control " + key + " missing for " + normalizeString(info && info.id));
  }
  const text = normalizeString(value);
  if (!text) {
    throw new Error("graph control " + key + " empty for " + normalizeString(info && info.id));
  }
  return text;
}

function optionalControlString(info, key) {
  const value = info && info[key];
  if (value == null) return "";
  if (typeof value !== "string") {
    throw new Error("graph control " + key + " invalid for " + normalizeString(info && info.id));
  }
  return normalizeString(value);
}

function optionalStringArray(info, key) {
  const value = info && info[key];
  if (!Array.isArray(value)) return [];
  return normalizeStringList(value);
}

function bindingFieldTargets(info, fieldKey) {
  const bindings = optionalControlObject(info, "bindings");
  const fieldBindings = bindings && bindings.field && typeof bindings.field === "object" && !Array.isArray(bindings.field)
    ? bindings.field
    : null;
  const entry = fieldBindings && fieldBindings[fieldKey] && typeof fieldBindings[fieldKey] === "object" && !Array.isArray(fieldBindings[fieldKey])
    ? fieldBindings[fieldKey]
    : null;
  return entry && Array.isArray(entry.targets) ? entry.targets.slice() : [];
}

function graphControlInfoOrNull(controlId, host) {
  const targetId = normalizeString(controlId);
  if (!targetId) return null;
  try {
    return graphControlInfo(targetId, host);
  } catch (_error) {
    return null;
  }
}

function scriptHookConfigEntries(value) {
  if (!Array.isArray(value)) return [];
  const entries = [];
  for (const raw of value) {
    if (typeof raw === "string") {
      const targetId = normalizeString(raw);
      if (!targetId) continue;
      entries.push({
        bindingId: targetId,
        targetId: targetId,
      });
      continue;
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      continue;
    }
    const targetId = normalizeString(raw.target);
    const bindingId = normalizeString(raw.id || raw.name) || targetId;
    if (!bindingId || !targetId) {
      continue;
    }
    entries.push({
      bindingId: bindingId,
      targetId: targetId,
    });
  }
  return entries;
}

function agentHookControlCallOptions(value) {
  if (value == null) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Agent helper control options must be an object");
  }
  if (value.parallel === true) {
    throw new Error("Agent helper controls do not support parallel calls");
  }
  const options = {};
  if (value.fields && typeof value.fields === "object" && !Array.isArray(value.fields)) {
    options.fields = clone(value.fields);
  }
  if (value.details === true) {
    options.details = true;
  }
  if (value.metadata === true) {
    options.metadata = true;
  }
  return options;
}

function buildAgentHookControlInfo(bindingId, lookupName, targetId, host) {
  const info = {
    kind: "control",
    lookupName: normalizeString(lookupName),
    bindingId: normalizeString(bindingId),
    targetId: normalizeString(targetId),
  };
  const targetInfo = graphControlInfoOrNull(targetId, host);
  if (targetInfo && typeof targetInfo === "object" && !Array.isArray(targetInfo)) {
    for (const [key, value] of Object.entries(targetInfo)) {
      info[key] = clone(value);
    }
  }
  return info;
}

function buildAgentHookControlLookup(currentControlId, config, host) {
  const currentControlInfo = graphControlInfoOrNull(currentControlId, host);
  const sourceConfig = currentControlInfo && currentControlInfo.config && typeof currentControlInfo.config === "object" && !Array.isArray(currentControlInfo.config)
    ? currentControlInfo.config
    : config;
  const entries = scriptHookConfigEntries(sourceConfig && sourceConfig.controls);
  const controls = {};
  const aliases = {};
  const addControl = function (lookupName, bindingId, targetId) {
    const name = normalizeString(lookupName);
    if (!name || controls[name]) return;
    const callable = function (input, options) {
      const invoked = graphInvoke(
        targetId,
        input,
        host,
        agentHookControlCallOptions(options),
      );
      return graphInvokeOutput(invoked, "Agent helper control call failed");
    };
    callable.info = buildAgentHookControlInfo(bindingId, name, targetId, host);
    controls[name] = callable;
  };
  for (const entry of entries) {
    addControl(entry.bindingId, entry.bindingId, entry.targetId);
    const targetInfo = graphControlInfoOrNull(entry.targetId, host);
    const alias = normalizeString((targetInfo && (targetInfo.title || targetInfo.name)) || "");
    if (alias && alias !== entry.bindingId) {
      if (!aliases[alias]) {
        aliases[alias] = [];
      }
      aliases[alias].push(entry);
    }
  }
  for (const [alias, matches] of Object.entries(aliases)) {
    if (!Array.isArray(matches) || matches.length !== 1) {
      continue;
    }
    const match = matches[0];
    addControl(alias, match.bindingId, match.targetId);
  }
  return controls;
}

function parseAgentHookSignalBindingRequest(bindingName, value, extraArgument) {
  const label = "context.self.signals." + bindingName;
  if (extraArgument !== undefined) {
    throw new Error(label + " does not take options");
  }
  if (value == null) {
    return { action: "check" };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(label + " input must be a signal request object");
  }
  if (Object.keys(value).length === 0) {
    return { action: "check" };
  }
  const action = normalizeString(value.action).toLowerCase();
  if (!action) {
    throw new Error(label + " signal request action is required");
  }
  if (action !== "probe" && action !== "check" && action !== "peek" && action !== "read") {
    throw new Error(label + ' action must be "probe", "check", "peek", or "read"');
  }
  return { action: action };
}

function buildAgentHookSignalBindingInfo(bindingId, targetId, host) {
  const info = {
    kind: "signal",
    bindingId: normalizeString(bindingId),
    targetId: normalizeString(targetId),
  };
  const targetInfo = graphControlInfoOrNull(targetId, host);
  if (targetInfo && typeof targetInfo === "object" && !Array.isArray(targetInfo)) {
    for (const [key, value] of Object.entries(targetInfo)) {
      info[key] = clone(value);
    }
  }
  const channel = normalizeString(targetInfo && targetInfo.config && targetInfo.config.channel);
  if (channel && !Object.prototype.hasOwnProperty.call(info, "channel")) {
    info.channel = channel;
  }
  return info;
}

function normalizeAgentHookSignalBindingEvent(bindingId, targetId, raw, host) {
  const base = {
    id: normalizeString(targetId),
    alias: normalizeString(bindingId),
  }
  const wrapped = clone(base);
  wrapped.value = raw && typeof raw === "object" && !Array.isArray(raw) ? clone(raw) : raw;
  return wrapped;
}

function buildAgentHookSignalLookup(currentControlId, config, host) {
  const currentControlInfo = graphControlInfoOrNull(currentControlId, host);
  const sourceConfig = currentControlInfo && currentControlInfo.config && typeof currentControlInfo.config === "object" && !Array.isArray(currentControlInfo.config)
    ? currentControlInfo.config
    : config;
  const entries = scriptHookConfigEntries(sourceConfig && sourceConfig.signals);
  const signals = {};
  for (const entry of entries) {
    const bindingId = normalizeString(entry.bindingId);
    const targetId = normalizeString(entry.targetId);
    if (!bindingId || !targetId || signals[bindingId]) {
      continue;
    }
    const callable = function (input, options) {
      const request = parseAgentHookSignalBindingRequest(bindingId, input, options);
      switch (request.action) {
        case "probe": {
          const output = graphInvokeOutput(
            graphInvoke(targetId, { action: "probe" }, host, { quiet: true }),
            "Agent bound signal probe failed",
          );
          const result = signalCheckResult(output);
          if (!result.ready) {
            return false;
          }
          return normalizeAgentHookSignalBindingEvent(bindingId, targetId, result.value, host);
        }
        case "check": {
          const output = graphInvokeOutput(
            graphInvoke(targetId, { action: "check" }, host),
            "Agent bound signal check failed",
          );
          const result = signalCheckResult(output);
          if (!result.ready) {
            return false;
          }
          return normalizeAgentHookSignalBindingEvent(bindingId, targetId, result.value, host);
        }
        case "peek":
          return graphInvokeOutput(
            graphInvoke(targetId, { action: "peek" }, host),
            "Agent bound signal peek failed",
          );
        case "read":
          return graphInvokeOutput(
            graphInvoke(targetId, { action: "read" }, host),
            "Agent bound signal read failed",
          );
        default:
          throw new Error("unsupported signal action");
      }
    };
    callable.info = buildAgentHookSignalBindingInfo(bindingId, targetId, host);
    signals[bindingId] = callable;
    if (targetId && !signals[targetId]) {
      signals[targetId] = callable;
    }
  }
  return signals;
}

function buildAgentHookContext(currentControlId, config, state, host) {
  const currentControlInfo = graphControlInfoOrNull(currentControlId, host);
  const sourceConfig = currentControlInfo && currentControlInfo.config && typeof currentControlInfo.config === "object" && !Array.isArray(currentControlInfo.config)
    ? currentControlInfo.config
    : config;
  // Purposeful: Agent hooks are not the full Control/Main runtime surface.
  // Expose Agent state plus this control's bound helper controls and bound
  // signals so message/signal policy can delegate work without pretending it
  // has routes, libraries, or the broader graph-script context.
  return {
    state: clone(state),
    self: {
      id: normalizeString(currentControlId) || normalizeString(currentControlInfo && currentControlInfo.id),
      fields: clone(sourceConfig || {}),
      controls: buildAgentHookControlLookup(currentControlId, sourceConfig || config || {}, host),
      signals: buildAgentHookSignalLookup(currentControlId, sourceConfig || config || {}, host),
    },
  };
}

function targetInvokeControlID(target) {
  if (typeof target === "string") {
    return normalizeString(target);
  }
  if (!target || typeof target !== "object" || Array.isArray(target)) {
    return "";
  }
  return normalizeString(target.invokeControlId || target.controlId || target.id);
}

function targetInvokePath(target) {
  if (!target || typeof target !== "object" || Array.isArray(target)) {
    return [];
  }
  return optionalStringArray(target, "invokePath");
}

function targetInvokeInput(target, input) {
  const invokePath = targetInvokePath(target);
  if (invokePath.length === 0) {
    return clone(input);
  }
  return {
    id: invokePath[0],
    path: invokePath.slice(1),
    args: clone(input),
  };
}

function canonicalBoundControlInfo(info) {
  const control = controlDescriptor(info);
  const contracts = optionalControlObject(info, "contracts");
  const capabilities = optionalStringArray(info, "capabilities");
  const boundInfo = {
    kind: "control",
    id: requiredControlString(info, "id"),
    title: optionalControlString(info, "title"),
    name: requiredControlString(info, "name"),
    description: optionalControlString(info, "description"),
    invokeControlId: optionalControlString(info, "invokeControlId") || requiredControlString(info, "id"),
    invokePath: optionalStringArray(info, "invokePath"),
  };
  const controlRef = optionalControlString(info, "controlRef");
  if (controlRef) boundInfo.controlRef = controlRef;
  const baseControlRef = optionalControlString(info, "baseControlRef");
  if (baseControlRef) boundInfo.baseControlRef = baseControlRef;
  if (contracts) boundInfo.contracts = clone(contracts);
  if (capabilities.length > 0) boundInfo.capabilities = capabilities.slice();
  if (control) boundInfo.control = clone(control);
  const config = optionalControlObject(info, "config");
  if (config) boundInfo.config = clone(config);
  return boundInfo;
}

function canonicalToolInfo(info) {
  const toolInfo = canonicalBoundControlInfo(info);
  return toolInfo;
}

function resolveBoundProviderTarget(currentControlId, config, host) {
  if (normalizeString(currentControlId)) {
    const currentControlInfo = graphControlInfoOrNull(currentControlId, host);
    const targets = bindingFieldTargets(currentControlInfo, "providerControl");
    if (targets.length > 1) {
      throw new Error("providerControl binding resolved multiple targets");
    }
    if (targets.length === 1) {
      // Purposeful: Agent Provider should use the resolved field binding target,
      // not a raw config control id, so wrapper chains and the Provider field's
      // exposed contract surface stay the source of truth.
      return canonicalBoundControlInfo(targets[0]);
    }
  }
  const providerControlId = configString(config, "providerControl");
  if (!providerControlId) {
    return null;
  }
  const targetInfo = graphControlInfoOrNull(providerControlId, host);
  if (targetInfo && typeof targetInfo === "object" && !Array.isArray(targetInfo)) {
    return canonicalBoundControlInfo(targetInfo);
  }
  return {
    kind: "control",
    id: providerControlId,
    name: providerControlId,
    description: "",
    invokeControlId: providerControlId,
    invokePath: [],
  };
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) return [];
  const items = [];
  const seen = {};
  for (const entry of value) {
    const text = normalizeString(entry);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen[key]) continue;
    seen[key] = true;
    items.push(text);
  }
  return items;
}

function controlDocsSections(control) {
  if (!control || typeof control !== "object") return [];
  const docs = control.docs && typeof control.docs === "object" && !Array.isArray(control.docs) ? control.docs : null;
  if (docs && Array.isArray(docs.sections)) return docs.sections;
  const info = control.info && typeof control.info === "object" && !Array.isArray(control.info) ? control.info : null;
  if (info && Array.isArray(info.sections)) return info.sections;
  const ui = control.ui && typeof control.ui === "object" && !Array.isArray(control.ui) ? control.ui : null;
  const uiInfo = ui && ui.info && typeof ui.info === "object" && !Array.isArray(ui.info) ? ui.info : null;
  if (uiInfo && Array.isArray(uiInfo.sections)) return uiInfo.sections;
  return [];
}

function summarizeDocsSection(section) {
  if (!section || typeof section !== "object" || Array.isArray(section)) return "";
  const title = normalizeString(section.title);
  const kind = normalizeString(section.kind).toLowerCase();
  let text = "";
  if (kind === "list" && Array.isArray(section.items)) {
    text = section.items
      .map((item) => {
        if (item && typeof item === "object" && !Array.isArray(item)) {
          return normalizeString(item.text || item.value || item.label);
        }
        return normalizeString(item);
      })
      .filter(Boolean)
      .join("; ");
  } else {
    text = normalizeString(section.text);
  }
  if (!text) return "";
  return title ? title + ": " + text : text;
}

function controlDocsSummary(control) {
  const sections = controlDocsSections(control);
  if (sections.length === 0) return "";
  const blocks = [];
  for (const section of sections) {
    const summary = summarizeDocsSection(section);
    if (!summary) continue;
    blocks.push(summary);
    if (blocks.length >= 6) break;
  }
  return blocks.join("\n\n");
}

function permissionSummary(rawPermissions) {
  if (!Array.isArray(rawPermissions)) return "";
  const items = [];
  const seen = {};
  for (const entry of rawPermissions) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const title = normalizeString(entry.title || entry.id || entry.action);
    if (!title) continue;
    const platform = normalizeString(entry.platform);
    const label = platform ? title + " (" + platform + ")" : title;
    const key = label.toLowerCase();
    if (seen[key]) continue;
    seen[key] = true;
    items.push(label);
  }
  return items.join("; ");
}

function toolParameterSchema(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { type: "object", properties: {} };
  }
  if (normalizeString(input.type) === "object" || (input.properties && typeof input.properties === "object")) {
    return clone(input);
  }
  if (
    (Array.isArray(input.anyOf) && input.anyOf.length > 0) ||
    (Array.isArray(input.oneOf) && input.oneOf.length > 0) ||
    (Array.isArray(input.allOf) && input.allOf.length > 0)
  ) {
    // Keep schema combiners intact here. Provider adapters already rewrite
    // top-level unions into one provider-safe object schema when required,
    // but collapsing them to `{}` here hides the tool contract from the
    // model entirely.
    return clone(input);
  }
  return { type: "object", properties: {} };
}

function callerContractVariants(contracts) {
  if (!contracts || typeof contracts !== "object" || Array.isArray(contracts)) return [];
  const caller = contracts.caller;
  if (!caller || typeof caller !== "object" || Array.isArray(caller)) return [];
  const variants = Array.isArray(caller.contracts) ? caller.contracts : [];
  const resolved = [];
  for (const variant of variants) {
    if (!variant || typeof variant !== "object" || Array.isArray(variant)) continue;
    if (!callerContractIsProviderToolVisible(variant)) continue;
    resolved.push({
      id: normalizeString(variant.id),
      name: normalizeString(variant.name),
      description: normalizeString(variant.description),
      graphInput: variant.input && typeof variant.input === "object" && !Array.isArray(variant.input)
        ? clone(variant.input)
        : null,
      input: toolParameterSchema(variant.input),
      output: variant.output && typeof variant.output === "object" && !Array.isArray(variant.output)
        ? clone(variant.output)
        : null,
    });
  }
  return resolved;
}

function callerContractKey(variant, index) {
  const lifecycle = callerContractLifecycleInfo(variant);
  if (lifecycle) {
    return lifecycle.transport + "_" + lifecycle.phase;
  }
  return normalizeToolName((variant && (variant.id || variant.name)) || "") || ("variant_" + String(index + 1));
}

function callerContractLabel(variant, index) {
  return normalizeString(variant && (variant.name || variant.id)) || ("Variant " + String(index + 1));
}

function callerContractOutputSummary(variant) {
  const output = variant && variant.output && typeof variant.output === "object" && !Array.isArray(variant.output)
    ? variant.output
    : null;
  return normalizeString(output && output.description);
}

function toolParametersFromContracts(contracts) {
  const variants = callerContractVariants(contracts);
  if (variants.length === 0) {
    return { type: "object", properties: {} };
  }
  if (variants.length === 1) {
    return toolParameterSchema(variants[0].input);
  }
  return preserveVariantInputSchemas(variants);
}

function preserveVariantInputSchemas(variants) {
  const preserved = [];
  for (const variant of variants) {
    preserved.push(toolParameterSchema(variant && variant.input));
  }
  if (preserved.length === 0) {
    return { type: "object", properties: {} };
  }
  if (preserved.length === 1) {
    return preserved[0];
  }
  // Preserve each caller variant instead of flattening them into one union of
  // fields. Agents often only see the JSON schema, and merged discriminator
  // tools make invalid mode-specific params look valid for every call.
  return { type: "object", anyOf: preserved };
}

function buildToolDescription(info, variant, compact = false) {
  const control = info.control && typeof info.control === "object" && !Array.isArray(info.control) ? info.control : null;
  const parts = [];
  const description = normalizeString(info.description);
  if (description) parts.push(description);
  const contractDescription = normalizeString(variant && variant.description);
  if (contractDescription && contractDescription.toLowerCase() !== description.toLowerCase()) {
    parts.push(contractDescription);
  }
  const outputSummary = callerContractOutputSummary(variant);
  if (outputSummary) {
    parts.push("Returns: " + outputSummary);
  }
  if (!compact) {
    const inputTypes = normalizeStringList(control && control.inputTypes);
    if (inputTypes.length > 0) parts.push("Inputs: " + inputTypes.join(", "));
    const outputTypes = normalizeStringList(control && control.outputTypes);
    if (outputTypes.length > 0) parts.push("Outputs: " + outputTypes.join(", "));
  }
  const permissions = permissionSummary(control && control.permissions);
  if (permissions) parts.push("Permissions: " + permissions);
  if (!compact) {
    const docs = controlDocsSummary(control);
    if (docs) parts.push(docs);
  }
  return parts.join("\n\n") || info.name;
}

function toolLiteralArgumentsFromSchema(schema) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return {};
  const properties = schema.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties)
    ? schema.properties
    : null;
  if (!properties) return {};
  const literals = {};
  for (const [key, property] of Object.entries(properties)) {
    if (!property || typeof property !== "object" || Array.isArray(property)) continue;
    if (Object.prototype.hasOwnProperty.call(property, "const")) {
      literals[key] = clone(property.const);
      continue;
    }
    if (Array.isArray(property.enum) && property.enum.length === 1) {
      literals[key] = clone(property.enum[0]);
    }
  }
  return literals;
}

function orderedSchemaPropertyNames(schema) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return [];
  const properties = schema.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties)
    ? schema.properties
    : {};
  const ordered = [];
  const seen = {};
  const add = (value) => {
    const key = normalizeString(value);
    if (!key || seen[key]) return;
    seen[key] = true;
    ordered.push(key);
  };
  if (Array.isArray(schema.required)) {
    for (const key of schema.required) add(key);
  }
  if (Array.isArray(schema.propertyOrder)) {
    for (const key of schema.propertyOrder) add(key);
  }
  for (const key of Object.keys(properties)) add(key);
  return ordered;
}

function schemaLiteralKeyValue(schema, key) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return undefined;
  const properties = schema.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties)
    ? schema.properties
    : null;
  const property = properties && properties[key] && typeof properties[key] === "object" && !Array.isArray(properties[key])
    ? properties[key]
    : null;
  if (!property) return undefined;
  if (Object.prototype.hasOwnProperty.call(property, "const")) return property.const;
  if (Array.isArray(property.enum) && property.enum.length === 1) return property.enum[0];
  return undefined;
}

function providerVisibleInputAlternatives(schema) {
  const base = toolParameterSchema(schema);
  const rawAlternatives = Array.isArray(base.anyOf) && base.anyOf.length > 0
    ? base.anyOf
    : (Array.isArray(base.oneOf) && base.oneOf.length > 0 ? base.oneOf : []);
  if (rawAlternatives.length === 0) return [{ key: "", schema: base }];
  const alternatives = [];
  for (const raw of rawAlternatives) {
    const candidate = toolParameterSchema(raw);
    if (
      !candidate ||
      typeof candidate !== "object" ||
      Array.isArray(candidate) ||
      (normalizeString(candidate.type) !== "object" && !(candidate.properties && typeof candidate.properties === "object"))
    ) {
      return [{ key: "", schema: base }];
    }
    alternatives.push(candidate);
  }
  if (alternatives.length <= 1) {
    return alternatives.length === 1 ? [{ key: "", schema: alternatives[0] }] : [{ key: "", schema: base }];
  }
  const propertyCounts = {};
  for (const alternative of alternatives) {
    for (const key of orderedSchemaPropertyNames(alternative)) {
      propertyCounts[key] = (propertyCounts[key] || 0) + 1;
    }
  }
  const withKeys = [];
  const seenKeys = {};
  for (let index = 0; index < alternatives.length; index += 1) {
    const alternative = alternatives[index];
    const orderedKeys = orderedSchemaPropertyNames(alternative);
    let key = "";
    for (const candidateKey of orderedKeys) {
      const literal = schemaLiteralKeyValue(alternative, candidateKey);
      if (literal === undefined) continue;
      const siblingValues = {};
      for (const sibling of alternatives) {
        const siblingLiteral = schemaLiteralKeyValue(sibling, candidateKey);
        if (siblingLiteral === undefined) continue;
        siblingValues[JSON.stringify(siblingLiteral)] = true;
      }
      if (Object.keys(siblingValues).length > 1) {
        key = normalizeToolName(String(literal));
        break;
      }
    }
    if (!key) {
      for (const candidateKey of orderedKeys) {
        if (propertyCounts[candidateKey] !== 1) continue;
        const literal = schemaLiteralKeyValue(alternative, candidateKey);
        if (literal !== undefined) {
          key = normalizeToolName(String(literal));
          if (key === "true" || key === "false") key = "";
        }
        if (!key) key = normalizeToolName(candidateKey);
        if (key) break;
      }
    }
    if (!key) key = "variant_" + String(index + 1);
    if (seenKeys[key]) {
      seenKeys[key] += 1;
      key = key + "_" + String(seenKeys[key]);
    } else {
      seenKeys[key] = 1;
    }
    withKeys.push({ key: key, schema: alternative });
  }
  return withKeys;
}

function stripToolParameterKeys(schema, keys) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return schema;
  const properties = schema.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties)
    ? schema.properties
    : null;
  if (!properties || !Array.isArray(keys) || keys.length === 0) {
    return clone(schema);
  }
  const hidden = {};
  for (const entry of keys) {
    const key = normalizeString(entry);
    if (!key) continue;
    hidden[key] = true;
  }
  if (Object.keys(hidden).length === 0) {
    return clone(schema);
  }
  const next = clone(schema);
  next.properties = clone(properties);
  for (const key of Object.keys(hidden)) {
    delete next.properties[key];
  }
  if (Array.isArray(next.required)) {
    next.required = next.required.filter((entry) => !hidden[normalizeString(entry)]);
  }
  if (Array.isArray(next.propertyOrder)) {
    next.propertyOrder = next.propertyOrder.filter((entry) => !hidden[normalizeString(entry)]);
  }
  return next;
}

function providerVisibleToolParameterSchema(schema, runtimeHiddenKeys) {
  const base = toolParameterSchema(schema);
  const hiddenKeys = [
    ...Object.keys(toolLiteralArgumentsFromSchema(base)),
    ...(Array.isArray(runtimeHiddenKeys) ? runtimeHiddenKeys : []),
  ];
  return stripToolParameterKeys(base, hiddenKeys);
}

function variantNeedsOwnerInvocationInjection(variant) {
  const lifecycle = callerContractLifecycleInfo(variant);
  if (!lifecycle || lifecycle.phase !== "start") return false;
  const input = variant && variant.input && typeof variant.input === "object" && !Array.isArray(variant.input)
    ? variant.input
    : null;
  const properties = input && input.properties && typeof input.properties === "object" && !Array.isArray(input.properties)
    ? input.properties
    : null;
  return !!(properties && Object.prototype.hasOwnProperty.call(properties, "ownerInvocationId"));
}

function applyToolRuntimeArguments(args, definition, host) {
  const next = args && typeof args === "object" && !Array.isArray(args) ? clone(args) : {};
  if (definition && definition.injectOwnerInvocationId === true) {
    const invocationId = normalizeString(host && host.execution && host.execution.invocationId);
    if (!invocationId) {
      throw new Error("tool lifecycle start requires invocationId");
    }
    next.ownerInvocationId = invocationId;
  }
  return next;
}

function toolUsesInternalPullDriver(definition) {
  return normalizeString(definition && definition.executionMode).toLowerCase() === "pull-driver";
}

function toolDefinitionsFromInfo(info, overrides = {}) {
  const variants = callerContractVariants(info.contracts);
  const invokeControlId = normalizeString(overrides.invokeControlId) || info.id;
  const invokePath = Array.isArray(overrides.invokePath) ? normalizeStringList(overrides.invokePath) : [];
  const supportsPulling = definitionSupportsPulling(info);
  if (variants.length === 0) {
    return [{
      id: info.id,
      title: info.name,
      name: buildToolTransportName(info.id, info.name),
      description: buildToolDescription(info, null, false),
      parameters: toolParametersFromContracts(info.contracts),
      controlId: info.id,
      invokeControlId: invokeControlId,
      invokePath: invokePath,
      controlRef: info.controlRef,
      baseControlRef: info.baseControlRef,
      capabilities: Array.isArray(info.capabilities) ? info.capabilities.slice() : [],
      supportsPulling: supportsPulling,
      executionMode: "invoke",
      injectOwnerInvocationId: false,
      expectsVoidInput: false,
    }];
  }

  const definitions = [];
  const multipleVariants = variants.length > 1;
  const seenKeys = {};
  // Provider APIs only accept one top-level object schema per tool. Expose one
  // transport tool per caller contract and per top-level payload alternative so
  // the model sees concrete schemas instead of one flattened object with
  // mutually exclusive fields that only descriptions can explain.
  for (let index = 0; index < variants.length; index += 1) {
    const variant = variants[index];
    const contractKey = callerContractKey(variant, index);
    const inputAlternatives = providerVisibleInputAlternatives(variant.input);
    const splitAlternatives = inputAlternatives.length > 1;
    let baseKey = contractKey;
    if (seenKeys[contractKey]) {
      baseKey += "_" + String(index + 1);
    }
    seenKeys[contractKey] = true;
    const injectOwnerInvocationId = variantNeedsOwnerInvocationInjection(variant);
    for (const alternative of inputAlternatives) {
      const transportKey = multipleVariants || splitAlternatives
        ? [baseKey, splitAlternatives ? alternative.key : ""].filter(Boolean).join("_")
        : "";
      const title = multipleVariants || splitAlternatives
        ? info.name + ": " + callerContractLabel(variant, index) + (splitAlternatives && alternative.key ? " " + alternative.key : "")
        : info.name;
      const literals = toolLiteralArgumentsFromSchema(alternative.schema);
      const definition = {
        id: transportKey ? info.id + "#" + transportKey : info.id,
        title: title,
        name: buildToolTransportName(info.id, info.name, transportKey),
        description: buildToolDescription(info, variant, multipleVariants || splitAlternatives),
        parameters: providerVisibleToolParameterSchema(alternative.schema, injectOwnerInvocationId ? ["ownerInvocationId"] : []),
        controlId: info.id,
        invokeControlId: invokeControlId,
        invokePath: invokePath,
        controlRef: info.controlRef,
        baseControlRef: info.baseControlRef,
        capabilities: Array.isArray(info.capabilities) ? info.capabilities.slice() : [],
        supportsPulling: supportsPulling,
        executionMode: "invoke",
        injectOwnerInvocationId: injectOwnerInvocationId,
        toolContractId: baseKey,
        expectsVoidInput: isVoidInputSchema(variant.graphInput),
      };
      if (Object.keys(literals).length > 0) {
        definition.toolLiteralArguments = literals;
      }
      definitions.push(definition);
    }
  }
  return definitions;
}

function resolveToolDefinition(controlId, host) {
  const info = canonicalToolInfo(graphControlInfo(controlId, host));
  return toolDefinitionsFromInfo(info);
}

function resolveBoundToolDefinitions(currentControlId, config, host) {
  if (normalizeString(currentControlId)) {
    const currentControlInfo = graphControlInfo(currentControlId, host);
    const targets = bindingFieldTargets(currentControlInfo, "tools");
    if (targets.length > 0) {
      const resolved = [];
      for (const entry of targets) {
        const info = canonicalToolInfo(entry);
        const invokeControlId = optionalControlString(entry, "invokeControlId") || info.id;
        const invokePath = optionalStringArray(entry, "invokePath");
        const supportsPulling = controlSupportsPulling(invokeControlId, host);
        for (const definition of toolDefinitionsFromInfo(info, {
          invokeControlId: invokeControlId,
          invokePath: invokePath,
        })) {
          // Purposeful: tool pullability must reflect the actual control Agent will
          // invoke, not the flattened target's contracts. Passthrough exposes a
          // downstream pullable tool but is not itself pullable, so Agent must
          // fall back to a direct invoke through that boundary instead of
          // sending pull start/step envelopes the wrapper cannot accept.
          definition.supportsPulling = supportsPulling;
          resolved.push(definition);
        }
      }
      return resolved;
    }
  }
  const resolved = [];
  for (const controlId of configControlTargetList(config, "tools")) {
    for (const definition of resolveToolDefinition(controlId, host)) {
      resolved.push(definition);
    }
  }
  return resolved;
}

function buildToolDefinitions(currentControlId, config, host) {
  const tools = [];
  for (const def of resolveBoundToolDefinitions(currentControlId, config, host)) {
    tools.push({
      id: def.id,
      title: def.title,
      name: def.name,
      description: def.description,
      parameters: def.parameters,
    });
  }
  return tools;
}

function toolLookup(currentControlId, config, host) {
  const map = {};
  for (const def of resolveBoundToolDefinitions(currentControlId, config, host)) {
    map[def.name] = def;
    map[def.id] = def;
  }
  return map;
}

function toolCallName(toolCall) {
  if (!toolCall || typeof toolCall !== "object") return "";
  return normalizeString(
    toolCall.name ||
    toolCall.Name ||
    (toolCall.function && (toolCall.function.name || toolCall.function.Name)) ||
    "",
  );
}

function toolCallArguments(toolCall) {
  if (!toolCall || typeof toolCall !== "object") return "";
  const direct =
    toolCall.arguments != null ? toolCall.arguments :
    (toolCall.Arguments != null ? toolCall.Arguments : undefined);
  if (direct != null) return String(direct);
  const fn = toolCall.function && typeof toolCall.function === "object" ? toolCall.function : null;
  if (!fn) return "";
  const nested =
    fn.arguments != null ? fn.arguments :
    (fn.Arguments != null ? fn.Arguments : undefined);
  return nested == null ? "" : String(nested);
}

function toolCallID(toolCall) {
  if (!toolCall || typeof toolCall !== "object") return "";
  return normalizeString(toolCall.id || toolCall.ID || "");
}

function isBundleToolDefinition(definition) {
  const refs = [
    normalizeString(definition && definition.controlRef).toLowerCase(),
    normalizeString(definition && definition.baseControlRef).toLowerCase(),
  ];
  return refs.some((entry) => entry.endsWith("/definitions/bundle") || entry.endsWith("/definitions/bundle-base"));
}

function trackedToolCallTitle(definition, toolCall, host) {
  const defaultTitle = normalizeString(definition && definition.title) || "Tool";
  if (!isBundleToolDefinition(definition)) return defaultTitle;
  try {
    const args = normalizeToolArguments(toolCallArguments(toolCall));
    const action = normalizeString(args && args.action).toLowerCase();
    if (action === "invoke") {
      const targetID = normalizeString(args && args.id);
      if (targetID) {
        const targetInfo = canonicalToolInfo(graphControlInfo(targetID, host));
        const targetTitle = normalizeString(targetInfo && targetInfo.name);
        if (targetTitle) return targetTitle;
      }
    }
  } catch {}
  return "Bundle";
}

function normalizeTrackedToolCall(toolCall, fallbackID, extra = {}) {
  const next = {};
  const id = toolCallID(toolCall) || normalizeString(fallbackID);
  const name = toolCallName(toolCall);
  const title = normalizeString((extra && extra.title) || (toolCall && (toolCall.title || toolCall.Title)) || "");
  const args = toolCallArguments(toolCall);
  const metadata = extra && extra.metadata && typeof extra.metadata === "object" && !Array.isArray(extra.metadata)
    ? clone(extra.metadata)
    : toolCall && toolCall.metadata && typeof toolCall.metadata === "object" && !Array.isArray(toolCall.metadata)
      ? clone(toolCall.metadata)
      : null;
  if (id) next.id = id;
  if (name) next.name = name;
  if (title) next.title = title;
  if (args) next.arguments = args;
  const status = normalizeString((extra && extra.status) || (toolCall && (toolCall.status || toolCall.Status)) || "");
  if (status) {
    next.status = status;
  }
  if (metadata && Object.keys(metadata).length > 0) {
    next.metadata = metadata;
  }
  const detailsRef = normalizeString((extra && extra.detailsRef) || (toolCall && (toolCall.detailsRef || toolCall.DetailsRef)) || "");
  if (detailsRef) {
    next.detailsRef = detailsRef;
  }
  if (extra.details && typeof extra.details === "object" && !Array.isArray(extra.details)) {
    next.details = clone(extra.details);
  } else if (toolCall && toolCall.details && typeof toolCall.details === "object" && !Array.isArray(toolCall.details)) {
    next.details = clone(toolCall.details);
  }
  return next;
}

function buildTrackedToolCallDetails(details, result, attachments) {
  const next = details && typeof details === "object" && !Array.isArray(details)
    ? clone(details)
    : { version: 1 };
  const version = Number(next.version);
  if (!Number.isFinite(version) || version <= 0) {
    next.version = 1;
  }
  if (result !== undefined) {
    next.result = clone(result);
  }
  if (Array.isArray(attachments) && attachments.length > 0) {
    next.attachments = clone(attachments);
  }
  return next;
}

function buildAgentMessageToolInfo(toolCall, definition) {
  return {
    id: normalizeString(definition && (definition.invokeControlId || definition.controlId)),
    name: toolCallName(toolCall) || normalizeString(definition && definition.name),
    toolCallId: toolCallID(toolCall),
  };
}

async function invokePullableTool(definition, invokeInput, host, currentControlId, config, signalState, round) {
  const ownerInvocationId = normalizeString(host && host.execution && host.execution.invocationId);
  const invokeControlId = definition.invokeControlId || definition.controlId;
  const started = pullInvokeOutput(invokeControlPullStart(invokeControlId, invokeInput, ownerInvocationId, host));
  const taskId = requirePullTaskID(started, "start");
  try {
    for (;;) {
      const signalDecision = await checkpointAgentSignals(currentControlId, config, {
        phase: "tool-step",
        round: round,
        canInterrupt: true,
        active: {
          kind: "tool",
          controlId: invokeControlId,
          taskId: taskId,
          name: normalizeString(definition && definition.name),
        },
      }, signalState, host);
      if (signalDecision.action === "interrupt") {
        throw createAgentSignalInterruptError();
      }
      if (signalDecision.action === "cancel") {
        throw createAgentSignalCancelError(signalDecision.reason);
      }
      if (!peekAgentTaskReady(taskId, host)) {
        delayPullLoop(host);
        continue;
      }
      const polled = pullInvokeOutput(invokeControlPullStep(invokeControlId, taskId, host));
      requirePullTaskID(polled, "step", taskId);
      const event = normalizePullStepEvent(polled);
      const phase = normalizeString(event && event.phase).toLowerCase();
      if (!isTerminalPullPhase(phase)) {
        delayPullLoop(host);
        continue;
      }
      const errorText = phase === "error"
        ? pullTerminalMessage(event, "pullable control failed")
        : phase === "cancel"
          ? pullTerminalMessage(event, "pull task cancelled")
          : "";
      return {
        ok: phase === "end",
        output: event && Object.prototype.hasOwnProperty.call(event, "content") ? clone(event.content) : undefined,
        error: errorText,
      };
    }
  } catch (error) {
    const cancelReason = isAgentSignalInterruptError(error)
      ? "signal-interrupt"
      : isAgentSignalCancelError(error)
        ? normalizeString(error.reason) || "signal-cancel"
        : "tool-pull-error";
    cancelPullTask(invokeControlId, taskId, cancelReason, host);
    throw error;
  }
}

function trackedToolCallMatches(left, right) {
  if (!left || typeof left !== "object" || !right || typeof right !== "object") return false;
  const leftID = toolCallID(left);
  const rightID = toolCallID(right);
  if (leftID || rightID) {
    return leftID !== "" && leftID === rightID;
  }
  return toolCallName(left) === toolCallName(right) && toolCallArguments(left) === toolCallArguments(right);
}

function upsertTrackedToolCall(toolCalls, toolCall) {
  const next = Array.isArray(toolCalls) ? toolCalls.map((entry) => clone(entry)) : [];
  const normalized = normalizeTrackedToolCall(toolCall, "", {
    status: toolCall && toolCall.status,
    metadata: toolCall && toolCall.metadata,
    details: toolCall && toolCall.details,
  });
  const index = next.findIndex((entry) => trackedToolCallMatches(entry, normalized));
  if (index >= 0) {
    next[index] = normalized;
  } else {
    next.push(normalized);
  }
  return next;
}

function toolCallPart(toolCall) {
  const normalized = normalizeTrackedToolCall(toolCall);
  if (!normalized.name && !normalized.id) return null;
  return {
    kind: "tool_call",
    toolCall: normalized,
  };
}

function toolCallsFromParts(parts) {
  if (!Array.isArray(parts)) return [];
  const toolCalls = [];
  for (const part of parts) {
    if (!part || typeof part !== "object" || Array.isArray(part)) continue;
    if (normalizeString(part.kind).toLowerCase() !== "tool_call") continue;
    if (!part.toolCall || typeof part.toolCall !== "object" || Array.isArray(part.toolCall)) continue;
    const normalized = normalizeTrackedToolCall(part.toolCall);
    if (normalized.name || normalized.id) {
      toolCalls.push(normalized);
    }
  }
  return toolCalls;
}

function setToolCallParts(parts, toolCalls) {
  const base = Array.isArray(parts)
    ? parts
        .filter((part) => normalizeString(part && part.kind).toLowerCase() !== "tool_call")
        .map((part) => clone(part))
    : [];
  for (const toolCall of Array.isArray(toolCalls) ? toolCalls : []) {
    const part = toolCallPart(toolCall);
    if (part) base.push(part);
  }
  return normalizeAgentParts(base);
}

function prependToolCallParts(parts, toolCalls) {
  const toolParts = [];
  for (const toolCall of Array.isArray(toolCalls) ? toolCalls : []) {
    const part = toolCallPart(toolCall);
    if (part) toolParts.push(part);
  }
  return normalizeAgentParts([...toolParts, ...(Array.isArray(parts) ? parts.map((part) => clone(part)) : [])]);
}

function sanitizeProviderToolCall(toolCall) {
  const next = normalizeTrackedToolCall(toolCall);
  delete next.title;
  delete next.status;
  delete next.details;
  delete next.detailsRef;
  return next;
}

function sanitizeProviderMessage(message) {
  const next = clone(message);
  if (!next || typeof next !== "object" || Array.isArray(next)) return next;
  if (isAgentConversationRole(next.role)) {
    next.role = "assistant";
  }
  const partToolCalls = toolCallsFromParts(next.parts);
  if (partToolCalls.length > 0) {
    next.toolCalls = partToolCalls;
  }
  if (Array.isArray(next.toolCalls)) {
    next.toolCalls = next.toolCalls.map((entry) => sanitizeProviderToolCall(entry));
  }
  return next;
}

function sanitizeProviderMessages(messages) {
  return Array.isArray(messages) ? messages.map((entry) => sanitizeProviderMessage(entry)) : [];
}

function unwrapDetailedInvokeResult(invoked) {
  const wrapped = invoked && Object.prototype.hasOwnProperty.call(invoked, "output") ? invoked.output : null;
  if (wrapped && typeof wrapped === "object" && !Array.isArray(wrapped) && Object.prototype.hasOwnProperty.call(wrapped, "value")) {
    return {
      value: Object.prototype.hasOwnProperty.call(wrapped, "value") ? wrapped.value : null,
      details: wrapped.details && typeof wrapped.details === "object" && !Array.isArray(wrapped.details)
        ? clone(wrapped.details)
        : null,
    };
  }
  return {
    value: wrapped,
    details: null,
  };
}

function applyToolLiteralArguments(args, definition) {
  const literals = definition && definition.toolLiteralArguments && typeof definition.toolLiteralArguments === "object" && !Array.isArray(definition.toolLiteralArguments)
    ? definition.toolLiteralArguments
    : null;
  if (!literals || Object.keys(literals).length === 0) {
    return args;
  }
  const next = args && typeof args === "object" && !Array.isArray(args) ? clone(args) : {};
  // Split provider-visible tools by caller contract, but the underlying invoke
  // still targets the original control. Reapply literal discriminator fields such
  // as `mode: "replace"` here so the control receives the chosen contract even if
  // the provider omits singleton enum arguments from the call payload.
  for (const [key, value] of Object.entries(literals)) {
    next[key] = clone(value);
  }
  return next;
}

async function executeToolCall(toolCall, currentControlId, config, host, signalState, round) {
  const toolName = toolCallName(toolCall);
  if (!toolName) throw new Error("tool call name is required");
  const definition = toolLookup(currentControlId, config, host)[toolName];
  if (!definition) throw new Error("tool not found: " + toolName);
  const args = applyToolRuntimeArguments(
    applyToolLiteralArguments(normalizeToolArguments(toolCallArguments(toolCall)), definition),
    definition,
    host,
  );
  const invokeArgs = normalizeGraphInvokeArgs(args, definition);
  const invokeInput = Array.isArray(definition.invokePath) && definition.invokePath.length > 0
    ? {
        id: definition.invokePath[0],
        path: definition.invokePath.slice(1),
        args: invokeArgs,
      }
    : invokeArgs;
  const usedPulling = toolUsesInternalPullDriver(definition);
  const invoked = usedPulling
    ? await invokePullableTool(definition, invokeInput, host, currentControlId, config, signalState, round)
    : host.graph.invoke({
        controlId: definition.invokeControlId || definition.controlId,
        input: invokeInput,
        details: true,
      });
  const invokedResult = usedPulling
    ? { value: invoked.output, details: null }
    : unwrapDetailedInvokeResult(invoked);
  const executed = buildExecutedToolCallResult(toolCall, definition, invoked, invokedResult, host);
  executed.messages = await runAgentMessageScript(currentControlId, config, {
    source: "tool",
    messages: executed.messages,
    tool: buildAgentMessageToolInfo(toolCall, definition),
  }, {
    phase: "tool-result",
    round: finiteNumber(round, 0),
    canInterrupt: false,
    queuedMessages: signalState && Array.isArray(signalState.pendingMessages)
      ? signalState.pendingMessages.length
      : 0,
    active: null,
  }, host);
  return executed;
}

function buildExecutedToolCallResult(toolCall, definition, invoked, invokedResult, host) {
  const toolName = toolCallName(toolCall) || normalizeString(definition && definition.name);
  const envelope = {
    version: 1,
    output: invokedResult.value,
    attachments: [],
  };
  if (!invoked || !invoked.ok) {
    envelope.output = {
      error: normalizeInvokedToolError(invoked),
    };
  } else if (invokedResult.value && typeof invokedResult.value === "object" && !Array.isArray(invokedResult.value)) {
    if (Object.prototype.hasOwnProperty.call(invokedResult.value, "output")) {
      envelope.output = invokedResult.value.output;
    }
    if (Array.isArray(invokedResult.value.attachments)) {
      envelope.attachments = clone(invokedResult.value.attachments);
    }
  }
  const parts = [{
    role: "tool",
    toolCallId: toolCallID(toolCall),
    name: toolName,
    parts: [{ kind: "text", text: JSON.stringify(envelope) }],
  }];
  if (envelope.attachments.length > 0) {
    parts.push({ role: "user", parts: normalizeMessageParts([], envelope.attachments) });
  }
  return {
    messages: parts,
    toolCall: normalizeTrackedToolCall(toolCall, "", {
      title: trackedToolCallTitle(definition, toolCall, host),
      status: invoked && invoked.ok ? "complete" : "error",
      details: buildTrackedToolCallDetails(invokedResult.details, envelope.output, envelope.attachments),
    }),
  };
}

function normalizeInvokedToolError(invoked) {
  const raw = invoked && invoked.error;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const next = clone(raw);
    if (!normalizeString(next.message)) {
      next.message = "tool call failed";
    }
    return next;
  }
  return {
    message: normalizeString(raw) || "tool call failed",
  };
}

function normalizeProviderResponse(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("provider call must return an object");
  }
  const text =
    normalizeString(result.text) ||
    normalizeString(result.reply) ||
    normalizeString(result.output) ||
    normalizeString(result.content);
  const reasoningText =
    normalizeString(result.reasoningText) ||
    normalizeString(result.reasoning) ||
    normalizeString(result.reasoning_content);
  const toolCalls = Array.isArray(result.toolCalls) ? clone(result.toolCalls) : [];
  let usage = null;
  if (result.usage && typeof result.usage === "object" && !Array.isArray(result.usage)) {
    usage = clone(result.usage);
  } else {
    const inputTokens = Number(result.inputTokens ?? result.promptTokens);
    const outputTokens = Number(result.outputTokens ?? result.completionTokens);
    const totalTokens = Number(result.totalTokens ?? result.total_tokens);
    if (Number.isFinite(inputTokens) || Number.isFinite(outputTokens) || Number.isFinite(totalTokens)) {
      usage = {};
      if (Number.isFinite(inputTokens)) usage.inputTokens = inputTokens;
      if (Number.isFinite(outputTokens)) usage.outputTokens = outputTokens;
      if (Number.isFinite(totalTokens)) usage.totalTokens = totalTokens;
    }
  }
  const finishReason = normalizeString(result.finishReason || result.finish_reason);
  const model = normalizeString(result.model || result.responseModel);
  const parts = normalizeAgentParts(result.parts);
  return {
    text,
    reasoningText,
    parts,
    toolCalls,
    usage,
    finishReason,
    model,
  };
}

function buildAgentMessage(response) {
  const parts = Array.isArray(response.parts) ? clone(response.parts) : [];
  const hasReasoningPart = parts.some((part) =>
    part && typeof part === "object" && normalizeString(part.kind).toLowerCase() === "reasoning");
  const hasTextPart = parts.some((part) =>
    part && typeof part === "object" && normalizeString(part.kind).toLowerCase() === "text");
  if (response.reasoningText && !hasReasoningPart) {
    parts.push({ kind: "reasoning", text: response.reasoningText });
  }
  if (response.text && !hasTextPart) {
    parts.push({ kind: "text", text: response.text });
  }
  const message = {
    role: "agent",
    parts: parts,
  };
  if (response.usage && typeof response.usage === "object" && !Array.isArray(response.usage)) {
    message.usage = clone(response.usage);
  }
  if (response.finishReason) message.finishReason = response.finishReason;
  if (response.model) message.model = response.model;
  return message;
}

function normalizeAgentParts(parts) {
  if (!Array.isArray(parts)) return [];
  const normalized = [];
  for (const part of parts) {
    if (!part || typeof part !== "object" || Array.isArray(part)) continue;
    const text = part.text === null || part.text === undefined ? "" : String(part.text);
    const hasMetadata = part.metadata && typeof part.metadata === "object" && !Array.isArray(part.metadata);
    const attachment = part.attachment && typeof part.attachment === "object" && !Array.isArray(part.attachment)
      ? clone(part.attachment)
      : null;
    const toolCall = part.toolCall && typeof part.toolCall === "object" && !Array.isArray(part.toolCall)
      ? normalizeTrackedToolCall(part.toolCall)
      : null;
    const error = part.error && typeof part.error === "object" && !Array.isArray(part.error)
      ? clone(part.error)
      : null;
    if (text === "" && !hasMetadata && !attachment && !toolCall && !error) continue;
    const next = {
      kind: normalizeString(part.kind) || "text",
      text: text,
    };
    if (hasMetadata) {
      next.metadata = clone(part.metadata);
    }
    if (attachment) {
      next.attachment = attachment;
    }
    if (toolCall && (toolCall.name || toolCall.id)) {
      next.toolCall = toolCall;
    }
    if (error) {
      next.error = error;
    }
    normalized.push(next);
  }
  return normalized;
}

function buildAgentChunkMessage(event) {
  if (!event || typeof event !== "object") return null;
  // Pull exposes provider chunk payloads as `content`, while direct provider
  // streaming still surfaces the same payload object as raw stream-event
  // `value`. Normalize both paths here, but require the same canonical
  // `{ parts:[...] }` payload so first-party providers fail fast if they drift
  // back to legacy text-only chunk events.
  const content = Object.prototype.hasOwnProperty.call(event, "content")
    ? event.content
    : Object.prototype.hasOwnProperty.call(event, "value")
      ? event.value
      : undefined;
  const value = content && typeof content === "object" && !Array.isArray(content)
    ? content
    : null;
  const parts = normalizeAgentParts(value && value.parts);
  if (parts.length === 0) {
    throw new Error("provider chunk events must use canonical value.parts payloads");
  }
  const message = {
    role: "agent",
    parts: parts,
  };
  return message;
}

function agentPullOutputEnabled(payload) {
  return !!(payload &&
    payload.runtime &&
    typeof payload.runtime === "object" &&
    !Array.isArray(payload.runtime) &&
    payload.runtime.pullOutput === true);
}

function emitAgentPullChunk(message, speaker, metadata, host) {
  if (!message || !host || !host.stream || typeof host.stream.write !== "function") {
    return false;
  }
  const event = {
    type: "chunk",
    value: clone(message),
  };
  let nextMetadata = metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? clone(metadata)
    : undefined;
  if (speaker) {
    if (!nextMetadata || typeof nextMetadata !== "object") {
      nextMetadata = {};
    }
    nextMetadata.speaker = speaker;
  }
  if (nextMetadata && typeof nextMetadata === "object" && Object.keys(nextMetadata).length > 0) {
    event.metadata = nextMetadata;
  }
  host.stream.write(event);
  return true;
}

function hasAgentChunkContent(message) {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return false;
  }
  if (Array.isArray(message.parts) && message.parts.length > 0) {
    return true;
  }
  return false;
}

function createPulledProviderChunkState() {
  return {
    text: "",
    reasoningText: "",
    parts: [],
  };
}

function accumulatePulledProviderChunk(state, message) {
  if (!state || !message || !Array.isArray(message.parts)) return;
  const parts = normalizeAgentParts(message.parts);
  state.parts = [...state.parts, ...clone(parts)];
  for (const part of parts) {
    if (!part || typeof part !== "object" || Array.isArray(part)) continue;
    const text = part.text === null || part.text === undefined ? "" : String(part.text);
    if (text === "") continue;
    switch (normalizeString(part.kind).toLowerCase()) {
      case "reasoning":
        state.reasoningText += text;
        break;
      case "text":
        state.text += text;
        break;
      default:
        break;
    }
  }
}

function mergePulledProviderTerminalOutput(content, chunkState) {
  const hasChunkText = chunkState && chunkState.text !== "";
  const hasChunkReasoning = chunkState && chunkState.reasoningText !== "";
  const hasChunkParts = chunkState && Array.isArray(chunkState.parts) && chunkState.parts.length > 0;
  if (!hasChunkText && !hasChunkReasoning && !hasChunkParts) {
    return clone(content);
  }
  // Purposeful: terminal pull events no longer carry reply content. Rebuild the
  // full provider result here from accumulated chunks plus terminal-only
  // provider metadata so Agent can still derive the correct final message.
  const merged = content && typeof content === "object" && !Array.isArray(content)
    ? clone(content)
    : {};
  if (hasChunkText) {
    merged.text = chunkState.text;
  }
  if (hasChunkReasoning) {
    merged.reasoningText = chunkState.reasoningText;
  }
  if (hasChunkParts && !Array.isArray(merged.parts)) {
    merged.parts = clone(chunkState.parts);
  }
  return merged;
}

async function callPullableProviderControl(currentControlId, providerTarget, request, speaker, onChunk, host, config, signalState, round) {
  const ownerInvocationId = normalizeString(host && host.execution && host.execution.invocationId);
  const started = pullInvokeOutput(invokeControlPullStart(providerTarget, request, ownerInvocationId, host));
  const taskId = requirePullTaskID(started, "start");
  const activeControlId = targetInvokeControlID(providerTarget);
  let chunkWrote = false;
  const chunkState = createPulledProviderChunkState();
  try {
    for (;;) {
      const signalDecision = await checkpointAgentSignals(currentControlId, config, {
        phase: "provider-step",
        round: round,
        canInterrupt: true,
        active: {
          kind: "provider",
          controlId: activeControlId,
          taskId: taskId,
        },
      }, signalState, host);
      if (signalDecision.action === "interrupt") {
        throw createAgentSignalInterruptError();
      }
      if (signalDecision.action === "cancel") {
        throw createAgentSignalCancelError(signalDecision.reason);
      }
      if (!peekAgentTaskReady(taskId, host)) {
        delayPullLoop(host);
        continue;
      }
      const polled = pullInvokeOutput(invokeControlPullStep(providerTarget, taskId, host));
      requirePullTaskID(polled, "step", taskId);
      const event = normalizePullStepEvent(polled);
      const phase = normalizeString(event && event.phase).toLowerCase();
      if (phase === "chunk") {
        const chunk = buildAgentChunkMessage(event);
        accumulatePulledProviderChunk(chunkState, chunk);
        if (typeof onChunk === "function" && chunk != null) {
          onChunk(chunk, event.metadata);
          chunkWrote = true;
        }
        delayPullLoop(host);
        continue;
      }
      if (!isTerminalPullPhase(phase)) {
        delayPullLoop(host);
        continue;
      }
      if (phase === "cancel") {
        return {
          output: {
            cancelled: true,
            output: event && Object.prototype.hasOwnProperty.call(event, "content") ? clone(event.content) : undefined,
          },
          metadata: {
            chunkWrote: chunkWrote,
          },
        };
      }
      if (phase === "error") {
        throw new Error(pullTerminalMessage(event, "pullable control failed"));
      }
      const terminalOutput = mergePulledProviderTerminalOutput(
        event && Object.prototype.hasOwnProperty.call(event, "content") ? event.content : undefined,
        chunkState,
      );
      const providerSource = providerSourceFromTarget(providerTarget, terminalOutput);
      return {
        output: withReasoningProviderSource(terminalOutput, providerSource),
        metadata: {
          chunkWrote: chunkWrote,
        },
        providerSource: providerSource,
      };
    }
  } catch (error) {
    const cancelReason = isAgentSignalInterruptError(error)
      ? "signal-interrupt"
      : isAgentSignalCancelError(error)
        ? normalizeString(error.reason) || "signal-cancel"
        : isStreamCancelledError(error)
          ? "stream-cancelled"
          : "provider-pull-error";
    cancelPullTask(providerTarget, taskId, cancelReason, host);
    throw error;
  }
}

async function callConfiguredProviderControl(currentControlId, config, providerTarget, conversation, toolDefinitions, speaker, onChunk, host, signalState, round) {
  const request = {
    input: {
      messages: sanitizeProviderMessages(conversation),
      tools: clone(Array.isArray(toolDefinitions) ? toolDefinitions : buildToolDefinitions(currentControlId, config, host)),
    },
  };
  if (speaker) request.speaker = speaker;
  if (!targetSupportsPulling(providerTarget, host)) {
    return invokeProviderControl(providerTarget, request, host);
  }
  return callPullableProviderControl(currentControlId, providerTarget, request, speaker, onChunk, host, config, signalState, round);
}

function emptyAgentMessage() {
  return { role: "agent", parts: [] };
}

function agentPullEventMetadata(speaker, metadata) {
  let nextMetadata = metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? clone(metadata)
    : undefined;
  if (speaker) {
    if (!nextMetadata || typeof nextMetadata !== "object") {
      nextMetadata = {};
    }
    nextMetadata.speaker = speaker;
  }
  return nextMetadata && Object.keys(nextMetadata).length > 0 ? nextMetadata : undefined;
}

function normalizeAgentPullTaskState(raw) {
  const state = raw && typeof raw === "object" && !Array.isArray(raw)
    ? clone(raw)
    : null;
  if (!state) {
    throw new Error("agent pull task state must be an object");
  }
  if (!Array.isArray(state.conversation)) state.conversation = [];
  if (!Array.isArray(state.pendingContextMessages)) state.pendingContextMessages = [];
  if (!Array.isArray(state.trackedToolCalls)) state.trackedToolCalls = [];
  if (!Array.isArray(state.currentToolCalls)) state.currentToolCalls = [];
  if (!Array.isArray(state.pendingToolCalls)) state.pendingToolCalls = [];
  if (!Array.isArray(state.pendingEvents)) state.pendingEvents = [];
  if (!Array.isArray(state.historySeedPending)) state.historySeedPending = [];
  if (!state.signalState || typeof state.signalState !== "object" || Array.isArray(state.signalState)) {
    state.signalState = {};
  }
  if (!Array.isArray(state.signalState.pendingMessages)) state.signalState.pendingMessages = [];
  if (!state.active || typeof state.active !== "object" || Array.isArray(state.active)) {
    state.active = null;
  }
  state.round = Math.max(0, finiteNumber(state.round, 0));
  state.nextSequence = Math.max(1, finiteNumber(state.nextSequence, 1));
  state.maxToolRounds = Math.max(1, finiteNumber(state.maxToolRounds, 250));
  state.toolAgentIndex = finiteNumber(state.toolAgentIndex, finiteNumber(state.toolAssistantIndex, -1));
  delete state.toolAssistantIndex;
  state.hadAgentChunk = state.hadAgentChunk === true;
  return state;
}

function buildAgentLiveOutputMessage(message) {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return message;
  }
  const role = normalizeString(message.role) || "agent";
  const parts = normalizeAgentParts(message.parts);
  const next = {
    role,
    parts: clone(parts),
  };
  for (const key of ["name", "participantID", "participantId", "speaker", "usage", "finishReason", "model"]) {
    if (Object.prototype.hasOwnProperty.call(message, key)) {
      next[key] = clone(message[key]);
    }
  }
  return next;
}

function requireAgentTaskMethod(host, method) {
  if (!host || !host.task || typeof host.task[method] !== "function") {
    throw new Error("host.task." + method + " unavailable");
  }
}

function peekAgentTaskReady(taskId, host) {
  if (!host || !host.task || typeof host.task.peek !== "function") {
    return true;
  }
  const ready = host.task.peek({ taskId: normalizeString(taskId) });
  if (ready === true) {
    return true;
  }
  if (ready === false || ready == null) {
    return false;
  }
  throw new Error("host.task.peek must return a boolean");
}

function loadAgentPullTaskState(taskId, host) {
  requireAgentTaskMethod(host, "load");
  const loaded = host.task.load({ taskId: normalizeString(taskId) });
  const loadedTaskId = pullResultString(loaded, ["taskId", "TaskID"]);
  if (loadedTaskId && loadedTaskId !== normalizeString(taskId)) {
    throw new Error("agent pull task load returned mismatched taskId");
  }
  return normalizeAgentPullTaskState(pullResultData(loaded, ["state", "State"]));
}

function storeAgentPullTaskState(taskId, state, host) {
  requireAgentTaskMethod(host, "store");
  host.task.store({
    taskId: normalizeString(taskId),
    state: clone(state),
  });
}

function finishAgentPullTask(taskId, host) {
  requireAgentTaskMethod(host, "finish");
  host.task.finish({ taskId: normalizeString(taskId) });
}

function createAgentPullInitialState(currentControlId, inputMessages, config, ownerInvocationId) {
  return {
    version: 1,
    controlId: normalizeString(currentControlId),
    ownerInvocationId: normalizeString(ownerInvocationId),
    conversation: clone(inputMessages),
    pendingContextMessages: clone(inputMessages),
    trackedToolCalls: [],
    currentToolCalls: [],
    pendingToolCalls: [],
    pendingEvents: [],
    historySeedPending: clone(inputMessages),
    signalState: { pendingMessages: [] },
    active: null,
    round: 0,
    nextSequence: 1,
    toolAgentIndex: -1,
    hadAgentChunk: false,
    maxToolRounds: Math.max(1, configNumber(config, "maxToolRounds", 250)),
  };
}

function buildAgentPullStepOutput(taskId, state, event) {
  const result = {
    taskId: normalizeString(taskId),
  };
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    return result;
  }
  const phase = normalizeString(event.phase).toLowerCase();
  if (phase !== "chunk" && phase !== "end" && phase !== "error" && phase !== "cancel") {
    return result;
  }
  const sequence = Math.max(1, finiteNumber(state && state.nextSequence, 1));
  if (state && typeof state === "object") {
    state.nextSequence = sequence + 1;
  }
  result.sequence = sequence;
  result.phase = phase;
  if (phase === "chunk" && Object.prototype.hasOwnProperty.call(event, "content")) {
    result.content = clone(event.content);
  }
  if (phase === "error" || phase === "cancel") {
    const reason = normalizeString(event.reason);
    if (reason) {
      result.reason = reason;
    }
  }
  if (event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata)) {
    const metadata = clone(event.metadata);
    if (phase === "error" || phase === "cancel") {
      delete metadata.reason;
    }
    if (Object.keys(metadata).length > 0) {
      result.metadata = metadata;
    }
  }
  return result;
}

function normalizeAgentPullTerminalFields(phase, content) {
  const normalizedPhase = normalizeString(phase).toLowerCase();
  if (content === undefined || content === null) {
    return { reason: undefined, metadata: undefined };
  }
  if (typeof content === "string") {
    const reason = normalizedPhase === "error" || normalizedPhase === "cancel"
      ? normalizeString(content)
      : undefined;
    return { reason: reason || undefined, metadata: undefined };
  }
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    return { reason: undefined, metadata: undefined };
  }
  const metadata = clone(content);
  const reason = normalizeString(metadata.reason || metadata.message || metadata.error);
  delete metadata.message;
  delete metadata.error;
  delete metadata.role;
  delete metadata.parts;
  if (metadata.replace === true) {
    delete metadata.replace;
  }
  if (normalizedPhase === "error" || normalizedPhase === "cancel") {
    delete metadata.reason;
  }
  return {
    reason: (normalizedPhase === "error" || normalizedPhase === "cancel") && reason ? reason : undefined,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  };
}

function queueAgentPullEvent(state, phase, content, metadata) {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    return;
  }
  const event = {
    phase: normalizeString(phase).toLowerCase(),
  };
  if (content !== undefined) {
    event.content = clone(content);
  }
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata) && Object.keys(metadata).length > 0) {
    event.metadata = clone(metadata);
  }
  state.pendingEvents.push(event);
}

function emitQueuedAgentPullEvent(taskId, state, host) {
  if (!state || !Array.isArray(state.pendingEvents) || state.pendingEvents.length === 0) {
    return null;
  }
  const event = state.pendingEvents.shift();
  const result = buildAgentPullStepOutput(taskId, state, event);
  const phase = normalizeString(event && event.phase).toLowerCase();
  if (isTerminalPullPhase(phase) && state.pendingEvents.length === 0) {
    finishAgentPullTask(taskId, host);
  } else {
    storeAgentPullTaskState(taskId, state, host);
  }
  return result;
}

function updateAgentPullAgentToolCalls(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    return;
  }
  const toolCalls = clone(Array.isArray(state.currentToolCalls) ? state.currentToolCalls : []);
  const index = finiteNumber(state.toolAgentIndex, -1);
  if (index >= 0 && Array.isArray(state.conversation) && state.conversation[index] && typeof state.conversation[index] === "object") {
    state.conversation[index].parts = setToolCallParts(state.conversation[index].parts, toolCalls);
    delete state.conversation[index].toolCalls;
  }
  if (Array.isArray(state.pendingContextMessages) && state.pendingContextMessages.length > 0) {
    const first = state.pendingContextMessages[0];
    if (first && typeof first === "object" && isAgentConversationRole(first.role)) {
      first.parts = setToolCallParts(first.parts, toolCalls);
      delete first.toolCalls;
    }
  }
}

function currentAgentPullToolStatusMessage(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    return null;
  }
  const index = finiteNumber(state.toolAgentIndex, -1);
  if (index >= 0 && Array.isArray(state.conversation)) {
    const message = state.conversation[index];
    if (message && typeof message === "object" && !Array.isArray(message) && isAgentConversationRole(message.role)) {
      return clone(message);
    }
  }
  if (Array.isArray(state.pendingContextMessages) && state.pendingContextMessages.length > 0) {
    const message = state.pendingContextMessages[0];
    if (message && typeof message === "object" && !Array.isArray(message) && isAgentConversationRole(message.role)) {
      return clone(message);
    }
  }
  return null;
}

function agentToolStatusChunkMessage(message) {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return message;
  }
  const next = {
    role: normalizeString(message.role) || "agent",
    parts: normalizeAgentParts(message.parts).filter((part) => normalizeString(part.kind).toLowerCase() === "tool_call"),
  };
  return next;
}

function applyAgentPullInterruptMessages(state, messages, config, host) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return false;
  }
  state.conversation = [...state.conversation, ...clone(messages)];
  appendHistoryMessages(messages, config, host);
  state.pendingContextMessages = [...state.pendingContextMessages, ...clone(messages)];
  state.pendingToolCalls = [];
  state.active = null;
  state.toolAgentIndex = -1;
  state.trackedToolCalls = [];
  state.currentToolCalls = [];
  state.round += 1;
  return true;
}

function buildAgentPullChunkEvent(state, message, speaker, metadata) {
  if (!hasAgentChunkContent(message)) {
    return null;
  }
  state.hadAgentChunk = true;
  return {
    phase: "chunk",
    content: clone(message),
    metadata: agentPullEventMetadata(speaker, metadata),
  };
}

function buildAgentPullTerminalEvent(phase, metadataContent) {
  const event = {
    phase: normalizeString(phase).toLowerCase(),
  };
  const terminal = normalizeAgentPullTerminalFields(event.phase, metadataContent);
  if (terminal.reason) {
    event.reason = terminal.reason;
  }
  const metadata = terminal.metadata;
  if (metadata && typeof metadata === "object" && Object.keys(metadata).length > 0) {
    event.metadata = metadata;
  }
  return event;
}

function emitAgentPullFinalMessage(taskId, state, message, speaker, host) {
  if (state && state.hadAgentChunk !== true) {
    const chunkEvent = buildAgentPullChunkEvent(state, buildAgentLiveOutputMessage(message), speaker, null);
    if (chunkEvent) {
      queueAgentPullEvent(state, "end");
      return emitAgentPullResult(taskId, state, chunkEvent, host);
    }
  }
  return emitAgentPullResult(
    taskId,
    state,
    buildAgentPullTerminalEvent("end", message),
    host,
  );
}

function emitAgentPullResult(taskId, state, event, host) {
  const result = buildAgentPullStepOutput(taskId, state, event);
  if (isTerminalPullPhase(normalizeString(event && event.phase).toLowerCase())) {
    finishAgentPullTask(taskId, host);
  } else {
    storeAgentPullTaskState(taskId, state, host);
  }
  return result;
}

function storeEmptyAgentPullStep(taskId, state, host) {
  storeAgentPullTaskState(taskId, state, host);
  return {
    taskId: normalizeString(taskId),
  };
}

function hasAgentPullStepPhase(result) {
  return !!(result &&
    typeof result === "object" &&
    !Array.isArray(result) &&
    normalizeString(result.phase) !== "");
}

function agentPullToolPhase(round) {
  return round === 0 ? "initial" : "tool-round";
}

function buildAgentPullProviderRequest(currentControlId, config, state, providerTarget, host) {
  const providerContext = configString(config, "contextControl")
    ? resolveProviderMetadata(providerTarget, host)
    : null;
  const preparedMessages = resolveContextMessages(
    configString(config, "contextControl") ? state.pendingContextMessages : state.conversation,
    agentPullToolPhase(state.round),
    state.round,
    config,
    providerContext,
    host,
  );
  const providerConversation = withSystemPrompt(preparedMessages, configString(config, "systemPrompt"));
  const toolDefinitions = buildToolDefinitions(currentControlId, config, host);
  validateProviderRequestBudget(providerConversation, toolDefinitions, config, providerContext);
  return {
    request: {
      input: {
        messages: sanitizeProviderMessages(providerConversation),
        tools: clone(toolDefinitions),
      },
    },
    toolDefinitions: toolDefinitions,
  };
}

function agentPullStartActiveProvider(taskId, state, currentControlId, config, providerTarget, host) {
  const providerRequest = buildAgentPullProviderRequest(currentControlId, config, state, providerTarget, host).request;
  if (!targetSupportsPulling(providerTarget, host)) {
    return null;
  }
  const ownerInvocationId = normalizeString(state && state.ownerInvocationId) || normalizeString(host && host.execution && host.execution.invocationId);
  const started = pullInvokeOutput(invokeControlPullStart(providerTarget, providerRequest, ownerInvocationId, host));
  state.active = {
    kind: "provider",
    target: clone(providerTarget),
    taskId: requirePullTaskID(started, "start"),
    chunkState: createPulledProviderChunkState(),
    chunkWrote: false,
  };
  storeAgentPullTaskState(taskId, state, host);
  return {
    taskId: normalizeString(taskId),
  };
}

async function primeAgentPullStartTask(taskId, state, currentControlId, config, host) {
  if (!normalizeString(taskId)) {
    throw new Error("agent pull start requires taskId");
  }
  const activeControlId = normalizeString(currentControlId) || normalizeString(state && state.controlId);
  if (Array.isArray(state.historySeedPending) && state.historySeedPending.length > 0) {
    appendHistoryMessages(state.historySeedPending, config, host);
    state.historySeedPending = [];
  }
  const providerTarget = resolveBoundProviderTarget(activeControlId, config, host);
  if (providerTarget && targetSupportsPulling(providerTarget, host)) {
    agentPullStartActiveProvider(taskId, state, activeControlId, config, providerTarget, host);
    return;
  }
  storeAgentPullTaskState(taskId, state, host);
}

function buildAgentPullPassthroughMessage(state, config, host) {
  const passthroughMessages = resolveContextMessages(
    configString(config, "contextControl") ? state.pendingContextMessages : state.conversation,
    agentPullToolPhase(state.round),
    state.round,
    config,
    null,
    host,
  );
  if (!Array.isArray(passthroughMessages) || passthroughMessages.length === 0) {
    return emptyAgentMessage();
  }
  return clone(passthroughMessages[passthroughMessages.length - 1]);
}

function buildAgentPullCancelledOutput(content) {
  const cancelledOutput = {
    cancelled: true,
  };
  if (content !== undefined) {
    cancelledOutput.output = clone(content);
  }
  return cancelledOutput;
}

function advanceAgentPullToolResult(state, executed, config, host) {
  state.trackedToolCalls = upsertTrackedToolCall(state.trackedToolCalls, executed.toolCall);
  state.currentToolCalls = upsertTrackedToolCall(state.currentToolCalls, executed.toolCall);
  updateAgentPullAgentToolCalls(state);
  const statusMessage = currentAgentPullToolStatusMessage(state);
  appendHistoryMessages(executed.messages, config, host);
  state.conversation = [...state.conversation, ...executed.messages];
  state.pendingContextMessages = [...state.pendingContextMessages, ...clone(executed.messages)];
  state.pendingToolCalls.shift();
  state.active = null;
  if (state.pendingToolCalls.length === 0) {
    state.round += 1;
    state.toolAgentIndex = -1;
  }
  return statusMessage;
}

async function advanceAgentPullProviderOutcome(taskId, state, providerCall, currentControlId, config, speaker, host) {
  const providerResult = providerCall && typeof providerCall === "object" ? providerCall.output : providerCall;
  const providerMetadata = providerCall && typeof providerCall === "object" ? cloneObject(providerCall.metadata) : {};
  if (isProviderCallCancelledResult(providerResult)) {
    return emitAgentPullResult(
      taskId,
      state,
      buildAgentPullTerminalEvent("end", providerCallCancelledOutput(providerResult)),
      host,
    );
  }
  const response = normalizeProviderResponse(providerResult);
  if (!response.toolCalls.length) {
    const finalMessage = buildAgentMessage(response);
    const outputMessage = clone(finalMessage);
    if (state.trackedToolCalls.length > 0 && state.hadAgentChunk !== true) {
      outputMessage.parts = prependToolCallParts(outputMessage.parts, state.trackedToolCalls);
    }
    appendHistoryMessages([finalMessage], config, host);
    state.conversation = [...state.conversation, clone(finalMessage)];
    state.pendingContextMessages = [clone(finalMessage)];
    if (hasPendingAgentSignalMessages(state.signalState)) {
      const injectedMessages = drainAgentSignalMessages(state.signalState);
      if (injectedMessages.length > 0) {
        state.conversation = [...state.conversation, ...clone(injectedMessages)];
        appendHistoryMessages(injectedMessages, config, host);
        state.pendingContextMessages = clone(injectedMessages);
        state.trackedToolCalls = [];
        state.currentToolCalls = [];
        state.toolAgentIndex = -1;
        state.round += 1;
        const chunkEvent = providerMetadata.chunkWrote === true
          ? null
          : buildAgentPullChunkEvent(state, buildAgentLiveOutputMessage(outputMessage), speaker, null);
        if (chunkEvent) {
          return emitAgentPullResult(taskId, state, chunkEvent, host);
        }
        return storeEmptyAgentPullStep(taskId, state, host);
      }
    }
    const chunkEvent = providerMetadata.chunkWrote === true
      ? null
      : buildAgentPullChunkEvent(state, buildAgentLiveOutputMessage(outputMessage), speaker, null);
    if (chunkEvent) {
      queueAgentPullEvent(state, "end");
      return emitAgentPullResult(taskId, state, chunkEvent, host);
    }
    return emitAgentPullFinalMessage(taskId, state, outputMessage, speaker, host);
  }

  const agentMessage = buildAgentMessage(response);
  let currentToolCalls = [];
  response.toolCalls.forEach((toolCall, index) => {
    const definition = toolLookup(currentControlId, config, host)[toolCallName(toolCall)];
    const trackedToolCall = normalizeTrackedToolCall(toolCall, "tool-call-" + (state.round + 1) + "-" + (index + 1), {
      title: trackedToolCallTitle(definition, toolCall, host),
      status: "requested",
    });
    state.trackedToolCalls = upsertTrackedToolCall(
      state.trackedToolCalls,
      trackedToolCall,
    );
    currentToolCalls = upsertTrackedToolCall(currentToolCalls, trackedToolCall);
  });
  state.currentToolCalls = currentToolCalls;
  agentMessage.parts = setToolCallParts(agentMessage.parts, state.currentToolCalls);
  state.conversation = [...state.conversation, agentMessage];
  state.toolAgentIndex = state.conversation.length - 1;
  appendHistoryMessages([agentMessage], config, host);
  state.pendingContextMessages = [clone(agentMessage)];
  state.pendingToolCalls = clone(response.toolCalls);
  const chunkEvent = providerMetadata.chunkWrote === true
    ? null
    : buildAgentPullChunkEvent(state, buildAgentLiveOutputMessage(agentMessage), speaker, null);
  if (chunkEvent) {
    return emitAgentPullResult(taskId, state, chunkEvent, host);
  }
  return storeEmptyAgentPullStep(taskId, state, host);
}

async function advanceActiveAgentProviderTask(taskId, state, currentControlId, config, speaker, host) {
  const active = state.active;
  const signalDecision = await checkpointAgentSignals(currentControlId, config, {
    phase: "provider-step",
    round: state.round,
    canInterrupt: true,
    active: {
      kind: "provider",
      controlId: targetInvokeControlID(active.target),
      taskId: active.taskId,
    },
  }, state.signalState, host);
  if (signalDecision.action === "cancel") {
    cancelPullTask(active.target, active.taskId, normalizeString(signalDecision.reason) || "signal-cancel", host);
    return emitAgentPullResult(
      taskId,
      state,
      buildAgentPullTerminalEvent("cancel", { reason: normalizeString(signalDecision.reason) || "agent cancelled by signal" }),
      host,
    );
  }
  if (signalDecision.action === "interrupt") {
    cancelPullTask(active.target, active.taskId, "signal-interrupt", host);
    state.active = null;
    const injectedMessages = drainAgentSignalMessages(state.signalState);
    if (applyAgentPullInterruptMessages(state, injectedMessages, config, host)) {
      return storeEmptyAgentPullStep(taskId, state, host);
    }
    state.pendingToolCalls = [];
    state.toolAgentIndex = -1;
    state.trackedToolCalls = [];
    state.currentToolCalls = [];
    state.round += 1;
    return storeEmptyAgentPullStep(taskId, state, host);
  }
  if (!peekAgentTaskReady(active.taskId, host)) {
    state.active = active;
    return storeEmptyAgentPullStep(taskId, state, host);
  }
  const polled = pullInvokeOutput(invokeControlPullStep(active.target, active.taskId, host));
  requirePullTaskID(polled, "step", active.taskId);
  const event = normalizePullStepEvent(polled);
  const phase = normalizeString(event && event.phase).toLowerCase();
  if (phase === "chunk") {
    const chunk = buildAgentChunkMessage(event);
    accumulatePulledProviderChunk(active.chunkState, chunk);
    if (chunk != null) {
      active.chunkWrote = true;
      const chunkEvent = buildAgentPullChunkEvent(state, buildAgentLiveOutputMessage(chunk), speaker, event.metadata);
      state.active = active;
      if (chunkEvent) {
        return emitAgentPullResult(taskId, state, chunkEvent, host);
      }
    }
    state.active = active;
    return storeEmptyAgentPullStep(taskId, state, host);
  }
  if (!isTerminalPullPhase(phase)) {
    state.active = active;
    return storeEmptyAgentPullStep(taskId, state, host);
  }
  state.active = null;
  if (phase === "cancel") {
    return emitAgentPullResult(
      taskId,
      state,
      buildAgentPullTerminalEvent("end", buildAgentPullCancelledOutput(
        event && Object.prototype.hasOwnProperty.call(event, "content") ? event.content : undefined,
      )),
      host,
    );
  }
  if (phase === "error") {
    return emitAgentPullResult(
      taskId,
      state,
      buildAgentPullTerminalEvent("error", { reason: pullTerminalMessage(event, "pullable control failed") }),
      host,
    );
  }
  const terminalOutput = mergePulledProviderTerminalOutput(
    event && Object.prototype.hasOwnProperty.call(event, "content") ? event.content : undefined,
    active.chunkState,
  );
  const providerSource = providerSourceFromTarget(active.target, terminalOutput);
  return advanceAgentPullProviderOutcome(taskId, state, {
    output: withReasoningProviderSource(terminalOutput, providerSource),
    metadata: {
      chunkWrote: active.chunkWrote,
    },
    providerSource: providerSource,
  }, currentControlId, config, speaker, host);
}

async function startOrAdvanceAgentToolTask(taskId, state, currentControlId, config, speaker, host) {
  const toolCall = state.pendingToolCalls[0];
  if (!toolCall) {
    return storeEmptyAgentPullStep(taskId, state, host);
  }
  const toolName = toolCallName(toolCall);
  if (!toolName) {
    return emitAgentPullResult(taskId, state, buildAgentPullTerminalEvent("error", { reason: "tool call name is required" }), host);
  }
  const definition = toolLookup(currentControlId, config, host)[toolName];
  if (!definition) {
    return emitAgentPullResult(taskId, state, buildAgentPullTerminalEvent("error", { reason: "tool not found: " + toolName }), host);
  }
  if (!state.active) {
    if (!toolUsesInternalPullDriver(definition)) {
      const executed = await executeToolCall(toolCall, currentControlId, config, host, state.signalState, state.round);
      const statusMessage = advanceAgentPullToolResult(state, executed, config, host);
      const chunkEvent = buildAgentPullChunkEvent(
        state,
        buildAgentLiveOutputMessage(agentToolStatusChunkMessage(statusMessage)),
        speaker,
        null,
      );
      if (chunkEvent) {
        return emitAgentPullResult(taskId, state, chunkEvent, host);
      }
      return storeEmptyAgentPullStep(taskId, state, host);
    }
    const args = applyToolRuntimeArguments(
      applyToolLiteralArguments(normalizeToolArguments(toolCallArguments(toolCall)), definition),
      definition,
      host,
    );
    const invokeArgs = normalizeGraphInvokeArgs(args, definition);
    const invokeInput = Array.isArray(definition.invokePath) && definition.invokePath.length > 0
      ? {
          id: definition.invokePath[0],
          path: definition.invokePath.slice(1),
          args: invokeArgs,
        }
      : invokeArgs;
    const ownerInvocationId = normalizeString(state && state.ownerInvocationId) || normalizeString(host && host.execution && host.execution.invocationId);
    const invokeControlId = definition.invokeControlId || definition.controlId;
    const started = pullInvokeOutput(invokeControlPullStart(invokeControlId, invokeInput, ownerInvocationId, host));
    state.active = {
      kind: "tool",
      definition: clone(definition),
      taskId: requirePullTaskID(started, "start"),
      toolCall: clone(toolCall),
    };
    return storeEmptyAgentPullStep(taskId, state, host);
  }

  const active = state.active;
  const signalDecision = await checkpointAgentSignals(currentControlId, config, {
    phase: "tool-step",
    round: state.round,
    canInterrupt: true,
    active: {
      kind: "tool",
      controlId: active.definition.invokeControlId || active.definition.controlId,
      taskId: active.taskId,
      name: normalizeString(active.definition && active.definition.name),
    },
  }, state.signalState, host);
  if (signalDecision.action === "cancel") {
    cancelPullTask(active.definition.invokeControlId || active.definition.controlId, active.taskId, normalizeString(signalDecision.reason) || "signal-cancel", host);
    return emitAgentPullResult(
      taskId,
      state,
      buildAgentPullTerminalEvent("cancel", { reason: normalizeString(signalDecision.reason) || "agent cancelled by signal" }),
      host,
    );
  }
  if (signalDecision.action === "interrupt") {
    cancelPullTask(active.definition.invokeControlId || active.definition.controlId, active.taskId, "signal-interrupt", host);
    state.active = null;
    const injectedMessages = drainAgentSignalMessages(state.signalState);
    if (applyAgentPullInterruptMessages(state, injectedMessages, config, host)) {
      return storeEmptyAgentPullStep(taskId, state, host);
    }
    state.pendingToolCalls = [];
    state.toolAgentIndex = -1;
    state.trackedToolCalls = [];
    state.currentToolCalls = [];
    state.round += 1;
    return storeEmptyAgentPullStep(taskId, state, host);
  }
  if (!peekAgentTaskReady(active.taskId, host)) {
    return storeEmptyAgentPullStep(taskId, state, host);
  }
  const polled = pullInvokeOutput(invokeControlPullStep(active.definition.invokeControlId || active.definition.controlId, active.taskId, host));
  requirePullTaskID(polled, "step", active.taskId);
  const event = normalizePullStepEvent(polled);
  const phase = normalizeString(event && event.phase).toLowerCase();
  if (!isTerminalPullPhase(phase)) {
    return storeEmptyAgentPullStep(taskId, state, host);
  }
  state.active = null;
  const invoked = phase === "end"
    ? {
        ok: true,
        output: event && Object.prototype.hasOwnProperty.call(event, "content") ? clone(event.content) : undefined,
      }
    : {
        ok: false,
        error: phase === "cancel"
          ? pullTerminalMessage(event, "pull task cancelled")
          : pullTerminalMessage(event, "pullable control failed"),
        output: event && Object.prototype.hasOwnProperty.call(event, "content") ? clone(event.content) : undefined,
      };
  const executed = buildExecutedToolCallResult(
    active.toolCall,
    active.definition,
    invoked,
    { value: invoked.output, details: null },
    host,
  );
  executed.messages = await runAgentMessageScript(currentControlId, config, {
    source: "tool",
    messages: executed.messages,
    tool: buildAgentMessageToolInfo(active.toolCall, active.definition),
  }, {
    phase: "tool-result",
    round: state.round,
    canInterrupt: false,
    queuedMessages: state.signalState && Array.isArray(state.signalState.pendingMessages)
      ? state.signalState.pendingMessages.length
      : 0,
    active: null,
  }, host);
  const statusMessage = advanceAgentPullToolResult(state, executed, config, host);
  const chunkEvent = buildAgentPullChunkEvent(
    state,
    buildAgentLiveOutputMessage(agentToolStatusChunkMessage(statusMessage)),
    speaker,
    null,
  );
  if (chunkEvent) {
    return emitAgentPullResult(taskId, state, chunkEvent, host);
  }
  return storeEmptyAgentPullStep(taskId, state, host);
}

async function stepAgentPullTask(payload, pull, currentControlId, config, speaker, host) {
  const taskId = normalizeString(pull.taskId);
  if (!taskId) {
    throw new Error("agent pull step requires taskId");
  }
  const state = loadAgentPullTaskState(taskId, host);
  const activeControlId = normalizeString(currentControlId) || normalizeString(state && state.controlId);
  for (let iteration = 0; iteration < 1000; iteration += 1) {
    const queued = emitQueuedAgentPullEvent(taskId, state, host);
    if (queued) {
      return queued;
    }
    if (state.historySeedPending.length > 0) {
      appendHistoryMessages(state.historySeedPending, config, host);
      state.historySeedPending = [];
      continue;
    }
    if (state.active && normalizeString(state.active.kind) === "provider") {
      const providerResult = await advanceActiveAgentProviderTask(taskId, state, activeControlId, config, speaker, host);
      if (hasAgentPullStepPhase(providerResult)) {
        return providerResult;
      }
      if (state.active && normalizeString(state.active.kind) === "provider") {
        return providerResult;
      }
      continue;
    }
    if (state.active && normalizeString(state.active.kind) === "tool") {
      const toolResult = await startOrAdvanceAgentToolTask(taskId, state, activeControlId, config, speaker, host);
      if (hasAgentPullStepPhase(toolResult)) {
        return toolResult;
      }
      if (state.active && normalizeString(state.active.kind) === "tool") {
        return toolResult;
      }
      continue;
    }
    if (state.pendingToolCalls.length > 0) {
      const pendingToolResult = await startOrAdvanceAgentToolTask(taskId, state, activeControlId, config, speaker, host);
      if (hasAgentPullStepPhase(pendingToolResult)) {
        return pendingToolResult;
      }
      if (state.active && normalizeString(state.active.kind) === "tool") {
        return pendingToolResult;
      }
      continue;
    }
    if (state.round >= state.maxToolRounds) {
      return emitAgentPullFinalMessage(taskId, state, emptyAgentMessage(), speaker, host);
    }
    const pendingSignalDecision = await checkpointAgentSignals(activeControlId, config, {
      phase: "before-provider-round",
      round: state.round,
      canInterrupt: false,
      active: null,
    }, state.signalState, host);
    if (pendingSignalDecision.action === "cancel") {
      return emitAgentPullResult(
        taskId,
        state,
        buildAgentPullTerminalEvent("cancel", { reason: normalizeString(pendingSignalDecision.reason) || "agent cancelled by signal" }),
        host,
      );
    }
    if (hasPendingAgentSignalMessages(state.signalState)) {
      const injectedMessages = drainAgentSignalMessages(state.signalState);
      if (injectedMessages.length > 0) {
        state.conversation = [...state.conversation, ...clone(injectedMessages)];
        appendHistoryMessages(injectedMessages, config, host);
        state.pendingContextMessages = [...state.pendingContextMessages, ...clone(injectedMessages)];
        continue;
      }
    }
    const providerTarget = resolveBoundProviderTarget(activeControlId, config, host);
    if (!providerTarget) {
      return emitAgentPullFinalMessage(taskId, state, buildAgentPullPassthroughMessage(state, config, host), speaker, host);
    }
    const startedProvider = agentPullStartActiveProvider(taskId, state, activeControlId, config, providerTarget, host);
    if (startedProvider) {
      return startedProvider;
    }
    const providerCall = await invokeProviderControl(
      providerTarget,
      buildAgentPullProviderRequest(activeControlId, config, state, providerTarget, host).request,
      host,
    );
    const providerResult = await advanceAgentPullProviderOutcome(taskId, state, providerCall, activeControlId, config, speaker, host);
    if (hasAgentPullStepPhase(providerResult)) {
      return providerResult;
    }
    if (state.active && normalizeString(state.active.kind) === "provider") {
      return providerResult;
    }
  }
  throw new Error("agent pull step exceeded internal boundary iterations");
}

async function agentControl(payload, host) {
  const config = payload.config || {};
  const speaker = resolveSpeakerName(config, payload);
  const currentControlId = normalizeString(payload && payload.control && payload.control.id);
  const pull = runtimePullRequest(payload && payload.input);
  if (pull) {
    if (!host.task) {
      throw new Error("host.task unavailable");
    }
    if (pull.pull === "start") {
      if (!currentControlId) {
        throw new Error("agent pull start requires current control id");
      }
      const rawInputMessages = asMessages(pull.payload && pull.payload.messages, "agent input");
      let inputMessages = rawInputMessages;
      let cancelledAtStart = "";
      try {
        inputMessages = await runAgentMessageScript(currentControlId, config, {
          source: "input",
          messages: rawInputMessages,
        }, {
          phase: "initial-input",
          round: 0,
          canInterrupt: false,
          queuedMessages: 0,
          active: null,
        }, host);
      } catch (error) {
        if (!isAgentMessageCancelError(error)) {
          throw error;
        }
        cancelledAtStart = normalizeString(error.reason) || normalizeString(error.message);
        inputMessages = [];
      }
      const initialState = createAgentPullInitialState(currentControlId, inputMessages, config, pull.ownerInvocationId);
      if (cancelledAtStart) {
        initialState.pendingEvents.push(buildAgentPullTerminalEvent("cancel", { reason: cancelledAtStart }));
      }
      const started = host.task.start({
        kind: "agent",
        ownerInvocationId: pull.ownerInvocationId,
        request: initialState,
      });
      const taskId = requirePullTaskID(started, "start");
      if (!cancelledAtStart) {
        try {
          await primeAgentPullStartTask(taskId, initialState, currentControlId, config, host);
        } catch (error) {
          initialState.active = null;
          initialState.pendingEvents.push(buildAgentPullTerminalEvent("error", {
            reason: normalizeString(error && error.message) || String(error),
          }));
          try {
            storeAgentPullTaskState(taskId, initialState, host);
          } catch (_storeError) {
            throw error;
          }
        }
      }
      return {
        output: started,
      };
    }
    if (pull.pull === "step") {
      try {
        return {
          output: await stepAgentPullTask(payload, pull, currentControlId, config, speaker, host),
        };
      } catch (error) {
        const taskId = normalizeString(pull.taskId);
        let sequence = 1;
        if (taskId) {
          try {
            const state = loadAgentPullTaskState(taskId, host);
            sequence = Math.max(1, finiteNumber(state && state.nextSequence, 1));
          } catch (_loadError) {}
        }
        if (taskId) {
          try {
            finishAgentPullTask(taskId, host);
          } catch (_finishError) {}
        }
        const phase = isAgentSignalCancelError(error) || isAgentMessageCancelError(error) ? "cancel" : "error";
        const content = phase === "cancel"
          ? normalizeString(error && error.reason) || normalizeString(error && error.message) || "agent cancelled"
          : normalizeString(error && error.message) || String(error);
        const output = {
          taskId: taskId,
          sequence: sequence,
          phase: phase,
        };
        if (content) {
          output.reason = content;
        }
        return { output: output };
      }
    }
    return {
      output: host.task.cancel({
        taskId: pull.taskId,
        reason: pull.reason,
      }),
    };
  }
  const providerTarget = resolveBoundProviderTarget(currentControlId, config, host);
  const rawInputMessages = asMessages(payload.input, "agent input");
  let inputMessages;
  try {
    inputMessages = await runAgentMessageScript(currentControlId, config, {
      source: "input",
      messages: rawInputMessages,
    }, {
      phase: "initial-input",
      round: 0,
      canInterrupt: false,
      queuedMessages: 0,
      active: null,
    }, host);
  } catch (error) {
    if (!isAgentMessageCancelError(error)) {
      throw error;
    }
    const cancelledOutput = {
      cancelled: true,
    };
    const reason = normalizeString(error.reason) || normalizeString(error.message);
    if (reason) {
      cancelledOutput.reason = reason;
    }
    return speaker ? { output: cancelledOutput, metadata: { speaker: speaker } } : { output: cancelledOutput };
  }
  if (!providerTarget) {
    const passthroughMessages = resolveContextMessages(inputMessages, "initial", 0, config, null, host);
    const passthrough = Array.isArray(passthroughMessages) && passthroughMessages.length > 0
      ? clone(passthroughMessages[passthroughMessages.length - 1])
      : emptyAgentMessage();
    return speaker ? { output: passthrough, metadata: { speaker: speaker } } : { output: passthrough };
  }
  const providerContext = configString(config, "contextControl")
    ? resolveProviderMetadata(providerTarget, host)
    : null;
  const pullOutput = agentPullOutputEnabled(payload);
  try {
    let conversation = clone(inputMessages);
    appendHistoryMessages(inputMessages, config, host);
    let trackedToolCalls = [];
    let pendingContextMessages = clone(inputMessages);
    const signalState = { pendingMessages: [] };
    // Keep this fallback aligned with the Agent manifest default so unset controls
    // behave the same whether the value comes from config or runtime fallback.
    const maxToolRounds = Math.max(1, configNumber(config, "maxToolRounds", 250));
    agent_round:
    for (let round = 0; round < maxToolRounds; round += 1) {
      const pendingSignalDecision = await checkpointAgentSignals(currentControlId, config, {
        phase: "before-provider-round",
        round: round,
        canInterrupt: false,
        active: null,
      }, signalState, host);
      if (pendingSignalDecision.action === "cancel") {
        throw createAgentSignalCancelError(pendingSignalDecision.reason);
      }
      if (hasPendingAgentSignalMessages(signalState)) {
        const injectedMessages = drainAgentSignalMessages(signalState);
        if (injectedMessages.length > 0) {
          conversation = [...conversation, ...clone(injectedMessages)];
          appendHistoryMessages(injectedMessages, config, host);
          pendingContextMessages = [...pendingContextMessages, ...clone(injectedMessages)];
        }
      }
      const phase = round === 0 ? "initial" : "tool-round";
      // Context now receives only the new messages for this round. Without a
      // Context control, Agent still falls back to its full in-memory execution
      // transcript so direct Agent calls keep the old simple behavior.
      const preparedMessages = resolveContextMessages(
        configString(config, "contextControl") ? pendingContextMessages : conversation,
        phase,
        round,
        config,
        providerContext,
        host,
      );
      const providerConversation = withSystemPrompt(preparedMessages, configString(config, "systemPrompt"));
      const toolDefinitions = buildToolDefinitions(currentControlId, config, host);
      validateProviderRequestBudget(providerConversation, toolDefinitions, config, providerContext);
      let providerCall;
      const emitPulledAgentChunk = pullOutput
        ? function (message, metadata) {
          emitAgentPullChunk(buildAgentLiveOutputMessage(message), speaker, metadata, host);
        }
        : null;
      try {
        providerCall = await callConfiguredProviderControl(
          currentControlId,
          config,
          providerTarget,
          providerConversation,
          toolDefinitions,
          speaker,
          emitPulledAgentChunk,
          host,
          signalState,
          round,
        );
      } catch (error) {
        if (isAgentSignalInterruptError(error)) {
          const injectedMessages = drainAgentSignalMessages(signalState);
          if (injectedMessages.length > 0) {
            conversation = [...conversation, ...clone(injectedMessages)];
            appendHistoryMessages(injectedMessages, config, host);
            pendingContextMessages = [...pendingContextMessages, ...clone(injectedMessages)];
            trackedToolCalls = [];
            continue agent_round;
          }
        }
        if (isAgentSignalCancelError(error) || isAgentMessageCancelError(error)) {
          throw error;
        }
        throw error;
      }
      const providerResult = providerCall && typeof providerCall === "object" ? providerCall.output : providerCall;
      const providerMetadata = providerCall && typeof providerCall === "object" ? cloneObject(providerCall.metadata) : {};
      if (isProviderCallCancelledResult(providerResult)) {
        const cancelledOutput = providerCallCancelledOutput(providerResult);
        return speaker ? { output: cancelledOutput, metadata: { speaker: speaker } } : { output: cancelledOutput };
      }
      const response = normalizeProviderResponse(providerResult);
      if (!response.toolCalls.length) {
        const finalMessage = buildAgentMessage(response);
        const outputMessage = clone(finalMessage);
        if (trackedToolCalls.length > 0 && pullOutput !== true) {
          outputMessage.parts = prependToolCallParts(outputMessage.parts, trackedToolCalls);
        }
        if (pullOutput && providerMetadata.chunkWrote !== true && hasAgentChunkContent(outputMessage)) {
          emitAgentPullChunk(buildAgentLiveOutputMessage(outputMessage), speaker, null, host);
        }
        appendHistoryMessages([finalMessage], config, host);
        if (hasPendingAgentSignalMessages(signalState)) {
          const injectedMessages = drainAgentSignalMessages(signalState);
          if (injectedMessages.length > 0) {
            conversation = [...conversation, clone(finalMessage), ...clone(injectedMessages)];
            appendHistoryMessages(injectedMessages, config, host);
            pendingContextMessages = clone(injectedMessages);
            trackedToolCalls = [];
            continue agent_round;
          }
        }
        return speaker ? { output: outputMessage, metadata: { speaker: speaker } } : { output: outputMessage };
      }
      const agentMessage = buildAgentMessage(response);
      let currentToolCalls = [];
      response.toolCalls.forEach((toolCall, index) => {
        const definition = toolLookup(currentControlId, config, host)[toolCallName(toolCall)];
        const trackedToolCall = normalizeTrackedToolCall(toolCall, "tool-call-" + (round + 1) + "-" + (index + 1), {
          title: trackedToolCallTitle(definition, toolCall, host),
          status: "requested",
        });
        trackedToolCalls = upsertTrackedToolCall(trackedToolCalls, trackedToolCall);
        currentToolCalls = upsertTrackedToolCall(currentToolCalls, trackedToolCall);
      });
      agentMessage.parts = setToolCallParts(agentMessage.parts, currentToolCalls);
      if (pullOutput && providerMetadata.chunkWrote !== true && hasAgentChunkContent(agentMessage)) {
        emitAgentPullChunk(buildAgentLiveOutputMessage(agentMessage), speaker, null, host);
      }
      conversation = [...conversation, agentMessage];
      appendHistoryMessages([agentMessage], config, host);
      pendingContextMessages = [clone(agentMessage)];
      for (const toolCall of response.toolCalls) {
        let executed;
        try {
          executed = await executeToolCall(toolCall, currentControlId, config, host, signalState, round);
        } catch (error) {
          if (isAgentSignalInterruptError(error)) {
            const injectedMessages = drainAgentSignalMessages(signalState);
            if (injectedMessages.length > 0) {
              conversation = [...conversation, ...clone(injectedMessages)];
              appendHistoryMessages(injectedMessages, config, host);
              pendingContextMessages = [...pendingContextMessages, ...clone(injectedMessages)];
              trackedToolCalls = [];
              continue agent_round;
            }
          }
          if (isAgentSignalCancelError(error) || isAgentMessageCancelError(error)) {
            throw error;
          }
          throw error;
        }
        trackedToolCalls = upsertTrackedToolCall(trackedToolCalls, executed.toolCall);
        currentToolCalls = upsertTrackedToolCall(currentToolCalls, executed.toolCall);
        agentMessage.parts = setToolCallParts(agentMessage.parts, currentToolCalls);
        if (pullOutput && hasAgentChunkContent(agentMessage)) {
          emitAgentPullChunk(
            buildAgentLiveOutputMessage(agentToolStatusChunkMessage(agentMessage)),
            speaker,
            null,
            host,
          );
        }
        appendHistoryMessages(executed.messages, config, host);
        conversation = [...conversation, ...executed.messages];
        pendingContextMessages = [...pendingContextMessages, ...clone(executed.messages)];
      }
    }
    const emptyMessage = emptyAgentMessage();
    return speaker ? { output: emptyMessage, metadata: { speaker: speaker } } : { output: emptyMessage };
  } catch (error) {
    if (isAgentSignalCancelError(error) || isAgentMessageCancelError(error)) {
      const cancelledOutput = {
        cancelled: true,
      };
      const reason = normalizeString(error.reason) || normalizeString(error && error.message);
      if (reason) {
        cancelledOutput.reason = reason;
      }
      return speaker ? { output: cancelledOutput, metadata: { speaker: speaker } } : { output: cancelledOutput };
    }
    throw error;
  }
}

function buildEffectiveProviderConfig(config, provider, request) {
  const effective = providerConfig(provider);
  const requestedRef = normalizeString(request && request.config);
  const ref = requestedRef || providerRef(provider) || providerRefFromConfig(config);
  if (ref) effective.providerRef = ref;
  const definitionId = providerDefinitionId(provider) || configString(config, "providerDefinitionId");
  const interfaces = providerInterfaces(provider);
  if (definitionId) effective.providerDefinitionId = definitionId;
  if (interfaces.length > 0) effective.providerInterfaces = interfaces;
  for (const key of ["llmModel", "timeoutSeconds", "reasoningEffort"]) {
    if (Object.prototype.hasOwnProperty.call(config, key) && hasOverrideValue(config[key])) {
      effective[key] = clone(config[key]);
    }
  }
  const requestOverrides = {
    llmModel: request && request.model,
    timeoutSeconds: request && request.timeoutSeconds,
    reasoningEffort: request && request.reasoning,
  };
  for (const [key, value] of Object.entries(requestOverrides)) {
    if (hasOverrideValue(value)) {
      effective[key] = clone(value);
    }
  }
  return effective;
}

function runtimePullRequest(input) {
  const pull = input && typeof input === "object" && !Array.isArray(input)
    ? input
    : null;
  if (!pull) return null;
  const pullMode = normalizeString(pull.pull).toLowerCase();
  // Treat objects with an explicit start/step/cancel pull discriminator as
  // pull lifecycle traffic
  // traffic even when the sandbox bridge exposes them as host-backed objects
  // instead of plain own-property maps. Ordinary calls like { metadata: true }
  // still skip this path because their pull string is empty.
  if (!pullMode) {
    return null;
  }
  if (pullMode !== "start" && pullMode !== "step" && pullMode !== "cancel") {
    throw new Error("pull must be start, step, or cancel");
  }
  return {
    pull: pullMode,
    taskId: normalizeString(pull.taskId),
    ownerInvocationId: normalizeString(pull.ownerInvocationId),
    reason: normalizeString(pull.reason),
    payload: (function () {
      const payload = clone(pull);
      delete payload.pull;
      delete payload.taskId;
      delete payload.ownerInvocationId;
      delete payload.reason;
      return payload;
    }()),
  };
}

function textProviderControl(payload, host) {
  const config = payload.config || {};
  const provider = providerMetaFromPayload(config, payload);
  const request = payload.input || {};
  if (request && typeof request === "object" && !Array.isArray(request)) {
    const pull = runtimePullRequest(request);
    const args = pull && pull.pull === "start" ? pull.payload : request;
    const effectiveConfig = buildEffectiveProviderConfig(config, provider, args);
    const ref = configString(effectiveConfig, "providerRef");
    if (!ref) throw new Error("providerRef is required; select a provider instance on this control");
    const metadataRequest = metadataRequestValue(args);
    if (metadataRequest) {
      if (Object.prototype.hasOwnProperty.call(args, "input")) {
        throw new Error("provider metadata request does not accept input");
      }
      const metadata = buildProviderMetadata(effectiveConfig, provider, metadataRequest, host);
      return { output: metadata };
    }
    const providerInput = clone(args.input);
    if (providerInput && typeof providerInput === "object" && !Array.isArray(providerInput) &&
      Object.prototype.hasOwnProperty.call(providerInput, "messages")) {
      providerInput.messages = asMessages(providerInput.messages, "provider input messages");
      providerInput.messages = sanitizeProviderMessages(providerInput.messages);
    }
    if (pull) {
      if (!host.task) {
        throw new Error("host.task unavailable");
      }
      if (pull.pull === "start") {
        return {
          output: host.task.start({
            kind: "provider-runtime",
            ownerInvocationId: pull.ownerInvocationId,
            request: {
              projectId: normalizeString(payload && payload.project && payload.project.id),
              providerRef: ref,
              definitionId: configString(effectiveConfig, "providerDefinitionId"),
              config: clone(effectiveConfig),
              action: "respondText",
              payload: providerInput,
            },
          }),
        };
      }
      if (pull.pull === "step") {
        return {
          output: normalizeAttachedTaskStepOutput(host.task.pull({
            taskId: pull.taskId,
          }), pull.taskId),
        };
      }
      return {
        output: host.task.cancel({
          taskId: pull.taskId,
          reason: pull.reason,
        }),
      };
    }
    const providerMeta = cloneObject(provider);
    providerMeta.ref = ref;
    providerMeta.definitionId = configString(effectiveConfig, "providerDefinitionId");
    providerMeta.interfaces = Array.isArray(effectiveConfig.providerInterfaces) ? clone(effectiveConfig.providerInterfaces) : providerInterfaces(provider);
    providerMeta.config = effectiveConfig;
    const result = host.providerRuntime.call({
      providerRef: ref,
      definitionId: configString(effectiveConfig, "providerDefinitionId"),
      config: effectiveConfig,
      action: "respondText",
      payload: providerInput,
    });
    const output = withProviderResultMetadata(result, providerMeta);
    if (!output || typeof output !== "object" || Array.isArray(output)) {
      throw new Error("provider call must return an object");
    }
    return { output: output };
  }
  throw new Error("provider input must be an object");
}

module.exports = {
  "agent-control": agentControl,
  "text-provider-control": textProviderControl,
};
