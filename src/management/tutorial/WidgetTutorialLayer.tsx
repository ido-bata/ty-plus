/**
 * Tutorial layer wrapper for a widget tile (Issues #159 / #160, coach-mark
 * tour revision).
 *
 * Wraps the widget body plus the first-run auto tour: the first time a
 * widget *type* appears in the workspace (per
 * `settings/tutorial-state.json`, keyed by widget type + content version),
 * the tour opens automatically and is dismissed — persisted via the
 * tutorial state store — by finishing, skipping, or closing it.
 *
 * The tour renders anchored speech-bubble steps pointing at
 * `[data-tutorial-target]` elements inside the widget. There is no
 * persistent help affordance: the layer paints nothing of its own.
 */

import type { JSX, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { getWidgetDescriptor } from "@/management/widget/registry";
import { css } from "@/styled-system/css";
import {
	dismissTutorialHint,
	isTutorialHintDismissed,
	isTutorialSeen,
	markTutorialSeen,
} from "./state-store";
import { WidgetTutorialTour } from "./WidgetTutorialTour";

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
	const layerRef = useRef<HTMLDivElement | null>(null);
	const [tourOpen, setTourOpen] = useState(false);
	const tourAutoRef = useRef(false);
	const tutorial = getWidgetDescriptor(widgetType)?.tutorial;
	const contentVersion = tutorial?.contentVersion;

	// First-run auto tour: open once per widget type + content version unless
	// the user already saw the help or dismissed the hint.
	useEffect(() => {
		if (!tutorial?.summaryKey || !contentVersion) return;
		let cancelled = false;
		void Promise.all([
			isTutorialHintDismissed(window, widgetType, contentVersion),
			isTutorialSeen(window, widgetType, contentVersion),
		])
			.then(([dismissed, seen]) => {
				if (!cancelled && !dismissed && !seen) {
					tourAutoRef.current = true;
					setTourOpen(true);
				}
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [widgetType, tutorial?.summaryKey, contentVersion]);

	const closeTour = useCallback((): void => {
		setTourOpen(false);
		if (tourAutoRef.current && contentVersion) {
			void dismissTutorialHint(window, widgetType, contentVersion).catch(
				() => {},
			);
			void markTutorialSeen(window, widgetType, contentVersion).catch(() => {});
		}
		tourAutoRef.current = false;
	}, [widgetType, contentVersion]);

	return (
		<div ref={layerRef} className={layer}>
			{children}
			{tourOpen ? (
				<WidgetTutorialTour
					widgetType={widgetType}
					layerRef={layerRef}
					onClose={closeTour}
				/>
			) : null}
		</div>
	);
}
