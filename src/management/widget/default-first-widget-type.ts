import type { WidgetType } from "@/function/widget";
import { registry } from "@/management/widget/registry";

export function defaultFirstWidgetType(): WidgetType | null {
	const first = registry.widgets.find((widget) => widget.available);
	return first?.type ?? null;
}
