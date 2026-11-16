import { createCepSurfaceTransport } from "@/management/ae/cep/transport";
import { applyCepShellTheme } from "@/management/panel/inject-styles";
import {
	loadCepShellThemeOverridesForWrite,
	sanitizeCepShellThemeOverrides,
	saveCepShellThemeToCss,
} from "@/management/panel/theme/storage";
import { enqueueThemeWrite } from "@/management/panel/theme/write-queue";
import {
	DEFAULT_SETTINGS,
	type Settings,
} from "@/management/setting/models/settings";
import { publishShellMessage } from "@/management/workspace/messaging/publish-shell-message";
import { SHELL_CHANNELS } from "@/management/workspace/surface/contract";

/**
 * `settings.ui.*` → `styles/theme.css` bridge (Issue #94).
 *
 * The Style section persists accent/text/widget/panel colors into
 * `settings/app.json`, but nothing consumed them. The theme token pipeline
 * (`theme.css` + override cache + `themeLive` broadcast) is the existing
 * route that reaches every surface, so UI settings are projected into it:
 *
 *   - values equal to `DEFAULT_SETTINGS.ui` emit nothing, preserving the
 *     shipped look for untouched installs;
 *   - non-default values become theme token overrides, persisted through
 *     the same queue/strict-read path as grid metrics;
 *   - the broadcast carries `replace: true` with the full merged record so
 *     receivers drop keys the user reset to defaults.
 *
 * `ui.theme` (system/dark/light/custom) has no runtime palette switch yet
 * and is intentionally not projected; the control is hidden in
 * StyleSection until a second palette exists.
 */

type UiSettings = Settings["ui"];
type ThemeOverrides = Partial<Record<string, string>>;

/** Theme token keys owned by the ui.* projection. Rewritten wholesale. */
export const UI_OWNED_THEME_KEYS = [
	"accent-r",
	"accent-g",
	"accent-b",
	"color-ty-accent",
	"text-r",
	"text-g",
	"text-b",
	"color-ty-widget-bg",
	"color-ty-bg-app",
] as const;

const hexToChannels = (
	hex: string,
): { r: number; g: number; b: number } | null => {
	const h = hex.trim().replace(/^#/, "");
	if (!/^[0-9a-fA-F]{6}$/.test(h)) {
		return null;
	}
	return {
		r: Number.parseInt(h.slice(0, 2), 16),
		g: Number.parseInt(h.slice(2, 4), 16),
		b: Number.parseInt(h.slice(4, 6), 16),
	};
};

/** `#rrggbb` + percent → `rgba(r,g,b,a)` token value. */
const colorWithOpacity = (hex: string, opacityPct: number): string | null => {
	const channels = hexToChannels(hex);
	if (!channels) {
		return null;
	}
	const alpha = Math.min(100, Math.max(0, opacityPct)) / 100;
	return `rgba(${channels.r}, ${channels.g}, ${channels.b}, ${alpha})`;
};

const accentChannels = (color: string | undefined): ThemeOverrides => {
	if (!color) {
		return {};
	}
	const channels = hexToChannels(color);
	if (!channels) {
		return {};
	}
	return {
		"accent-r": String(channels.r),
		"accent-g": String(channels.g),
		"accent-b": String(channels.b),
		"color-ty-accent": color.trim(),
	};
};

const surfaceColorWithOpacity = (
	color: string | undefined,
	opacity: number | undefined,
): string | null => {
	if (!color || opacity === undefined) {
		return null;
	}
	return colorWithOpacity(color, opacity);
};

/**
 * Projects `settings.ui` into theme token overrides. Returns only the
 * ui-owned keys that differ from the shipped defaults.
 */
export const themeOverridesFromUiSettings = (
	ui: UiSettings,
): ThemeOverrides => {
	const defaults = DEFAULT_SETTINGS.ui;
	const out: ThemeOverrides = {};

	if (ui.accentColor && ui.accentColor !== defaults.accentColor) {
		Object.assign(out, accentChannels(ui.accentColor));
	}
	if (ui.textColor && ui.textColor !== defaults.textColor) {
		const channels = hexToChannels(ui.textColor);
		if (channels) {
			out["text-r"] = String(channels.r);
			out["text-g"] = String(channels.g);
			out["text-b"] = String(channels.b);
		}
	}

	const widgetBg = ui.widget?.backgroundColor;
	const widgetOpacity = ui.widget?.opacity;
	const widgetChanged =
		(widgetBg !== undefined && widgetBg !== defaults.widget?.backgroundColor) ||
		(widgetOpacity !== undefined && widgetOpacity !== defaults.widget?.opacity);
	if (widgetChanged) {
		const value = surfaceColorWithOpacity(
			widgetBg ?? defaults.widget?.backgroundColor,
			widgetOpacity ?? defaults.widget?.opacity ?? 100,
		);
		if (value) {
			out["color-ty-widget-bg"] = value;
		}
	}

	const panelBg = ui.panel?.backgroundColor;
	const panelOpacity = ui.panel?.opacity;
	const panelChanged =
		(panelBg !== undefined && panelBg !== defaults.panel?.backgroundColor) ||
		(panelOpacity !== undefined && panelOpacity !== defaults.panel?.opacity);
	if (panelChanged) {
		const value = surfaceColorWithOpacity(
			panelBg ?? defaults.panel?.backgroundColor,
			panelOpacity ?? defaults.panel?.opacity ?? 100,
		);
		if (value) {
			out["color-ty-bg-app"] = value;
		}
	}

	return sanitizeCepShellThemeOverrides(out);
};

/**
 * Persists the ui.* projection into theme.css and broadcasts the full
 * merged record so every surface converges, including keys reset back to
 * theme defaults (`replace: true`).
 */
export const applyUiSettingsTheme = async (
	win: Window,
	sourceSurfaceId: string,
	ui: UiSettings,
): Promise<void> => {
	await enqueueThemeWrite(win, async () => {
		const disk = await loadCepShellThemeOverridesForWrite(win);
		const merged: ThemeOverrides = { ...disk };
		for (const key of UI_OWNED_THEME_KEYS) {
			delete merged[key];
		}
		Object.assign(merged, themeOverridesFromUiSettings(ui));
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
	});
};
