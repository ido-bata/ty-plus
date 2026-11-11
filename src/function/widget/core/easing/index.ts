/**
 * Easing widget self-description (Wave 1 D3).
 *
 * Defines the easing widget descriptor for auto-registration via registry-v2.ts.
 * Metadata is duplicated here (INV-6: widgets own their descriptor) while the
 * legacy catalog in kinds.ts/CATALOG is preserved for the migration period.
 *
 * INV-3: `id ?? widgetId` fallback collapsed — Layout.id is the canonical ID.
 */

import { defineWidget } from "@/function/widget/define";
import { EasingWidget } from "./Component";

export const descriptor = defineWidget({
	type: "easing",
	nameKey: "widgets.easing.name",
	icon: "TrendingUp",
	minSize: { cols: 3, rows: 3 },
	maxSize: { cols: 20, rows: 20 },
	defaultSize: { cols: 4, rows: 5 },
	available: true,
	resizable: true,
	category: "core",
	component: EasingWidget,
});
