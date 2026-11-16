import {
	createContext,
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";

import {
	clearCepShellThemeStorage,
	loadCepShellThemeOverridesForWrite,
	sanitizeCepShellThemeOverrides,
	saveCepShellThemeToCss,
} from "@/management/panel/theme/storage";
import { enqueueThemeWrite } from "@/management/panel/theme/write-queue";

export type ThemeContextValue = {
	themeOverrides: Record<string, string>;
	applyTheme: (overrides: Record<string, string>) => void;
	resetTheme: () => void;
	rebaselineTheme: () => Promise<void>;
	isDirty: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const fingerprintOverrides = (o: Record<string, string>): string => {
	const keys = Object.keys(o).sort();
	const sorted: Record<string, string> = {};
	for (const k of keys) {
		sorted[k] = o[k] ?? "";
	}
	return JSON.stringify(sorted);
};

const syncOverridesState = async (
	_win: Window,
): Promise<Record<string, string>> => {
	return {};
};

export const ThemeProvider = ({
	children,
	panelSurfaceId,
}: {
	children: ReactNode;
	panelSurfaceId?: string;
}) => {
	const [themeOverrides, setThemeOverrides] = useState<Record<string, string>>(
		{},
	);
	const [baselineFingerprint, setBaselineFingerprint] = useState("");

	const isDirty = fingerprintOverrides(themeOverrides) !== baselineFingerprint;

	const refreshFromStorage = useCallback(async () => {
		const next = await syncOverridesState(window);
		setThemeOverrides(next);
	}, []);

	useEffect(() => {
		const bump = () => {
			refreshFromStorage();
		};
		window.addEventListener("focus", bump);
		const onVis = () => {
			if (document.visibilityState === "visible") {
				bump();
			}
		};
		document.addEventListener("visibilitychange", onVis);
		return () => {
			window.removeEventListener("focus", bump);
			document.removeEventListener("visibilitychange", onVis);
		};
	}, [refreshFromStorage]);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			if (!cancelled) {
				const initial = await syncOverridesState(window);
				setThemeOverrides(initial);
				setBaselineFingerprint(fingerprintOverrides(initial));
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const applyTheme = useCallback((overrides: Record<string, string>) => {
		void enqueueThemeWrite(window, async () => {
			// Merge the patch over the durable file, not in-memory state:
			// theme.css is shared with grid/token writers, and a stale
			// base would erase their overrides (Issue #91 review).
			const disk = await loadCepShellThemeOverridesForWrite(window);
			const merged = {
				...disk,
				...sanitizeCepShellThemeOverrides(overrides),
			};
			await saveCepShellThemeToCss(window, merged);
		})
			.then(async () => {
				const next = await syncOverridesState(window);
				const fp = fingerprintOverrides(next);
				setThemeOverrides(next);
				setBaselineFingerprint(fp);
			})
			.catch((error) => {
				console.error("[ThemeContext] Failed to apply theme:", error);
			});
	}, []);

	const resetTheme = useCallback(() => {
		void enqueueThemeWrite(window, () => clearCepShellThemeStorage(window))
			.then(async () => {
				const next = await syncOverridesState(window);
				const fp = fingerprintOverrides(next);
				setThemeOverrides(next);
				setBaselineFingerprint(fp);
			})
			.catch((error) => {
				console.error("[ThemeContext] Failed to reset theme:", error);
			});
	}, []);

	const rebaselineTheme = useCallback(async () => {
		const next = await syncOverridesState(window);
		setThemeOverrides(next);
		setBaselineFingerprint(fingerprintOverrides(next));
	}, []);

	const value = useMemo<ThemeContextValue>(
		() => ({
			themeOverrides,
			applyTheme,
			resetTheme,
			rebaselineTheme,
			isDirty,
		}),
		[themeOverrides, applyTheme, resetTheme, rebaselineTheme, isDirty],
	);

	return (
		<ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
	);
};
