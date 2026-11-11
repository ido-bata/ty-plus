/**
 * Dialogs module — dialog orchestration, requests, handoffs, results.
 *
 * Wave 2 task: F8
 */

import { openCepDialogSurface } from "@/management/ae/cep/transport";
import { storeRequest as storeDialogRequest } from "@/management/dialog/dialogs/bridge";
import {
	TY_PLUS_DIALOG_EXTENSION,
	type ToolDialogKind,
} from "@/management/dialog/dialogs/ids";
import { createProbeId as createDialogProbeId } from "@/management/dialog/dialogs/probe/session";
import { planWorkspaceShellToolDialogOpen } from "@/management/dialog/workspace-shell-tool-open";
import { allocatePresetAddToolExtensionId } from "@/management/preset/add-dialog-pool";
import { writePresetToolHandoff } from "@/management/preset/tool-handoff-file";
import { openWorkspaceBackgroundPanelDialog } from "@/management/workspace/background/open-panel";

// ── Pure dialog param builders ─────────────────────────────────────────────────

/**
 * Builds open params for workspace shell tool dialogs from raw JSON string.
 */
const buildDialogOpenParams = (
	rawJson: string | undefined,
	panelId: string,
): Record<string, unknown> => {
	const base: Record<string, unknown> = { openerSurfaceId: panelId };
	if (!rawJson?.trim()) {
		return base;
	}
	try {
		const parsed = JSON.parse(rawJson) as unknown;
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			return base;
		}
		const o = parsed as Record<string, unknown>;
		if (o.initialTab === "list" || o.initialTab === "create") {
			base.initialTab = o.initialTab;
		}
		if (
			typeof o.createTemplate === "string" &&
			/^[a-z][a-z0-9-]{0,31}$/i.test(o.createTemplate)
		) {
			base.createTemplate = o.createTemplate;
		}
		if (typeof o.initialCommand === "string" && o.initialCommand.trim()) {
			base.initialCommand = o.initialCommand.trim();
		}
	} catch {
		/* ignore */
	}
	return base;
};

// ── Dialog open request helpers ───────────────────────────────────────────────

/**
 * Opens a workspace shell tool dialog surface.
 */
export const requestOpenWorkspaceShellTool = (
	kind: ToolDialogKind,
	paramsRaw: string | null | undefined,
	panelId: string,
	isCep: boolean,
	win: Window,
): void => {
	const plan = planWorkspaceShellToolDialogOpen(kind, isCep);
	if (!plan) return;
	const openParams = buildDialogOpenParams(paramsRaw ?? undefined, panelId);
	openCepDialogSurface(win, {
		extensionId: plan.extensionId,
		params: { openerSurfaceId: panelId, ...openParams },
	});
};

/**
 * Opens the workspace background panel dialog.
 */
export const requestOpenBackgroundPanel = (
	panelId: string,
	isCep: boolean,
	win: Window,
	lastPersistenceManagedRoot: string | null | undefined,
): void => {
	if (!isCep) return;
	void openWorkspaceBackgroundPanelDialog(win, {
		panelId,
		layoutReadSupportRoot: lastPersistenceManagedRoot ?? undefined,
	});
};

/**
 * Opens a preset tool dialog surface (CEP only).
 * Writes handoff file for reliable cross-panel delivery via getArguments.
 */
export const openPresetToolSurface = async (
	win: Window,
	panelId: string,
	surfaceId: string,
	params?: Record<string, unknown>,
): Promise<void> => {
	const { getPresetToolDialogEntry } = await import(
		"@/management/preset/registry"
	);
	const entry = getPresetToolDialogEntry(surfaceId);
	if (!entry) return;
	const extensionId = allocatePresetAddToolExtensionId();
	const payload: Record<string, unknown> = {
		openerSurfaceId: panelId,
		...(params ?? {}),
		presetToolSurfaceId: surfaceId,
	};
	try {
		await writePresetToolHandoff(win, extensionId, payload);
	} catch {
		/* CEP Node / fs unavailable: skip handoff (delegate to bus / getArguments) */
	}
	openCepDialogSurface(win, {
		extensionId,
		params: payload,
	});
};

/**
 * Opens the CEP dialog probe surface.
 */
export const openDialogProbe = async (
	payload: { title?: string; message?: string } = {},
	isCep: boolean,
	panelId: string,
	win: Window,
): Promise<void> => {
	if (!isCep) return;
	const dialogId = createDialogProbeId();
	await storeDialogRequest(win, dialogId, payload);
	openCepDialogSurface(win, {
		extensionId: TY_PLUS_DIALOG_EXTENSION.probe,
		params: { openerSurfaceId: panelId, dialogId },
	});
};
