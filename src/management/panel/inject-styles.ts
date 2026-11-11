import {
	applyCepShellLocaleToDocument,
	loadCepShellLocale,
} from "@/management/i18n/locale-storage";
import {
	loadCepShellThemeFromCss,
	sanitizeCepShellThemeOverrides,
} from "@/management/panel/theme/storage";
import {
	mergePanelTheme,
	themeVarsToCssBlock,
} from "@/management/style/merge-theme";

const THEME_STYLE_ID = "ty-plus-theme-vars";

const viewportThemeResyncInstalled = new WeakMap<Window, true>();
const styleRecoveryInstalled = new WeakMap<Window, () => void>();

export type InjectCepShellStylesOptions = {
	/** Temporary override from caller (applied after settings merge) */
	themeOverrides?: Partial<Record<string, string>>;
};

export const applyCepShellTheme = (
	target: Document = document,
	options: InjectCepShellStylesOptions = {},
): void => {
	const merged = mergePanelTheme(
		sanitizeCepShellThemeOverrides(options.themeOverrides),
	);
	let themeEl = target.getElementById(
		THEME_STYLE_ID,
	) as HTMLStyleElement | null;
	if (!themeEl) {
		themeEl = target.createElement("style");
		themeEl.id = THEME_STYLE_ID;
		const head = target.head;
		if (head.firstChild) {
			head.insertBefore(themeEl, head.firstChild);
		} else {
			head.appendChild(themeEl);
		}
	}
	const next = themeVarsToCssBlock(merged);
	if (themeEl.textContent === next) {
		return;
	}
	themeEl.textContent = next;
};

/**
 * On CEP boot: load styles/theme.css and reflect into DOM.
 */
export async function mirrorHostCepShellThemeToCss(win: Window): Promise<void> {
	try {
		const fromCss = await loadCepShellThemeFromCss(win);
		if (fromCss && Object.keys(fromCss).length > 0) {
			applyCepShellTheme(win.document, { themeOverrides: fromCss });
			return;
		}
		applyCepShellTheme(win.document);
	} catch {
		/* Keep local when not connected */
	}
}

/**
 * Color/component CSS only. Does not include locale/storage subscription (fastest render).
 */
export function injectCepShellAppearanceOnly(
	target: Document = document,
	options: InjectCepShellStylesOptions = {},
): void {
	applyCepShellTheme(target, options);
}

/**
 * In CEF, the initial layout may have innerWidth/innerHeight offset from the actual size.
 * **Only immediately after boot**, re-apply theme + bundle multiple times.
 *
 * Do not re-inject on resize (to avoid double-triggering layout with workspace's
 * `attachCepLayoutRefresh`).
 */
export function installCepShellViewportThemeResync(win: Window): void {
	if (viewportThemeResyncInstalled.has(win)) {
		return;
	}
	viewportThemeResyncInstalled.set(win, true);

	const doc = win.document;

	const runBootstrapInject = (): void => {
		try {
			injectCepShellStyles(doc);
			void doc.documentElement.offsetHeight;
		} catch {
			/* ignore */
		}
	};

	runBootstrapInject();
	for (const ms of [0, 24, 72, 160, 400, 900, 1800] as const) {
		win.setTimeout(runBootstrapInject, ms);
	}
}

export function installCepShellStyleRecoveryOnResize(
	win: Window,
	options: {
		debounceMs?: number;
		reinject?: (target: Document) => void;
	} = {},
): () => void {
	const existing = styleRecoveryInstalled.get(win);
	if (existing) {
		return existing;
	}

	const doc = win.document;
	const debounceMs = Math.max(0, options.debounceMs ?? 120);
	const reinject = options.reinject ?? injectCepShellStyles;

	let timer: number | undefined;
	const schedule = (): void => {
		if (timer !== undefined) {
			win.clearTimeout(timer);
		}
		timer = win.setTimeout(() => {
			timer = undefined;
			try {
				reinject(doc);
				void doc.documentElement.offsetHeight;
			} catch {
				/* ignore */
			}
		}, debounceMs);
	};

	const onResize = (): void => {
		schedule();
	};
	const onFocus = (): void => {
		schedule();
	};
	const onVisibility = (): void => {
		if (doc.visibilityState === "visible") {
			schedule();
		}
	};

	let ro: ResizeObserver | undefined;
	if (typeof ResizeObserver !== "undefined") {
		ro = new ResizeObserver(() => {
			schedule();
		});
		ro.observe(doc.documentElement);
		if (doc.body) {
			ro.observe(doc.body);
		}
	}

	// Startup recovery for CEP timing races that don't emit resize.
	schedule();
	for (const ms of [24, 72, 160, 400, 900, 1800] as const) {
		win.setTimeout(schedule, ms);
	}

	win.addEventListener("resize", onResize, false);
	win.addEventListener("focus", onFocus, false);
	doc.addEventListener("visibilitychange", onVisibility);

	const cleanup = () => {
		if (timer !== undefined) {
			win.clearTimeout(timer);
		}
		win.removeEventListener("resize", onResize, false);
		win.removeEventListener("focus", onFocus, false);
		doc.removeEventListener("visibilitychange", onVisibility);
		ro?.disconnect();
		styleRecoveryInstalled.delete(win);
	};
	styleRecoveryInstalled.set(win, cleanup);
	return cleanup;
}

function injectCepShellLocaleAndThemeStorageHooks(
	target: Document = document,
): void {
	applyCepShellLocaleToDocument(target, loadCepShellLocale());
}

/**
 * For panel/Modeless boot. Appearance (vars + bundle) -> locale -> full re-apply after host mirror completes.
 */
export function bootstrapCepShellThemeHydration(win: Window): void {
	const doc = win.document;
	try {
		injectCepShellAppearanceOnly(doc);
	} catch (error) {
		console.warn(
			"[ty-plus] injectCepShellAppearanceOnly (initial) failed:",
			error,
		);
	}
	try {
		injectCepShellLocaleAndThemeStorageHooks(doc);
	} catch (error) {
		console.warn(
			"[ty-plus] injectCepShellLocaleAndThemeStorageHooks failed:",
			error,
		);
	}
	void mirrorHostCepShellThemeToCss(win).finally(() => {
		try {
			injectCepShellStyles(doc);
		} catch (error) {
			console.warn(
				"[ty-plus] injectCepShellStyles (after mirror) failed:",
				error,
			);
		}
	});

	installCepShellViewportThemeResync(win);
}

/**
 * 1) Theme variables (initial + loadThemeOverrides + themeOverrides)
 * 2) locale / storage sync
 * 3) Tailwind / component CSS bundle
 */
export const injectCepShellStyles = (
	target: Document = document,
	options: InjectCepShellStylesOptions = {},
): void => {
	injectCepShellAppearanceOnly(target, options);
	injectCepShellLocaleAndThemeStorageHooks(target);
};
