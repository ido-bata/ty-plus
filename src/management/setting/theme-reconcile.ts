import { createCepSurfaceTransport } from "@/management/ae/cep/transport";
import { applyCepShellTheme } from "@/management/panel/inject-styles";
import {
	loadCepShellThemeOverridesForWrite,
	saveCepShellThemeToCss,
} from "@/management/panel/theme/storage";
import { enqueueThemeWrite } from "@/management/panel/theme/write-queue";
import {
	GRID_THEME_TOKEN_KEYS,
	gridMetricsToThemeOverrides,
} from "@/management/setting/dialog/grid-theme-sync";
import { coerceSettings } from "@/management/setting/models/settings";
import {
	themeOverridesFromUiSettings,
	UI_OWNED_THEME_KEYS,
} from "@/management/setting/ui-theme-sync";
import { gridSettingsFromSettingsJson } from "@/management/workspace/grid-settings";
import { publishShellMessage } from "@/management/workspace/messaging/publish-shell-message";
import { readSettings } from "@/management/workspace/persistence/store";
import { SHELL_CHANNELS } from "@/management/workspace/surface/contract";

/**
 * Boot-time reconcile between `settings/app.json` and `styles/theme.css`
 * (Issue #112).
 *
 * `ui.*` and `workspace.grid` are written to app.json by the settings
 * dialog, but the runtime only consumes the theme.css projection. Writes
 * from older builds or failed theme writes leave the two stores diverged
 * forever because nothing re-projects on boot — the user's accent/grid
 * choice is silently ignored.
 *
 * This pass treats app.json as the authority for the keys it owns:
 *
 *   - `UI_OWNED_THEME_KEYS` are always rewritten from `settings.ui`
 *     (defaults remove the keys, matching `applyUiSettingsTheme`);
 *   - the three grid metric tokens are rewritten from
 *     `workspace.grid`, or removed when the section is absent/unusable so
 *     the shipped defaults apply;
 *   - every other theme.css key is preserved untouched.
 *
 * The write is idempotent: when the merged record already equals what is
 * on disk nothing is written and no `themeLive` is broadcast, so running
 * it on every panel-1 boot is cheap. Callers must gate to a single
 * surface (panel-1) — theme.css is shared and the write queue is
 * per-window.
 */

export type ThemeReconcilePlan = {
	/** ui-owned overrides derived from settings.ui (may be empty). */
	ui: Partial<Record<string, string>>;
	/** grid metric overrides, or null when workspace.grid is absent. */
	grid: Record<string, string> | null;
};

const GRID_TOKEN_KEYS = Object.values(GRID_THEME_TOKEN_KEYS);

/**
 * Pure projection: raw `settings/app.json` text → the theme override
 * delta this module owns. Returns `null` when the document cannot be
 * parsed at all (caller keeps the persisted theme untouched).
 */
export const themeReconcilePlanFromSettingsJson = (
	settingsJson: string | null | undefined,
): ThemeReconcilePlan | null => {
	if (!settingsJson?.trim()) {
		return null;
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(settingsJson);
	} catch {
		return null;
	}
	const settings = coerceSettings(parsed);
	const grid = gridSettingsFromSettingsJson(settingsJson);
	return {
		ui: themeOverridesFromUiSettings(settings.ui),
		grid: grid ? gridMetricsToThemeOverrides(grid) : null,
	};
};

const sameOverrideRecord = (
	a: Record<string, string>,
	b: Record<string, string>,
): boolean => {
	const ak = Object.keys(a).sort();
	const bk = Object.keys(b).sort();
	if (ak.length !== bk.length) {
		return false;
	}
	return ak.every((k, i) => k === bk[i] && a[k] === b[bk[i]]);
};

export type ThemeReconcileResult = "skipped" | "written";

/**
 * Re-reads app.json inside the write queue so the projection is built
 * from the freshest settings, then converges theme.css onto it.
 */
export const reconcileSettingsThemeOverrides = async (
	win: Window,
	sourceSurfaceId: string,
): Promise<ThemeReconcileResult> => {
	return enqueueThemeWrite(win, async () => {
		const plan = themeReconcilePlanFromSettingsJson(await readSettings(win));
		if (!plan) {
			return "skipped";
		}
		// Strict read: an unreadable theme.css must abort rather than be
		// treated as empty and erase persisted overrides.
		const disk = await loadCepShellThemeOverridesForWrite(win);
		const merged: Record<string, string> = { ...disk };
		for (const key of UI_OWNED_THEME_KEYS) {
			delete merged[key];
		}
		for (const key of GRID_TOKEN_KEYS) {
			delete merged[key];
		}
		Object.assign(merged, plan.ui);
		if (plan.grid) {
			Object.assign(merged, plan.grid);
		}
		if (sameOverrideRecord(merged, disk)) {
			return "skipped";
		}
		await saveCepShellThemeToCss(win, merged);
		applyCepShellTheme(win.document, { themeOverrides: merged });
		const transport = createCepSurfaceTransport(win);
		await publishShellMessage(transport, {
			channel: SHELL_CHANNELS.settings,
			kind: "publish",
			sourceSurfaceId,
			payload: {
				kind: "themeLive",
				sourceSurfaceId,
				at: new Date().toISOString(),
				overrides: merged,
				replace: true,
			},
		});
		return "written";
	});
};
