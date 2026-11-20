import { themeVarsToCssBlock } from "@ty-plus/ui/tokens/theme-css";
import { DEFAULT_THEME } from "@/management/style/default-values";
import { loadThemeOverrides } from "@/management/style/load-overrides";

export { themeVarsToCssBlock };

export const mergePanelTheme = (
	...extra: (Partial<Record<string, string>> | undefined)[]
): Record<string, string> => {
	const merged: Record<string, string> = { ...DEFAULT_THEME };
	// Skip storage overrides before onboarding completes - use DEFAULT only.
	// Callers pass { skipStorageOverrides: true } as first argument when
	// onboarding is not yet complete to prevent custom styles from leaking.
	const hasSkipFlag =
		extra.length > 0 &&
		extra[0] !== undefined &&
		(extra[0] as Record<string, unknown>).__skipStorageOverrides === true;
	const storageOverrides = hasSkipFlag ? {} : loadThemeOverrides();
	const layersToMerge = hasSkipFlag ? [...extra] : [storageOverrides, ...extra];
	for (const layer of layersToMerge) {
		if (!layer) {
			continue;
		}
		for (const [k, v] of Object.entries(layer)) {
			if (v !== undefined && v !== "") {
				merged[k] = v;
			}
		}
	}
	return merged;
};
