import type { Status } from "@/management/online/licensing/types";

export type FeatureId =
	| "basic-presets"
	| "preset-library"
	| "directory-browser"
	| "font-viewer"
	| "text-editor"
	| "fx-search"
	| "cloud-sync"
	| "theme-customization"
	| "multi-panel"
	| "export-import";

type FeatureTier = "free" | "pro";

const FEATURE_TIERS: Record<FeatureId, FeatureTier> = {
	"basic-presets": "free",
	"preset-library": "pro",
	"directory-browser": "pro",
	"font-viewer": "pro",
	"text-editor": "pro",
	"fx-search": "free",
	"cloud-sync": "pro",
	"theme-customization": "free",
	"multi-panel": "pro",
	"export-import": "pro",
};

export const hasFeatureAccess = (
	feature: FeatureId,
	licenseStatus: Status,
): boolean => {
	if (FEATURE_TIERS[feature] === "free") {
		return true;
	}
	return licenseStatus === "active";
};
