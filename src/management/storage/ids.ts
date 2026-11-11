const uuid = (): string => {
	if (
		typeof crypto !== "undefined" &&
		typeof crypto.randomUUID === "function"
	) {
		return crypto.randomUUID();
	}
	// Fallback (tests / very old hosts): RFC-4122 v4-shaped so it stays a bare,
	// opaque UUID that passes `assertOpaqueId` (no meaning, no prefix).
	return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
		const r = (Math.random() * 16) | 0;
		const v = c === "x" ? r : (r & 0x3) | 0x8;
		return v.toString(16);
	});
};

/**
 * UUIDs are equal, opaque, per-unit Source of Truth.
 *
 * New IDs are generated ONLY by the three functions below. No prefixes (local-,
 * pcl:, ppi:, wsi:), no embedded type, no embedded name, no locality. UUIDs are
 * equal, opaque units - never infer meaning from a UUID string.
 *
 * The sole generators:
 *   - `createInstanceId()`          -> widget instance row in widgets.json
 *   - `createLocalPresetCatalogId()`-> local preset row in presets.json
 *   - `createPresetPlacementInstanceId()` -> grid tile key (placement, not catalog)
 */
export const createInstanceId = (): string => uuid();

/** New preset placement id (grid tile key when distinct from catalog ref). */
const createPresetPlacementInstanceId = (): string => uuid();

/**
 * New local preset row in `presets.json`.
 * Unique even when basenames collide across folders.
 */
export const createLocalPresetCatalogId = (): string => uuid();

const UUID_LIKE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when `id` is a bare UUID string (no type prefix). */
export const isUuidLike = (id: string): boolean => UUID_LIKE.test(id.trim());

/**
 * True when `id` looks like an opaque grid key (typically placement or catalog UUID).
 * Callers combine with `nonWidgetLayoutIds`, legacy prefixes, and `presetPlacements` maps.
 */
export const isOpaquePresetPlacementId = (id: string): boolean =>
	isUuidLike(id.trim());

/** True when `id` looks like an opaque widget instance id (bare UUID). */
export const isOpaqueInstanceId = (id: string): boolean =>
	isUuidLike(id.trim());

const KNOWN_PREFIXES = ["wsi:", "ppi:", "pcl:"] as const;

/** Legacy prefix for local preset catalog ids (no longer emitted, kept for backward compat). */
export const LOCAL_PRESET_CATALOG_PREFIX = "pcl:";

/** True when JSON text may still contain legacy id prefixes (catalog migration / rewrite hint). */
export const catalogJsonMayContainLegacyIdPrefixes = (
	jsonText: string,
): boolean => {
	const t = jsonText.toLowerCase();
	for (const p of KNOWN_PREFIXES) {
		if (t.includes(p)) return true;
	}
	return false;
};

/**
 * Removes historical `wsi:` / `ppi:` / `pcl:` prefixes from persisted ids so
 * in-memory and newly written JSON use bare UUIDs (or other suffix) only.
 */
export const stripKnownIdPrefixes = (id: string): string => {
	let t = id.trim();
	for (let i = 0; i < 4; i++) {
		const lower = t.toLowerCase();
		let stripped = false;
		for (const p of KNOWN_PREFIXES) {
			if (lower.startsWith(p)) {
				t = t.slice(p.length);
				stripped = true;
				break;
			}
		}
		if (!stripped) break;
	}
	return t;
};
