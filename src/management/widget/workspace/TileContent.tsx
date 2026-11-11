import type { JSX } from "react";
import type { WidgetType } from "@/function/widget";
import { renderDescriptorSafe } from "@/function/widget/registry";
import { getWidgetDescriptor } from "@/management/widget/registry";
import type {
	GridSettings,
	Layout,
	SurfaceState,
} from "@/management/workspace/state";
import { css } from "@/styled-system/css";

type WidgetProps = {
	layout: Layout;
	state: SurfaceState;
	grid: GridSettings;
};

const fallbackStyle = css({
	padding: "1",
	fontSize: "text-2xs",
	color: "text.muted",
});

export function Widget({ layout, state, grid }: WidgetProps): JSX.Element {
	const descriptor = getWidgetDescriptor(layout.widgetType as WidgetType);
	if (!descriptor) {
		return <div className={fallbackStyle}>{layout.widgetType}</div>;
	}
	return renderDescriptorSafe(descriptor, { layout, state, grid });
}
