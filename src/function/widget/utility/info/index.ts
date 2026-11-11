/**
 * Widget self-description for the info utility widget (Wave 1 D6).
 *
 * Auto-aggregated by registry-v2.ts via import.meta.glob (eager glob pattern).
 * Metadata is duplicated here (INV-6: widgets own their descriptor) while the
 * legacy catalog in kinds.ts/CATALOG is preserved for the migration period.
 *
 * INV-3: id ?? widgetId fallback collapsed — Layout.id is the canonical ID.
 */

import type { ComponentType } from "react";
import type { WidgetRenderProps } from "@/function/widget/define";
import { defineWidget } from "@/function/widget/define";
import { PresetInfoWidget } from "./preset";

defineWidget({
	type: "info",
	nameKey: "widgets.info.name",
	icon: "Info",
	minSize: { cols: 4, rows: 2 },
	maxSize: { cols: 20, rows: 20 },
	defaultSize: { cols: 6, rows: 3 },
	available: true,
	resizable: true,
	category: "utility",
	component: PresetInfoWidget as unknown as ComponentType<WidgetRenderProps>,
});
