function trim(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

function normalizeSimpleTransportErrorMessage(message, fallback) {
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
    return "Simple provider request failed. The provider may be unavailable right now. Upstream error: " + text;
  }
  return text || fallback;
}

function hostFetch(host, request, onEvent) {
  try {
    return host.http.fetch(request, onEvent);
  } catch (error) {
    throw new Error(
      normalizeSimpleTransportErrorMessage(
        error && error.message ? error.message : error,
        "simple provider request failed"
      )
    );
  }
}

function finiteNumber(value) {
  var parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function messageText(message) {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return "";
  }
  if (!Array.isArray(message.parts)) {
    return "";
  }
  var text = "";
  for (var i = 0; i < message.parts.length; i += 1) {
    var part = message.parts[i];
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
  return trim(text);
}

function latestMessageText(messages) {
  if (!Array.isArray(messages)) {
    return "";
  }
  for (var i = messages.length - 1; i >= 0; i -= 1) {
    var text = messageText(messages[i]);
    if (text !== "") {
      return text;
    }
  }
  return "";
}

function extractText(value) {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return trim(value);
  }
  if (Array.isArray(value)) {
    return "";
  }
  if (typeof value === "object") {
    var keys = ["text", "reply", "output", "content"];
    for (var i = 0; i < keys.length; i += 1) {
      var candidate = trim(value[keys[i]]);
      if (candidate !== "") {
        return candidate;
      }
    }
    if (Array.isArray(value.choices) && value.choices.length > 0) {
      var first = value.choices[0];
      if (first && first.message && typeof first.message === "object") {
        return trim(first.message.content);
      }
    }
  }
  return "";
}

module.exports = {
  "list-models": function (input) {
    var provider = input && input.provider && typeof input.provider === "object" ? input.provider : {};
    var config = provider && provider.config && typeof provider.config === "object" ? provider.config : {};
    var model = trim(config.llmModel) || "custom-model";
    var maxContextTokens = Math.floor(finiteNumber(config.maxContextTokens));
    if (maxContextTokens <= 0) {
      return { error: "provider config maxContextTokens is required" };
    }
    return {
      output: {
        items: [
          {
            id: model,
            maxContextTokens: maxContextTokens,
          },
        ],
        reachable: true,
      },
    };
  },
  "respond-text": function (input, host) {
    var provider = input && input.provider && typeof input.provider === "object" ? input.provider : {};
    var config = provider && provider.config && typeof provider.config === "object" ? provider.config : {};
    var request = input && input.request && typeof input.request === "object" ? input.request : {};

    var endpoint = trim(config.http);
    if (endpoint === "") {
      return { error: "provider config http is required" };
    }

    var text = trim(request.prompt);
    if (text === "") {
      text = latestMessageText(request.messages);
    }

    var response = hostFetch(host, {
      url: endpoint,
      method: "POST",
      // Timeout is owned by execution/control runtime budget, not provider config.
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        text: text
      })
    });

    if (!response || !response.ok) {
      return {
        error: normalizeSimpleTransportErrorMessage(
          trim(response && response.body),
          "simple provider request failed"
        )
      };
    }

    var responseText = "";
    var rawBody = trim(response.body);
    if (rawBody !== "") {
      try {
        responseText = extractText(JSON.parse(rawBody));
      } catch (err) {
        responseText = rawBody;
      }
    }
    if (responseText === "") {
      return { error: "provider response did not include text" };
    }

    return {
      output: {
        text: responseText
      }
    };
  }
};
