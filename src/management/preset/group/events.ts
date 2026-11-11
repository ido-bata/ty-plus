export const GROUP_WORKSPACE_EVENT = "typlus:group-workspace-request";

/**
 * Bus event for cross-panel group lifecycle changes (toggle the opened
 * group panel; release / dissolve a group on the workspace).
 *
 * - `toggle-open`: issued by a tile click or the "Open" menu item.
 *   Receiving panels flip `openedGroupPresetId` to the given id (or back
 *   to `null` when it was already open).
 * - `release`: issued by a successful group release (right-click "Release
 *   Group", or the drag-out handler). Receiving panels can use this to
 *   refresh their `groupCatalogEntries` snapshot without re-reading disk.
 */
export type GroupWorkspaceRequest =
	| {
			type: "toggle-open";
			groupId: string;
	  }
	| {
			type: "release";
			groupId: string;
	  };

export function dispatchGroupWorkspaceRequest(
	detail: GroupWorkspaceRequest,
): void {
	window.dispatchEvent(
		new CustomEvent<GroupWorkspaceRequest>(GROUP_WORKSPACE_EVENT, {
			detail,
		}),
	);
}
