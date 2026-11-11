import { notifyPanelsAfterPresetSave } from "@/management/workspace/placement/notify-panels-after-preset-save";
import { css } from "@/styled-system/css";

import type { PresetToolDialogProps } from "./Dialog";

export const shellFieldLabelClass = css({
	fontSize: "xs",
	fontWeight: "medium",
	textTransform: "uppercase",
	letterSpacing: "wide",
	color: "text.muted",
});

const getCatalogRefIds = (r: {
	catalogRefIds?: readonly string[] | null;
}): string[] => r.catalogRefIds?.filter((x) => x.trim().length > 0) ?? [];

const getCatalogRefIdsArg = (refs: string[], presetId: string): string[] =>
	refs.length > 0 ? refs : [presetId];

const buildFilePath = (
	before: { filePath?: string | null } | null,
	buildFilePath: PresetToolDialogProps["buildFilePath"],
	values: Record<string, string>,
	name: string,
	presetId: string,
): string =>
	(
		before?.filePath ??
		buildFilePath?.(values, {
			name: name.trim(),
			presetId,
		}) ??
		""
	).trim();

const getExtraData = (
	mapPersistData: PresetToolDialogProps["mapPersistData"],
	values: Record<string, string>,
): Record<string, unknown> => mapPersistData?.(values) ?? {};

const getTitle = (name: string, defaultName: string | undefined): string =>
	name.trim() || defaultName || "";

const getIconText = (iconText: string | null | undefined): string =>
	iconText ?? "PRESET";

const getDataBlock = (
	extraData: Record<string, unknown>,
): { data?: Record<string, unknown> } =>
	Object.keys(extraData).length > 0 ? { data: extraData } : {};

const getStatusMessage = (
	before: { status?: string } | null,
	recordId: string,
): string => before?.status ?? `Saved: ${recordId}`;

const notifyBounded = async (
	input: Parameters<typeof notifyPanelsAfterPresetSave>[1],
): Promise<void> => {
	let timer: ReturnType<typeof setTimeout> | null = null;
	const timeout = new Promise<void>((resolve) => {
		timer = setTimeout(resolve, 3000);
	});
	try {
		await Promise.race([
			notifyPanelsAfterPresetSave(window, input).catch(() => undefined),
			timeout,
		]);
	} catch {
		// race cannot realistically reject here; swallow defensively
	}
	if (timer) clearTimeout(timer);
};
