/**
 * Widget registry index (management layer).
 *
 * Wraps the function-layer descriptor registry and exposes the legacy `registry`
 * interface for code that expects `registry.getConfig()`.
 *
 * Wave 3 (D13): This file now re-exports from the function layer and adds a
 * `registry` compatibility shim that maps WidgetDescriptor → Config.
 */

import { WIDGET_TYPES, type WidgetType } from "@/function/widget/contract";
import {
	_widgetGlobs, // Force Rollup to include registry.ts and its side effects
	getWidgetDescriptor,
} from "@/function/widget/registry";
import { createInstanceId } from "@/management/storage/ids";

export { getWidgetDescriptor };

// Consume _widgetGlobs to ensure Rollup does not tree-shake the side-effects
if (typeof _widgetGlobs === "undefined") {
	console.warn("Widgets were tree-shaken!");
}

type WidgetSize = {
	cols: number;
	rows: number;
};

type Config = {
	type: WidgetType;
	name: string;
	nameKey: string;
	descriptionKey?: string;
	icon: string;
	minSize: WidgetSize;
	maxSize: WidgetSize;
	defaultSize: WidgetSize;
	available: boolean;
	resizable: boolean;
	category?: "core" | "utility" | "media" | "phase4";
};

const CATALOG: Config[] = WIDGET_TYPES.map((type) => {
	const d = getWidgetDescriptor(type);
	return {
		type,
		name: d?.nameKey ?? type,
		nameKey: d?.nameKey ?? "",
		descriptionKey: d?.descriptionKey,
		icon: d?.icon ?? "Box",
		minSize: d?.minSize ?? { cols: 2, rows: 2 },
		maxSize: d?.maxSize ?? { cols: 4, rows: 4 },
		defaultSize: d?.defaultSize ?? { cols: 2, rows: 2 },
		available: d?.available ?? true,
		resizable: d?.resizable ?? false,
		category: d?.category,
	};
});

const getConfig = (type: WidgetType): Config | undefined =>
	CATALOG.find((w) => w.type === type);

const createId = (_type: WidgetType): string => createInstanceId();

export const registry = {
	widgets: CATALOG,
	getConfig,
	createId,
};
