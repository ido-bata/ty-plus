/**
 * Widget implementation contract — function-local types.
 * Generic management interface types live in `src/management/widget/contract`.
 */

export const WIDGET_TYPES = [
	"quick-actions",
	"menu",
	"info",
	"easing",
	"align",
	"anchor-point",
	"directory-browser",
	"layout-lock",
	"font-viewer",
] as const;

export type WidgetType = (typeof WIDGET_TYPES)[number];

const TYPE_SET = new Set<string>(WIDGET_TYPES);

export const isWidgetType = (value: string): value is WidgetType =>
	TYPE_SET.has(value);
