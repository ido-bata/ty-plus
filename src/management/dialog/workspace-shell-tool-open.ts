import type { ToolDialogKind } from "@/management/dialog/dialogs/ids";
import { tyPlusWorkspaceToolDialogId } from "@/management/dialog/dialogs/ids";

/** `DialogRoot` surface ids for status bar / workspace shell tool kinds. */
function workspaceShellSurfaceIdForToolKind(kind: ToolDialogKind): string {
	switch (kind) {
		case "presets":
			return "dialog-presets";
		case "presetLibrary":
			return "dialog-preset-library";
		case "messages":
			return "dialog-messages";
		case "settings":
			return "dialog-settings";
		default: {
			const _never: never = kind;
			return _never;
		}
	}
}

export type WorkspaceShellToolDialogOpenPlan = {
	extensionId: string;
	surfaceId: string;
};

/**
 * Workspace shell tool dialogs are separate CEP Modeless extensions (not panel UI).
 * Returns null when not running under CEP.
 */
export function planWorkspaceShellToolDialogOpen(
	kind: ToolDialogKind,
	isCep: boolean,
): WorkspaceShellToolDialogOpenPlan | null {
	if (!isCep) return null;
	const surfaceId = workspaceShellSurfaceIdForToolKind(kind);
	return {
		extensionId: tyPlusWorkspaceToolDialogId(kind),
		surfaceId,
	};
}
