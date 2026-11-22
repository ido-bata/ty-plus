/**
 * Tutorial layer wrapper for a widget tile (Issues #159 / #160, coach-mark
 * tour revision).
 *
 * Wraps the widget body plus two tutorial surfaces:
 *
 * - A "?" help affordance that opens the step-through tour on demand.
 * - A first-run auto tour: the first time a widget *type* appears in the
 *   workspace (per `settings/tutorial-state.json`, keyed by widget type +
 *   content version), the same tour opens automatically and is dismissed —
 *   persisted via the tutorial state store — by finishing, skipping, or
 *   closing it.
 *
 * Both surfaces share `WidgetTutorialTour`, which renders anchored
 * speech-bubble steps pointing at `[data-tutorial-target]` elements inside
 * the widget.
 */

import { cx } from "@ty-plus/ui/util/cx";
import { CircleHelp } from "lucide-react";
import type { JSX, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "@/management/i18n/Context";
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

const helpAnchor = css({
	position: "absolute",
	top: "1",
	right: "1",
	zIndex: "2",
});

const helpButton = css({
	display: "inline-flex",
	alignItems: "center",
	justifyContent: "center",
	height: "6",
	width: "6",
	padding: "0",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.subtle",
	borderRadius: "shell-sm",
	backgroundColor: "surface.widget",
	color: "text.muted",
	cursor: "pointer",
	transitionProperty: "color, border-color",
	transitionDuration: "fast",
	"&:hover": {
		color: "text.primary",
		borderColor: "border.default",
	},
	"&:focus-visible": {
		outline: "2px solid",
		outlineColor: "text.accent",
		outlineOffset: "1px",
	},
});

const stopPropagation = (event: { stopPropagation: () => void }): void => {
	event.stopPropagation();
};

export type WidgetTutorialLayerProps = {
	widgetType: string;
	children: ReactNode;
};

export function WidgetTutorialLayer({
	widgetType,
	children,
}: WidgetTutorialLayerProps): JSX.Element {
	const { t } = useTranslation("widgets");
	const layerRef = useRef<HTMLDivElement | null>(null);
	const [tourOpen, setTourOpen] = useState(false);
	const tourAutoRef = useRef(false);
	const tutorial = getWidgetDescriptor(widgetType)?.tutorial;
	const contentVersion = tutorial?.contentVersion;
	const hasContent =
		Boolean(tutorial?.summaryKey) &&
		(contentVersion !== undefined || (tutorial?.steps?.length ?? 0) > 0);

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

	const openHelp = useCallback((): void => {
		tourAutoRef.current = false;
		setTourOpen(true);
		if (contentVersion) {
			void markTutorialSeen(window, widgetType, contentVersion).catch(() => {});
		}
	}, [widgetType, contentVersion]);

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
			{hasContent ? (
				<button
					type="button"
					className={cx(helpAnchor, helpButton)}
					aria-label={t("tutorial.chrome.help", { defaultValue: "Help" })}
					aria-expanded={tourOpen}
					onMouseDown={stopPropagation}
					onClick={(event) => {
						event.stopPropagation();
						openHelp();
					}}
				>
					<CircleHelp size={14} aria-hidden />
				</button>
			) : null}
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
