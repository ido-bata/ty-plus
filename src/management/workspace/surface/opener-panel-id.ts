import { readCepOpenParams } from "@/management/ae/cep/transport";
import { TY_PLUS_DIALOG_EXTENSION } from "@/management/dialog/dialogs/ids";
import {
	discardModelessLaunchHandoff,
	tryConsumeDialogOpenerHandoff,
} from "@/management/preset/tool-handoff-file";

declare global {
	interface Window {
		/**
		 * Optional dev/test override: canonical workspace panel id (`panel-1` … `panel-5`)
		 * when CEP `getArguments()` does not include `openerSurfaceId`.
		 */
		__TY_PLUS_OPENER_SURFACE_ID__?: string;
	}
}

/** Place on a `data-ws-action` control to force the workspace panel used for panel-scoped actions. */
export const DATA_OPENER_WORKSPACE_PANEL =
	"data-opener-workspace-panel" as const;

const CANON_PANEL = /^panel-[1-5]$/;

function normalizePanelKey(raw: string): string | null {
	const t = raw.trim();
	if (CANON_PANEL.test(t)) {
		return t;
	}
	const compact = /^panel([1-5])$/i.exec(t);
	if (compact) {
		return `panel-${compact[1]}`;
	}
	return null;
}

function fromUnknown(raw: unknown): string | null {
	if (typeof raw !== "string") {
		return null;
	}
	return normalizePanelKey(raw);
}

function fromOpenParamsRecord(args: Record<string, unknown>): string | null {
	for (const key of [
		"targetPanelId",
		"openerSurfaceId",
		"sourcePanelId",
		"openerPanelId",
	] as const) {
		const v = fromUnknown(args[key]);
		if (v) {
			return v;
		}
	}
	return null;
}

/** Opener from CEP `getArguments()` only (no URL / no default). */
function tryOpenerFromCepOpenParamsOnly(win: Window): string | null {
	const args = readCepOpenParams<Record<string, unknown>>(win);
	if (!args || typeof args !== "object") {
		return null;
	}
	return fromOpenParamsRecord(args);
}

function fromUrl(win: Window): string | null {
	try {
		const u = new URL(win.location.href);
		for (const key of [
			"openerSurfaceId",
			"sourcePanelId",
			"openerPanelId",
			"panel",
		] as const) {
			const v = fromUnknown(u.searchParams.get(key));
			if (v) {
				return v;
			}
		}
	} catch {
		/* invalid URL */
	}
	return null;
}

/**
 * Resolves the workspace panel (`panel-1` … `panel-5`) that launched the current
 * surface (modeless dialog, tool, etc.). Used for Add Widget and other panel-scoped
 * shell messages.
 *
 * Resolution order: `window.__TY_PLUS_OPENER_SURFACE_ID__` → CEP open JSON
 * (`openerSurfaceId` / `sourcePanelId` / `openerPanelId`) → URL query
 * (`openerSurfaceId`, …) → `"panel-1"`.
 */
export function resolveOpenerWorkspacePanelId(win: Window = window): string {
	const fromWin = fromUnknown(
		(win as Window & { __TY_PLUS_OPENER_SURFACE_ID__?: unknown })
			.__TY_PLUS_OPENER_SURFACE_ID__,
	);
	if (fromWin) {
		return fromWin;
	}

	const args = readCepOpenParams<Record<string, unknown>>(win);
	if (args && typeof args === "object") {
		const fromArgs = fromOpenParamsRecord(args);
		if (fromArgs) {
			return fromArgs;
		}
	}

	const fromQuery = fromUrl(win);
	if (fromQuery) {
		return fromQuery;
	}

	return "panel-1";
}

/**
 * Resolves opener panel for modeless Add Widget: URL / globals, then **handoff file**
 * (when `getArguments()` does not deliver JSON), then short-polls `getArguments()`.
 */
export async function awaitOpenerWorkspacePanelIdFromCep(
	win: Window = window,
	maxWaitMs = 480,
): Promise<string> {
	const fromWin = fromUnknown(
		(win as Window & { __TY_PLUS_OPENER_SURFACE_ID__?: unknown })
			.__TY_PLUS_OPENER_SURFACE_ID__,
	);
	if (fromWin) {
		return fromWin;
	}

	const fromQuery = fromUrl(win);
	if (fromQuery) {
		return fromQuery;
	}

	const step = 32;
	for (let waited = 0; waited <= maxWaitMs; waited += step) {
		const fromArgs = tryOpenerFromCepOpenParamsOnly(win);
		if (fromArgs) {
			void discardModelessLaunchHandoff(
				win,
				TY_PLUS_DIALOG_EXTENSION.widgetSelector,
			);
			return fromArgs;
		}
		const fromHandoff = await tryConsumeDialogOpenerHandoff(
			win,
			TY_PLUS_DIALOG_EXTENSION.widgetSelector,
		);
		if (fromHandoff) {
			return fromHandoff;
		}
		if (waited < maxWaitMs) {
			await new Promise((r) => {
				setTimeout(r, step);
			});
		}
	}

	return "panel-1";
}

/** Reads {@link DATA_OPENER_WORKSPACE_PANEL} when set to a canonical panel id. */
export function openerWorkspacePanelIdFromElement(
	el: Element,
	fallback: string,
): string {
	const raw = el.getAttribute(DATA_OPENER_WORKSPACE_PANEL)?.trim() ?? "";
	if (raw && CANON_PANEL.test(raw)) {
		return raw;
	}
	return fallback;
}
