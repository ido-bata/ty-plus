/**
 * Widget self-description descriptor.
 *
 * Auto-registers into `registry-v2.ts` via `defineWidget()` side-effect
 * when this module is loaded (eager glob import in registry-v2).
 */

import type { ComponentType } from "react";
import type { WidgetRenderProps } from "@/function/widget/define";
import { defineWidget } from "@/function/widget/define";
import { QuickActionsWidget } from "./ActionList";

/**
 * Quick Actions widget descriptor.
 *
 * Metadata sourced from `kinds.ts` CATALOG entry for "quick-actions".
 * Legacy catalog entry preserved until Wave 3 integration.
 */
export default defineWidget({
	type: "quick-actions",
	nameKey: "widgets.quickActions.name",
	icon: "Zap",
	minSize: { cols: 2, rows: 1 },
	maxSize: { cols: 20, rows: 20 },
	defaultSize: { cols: 4, rows: 1 },
	available: true,
	resizable: true,
	category: "utility",
	component: QuickActionsWidget as unknown as ComponentType<WidgetRenderProps>,
});
