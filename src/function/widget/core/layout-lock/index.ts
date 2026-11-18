/**
 * Widget self-description for layout-lock.
 *
 * Auto-aggregated by `registry-v2.ts` via `import.meta.glob`.
 * Metadata mirrors `kinds.ts` (legacy stays for backwards compatibility).
 */

import type { ComponentType } from "react";
import type { WidgetRenderProps } from "@/function/widget/define";
import { defineWidget } from "@/function/widget/define";
import { LayoutLockWidget } from "./Component";

export default defineWidget({
	type: "layout-lock",
	nameKey: "widgets.layoutLock.name",
	tutorial: {
		summaryKey: "widgets.tutorial.layout-lock.summary",
		steps: [
			{
				titleKey: "widgets.tutorial.layout-lock.steps.turnLockOn.title",
				bodyKey: "widgets.tutorial.layout-lock.steps.turnLockOn.body",
			},
			{
				titleKey: "widgets.tutorial.layout-lock.steps.unlockToRearrange.title",
				bodyKey: "widgets.tutorial.layout-lock.steps.unlockToRearrange.body",
			},
		],
	},
	icon: "Lock",
	minSize: { cols: 1, rows: 1 },
	maxSize: { cols: 10, rows: 10 },
	defaultSize: { cols: 1, rows: 1 },
	available: true,
	resizable: false,
	category: "core",
	component: LayoutLockWidget as unknown as ComponentType<WidgetRenderProps>,
});
