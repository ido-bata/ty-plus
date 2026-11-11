import type { CepMenuPayload } from "@/management/dialog/dialogs/context-menu";

export const PRESET_TOOL_CTX = {
	save: "ty.ctx.presetTool.save",
	cancel: "ty.ctx.presetTool.cancel",
	copyPath: "ty.ctx.presetTool.copyPath",
	browsePath: "ty.ctx.presetTool.browsePath",
	selectEntry: "ty.ctx.presetTool.selectEntry",
	openEntry: "ty.ctx.presetTool.openEntry",
	textSelectAll: "ty.ctx.presetTool.textSelectAll",
	textCut: "ty.ctx.presetTool.textCut",
	textCopy: "ty.ctx.presetTool.textCopy",
	textPaste: "ty.ctx.presetTool.textPaste",
	textClear: "ty.ctx.presetTool.textClear",
} as const;

const SEP: CepMenuPayload["menu"][number] = { label: "---" };

const actionsMenu = (): CepMenuPayload["menu"] => [
	{ id: PRESET_TOOL_CTX.save, label: "Create" },
	{ id: PRESET_TOOL_CTX.cancel, label: "Cancel" },
];

const resolveEditableField = (
	target: Element,
): HTMLInputElement | HTMLTextAreaElement | null => {
	if (target instanceof HTMLInputElement) {
		const type = (target.type || "text").toLowerCase();
		if (type === "hidden" || type === "checkbox" || type === "radio")
			return null;
		return target;
	}
	if (target instanceof HTMLTextAreaElement) return target;
	const nested = target.closest("input, textarea");
	if (nested instanceof HTMLInputElement) {
		const type = (nested.type || "text").toLowerCase();
		if (type === "hidden" || type === "checkbox" || type === "radio")
			return null;
		return nested;
	}
	return nested instanceof HTMLTextAreaElement ? nested : null;
};

const buildTextFieldMenu = (
	el: HTMLInputElement | HTMLTextAreaElement,
): CepMenuPayload => {
	const hasValue = Boolean(el.value?.length);
	const readOnly = el.readOnly || el.disabled;
	return {
		menu: [
			{ id: PRESET_TOOL_CTX.textSelectAll, label: "Select All" },
			SEP,
			{
				id: PRESET_TOOL_CTX.textCut,
				label: "Cut",
				enabled: !readOnly && hasValue,
			},
			{ id: PRESET_TOOL_CTX.textCopy, label: "Copy", enabled: hasValue },
			{ id: PRESET_TOOL_CTX.textPaste, label: "Paste", enabled: !readOnly },
			{
				id: PRESET_TOOL_CTX.textClear,
				label: "Clear",
				enabled: !readOnly && hasValue,
			},
			SEP,
			...actionsMenu(),
		],
	};
};

export function buildPresetToolContextMenuPayload(
	event: MouseEvent,
	surfaceId: string,
): CepMenuPayload | null {
	const target = event.target;
	if (!(target instanceof Element)) return null;
	if (!target.closest(`[data-surface-id="${surfaceId}"]`)) return null;
	if (target.closest("[data-dialog-header]")) {
		// No "Ty Plus · …" header: project rule says default/override menus
		// must only carry actionable rows.
		return { menu: [...actionsMenu()] };
	}
	if (target.closest("[data-preset-tool-footer]")) {
		return { menu: [...actionsMenu()] };
	}
	const authoringArea = target.closest("[data-preset-tool-area]");
	if (authoringArea) {
		return { menu: [...actionsMenu()] };
	}
	const directoryEntry = target.closest("[data-directory-browser-entry]");
	if (directoryEntry) {
		const isDir = directoryEntry.getAttribute("data-entry-kind") === "dir";
		return {
			menu: [
				{
					id: PRESET_TOOL_CTX.openEntry,
					label: isDir ? "Open folder" : "Open file",
				},
				{
					id: PRESET_TOOL_CTX.selectEntry,
					label: isDir ? "Select folder" : "Select file",
				},
				SEP,
				...actionsMenu(),
			],
		};
	}
	const pathRoot = target.closest("[data-path-field]");
	if (pathRoot) {
		const input = pathRoot.querySelector("input");
		const hasValue =
			input instanceof HTMLInputElement && input.value.length > 0;
		return {
			menu: [
				{ id: PRESET_TOOL_CTX.copyPath, label: "Copy path", enabled: hasValue },
				{ id: PRESET_TOOL_CTX.browsePath, label: "Browse..." },
				SEP,
				...(input instanceof HTMLInputElement
					? buildTextFieldMenu(input).menu
					: actionsMenu()),
			],
		};
	}
	const editable = resolveEditableField(target);
	if (editable) return buildTextFieldMenu(editable);
	return { menu: [...actionsMenu()] };
}
