import {
	type OpenWorkspaceBackgroundPanelDialogInput,
	openWorkspaceBackgroundPanelDialog,
} from "@/management/workspace/background/open-panel";

export type OpenWorkspaceBackgroundPanelInput = {
	panelIndex: 1 | 2 | 3 | 4 | 5;
	/** Optional hint; managed root is resolved like the workspace context menu when omitted. */
	supportRoot?: string;
};

/** Settings entry point — delegates to the workspace background open path. */
export async function openWorkspaceBackgroundPanel(
	win: Window,
	input: OpenWorkspaceBackgroundPanelInput,
): Promise<void> {
	const dialogInput: OpenWorkspaceBackgroundPanelDialogInput = {
		panelId: `panel-${input.panelIndex}`,
		layoutReadSupportRoot: input.supportRoot?.trim() || undefined,
	};
	await openWorkspaceBackgroundPanelDialog(win, dialogInput);
}
