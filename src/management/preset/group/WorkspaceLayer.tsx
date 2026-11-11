import { type JSX, memo, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Preset } from "@/management/preset/contract";
import { GroupPanelOverlay } from "@/management/preset/group/PanelOverlay";
import { ATTR_GRID } from "@/management/workspace/placement/types";

/**
 * Renders the expanded group panel inside the workspace grid (portal).
 * Keeps group UI out of `workspace/surface/Grid.tsx`.
 */
export const WorkspaceGroupLayer = memo(function WorkspaceGroupLayerImpl({
	panelRoot,
	onRunPreset,
}: {
	panelRoot: HTMLElement | null;
	onRunPreset?: (preset: Preset) => void;
}): JSX.Element | null {
	const [gridHost, setGridHost] = useState<HTMLElement | null>(null);

	useEffect(() => {
		if (!panelRoot) {
			setGridHost(null);
			return;
		}
		const sync = (): void => {
			setGridHost(
				panelRoot.querySelector<HTMLElement>(`[${ATTR_GRID}]`) ?? null,
			);
		};
		sync();
		const observer = new MutationObserver(sync);
		observer.observe(panelRoot, { childList: true, subtree: true });
		return () => observer.disconnect();
	}, [panelRoot]);

	if (!gridHost) return null;

	return createPortal(
		<GroupPanelOverlay panelRoot={panelRoot} onRunPreset={onRunPreset} />,
		gridHost,
	);
});
