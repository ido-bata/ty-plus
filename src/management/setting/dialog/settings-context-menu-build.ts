import type { CepMenuPayload } from "@/management/dialog/dialogs/context-menu";
import {
	SETTINGS_CTX,
	SETTINGS_DIALOG_SURFACE_ID,
} from "@/management/setting/dialog/settings-context-menu-ids";

export type CepMenuItem = CepMenuPayload["menu"][number];

export const SETTINGS_MENU_SEP: CepMenuItem = { label: "---" };

export function settingsSectionIdFromTitle(title: string): string {
	return title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

export function dialogActionsMenu(): CepMenuItem[] {
	return [
		{ id: SETTINGS_CTX.dialogSave, label: "Save" },
		{ id: SETTINGS_CTX.dialogCancel, label: "Cancel" },
		{ id: SETTINGS_CTX.dialogReset, label: "Reset" },
		SETTINGS_MENU_SEP,
		{ id: SETTINGS_CTX.dialogReload, label: "Reload from disk" },
	];
}

function sectionMenuItems(sectionId: string): CepMenuItem[] | null {
	switch (sectionId) {
		case "design-tokens":
			return [
				{ id: SETTINGS_CTX.tokensApply, label: "Apply & Save" },
				{ id: SETTINGS_CTX.tokensExport, label: "Export to Clipboard" },
				{ id: SETTINGS_CTX.tokensImport, label: "Import from Text" },
				SETTINGS_MENU_SEP,
				{
					id: SETTINGS_CTX.tokensResetAll,
					label: "Reset all tokens to defaults",
				},
			];
		case "workspace-backup":
			return [
				{ id: SETTINGS_CTX.backupExport, label: "Export workspace backup" },
				{ id: SETTINGS_CTX.backupImport, label: "Import workspace backup" },
			];
		case "feedback":
			return [{ id: SETTINGS_CTX.feedbackClear, label: "Clear feedback form" }];
		case "paths":
			return [
				{ id: SETTINGS_CTX.pathsRefresh, label: "Refresh paths from disk" },
			];
		default:
			return null;
	}
}

/**
 * Default fallback for the settings dialog right-click.
 *
 * Per project rule, the **default** state must be empty: no non-functional
 * "Ty Plus · Settings" header, no actions leaked into generic-area right
 * clicks. Functional entries are surfaced by the targeted branches
 * (footer / header / token / path / editable / section), which all
 * return their own payloads. The exported function is kept for
 * backward compatibility with any external caller but no longer
 * renders the legacy branding row.
 */
export function buildSettingsSurfaceDefaultMenu(): CepMenuPayload {
	return { menu: [] };
}

function buildTextFieldMenu(
	el: HTMLInputElement | HTMLTextAreaElement,
): CepMenuPayload {
	const hasValue = Boolean(el.value?.length);
	const readOnly = el.readOnly || el.disabled;
	return {
		menu: [
			{ id: SETTINGS_CTX.textSelectAll, label: "Select All" },
			SETTINGS_MENU_SEP,
			{
				id: SETTINGS_CTX.textCut,
				label: "Cut",
				enabled: !readOnly && hasValue,
			},
			{
				id: SETTINGS_CTX.textCopy,
				label: "Copy",
				enabled: hasValue,
			},
			{ id: SETTINGS_CTX.textPaste, label: "Paste", enabled: !readOnly },
			{
				id: SETTINGS_CTX.textClear,
				label: "Clear",
				enabled: !readOnly && hasValue,
			},
			SETTINGS_MENU_SEP,
			...dialogActionsMenu(),
		],
	};
}

function buildPathFieldMenu(
	input: HTMLInputElement,
	pathRoot: HTMLElement,
): CepMenuPayload {
	const hasValue = Boolean(input.value?.length);
	const readOnly = input.readOnly || input.disabled;
	const browse = pathRoot.querySelector<HTMLButtonElement>(
		"button[type='button']:not([disabled])",
	);
	return {
		menu: [
			{
				id: SETTINGS_CTX.pathCopy,
				label: "Copy path",
				enabled: hasValue,
			},
			{
				id: SETTINGS_CTX.pathPaste,
				label: "Paste into path",
				enabled: !readOnly,
			},
			{
				id: SETTINGS_CTX.pathBrowse,
				label: "Browse…",
				enabled: Boolean(browse),
			},
			SETTINGS_MENU_SEP,
			...buildTextFieldMenu(input).menu,
		],
	};
}

function buildTokenFieldMenu(tokenKey: string): CepMenuPayload {
	return {
		menu: [
			{
				id: `${SETTINGS_CTX.tokenResetPrefix}${encodeURIComponent(tokenKey)}`,
				label: "Reset token to default",
			},
			SETTINGS_MENU_SEP,
			...(sectionMenuItems("design-tokens") ?? []),
			SETTINGS_MENU_SEP,
			...dialogActionsMenu(),
		],
	};
}

function buildSectionBodyMenu(sectionId: string): CepMenuPayload {
	const sectionItems = sectionMenuItems(sectionId);
	const menu: CepMenuItem[] = sectionItems?.length ? [...sectionItems] : [];
	if (menu.length) {
		menu.push(SETTINGS_MENU_SEP);
	}
	menu.push(...dialogActionsMenu());
	return { menu };
}

function resolveEditableField(
	target: Element,
): HTMLInputElement | HTMLTextAreaElement | null {
	if (target instanceof HTMLInputElement) {
		const type = (target.type || "text").toLowerCase();
		if (type === "hidden" || type === "checkbox" || type === "radio") {
			return null;
		}
		return target;
	}
	if (target instanceof HTMLTextAreaElement) {
		return target;
	}
	const nested = target.closest("input, textarea");
	if (nested instanceof HTMLInputElement) {
		const type = (nested.type || "text").toLowerCase();
		if (type === "hidden" || type === "checkbox" || type === "radio") {
			return null;
		}
		return nested;
	}
	if (nested instanceof HTMLTextAreaElement) {
		return nested;
	}
	return null;
}

export function buildSettingsContextMenuPayload(
	event: MouseEvent,
): CepMenuPayload | null {
	const target = event.target;
	if (!(target instanceof Element)) {
		return null;
	}
	if (!target.closest(`[data-surface-id="${SETTINGS_DIALOG_SURFACE_ID}"]`)) {
		return null;
	}

	if (target.closest("[data-settings-footer]")) {
		return { menu: dialogActionsMenu() };
	}

	if (target.closest("[data-dialog-header]")) {
		return {
			menu: [
				{ id: SETTINGS_CTX.headerClose, label: "Close" },
				SETTINGS_MENU_SEP,
				...dialogActionsMenu(),
			],
		};
	}

	const tokenHost = target.closest("[data-design-token-key]");
	if (tokenHost) {
		const tokenKey = tokenHost.getAttribute("data-design-token-key")?.trim();
		if (tokenKey) {
			return buildTokenFieldMenu(tokenKey);
		}
	}

	if (target.closest("[data-settings-backup-bundle]")) {
		const editable = resolveEditableField(target);
		if (editable) {
			const menu = buildTextFieldMenu(editable).menu;
			return {
				menu: [
					{ id: SETTINGS_CTX.backupExport, label: "Export workspace backup" },
					{ id: SETTINGS_CTX.backupImport, label: "Import workspace backup" },
					SETTINGS_MENU_SEP,
					...menu,
				],
			};
		}
		return {
			menu: sectionMenuItems("workspace-backup") ?? dialogActionsMenu(),
		};
	}

	const pathRoot = target.closest("[data-path-field]");
	if (pathRoot) {
		const input = pathRoot.querySelector("input");
		if (input instanceof HTMLInputElement) {
			return buildPathFieldMenu(input, pathRoot as HTMLElement);
		}
	}

	const editable = resolveEditableField(target);
	if (editable) {
		return buildTextFieldMenu(editable);
	}

	const sectionEl = target.closest("[data-settings-section]");
	if (sectionEl) {
		const sectionId = sectionEl.getAttribute("data-settings-section")?.trim();
		if (sectionId) {
			return buildSectionBodyMenu(sectionId);
		}
	}

	return buildSettingsSurfaceDefaultMenu();
}
