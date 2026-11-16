import { applyCepShellTheme } from "@/management/panel/inject-styles";
import { sanitizeCepShellThemeOverrides } from "@/management/panel/theme/storage";
import { mergeThemeOverrideCache } from "@/management/style/theme-overrides-cache";

/** Key on ExtendScript `$__TYPLUS_BRIDGE_V1` (shared by all extensions within the host) */
const _THEME_LIVE_SHARED_KEY = "ty-plus.theme-live.v1";
let latestThemeLivePayload: ThemeLiveSharedPayload | null = null;

type ThemeLiveSharedPayload = {
	sourceSurfaceId: string;
	at: string;
	overrides: Partial<Record<string, string>>;
	/** Mix in random to distinguish even same-ms updates */
	rev: number;
};

const fingerprintThemeLiveSharedPayload = (
	raw: ThemeLiveSharedPayload,
): string =>
	`${raw.rev}:${raw.sourceSurfaceId}:${JSON.stringify(raw.overrides)}`;

const decideThemeLiveSharedApply = (
	surfaceId: string,
	raw: ThemeLiveSharedPayload | null,
	lastFingerprint: string | null,
):
	| { apply: false; nextFingerprint: string | null }
	| {
			apply: true;
			nextFingerprint: string;
			overrides: Partial<Record<string, string>>;
	  } => {
	if (!raw || raw.sourceSurfaceId === surfaceId) {
		return { apply: false, nextFingerprint: lastFingerprint };
	}
	const fp = fingerprintThemeLiveSharedPayload(raw);
	if (fp === lastFingerprint) {
		return { apply: false, nextFingerprint: lastFingerprint };
	}
	return {
		apply: true,
		nextFingerprint: fp,
		overrides: raw.overrides ?? {},
	};
};

/**
 * Fallback path for hosts where APPLICATION events from Modeless don't reach other panels.
 * Write draft to ExtendScript shared storage (`publishThemeLiveToSharedBridge`).
 */
const _publishThemeLiveToSharedBridge = async (
	win: Window,
	sourceSurfaceId: string,
	rawOverrides: Partial<Record<string, string>>,
): Promise<void> => {
	void win;
	const overrides = sanitizeCepShellThemeOverrides(rawOverrides);
	const payload: ThemeLiveSharedPayload = {
		sourceSurfaceId,
		at: new Date().toISOString(),
		overrides,
		rev: Date.now() * 1000 + Math.floor(Math.random() * 1000),
	};
	latestThemeLivePayload = payload;
};

/** Coalesce rapid `focus` events (not polling) */
const FOCUS_DEBOUNCE_MS = 400;

/**
 * Read theme draft from shared storage exactly once (no polling).
 * Primary path is `SurfaceTransport` `themeLive`. This is a miss-coverage fallback.
 */
export const subscribeThemeLiveSharedBridge = (
	win: Window,
	surfaceId: string,
	targetDoc: Document = document,
): (() => void) => {
	void win;

	let lastFingerprint: string | null = null;

	const syncFromBridge = (): void => {
		const decision = decideThemeLiveSharedApply(
			surfaceId,
			latestThemeLivePayload,
			lastFingerprint,
		);
		lastFingerprint = decision.nextFingerprint;
		if (decision.apply) {
			const overrides = sanitizeCepShellThemeOverrides(decision.overrides);
			mergeThemeOverrideCache(overrides);
			applyCepShellTheme(targetDoc, {
				themeOverrides: overrides,
			});
		}
	};

	syncFromBridge();

	const onVisibility = (): void => {
		if (targetDoc.visibilityState === "visible") {
			void syncFromBridge();
		}
	};
	targetDoc.addEventListener("visibilitychange", onVisibility);

	const w = targetDoc.defaultView;
	let focusTimer: number | undefined;
	const onWinFocus = (): void => {
		if (focusTimer !== undefined) {
			clearTimeout(focusTimer);
		}
		focusTimer = window.setTimeout(() => {
			focusTimer = undefined;
			void syncFromBridge();
		}, FOCUS_DEBOUNCE_MS);
	};
	w?.addEventListener("focus", onWinFocus);

	return () => {
		targetDoc.removeEventListener("visibilitychange", onVisibility);
		w?.removeEventListener("focus", onWinFocus);
		if (focusTimer !== undefined) {
			clearTimeout(focusTimer);
		}
	};
};
