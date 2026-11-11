/**
 * Load font list from After Effects (`app.fonts.allFonts`) via the CEP host bundle.
 * Same data path as `loadFontOptions` in `src/management/workspace/hook.ts`.
 */

import { createCepHostExecutor } from "@/management/ae/cep/host-executor";
import { createAdapter } from "@/management/ae/host-bridge";
import { type LocalFontFaceRow, normalizeLocalFontRows } from "./local-fonts";

function rowsFromHostFontPayload(value: unknown): LocalFontFaceRow[] {
	if (!Array.isArray(value)) {
		return [];
	}
	const raw: {
		family: string;
		fullName: string;
		postscriptName: string;
		style: string;
	}[] = [];
	for (const item of value) {
		if (!item || typeof item !== "object") {
			continue;
		}
		const record = item as {
			postScriptName?: unknown;
			label?: unknown;
			family?: unknown;
			styleName?: unknown;
		};
		const postscriptName =
			typeof record.postScriptName === "string"
				? record.postScriptName.trim()
				: "";
		if (!postscriptName) {
			continue;
		}
		const family =
			typeof record.family === "string" && record.family.trim()
				? record.family.trim()
				: postscriptName;
		const style =
			typeof record.styleName === "string" ? record.styleName.trim() : "";
		const label =
			typeof record.label === "string" && record.label.trim()
				? record.label.trim()
				: style
					? `${family} ${style}`
					: family;
		raw.push({
			family,
			fullName: label,
			postscriptName,
			style,
		});
	}
	return normalizeLocalFontRows(raw);
}

export type AeHostFontCatalogLoad = {
	rows: LocalFontFaceRow[];
	/** Present when `rows` is empty due to failure or unusable CEP host. */
	error?: string;
};

/**
 * Returns installed AE fonts. On failure, `rows` is empty and `error` explains why
 * (also logged with prefix `[ty-plus:font-viewer]`).
 */
export async function loadAeHostFontCatalog(
	win: Window,
): Promise<AeHostFontCatalogLoad> {
	try {
		console.info(
			"[ty-plus:font-viewer] AE font catalog: evalScript getFontBrowserEntries",
		);
		const caller = createCepHostExecutor(win, "after-effects");
		const host = createAdapter({ caller });
		const raw = await host.getFontBrowserEntries();
		const rows = rowsFromHostFontPayload(raw);
		console.info("[ty-plus:font-viewer] AE font catalog: done", {
			count: rows.length,
		});
		return { rows };
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		console.warn("[ty-plus:font-viewer] AE font catalog failed:", msg);
		return { rows: [], error: msg };
	}
}
