// ===== Preset Icon (docs/architecture/data/workspace-records/icon/index.md) =====

export type TextParams = {
	text: string;
	color?: string;
	backgroundColor?: string;
};

export type EmojiParams = {
	emoji: string;
	backgroundColor?: string;
};

type ImageParams = {
	/** Image URL or local path (image path or image source). */
	src: string;
};

/** Canvas icon: stores cubic bezier data for rendering an easing curve. */
export type CanvasParams = {
	/** Cubic bezier control points [x1, y1, x2, y2], values 0-1.
	 *  Always present for legacy compatibility — single-cubic presets have
	 *  only this. Multi-segment presets include both `cubic` (derived from
	 *  the first/last keyframe pair) and `points` (the full multi-ease data). */
	cubic?: [number, number, number, number];
	/** Optional: multi-point easing data. When present, the icon renderer
	 *  draws the full multi-segment curve instead of a single cubic.
	 *  Each point is `[x, y, hInX, hInY, hOutX, hOutY]`, x is 0-1 (relative
	 *  time within the preset span), y is the keyframe value (0-1 normalized). */
	points?: [number, number, number, number, number, number][];
	/** Optional color for the curve line */
	color?: string;
	/** Optional background color */
	backgroundColor?: string;
};

/**
 * Catalog / workspace icon: only `text` | `emoji` | `image` | `canvas`;
 * per-icon fields live under `param` (not a top-level `value`, and not `lucide`).
 */
export type PresetIcon =
	| { type: "text"; param: TextParams }
	| { type: "emoji"; param: EmojiParams }
	| { type: "image"; param: ImageParams }
	| { type: "canvas"; param: CanvasParams };

const ICON_TEXT_MAX = 6;

export function presetIconText(
	text: string,
	opts?: Pick<TextParams, "color" | "backgroundColor">,
): PresetIcon {
	const t = text.trim().slice(0, ICON_TEXT_MAX) || "?";
	return { type: "text", param: { text: t, ...opts } };
}

export function presetIconEmoji(
	emoji: string,
	opts?: Pick<EmojiParams, "backgroundColor">,
): PresetIcon {
	const e = emoji.trim() || "?";
	const bg = opts?.backgroundColor?.trim();
	return {
		type: "emoji",
		param: {
			emoji: e,
			...(bg ? { backgroundColor: bg } : {}),
		},
	};
}

export function presetIconImage(src: string): PresetIcon {
	return { type: "image", param: { src: src.trim() || "?" } };
}

export function presetIconCanvas(param: CanvasParams): PresetIcon {
	return { type: "canvas", param: { ...param } };
}

const IMAGE_PATH_RE =
	/^(?:https?:\/\/|file:\/\/|data:image\/|[a-zA-Z]:\\|\.{1,2}[\\/]|[\\/]).+\.(?:png|jpe?g|gif|webp|svg)$/i;
const IMAGE_URL_RE = /^(?:https?:\/\/|file:\/\/|data:image\/)/i;
const EMOJI_RE = /\p{Extended_Pictographic}/u;

type LegacyIconPayload = {
	type?: string;
	param?: unknown;
	value?: string;
	data?: string;
	text?: string;
	label?: string;
	emoji?: string;
	imagePath?: string;
	src?: string;
	url?: string;
	href?: string;
	name?: string;
	color?: string;
	backgroundColor?: string;
};

function lucideSlugToAbbrev(raw: string): string {
	const name = raw.replace(/^lucide:/i, "").trim();
	if (!name) return "ICON";
	const parts = name.split(/[-_]/).filter(Boolean);
	if (parts.length >= 2) {
		return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
	}
	return name.slice(0, 4).toUpperCase();
}

function isPlainRecord(v: unknown): v is Record<string, unknown> {
	return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

/**
 * Migrate JSON / legacy objects (`value`, `lucide`, loose keys) to canonical `PresetIcon`.
 */
export function coercePresetCatalogIcon(raw: unknown): PresetIcon | null {
	if (raw == null) {
		return null;
	}
	if (typeof raw === "string") {
		const s = raw.trim();
		if (!s) {
			return null;
		}
		if (s.startsWith("{") && s.endsWith("}")) {
			try {
				return coercePresetCatalogIcon(JSON.parse(s) as LegacyIconPayload);
			} catch {
				return null;
			}
		}
		if (s.startsWith("lucide:")) {
			return presetIconText(lucideSlugToAbbrev(s));
		}
		if (IMAGE_URL_RE.test(s) || IMAGE_PATH_RE.test(s)) {
			return presetIconImage(s);
		}
		if (EMOJI_RE.test(s) && s.length <= 8) {
			return presetIconEmoji(s);
		}
		return presetIconText(s);
	}
	if (!isPlainRecord(raw)) {
		return null;
	}
	const o = raw as LegacyIconPayload;
	const type = o.type?.trim();
	if (!type) {
		return null;
	}
	if (type === "lucide") {
		const symbol = String(o.value ?? o.data ?? o.name ?? "").trim();
		if (symbol) {
			return presetIconText(lucideSlugToAbbrev(symbol));
		}
	}
	if (type === "canvas") {
		if (isPlainRecord(o.param)) {
			return presetIconCanvas(o.param as Record<string, unknown>);
		}
		if (isPlainRecord(o.value)) {
			return presetIconCanvas(o.value as Record<string, unknown>);
		}
		return presetIconCanvas({});
	}
	if (type === "text" && isPlainRecord(o.param)) {
		const p = o.param as Record<string, unknown>;
		const rawText =
			typeof p.text === "string"
				? p.text
				: typeof p.value === "string"
					? p.value
					: typeof p.label === "string"
						? p.label
						: undefined;
		if (rawText !== undefined) {
			return presetIconText(rawText, {
				color: typeof p.color === "string" ? p.color : undefined,
				backgroundColor:
					typeof p.backgroundColor === "string" ? p.backgroundColor : undefined,
			});
		}
	}
	if (type === "emoji" && isPlainRecord(o.param)) {
		const p = o.param as Record<string, unknown>;
		const rawEmoji =
			typeof p.emoji === "string"
				? p.emoji
				: typeof p.value === "string"
					? p.value
					: undefined;
		if (rawEmoji !== undefined) {
			return presetIconEmoji(rawEmoji, {
				backgroundColor:
					typeof p.backgroundColor === "string" ? p.backgroundColor : undefined,
			});
		}
	}
	if (type === "image" && isPlainRecord(o.param)) {
		const p = o.param as Record<string, unknown>;
		const rawSrc =
			typeof p.src === "string"
				? p.src
				: typeof p.url === "string"
					? p.url
					: typeof p.href === "string"
						? p.href
						: typeof p.value === "string"
							? p.value
							: undefined;
		if (rawSrc !== undefined) {
			return presetIconImage(rawSrc);
		}
	}
	if (type === "text" && typeof o.value === "string") {
		return presetIconText(o.value, {
			color: typeof o.color === "string" ? o.color : undefined,
			backgroundColor:
				typeof o.backgroundColor === "string" ? o.backgroundColor : undefined,
		});
	}
	if (type === "emoji" && typeof o.value === "string") {
		return presetIconEmoji(o.value, {
			backgroundColor:
				typeof o.backgroundColor === "string" ? o.backgroundColor : undefined,
		});
	}
	if (type === "text") {
		const rawText =
			typeof o.text === "string"
				? o.text
				: typeof o.label === "string"
					? o.label
					: undefined;
		if (rawText !== undefined) {
			return presetIconText(rawText, {
				color: typeof o.color === "string" ? o.color : undefined,
				backgroundColor:
					typeof o.backgroundColor === "string" ? o.backgroundColor : undefined,
			});
		}
	}
	if (type === "emoji") {
		const rawEmoji = typeof o.emoji === "string" ? o.emoji : undefined;
		if (rawEmoji !== undefined) {
			return presetIconEmoji(rawEmoji, {
				backgroundColor:
					typeof o.backgroundColor === "string" ? o.backgroundColor : undefined,
			});
		}
	}
	if (type === "image") {
		const src = String(
			o.value ?? o.data ?? o.imagePath ?? o.src ?? o.url ?? o.href ?? "",
		).trim();
		if (!src) {
			return null;
		}
		return presetIconImage(src);
	}
	return null;
}

// ===== Preset Types (moved from contract/platform.ts) =====

export type PresetType = "preset" | "script" | "plugin" | "footage";

export type Preset = {
	id: string;
	type: PresetType;
	title: string;
	filePath: string;
	description?: string;
	descriptionImage?: string;
	/**
	 * Catalog category (e.g. "script", "plugin", "effect", "footage", "preset").
	 * Populated for cloud-synced presets whose source row has a `category` column;
	 * used by the download pipeline to choose the on-disk file extension.
	 */
	category?: string;
	/**
	 * Catalog icon (structured). Legacy rows may still use plain `string` until re-saved.
	 * Persisted local catalogs should store `PresetIcon` objects (see `management/preset`).
	 */
	icon?: PresetIcon | string;
	data?: Record<string, unknown>;
	/**
	 * Source preset id when this record was produced by `duplicatePreset`.
	 * Undefined for hand-authored / cloud-synced originals.
	 * Preserved for now as an in-memory contract field; the on-disk
	 * catalog serializer does not yet round-trip it.
	 */
	parentId?: string;
};

/** Alias for backward compatibility with code that used the old PresetRecord name. */
export type PresetRecord = Preset;

type CloudPresetMutation = {
	id: string;
	type: PresetType;
	title: string;
	filePath: string;
	description?: string;
	descriptionImage?: string;
	category?: string;
	icon?: PresetIcon | string;
	data?: Record<string, unknown>;
};

/** Easing curve preset data (captured from AE and stored in presets catalog). */
export type PresetEasingCurveV1 = {
	version: 1;
	cubic?: [number, number, number, number];
	/** Optional: multi-point easing data, same shape as `CanvasParams.points`.
	 *  When absent, the apply path reconstructs a 2-point curve from `cubic`. */
	points?: [number, number, number, number, number, number][];
	/** Optional: label color (1-16) to apply on commit. */
	labelColor?: number;
};
