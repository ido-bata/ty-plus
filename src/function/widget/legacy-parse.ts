import { WIDGET_TYPES, type WidgetType } from "@/function/widget/contract";

/**
 * Best-effort inference of widget **kind** from legacy ids that embedded the type
 * (`widget-search`, `widget-align-20260101-1`, …). Opaque ids return null.
 */
export const inferWidgetTypeFromLegacyLayoutId = (
	id: string,
	_types: readonly string[] = WIDGET_TYPES,
): WidgetType | null => {
	const trimmed = id.trim();
	if (!trimmed.startsWith("widget-")) return null;
	const parts = trimmed.slice("widget-".length);
	if (parts.startsWith("search")) {
		return "quick-actions";
	}
	const allTypes = _types as readonly string[];
	const sortedTypes = [...allTypes].sort((a, b) => b.length - a.length);
	for (const type of sortedTypes) {
		if (parts.startsWith(type)) {
			return type as WidgetType;
		}
	}
	return null;
};
