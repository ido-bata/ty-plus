import { openCepDialogSurface } from "@/management/ae/cep/transport";
import { TY_PLUS_DIALOG_EXTENSION } from "@/management/dialog/dialogs/ids";
import { writePresetToolHandoff } from "@/management/preset/tool-handoff-file";

/**
 * Opens the modeless widget picker (`dialog-widget-selector` surface).
 * `openerPanelId` is the workspace panel id (`panel-1`, …).
 *
 * On some hosts (e.g. AE) the JSON payload passed to `requestOpenExtension`
 * does not reach `getArguments()`, so we first write a handoff under userData
 * and then launch (same path the preset tool uses).
 */
export function openWidgetAddDialogSurface(
	win: Window,
	openerPanelId: string,
): void {
	const extId = TY_PLUS_DIALOG_EXTENSION.widgetSelector;
	const trimmed = openerPanelId.trim();
	void (async () => {
		try {
			await writePresetToolHandoff(win, extId, {
				openerSurfaceId: trimmed,
			});
		} catch {
			/* Skip in environments without cep fs */
		}
		openCepDialogSurface(win, {
			extensionId: extId,
			params: { openerSurfaceId: trimmed },
		});
	})();
}
