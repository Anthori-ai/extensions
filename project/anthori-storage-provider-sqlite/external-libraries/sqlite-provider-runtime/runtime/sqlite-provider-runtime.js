"use strict";

function normalizeString(value) {
  return String(value == null ? "" : value).trim();
}

module.exports = {
  "resolve-sqlite-path": function (input) {
    var provider = input && typeof input === "object" && input.provider && typeof input.provider === "object" ? input.provider : {};
    var config = provider.config && typeof provider.config === "object" ? provider.config : {};
    var path = normalizeString(config.path);
    if (!path) {
      return { error: "provider config path is required" };
    }
    return {
      output: {
        path: path
      }
    };
  }
};
