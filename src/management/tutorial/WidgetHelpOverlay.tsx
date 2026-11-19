/**
 * Per-widget help affordance (Issue #159).
 *
 * Renders a small "?" button anchored to the top-right of a widget tile plus
 * an in-tile help panel that shows the descriptor's `tutorial` content
 * (summary + ordered steps). Opening the panel marks the tutorial as seen via
 * the shared tutorial state store so first-run hint logic (#160) can treat
 * the user as already introduced.
 *
 * The overlay is rendered as a sibling of the widget body inside the tile
 * shell; both elements are absolutely positioned so they do not affect the
 * widget layout. Mouse events are stopped from propagating so tile
 * selection/drag handling is not disturbed.
 */

import { CircleHelp, X } from "lucide-react";
import type { JSX } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { getWidgetDescriptor } from "@/function/widget/registry-core";
import { useTranslation } from "@/management/i18n/Context";
import { cx } from "@/shared/util/cx";
import { css } from "@/styled-system/css";
import { markTutorialSeen } from "./state-store";

const stopPropagation = (event: { stopPropagation: () => void }): void => {
	event.stopPropagation();
};

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
		outlineColor: "accent.primary",
		outlineOffset: "1px",
	},
});

const helpPanel = css({
	position: "absolute",
	inset: "0",
	zIndex: "3",
	margin: "0",
	display: "flex",
	flexDirection: "column",
	gap: "1.5",
	padding: "2",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.subtle",
	borderRadius: "shell-sm",
	backgroundColor: "surface.widget",
	color: "text.primary",
	overflowY: "auto",
	fontSize: "text-2xs",
	lineHeight: "1.5",
});

const helpPanelHeader = css({
	display: "flex",
	alignItems: "center",
	justifyContent: "space-between",
	gap: "1",
	fontWeight: "medium",
});

const helpPanelClose = css({
	display: "inline-flex",
	alignItems: "center",
	justifyContent: "center",
	height: "5",
	width: "5",
	padding: "0",
	borderWidth: "0",
	borderRadius: "shell-sm",
	backgroundColor: "transparent",
	color: "text.muted",
	cursor: "pointer",
	"&:hover": { color: "text.primary" },
	"&:focus-visible": {
		outline: "2px solid",
		outlineColor: "accent.primary",
		outlineOffset: "1px",
	},
});

const helpSteps = css({
	margin: "0",
	paddingInlineStart: "4",
	display: "flex",
	flexDirection: "column",
	gap: "1",
});

const helpStepTitle = css({ fontWeight: "medium" });

export type WidgetHelpOverlayProps = {
	widgetType: string;
};

export function WidgetHelpOverlay({
	widgetType,
}: WidgetHelpOverlayProps): JSX.Element | null {
	const { t } = useTranslation("widgets");
	const [open, setOpen] = useState(false);
	const panelRef = useRef<HTMLDialogElement | null>(null);
	const descriptor = getWidgetDescriptor(widgetType);
	const tutorial = descriptor?.tutorial;

	const resolveKey = useCallback(
		(key: string): string =>
			t(key.replace(/^widgets\./, ""), { defaultValue: "" }),
		[t],
	);

	// Block mousedown from reaching tile-level drag/selection handlers while
	// the help panel is open. A native listener is used so the propagation
	// stop applies regardless of how the tile observes pointer input.
	useEffect(() => {
		const el = panelRef.current;
		if (!open || !el) return;
		const stop = (event: Event): void => {
			event.stopPropagation();
		};
		el.addEventListener("mousedown", stop);
		return () => el.removeEventListener("mousedown", stop);
	}, [open]);

	if (!tutorial?.summaryKey) {
		return null;
	}

	const openHelp = (): void => {
		setOpen(true);
		void markTutorialSeen(window, widgetType, tutorial.contentVersion).catch(
			() => {},
		);
	};

	const steps = tutorial.steps ?? [];

	return (
		<>
			<button
				type="button"
				className={cx(helpAnchor, helpButton)}
				aria-label={t("tutorial.chrome.help", { defaultValue: "Help" })}
				aria-expanded={open}
				onMouseDown={stopPropagation}
				onClick={(event) => {
					event.stopPropagation();
					openHelp();
				}}
			>
				<CircleHelp size={14} aria-hidden />
			</button>
			{open ? (
				<dialog
					ref={panelRef}
					open
					className={helpPanel}
					aria-label={t("tutorial.chrome.title", {
						defaultValue: "Widget help",
					})}
				>
					<div className={helpPanelHeader}>
						<span>
							{t("tutorial.chrome.title", { defaultValue: "Widget help" })}
						</span>
						<button
							type="button"
							className={helpPanelClose}
							aria-label={t("tutorial.chrome.close", {
								defaultValue: "Close",
							})}
							onClick={(event) => {
								event.stopPropagation();
								setOpen(false);
							}}
						>
							<X size={12} aria-hidden />
						</button>
					</div>
					<p className={css({ margin: "0" })}>
						{resolveKey(tutorial.summaryKey)}
					</p>
					{steps.length > 0 ? (
						<ol className={helpSteps}>
							{steps.map((step) => (
								<li key={step.titleKey}>
									<div className={helpStepTitle}>
										{resolveKey(step.titleKey)}
									</div>
									<div>{resolveKey(step.bodyKey)}</div>
								</li>
							))}
						</ol>
					) : null}
				</dialog>
			) : null}
		</>
	);
}
