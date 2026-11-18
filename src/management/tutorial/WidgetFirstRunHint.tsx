/**
 * First-run contextual hint (Issue #160, spec: tutorial-mode.md route B).
 *
 * Shows a lightweight, non-blocking hint bubble once per widget *type* the
 * first time a widget of that type appears in the workspace. The hint is
 * dismissed — and the dismissal persisted via the tutorial state store — by
 * any of: the dismiss button, a timeout, or the first pointer interaction
 * inside the tile (signalled by `WidgetTutorialLayer`'s interaction counter).
 * Re-showing is only possible through the Settings "show tips again" reset.
 *
 * Spotlight / coach-mark tours are intentionally out of scope.
 */

import { X } from "lucide-react";
import type { JSX } from "react";
import { useCallback, useEffect, useState } from "react";
import { getWidgetDescriptor } from "@/function/widget/registry-core";
import { useTranslation } from "@/management/i18n/Context";
import { css } from "@/styled-system/css";
import { dismissTutorialHint, isTutorialHintDismissed } from "./state-store";

/** How long the hint stays visible before auto-dismissing. */
export const FIRST_RUN_HINT_TIMEOUT_MS = 8_000;

const hintBubble = css({
	position: "absolute",
	left: "1",
	right: "1",
	bottom: "1",
	zIndex: "2",
	display: "flex",
	alignItems: "center",
	gap: "1.5",
	paddingBlock: "1",
	paddingInline: "1.5",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.subtle",
	borderRadius: "shell-sm",
	backgroundColor: "surface.panel",
	color: "text.primary",
	fontSize: "text-2xs",
	lineHeight: "1.4",
	boxShadow: "sm",
});

const hintText = css({
	flex: "1",
	minWidth: "0",
	overflow: "hidden",
	textOverflow: "ellipsis",
	whiteSpace: "nowrap",
});

const hintDismiss = css({
	display: "inline-flex",
	alignItems: "center",
	justifyContent: "center",
	flexShrink: "0",
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

export type WidgetFirstRunHintProps = {
	widgetType: string;
	/**
	 * Monotonic counter bumped by `WidgetTutorialLayer` on every pointerdown
	 * inside the tile. Any change while the hint is visible dismisses it.
	 */
	interactionSignal?: number;
};

export function WidgetFirstRunHint({
	widgetType,
	interactionSignal = 0,
}: WidgetFirstRunHintProps): JSX.Element | null {
	const { t } = useTranslation("widgets");
	const [visible, setVisible] = useState(false);
	const tutorial = getWidgetDescriptor(widgetType)?.tutorial;
	const summaryKey = tutorial?.summaryKey;
	const contentVersion = tutorial?.contentVersion;

	useEffect(() => {
		if (!summaryKey || !contentVersion) return;
		let cancelled = false;
		void isTutorialHintDismissed(window, widgetType, contentVersion)
			.then((dismissed) => {
				if (!cancelled && !dismissed) setVisible(true);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [widgetType, summaryKey, contentVersion]);

	const hide = useCallback((): void => {
		setVisible(false);
		if (contentVersion) {
			void dismissTutorialHint(window, widgetType, contentVersion).catch(
				() => {},
			);
		}
	}, [widgetType, contentVersion]);

	useEffect(() => {
		if (!visible) return;
		const timer = setTimeout(hide, FIRST_RUN_HINT_TIMEOUT_MS);
		return () => clearTimeout(timer);
	}, [visible, hide]);

	useEffect(() => {
		if (interactionSignal > 0 && visible) hide();
	}, [interactionSignal, visible, hide]);

	if (!visible || !summaryKey) {
		return null;
	}

	return (
		<div className={hintBubble} role="status">
			<span className={hintText}>
				{t(summaryKey.replace(/^widgets\./, ""), { defaultValue: "" })}
			</span>
			<button
				type="button"
				className={hintDismiss}
				aria-label={t("tutorial.chrome.dismissHint", {
					defaultValue: "Dismiss hint",
				})}
				onClick={(event) => {
					event.stopPropagation();
					hide();
				}}
			>
				<X size={12} aria-hidden />
			</button>
		</div>
	);
}
