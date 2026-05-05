# Agent Standard

First-party project extension that contributes the default visible `Agent` and Agent library `Storage` and `Context` controls.

It depends on `anthori.agent.foundation`, which provides the hidden shared `agent-base` and `text-provider-base` definitions used by the first-party agent/provider stack.

`Storage` builds on the shared storage foundation but uses agent-shaped message contracts plus a `writeStream` action that accepts `{ action:"writeStream", event: StreamWriteEvent }`, assembles streamed agent replies internally, and keeps `insert`, `insertAll`, `select`, `update`, and `delete` table-style operations available. Its `select` action requires `kind:"raw"` for stored row envelopes or `kind:"context"` for replay-safe `ContextMessage[]`; both shapes accept an optional `maxChars` hint that trims the oldest selected rows/messages until the result fits. Anthori-side tool-call UI metadata such as live `status`, inline `details`, or session-local `detailsRef` pointers is stripped from `parts[].toolCall` before rows are stored or budgeted so model history stays provider-safe, while provider-owned round-trip metadata remains available on `parts[].toolCall.metadata`. Terminal `error` or `cancel` stream events may carry plain string content; Storage ignores that text for row assembly, clears the active stream state, and still returns `{ ok:true }`.

`Context` builds provider-ready history from durable `Storage` rows, optional compacted session memory, and the latest round of Agent messages. Its editable Compact Prompt controls the summarizer instructions used when older history is compacted; if the prompt contains `{{transcript}}`, Context replaces that token with the transcript, otherwise it appends the transcript automatically.
