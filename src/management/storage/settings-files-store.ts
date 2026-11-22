/**
 * Thin domain wrappers over the persistence API. Kept ONLY so existing
 * callers don't import storage/persistence directly during Phase 3.
 * Phase 4 will inline these and remove the file.
 */

import { readJson, writeJson } from "@/management/storage/persistence";

export const readSettingsAppJson = (win: Window) => readJson(win, "app");

export const readSettingsPathsJson = (win: Window) => readJson(win, "paths");
export const writeSettingsPathsJson = (
	win: Window,
	data: Record<string, unknown>,
) => writeJson(win, "paths", data);

export const readSettingsUiJson = (win: Window) => readJson(win, "ui");
export const writeSettingsUiJson = (
	win: Window,
	data: Record<string, unknown>,
) => writeJson(win, "ui", data);
