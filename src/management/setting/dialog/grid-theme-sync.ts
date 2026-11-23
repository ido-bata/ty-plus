import { createCepSurfaceTransport } from "@/management/ae/cep/transport";
import { applyCepShellTheme } from "@/management/panel/inject-styles";
import {
	loadCepShellThemeOverridesForWrite,
	saveCepShellThemeToCss,
} from "@/management/panel/theme/storage";
import { enqueueThemeWrite } from "@/management/panel/theme/write-queue";
import type { Settings } from "@/management/setting/models/settings";
import { publishShellMessage } from "@/management/workspace/messaging/publish-shell-message";
import { SHELL_CHANNELS } from "@/management/workspace/surface/contract";

export const GRID_THEME_TOKEN_KEYS = {
	cellSize: "ty-ws-cell",
	gap: "ty-ws-grid-gap",
	radius: "ty-ws-grid-radius",
} as const;

export type GridMetrics = {
	cellSize: number;
	gap: number;
	radius: number;
};

const _parsePx = (raw: string | undefined, fallback: number): number => {
	const trimmed = raw?.trim() ?? "";
	if (!trimmed) {
		return fallback;
	}
	const pxMatch = trimmed.match(/^(\d+(?:\.\d+)?)px$/i);
	if (pxMatch) {
		return Math.round(Number(pxMatch[1]));
	}
	const num = Number(trimmed);
	return Number.isFinite(num) ? Math.round(num) : fallback;
};

export const gridMetricsToThemeOverrides = (
	metrics: GridMetrics,
): Record<string, string> => ({
	[GRID_THEME_TOKEN_KEYS.cellSize]: `${metrics.cellSize}px`,
	[GRID_THEME_TOKEN_KEYS.gap]: `${metrics.gap}px`,
	[GRID_THEME_TOKEN_KEYS.radius]: `${metrics.radius}px`,
});

export const metricsFromSettingsGrid = (
	grid: Settings["workspace"]["grid"] | undefined,
): GridMetrics => ({
	cellSize: grid?.cellSize ?? 48,
	gap: grid?.gap ?? 4,
	radius: grid?.radius ?? 2,
});

/** Persist settings + shell theme tokens and broadcast live preview to panels. */
export const applyGridMetricsLive = (
	win: Window,
	sourceSurfaceId: string,
	metrics: GridMetrics,
): Promise<Record<string, string>> =>
	enqueueThemeWrite(win, async () => {
		const overrides = gridMetricsToThemeOverrides(metrics);
		// Strict read: an unreadable theme.css must abort the write, not
		// merge against an empty record and erase persisted overrides.
		const fromCss = await loadCepShellThemeOverridesForWrite(win);
		const merged = { ...fromCss, ...overrides };
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
				overrides,
			},
		});
		return overrides;
	});
