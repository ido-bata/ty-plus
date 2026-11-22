/**
 * Loop widget descriptor (self-registration).
 *
 * The Loop widget edits a single-cycle cyclic wave and applies it N times
 * through the host `applyLoopEasing` / `captureLoopState` /
 * `unapplyLoopEasing` commands. The wave editor lives in this directory
 * (`WaveEditor`); it does not share the Easing widget's curve editor.
 */

import { defineWidget } from "@/function/widget/define";
import { LoopWidget } from "./Component";

export const descriptor = defineWidget({
	type: "loop",
	nameKey: "widgets.loop.name",
	descriptionKey: "widgets.selector.descriptions.loop",
	icon: "Repeat",
	minSize: { cols: 3, rows: 3 },
	maxSize: { cols: 20, rows: 20 },
	defaultSize: { cols: 4, rows: 5 },
	available: true,
	resizable: true,
	category: "core",
	component: LoopWidget,
});
