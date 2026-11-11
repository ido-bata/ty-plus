/**
 * Menu widget self-descriptor (Wave 1 D5).
 *
 * Metadata (type, nameKey, icon, sizes, availability) moved from kinds.ts/CATALOG.
 * The legacy `CATALOG` entry and `WidgetConfig` type in kinds.ts are kept for
 * backward compatibility; they are not the authority in Wave 3+.
 *
 * Auto-aggregation: `import.meta.glob` in registry-v2.ts loads this file eagerly,
 * triggering the `defineWidget(...)` call as a side-effect and registering the
 * descriptor without any hand-written central switch.
 *
 * INV-6: widgets are an open index -- the registry is the authority.
 * INV-8: additive only during parallel waves.
 */

import type { ComponentType } from "react";
import type { WidgetRenderProps } from "@/function/widget/define";
import { defineWidget } from "@/function/widget/define";
import { MenuWidget } from "./Component";

export default defineWidget({
	type: "menu",
	nameKey: "widgets.menu.name",
	icon: "Menu",
	minSize: { cols: 1, rows: 1 },
	maxSize: { cols: 10, rows: 10 },
	defaultSize: { cols: 1, rows: 1 },
	available: true,
	resizable: true,
	category: "core",
	component: MenuWidget as unknown as ComponentType<WidgetRenderProps>,
});
