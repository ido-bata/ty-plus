/**
 * Directory browser widget self-description (Wave 1 D8).
 *
 * Defines the directory-browser widget descriptor for auto-registration via registry-v2.ts.
 * Metadata is duplicated here (INV-6: widgets own their descriptor) while the
 * legacy catalog in kinds.ts/CATALOG is preserved for the migration period.
 *
 * INV-3: `id ?? widgetId` fallback collapsed — Layout.id is the canonical ID.
 */

import type { ComponentType } from "react";
import {
	defineWidget,
	type WidgetDescriptor,
	type WidgetRenderProps,
} from "@/function/widget/define";
import { DirectoryBrowserWidget } from "./Component";

const descriptor: WidgetDescriptor = {
	type: "directory-browser",
	nameKey: "widgets.directoryBrowser.name",
	icon: "FolderTree",
	minSize: { cols: 3, rows: 3 },
	maxSize: { cols: 20, rows: 20 },
	defaultSize: { cols: 5, rows: 5 },
	available: true,
	resizable: true,
	category: "utility",
	component:
		DirectoryBrowserWidget as unknown as ComponentType<WidgetRenderProps>,
};

export const directoryBrowserWidgetDescriptor = defineWidget(descriptor);
