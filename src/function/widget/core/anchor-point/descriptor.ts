/**
 * Anchor point widget self-description.
 *
 * Auto-aggregated via `import.meta.glob` in `registry-v2.ts`.
 * The metadata here is the canonical source; `kinds.ts` retains a legacy
 * copy until Wave 3 integration.
 */

import { defineWidget } from "@/function/widget/define";
import { AnchorPointWidget } from "./Component";

defineWidget({
	type: "anchor-point",
	nameKey: "widgets.anchorPoint.name",
	descriptionKey: "widgets.selector.descriptions.anchor-point",
	tutorial: {
		summaryKey: "widgets.tutorial.anchor-point.summary",
		contentVersion: "1",
		steps: [
			{
				titleKey: "widgets.tutorial.anchor-point.steps.nameAnchor.title",
				bodyKey: "widgets.tutorial.anchor-point.steps.nameAnchor.body",
			},
			{
				titleKey: "widgets.tutorial.anchor-point.steps.dropAnchor.title",
				bodyKey: "widgets.tutorial.anchor-point.steps.dropAnchor.body",
			},
		],
	},
	icon: "Crosshair",
	minSize: { cols: 2, rows: 2 },
	maxSize: { cols: 10, rows: 10 },
	defaultSize: { cols: 2, rows: 2 },
	available: true,
	resizable: false,
	category: "core",
	component: AnchorPointWidget,
});
