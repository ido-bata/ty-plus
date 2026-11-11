/**
 * Programmatic `data-ws-action` click for workspace handlers (capture listener on panel root).
 *
 * Optional attribute `data-opener-workspace-panel` (`panel-1` … `panel-5`): panel-scoped
 * actions such as Add Widget use this workspace panel instead of the surface default.
 */
export function dispatchWorkspaceWsActionClick(
	root: Element,
	action: string,
	dataAttrs: Record<string, string> = {},
): void {
	const btn = document.createElement("button");
	btn.type = "button";
	btn.setAttribute("data-ws-action", action);
	for (const [k, v] of Object.entries(dataAttrs)) {
		if (v !== "") {
			btn.setAttribute(k, v);
		}
	}
	btn.setAttribute("tabindex", "-1");
	btn.style.cssText =
		"position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none";
	root.appendChild(btn);
	btn.dispatchEvent(
		new MouseEvent("click", { bubbles: true, cancelable: true }),
	);
	root.removeChild(btn);
}
