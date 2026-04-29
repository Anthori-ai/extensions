Composition Standard packages the generic composition controls.

`Passthrough` is a composition boundary for `controlTarget[]` control lists. Hosts that expose connected controls from those array bindings can flatten Passthrough so callers still see the downstream controls directly while invocation still goes through the extra Passthrough boundary.

`Selector` exposes the currently selected connected control to callers. When its `options` field is connected only to compatible controls, downstream controlTarget target-type checks and caller-contract validation can both treat `Selector` as the selected option instead of only as a generic executable wrapper.
