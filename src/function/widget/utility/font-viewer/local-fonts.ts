/**
 * Local Font Access API (`queryLocalFonts`) helpers — pure logic + loading.
 * No AE / ExtendScript; CEP Chromium only when the API is available.
 */

export type LocalFontFaceRow = {
	/** Stable row id (postscript when present, else synthetic). */
	id: string;
	family: string;
	fullName: string;
	postscriptName: string;
	style: string;
	/** Parsed CSS numeric weight when inferable, else null. */
	weight: number | null;
};

const WEIGHT_BY_TOKEN: Readonly<Record<string, number>> = {
	thin: 100,
	extralight: 200,
	"extra light": 200,
	ultralight: 200,
	light: 300,
	regular: 400,
	normal: 400,
	medium: 500,
	semibold: 600,
	"semi bold": 600,
	demibold: 600,
	bold: 700,
	extrabold: 800,
	"extra bold": 800,
	ultrabold: 800,
	black: 900,
	heavy: 900,
};

export function parseCssWeight(style: string, fullName: string): number | null {
	const hay = `${style}\n${fullName}`.toLowerCase();
	const m = hay.match(/\b([1-9]00)\b/);
	if (m) {
		const n = Number(m[1]);
		if (n >= 100 && n <= 900) {
			return n;
		}
	}
	for (const [token, w] of Object.entries(WEIGHT_BY_TOKEN)) {
		if (hay.includes(token)) {
			return w;
		}
	}
	if (/\bitalic\b|\boblique\b/.test(hay) && !hay.includes("bold")) {
		return 400;
	}
	return null;
}

export function normalizeLocalFontRows(
	raw: readonly {
		family: string;
		fullName: string;
		postscriptName: string;
		style: string;
	}[],
): LocalFontFaceRow[] {
	const out: LocalFontFaceRow[] = [];
	for (const f of raw) {
		const family = String(f.family ?? "").trim();
		if (!family) {
			continue;
		}
		const postscriptName = String(f.postscriptName ?? "").trim();
		const fullName = String(f.fullName ?? "").trim();
		const style = String(f.style ?? "").trim();
		const weight = parseCssWeight(style, fullName);
		const id =
			postscriptName ||
			`${family}__${style}__${fullName}`.replace(/\s+/g, " ").slice(0, 200);
		out.push({ id, family, fullName, postscriptName, style, weight });
	}
	out.sort((a, b) => {
		const fa = a.family.localeCompare(b.family, undefined, {
			sensitivity: "base",
		});
		if (fa !== 0) {
			return fa;
		}
		const wa = a.weight ?? 999;
		const wb = b.weight ?? 999;
		if (wa !== wb) {
			return wa - wb;
		}
		return a.style.localeCompare(b.style, undefined, { sensitivity: "base" });
	});
	return out;
}

/** Maps workspace font dropdown options (PostScript in `value`) to viewer rows. */
export function rowsFromFontOptions(
	options: readonly {
		value: string;
		label: string;
	}[],
): LocalFontFaceRow[] {
	const raw = options.map((o) => {
		const postscriptName = String(o.value ?? "").trim();
		const label = String(o.label ?? "").trim();
		const family = label || postscriptName;
		return {
			family,
			fullName: label || postscriptName,
			postscriptName,
			style: "",
		};
	});
	return normalizeLocalFontRows(raw);
}

export type QueryLocalFontsFn = () => Promise<
	readonly {
		family: string;
		fullName: string;
		postscriptName: string;
		style: string;
	}[]
>;

export function getQueryLocalFonts(): QueryLocalFontsFn | undefined {
	if (typeof window === "undefined") {
		return undefined;
	}
	const w = window as unknown as { queryLocalFonts?: QueryLocalFontsFn };
	return typeof w.queryLocalFonts === "function"
		? w.queryLocalFonts.bind(window)
		: undefined;
}

export type LoadSystemFontCatalogOptions = {
	/**
	 * When true, calls `window.queryLocalFonts()` (Chromium Local Font Access).
	 * Many embedders return an empty list or reject without a user gesture — prefer
	 * starting with `false` and calling again with `true` from a click handler.
	 */
	tryLocalAccess?: boolean;
};

export type LoadSystemFontCatalogResult = {
	rows: LocalFontFaceRow[];
	via: "queryLocalFonts" | "documentFonts";
	/** True when `queryLocalFonts` ran (even if it returned 0 rows). */
	localApiAttempted: boolean;
	/** Set when `tryLocalAccess` was true and `queryLocalFonts` threw. */
	localAccessError?: string;
};

async function waitDocumentFontsReady(): Promise<void> {
	if (typeof document === "undefined") {
		return;
	}
	const ready = document.fonts?.ready as Promise<FontFaceSet> | undefined;
	if (ready && typeof ready.then === "function") {
		try {
			await ready;
		} catch {
			// ignore
		}
	}
}

function stripFamilyQuotes(family: string): string {
	return family.replace(/^["']+|["']+$/g, "").trim();
}

/**
 * Collects {@link FontFace} rows already attached to the document (subset of system fonts,
 * but works without Local Font Access permission).
 */
function collectDocumentFontFaceSources(): {
	family: string;
	fullName: string;
	postscriptName: string;
	style: string;
}[] {
	const fromDom: {
		family: string;
		fullName: string;
		postscriptName: string;
		style: string;
	}[] = [];
	const seen = new Set<string>();
	if (typeof document === "undefined" || !document.fonts) {
		return fromDom;
	}
	const fonts = document.fonts;
	const addFace = (face: FontFace): void => {
		const familyRaw = String(face.family ?? "").trim();
		const family = stripFamilyQuotes(familyRaw);
		if (!family) {
			return;
		}
		const st =
			`${String(face.weight ?? "").trim()} ${String(face.style ?? "").trim()}`.trim();
		const key = `${family.toLowerCase()}\u0000${st.toLowerCase()}`;
		if (seen.has(key)) {
			return;
		}
		seen.add(key);
		fromDom.push({
			family,
			fullName: st ? `${family} ${st}` : family,
			postscriptName: "",
			style: st || "normal",
		});
	};
	if (typeof fonts.forEach === "function") {
		fonts.forEach(addFace);
	} else {
		try {
			for (const face of fonts as Iterable<FontFace>) {
				addFace(face);
			}
		} catch {
			// ignore
		}
	}
	return fromDom;
}

export async function loadSystemFontCatalog(
	options: LoadSystemFontCatalogOptions = {},
): Promise<LoadSystemFontCatalogResult> {
	const tryLocal = Boolean(options.tryLocalAccess);
	await waitDocumentFontsReady();
	const domSources = collectDocumentFontFaceSources();
	const domRows = normalizeLocalFontRows(domSources);

	const q = getQueryLocalFonts();
	if (!tryLocal || !q) {
		return {
			rows: domRows,
			via: "documentFonts",
			localApiAttempted: false,
		};
	}

	let localAccessError: string | undefined;
	try {
		const raw = await q();
		const apiRows = normalizeLocalFontRows(raw);
		if (apiRows.length > 0) {
			return {
				rows: apiRows,
				via: "queryLocalFonts",
				localApiAttempted: true,
			};
		}
	} catch (e) {
		localAccessError = e instanceof Error ? e.message : String(e);
	}

	return {
		rows: domRows,
		via: "documentFonts",
		localApiAttempted: true,
		...(localAccessError ? { localAccessError } : {}),
	};
}

export function filterFontRowsByQuery(
	rows: readonly LocalFontFaceRow[],
	query: string,
): LocalFontFaceRow[] {
	const q = query.trim().toLowerCase();
	const nfkc = (s: string) => s.normalize("NFKC").toLowerCase();
	const qn = q ? nfkc(q) : "";
	const match = (row: LocalFontFaceRow): boolean => {
		if (!qn) {
			return true;
		}
		return (
			nfkc(row.family).includes(qn) ||
			nfkc(row.fullName).includes(qn) ||
			nfkc(row.postscriptName).includes(qn) ||
			nfkc(row.style).includes(qn)
		);
	};
	return rows.filter(match);
}

export type FontFamilyGroup = {
	family: string;
	faces: LocalFontFaceRow[];
};

/** Groups faces by `family` (display name), sorts families and faces within each family. */
export function groupFontRowsByFamily(
	rows: readonly LocalFontFaceRow[],
): FontFamilyGroup[] {
	const map = new Map<string, LocalFontFaceRow[]>();
	for (const row of rows) {
		const fam = row.family.trim() || row.fullName.trim() || row.postscriptName;
		const list = map.get(fam);
		if (list) {
			list.push(row);
		} else {
			map.set(fam, [row]);
		}
	}
	const keys = [...map.keys()].sort((a, b) =>
		a.localeCompare(b, undefined, { sensitivity: "base" }),
	);
	for (const k of keys) {
		const faces = map.get(k);
		if (!faces) {
			continue;
		}
		faces.sort((a, b) => {
			const wa = a.weight ?? 999;
			const wb = b.weight ?? 999;
			if (wa !== wb) {
				return wa - wb;
			}
			return a.style.localeCompare(b.style, undefined, { sensitivity: "base" });
		});
	}
	return keys.map((family) => ({
		family,
		faces: map.get(family) ?? [],
	}));
}

/** Escape a font family for use inside CSS `font-family: "…"`. */
export function cssQuoteFamily(family: string): string {
	const t = family.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
	return `"${t}"`;
}
