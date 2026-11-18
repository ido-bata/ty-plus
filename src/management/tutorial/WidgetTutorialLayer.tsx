/**
 * Tutorial layer wrapper for a widget tile (Issues #159 / #160).
 *
 * Wraps the widget body plus the help affordance and first-run hint in a
 * single positioned container. Every pointerdown inside the tile bumps an
 * interaction counter (capture phase, never stopped) so the first-run hint
 * can treat any widget interaction as "the user has started" and dismiss
 * itself — without interfering with tile selection or drag handling.
 */

import type { JSX, ReactNode } from "react";
import { useCallback, useState } from "react";
import { css } from "@/styled-system/css";
import { WidgetFirstRunHint } from "./WidgetFirstRunHint";
import { WidgetHelpOverlay } from "./WidgetHelpOverlay";

const layer = css({
	position: "absolute",
	inset: "0",
	minHeight: "0",
	minWidth: "0",
});

export type WidgetTutorialLayerProps = {
	widgetType: string;
	children: ReactNode;
};

export function WidgetTutorialLayer({
	widgetType,
	children,
}: WidgetTutorialLayerProps): JSX.Element {
	const [interactionSignal, setInteractionSignal] = useState(0);
	const onPointerDownCapture = useCallback(() => {
		setInteractionSignal((seq) => seq + 1);
	}, []);

	return (
		<div className={layer} onPointerDownCapture={onPointerDownCapture}>
			{children}
			<WidgetHelpOverlay widgetType={widgetType} />
			<WidgetFirstRunHint
				widgetType={widgetType}
				interactionSignal={interactionSignal}
			/>
		</div>
	);
}
