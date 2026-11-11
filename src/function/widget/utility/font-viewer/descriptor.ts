/**
 * Widget self-description for the font-viewer utility widget.
 *
 * Auto-aggregated by registry-v2.ts via import.meta.glob (eager glob pattern).
 */

import type { ComponentType } from "react";
import type { WidgetRenderProps } from "@/function/widget/define";
import { defineWidget } from "@/function/widget/define";
import { FontViewerWidget } from "./Component";

defineWidget({
	type: "font-viewer",
	nameKey: "widgets.fontViewer.name",
	icon: "Type",
	minSize: { cols: 2, rows: 2 },
	maxSize: { cols: 20, rows: 20 },
	defaultSize: { cols: 6, rows: 4 },
	available: true,
	resizable: true,
	category: "utility",
	component: FontViewerWidget as unknown as ComponentType<WidgetRenderProps>,
});
