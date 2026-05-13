# Notification

First-party project extension that lets graphs emit user-facing notification events through the sandboxed executable host.

`System > Notification > Send` publishes a structured `notification` graph event. Desktop clients can show it as a toast, and companion clients can subscribe to the same event stream for local notifications or status refreshes.
