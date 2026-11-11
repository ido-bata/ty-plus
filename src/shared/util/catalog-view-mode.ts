import type { Dispatch, SetStateAction } from "react";
import { useCallback, useState } from "react";

export type CatalogViewMode = "list" | "icons";

export type CatalogViewModeApi = {
	viewMode: CatalogViewMode;
	setViewMode: Dispatch<SetStateAction<CatalogViewMode>>;
	toggleView: () => void;
	isIconView: boolean;
};

export function useCatalogViewMode(
	initial: CatalogViewMode = "list",
): CatalogViewModeApi {
	const [viewMode, setViewMode] = useState<CatalogViewMode>(initial);
	const toggleView = useCallback(() => {
		setViewMode((v) => (v === "list" ? "icons" : "list"));
	}, []);
	return {
		viewMode,
		setViewMode,
		toggleView,
		isIconView: viewMode === "icons",
	};
}
