/**
 * Loop widget descriptor (self-registration).
 *
 * The Loop widget edits a single-cycle easing curve and applies it N times
 * to the "in" handle side through the host `applyLoopEasing` command. The
 * curve editor itself is shared with the Easing widget
 * (`function/widget/curve-editor`).
 */

import { defineWidget } from "@/function/widget/define";
import { LoopWidget } from "./Component";

export const descriptor = defineWidget({
	type: "loop",
	nameKey: "widgets.loop.name",
	descriptionKey: "widgets.selector.descriptions.loop",
	tutorial: {
		summaryKey: "widgets.tutorial.loop.summary",
		contentVersion: "1",
		steps: [
			{
				titleKey: "widgets.tutorial.loop.steps.chooseCycle.title",
				bodyKey: "widgets.tutorial.loop.steps.chooseCycle.body",
				targetSelector: '[data-tutorial-target="loop-canvas"]',
			},
			{
				titleKey: "widgets.tutorial.loop.steps.applyCycle.title",
				bodyKey: "widgets.tutorial.loop.steps.applyCycle.body",
				targetSelector: '[data-tutorial-target="loop-apply"]',
			},
		],
	},
	icon: "Repeat",
	minSize: { cols: 3, rows: 3 },
	maxSize: { cols: 20, rows: 20 },
	defaultSize: { cols: 4, rows: 5 },
	available: true,
	resizable: true,
	category: "core",
	component: LoopWidget,
});
