import { openCepDialogSurface } from "@/management/ae/cep/transport";
import { TY_PLUS_DIALOG_EXTENSION } from "@/management/dialog/dialogs/ids";
import { writePresetToolHandoff } from "@/management/preset/tool-handoff-file";
import { writeBackgroundDialogRootHandoff } from "@/management/workspace/background/dialog-root-handoff";
import { resolveWorkspacePersistenceManagedRoot } from "@/management/workspace/layout/persistence-root";

export type OpenWorkspaceBackgroundPanelDialogInput = {
	/** Canonical workspace panel id (`panel-1` … `panel-5`). */
	panelId: string;
	/** Optional support root hint; when omitted, resolves the same managed root as the workspace shell. */
	layoutReadSupportRoot?: string;
};

/**
 * Opens the workspace background layer editor (same path as workspace context menu
 * `CTX_MENU_IDS.openBackground` → `requestOpenBackgroundPanel` in `hook.ts`).
 */
export async function openWorkspaceBackgroundPanelDialog(
	win: Window,
	input: OpenWorkspaceBackgroundPanelDialogInput,
): Promise<void> {
	const panelId = input.panelId.trim();
	if (!/^panel-[1-5]$/.test(panelId)) {
		console.warn(
			"[WorkspaceBackground] openWorkspaceBackgroundPanelDialog: invalid panelId",
			panelId,
		);
		return;
	}

	const layoutReadSupportRoot =
		(
			await resolveWorkspacePersistenceManagedRoot(
				win,
				input.layoutReadSupportRoot,
			)
		)?.trim() ?? undefined;

	try {
		if (layoutReadSupportRoot) {
			win.localStorage?.setItem(
				"ty-plus.workspace.backgroundDialog.supportRoot",
				layoutReadSupportRoot,
			);
			writeBackgroundDialogRootHandoff(win, layoutReadSupportRoot);
			await writePresetToolHandoff(
				win,
				TY_PLUS_DIALOG_EXTENSION.backgroundPanel,
				{
					openerSurfaceId: panelId,
					layoutReadSupportRoot,
				},
			);
			console.info("[WorkspaceBackground] dialog-root-handoff", {
				panelId,
				supportRoot: layoutReadSupportRoot,
			});
		}
	} catch (e) {
		console.warn("[WorkspaceBackground] dialog-root-handoff-failed", e);
	}

	openCepDialogSurface(win, {
		extensionId: TY_PLUS_DIALOG_EXTENSION.backgroundPanel,
		params: {
			openerSurfaceId: panelId,
			surfaceId: "dialog-background-panel",
			layoutReadSupportRoot,
		},
	});
}
