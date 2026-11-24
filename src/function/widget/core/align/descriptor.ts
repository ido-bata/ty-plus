/**
 * Align widget self-description (Wave 1).
 *
 * Auto-registered via `import.meta.glob` in `registry-v2.ts`.
 * Metadata migrated from `kinds.ts` (legacy copy remains until Wave 3).
 */

import type { ComponentType } from "react";
import type { WidgetRenderProps } from "@/function/widget/define";
import { defineWidget } from "@/function/widget/define";

import { Align } from "./Component";

const descriptor = defineWidget({
	type: "align",
	nameKey: "widgets.align.name",
	descriptionKey: "widgets.selector.descriptions.align",
	tutorial: {
		summaryKey: "widgets.tutorial.align.summary",
		contentVersion: "1",
		steps: [
			{
				titleKey: "widgets.tutorial.align.steps.selectTargets.title",
				bodyKey: "widgets.tutorial.align.steps.selectTargets.body",
			},
			{
				titleKey: "widgets.tutorial.align.steps.pickAlignment.title",
				bodyKey: "widgets.tutorial.align.steps.pickAlignment.body",
			},
		],
	},
	icon: "AlignCenter",
	minSize: { cols: 2, rows: 2 },
	maxSize: { cols: 10, rows: 10 },
	defaultSize: { cols: 2, rows: 2 },
	available: true,
	resizable: false,
	category: "core",
	component: Align as ComponentType<WidgetRenderProps>,
});

export default descriptor;
