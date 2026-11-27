/**
 * Step-through tutorial tour (coach marks) for a widget tile.
 *
 * Renders a speech-bubble card anchored to the step's `targetSelector`
 * (`[data-tutorial-target]` element inside the widget) via a portal, so the
 * bubble is not clipped by the tile's `overflow: hidden` and can extend beyond
 * small widgets. A highlight ring marks the referenced control while the step
 * is active.
 *
 * The tour is user-driven: "next" advances one step at a time, "back" returns,
 * and "skip"/close ends the sequence. Steps without a resolvable target fall
 * back to anchoring on the tile itself. The dim scrim is visual only
 * (`pointer-events: none`) so the user can still operate the highlighted
 * control while reading each step.
 */

import { Button, cx, IconButton } from "@ty-plus/ui";
import { X } from "lucide-react";
import type { CSSProperties, JSX, RefObject } from "react";
import {
	useCallback,
	useEffect,
	useEffectEvent,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "@/management/i18n/Context";
import type { TutorialStep } from "@/management/widget/registry";
import { getWidgetDescriptor } from "@/management/widget/registry";
import { css } from "@/styled-system/css";

const VIEWPORT_MARGIN = 8;
const ANCHOR_GAP = 8;
const BUBBLE_MAX_WIDTH = 260;
const FALLBACK_MAX_HEIGHT_RATIO = 0.9;

const scrim = css({
	position: "fixed",
	inset: "0",
	zIndex: "var(--ty-z-tutorial-scrim)",
	pointerEvents: "none",
	backgroundColor: "var(--color-ty-scrim)",
});

const highlight = css({
	position: "fixed",
	zIndex: "var(--ty-z-tutorial-highlight)",
	pointerEvents: "none",
	borderWidth: "2px",
	borderStyle: "solid",
	borderColor: "text.accent",
	borderRadius: "shell-sm",
	boxShadow:
		"0 0 0 4px color-mix(in srgb, var(--color-text-accent) 25%, transparent)",
});

const bubble = css({
	position: "fixed",
	zIndex: "var(--ty-z-tutorial-bubble)",
	boxSizing: "border-box",
	width: "max-content",
	maxWidth: `${BUBBLE_MAX_WIDTH}px`,
	display: "flex",
	flexDirection: "column",
	gap: "1.5",
	padding: "2",
	borderWidth: "hairline",
	borderStyle: "solid",
	borderColor: "border.subtle",
	borderRadius: "md",
	backgroundColor: "surface.panel",
	color: "text.primary",
	fontSize: "text-2xs",
	lineHeight: "1.5",
	boxShadow: "md",
});

const bubbleHeader = css({
	display: "flex",
	alignItems: "center",
	justifyContent: "space-between",
	gap: "2",
});

const bubbleTitle = css({ fontWeight: "medium" });

const bubbleClose = css({
	flexShrink: "0",
});

const bubbleBody = css({
	margin: "0",
	minWidth: 0,
	maxHeight: "30vh",
	overflowY: "auto",
});

const bubbleFooter = css({
	display: "flex",
	alignItems: "center",
	justifyContent: "space-between",
	gap: "2",
});

const bubbleProgress = css({
	fontSize: "text-2xs",
	color: "text.muted",
	fontVariantNumeric: "tabular-nums",
});

const bubbleActions = css({
	display: "flex",
	alignItems: "center",
	gap: "1",
});

const caret = css({
	position: "absolute",
	width: "8px",
	height: "8px",
	backgroundColor: "surface.panel",
	clipPath: "polygon(0 0, 100% 0, 50% 100%)",
	pointerEvents: "none",
});

type Rect = { top: number; left: number; width: number; height: number };

type Placement = {
	top: number;
	left: number;
	/** Which edge of the bubble the caret sits on. */
	caretSide: "top" | "bottom";
	caretLeft: number;
};

const toRect = (el: Element): Rect => {
	const r = el.getBoundingClientRect();
	return { top: r.top, left: r.left, width: r.width, height: r.height };
};

const computePlacement = (
	anchor: Rect,
	bubbleSize: { width: number; height: number },
): Placement => {
	const vw = window.innerWidth;
	const vh = window.innerHeight;
	const maxBubbleHeight = vh * FALLBACK_MAX_HEIGHT_RATIO;
	const bubbleH = Math.min(bubbleSize.height, maxBubbleHeight);

	const anchorCenterX = anchor.left + anchor.width / 2;
	const fitsBelow =
		anchor.top + anchor.height + ANCHOR_GAP + bubbleH + VIEWPORT_MARGIN <= vh;
	const fitsAbove = anchor.top - ANCHOR_GAP - bubbleH - VIEWPORT_MARGIN >= 0;

	let top: number;
	let caretSide: "top" | "bottom";
	if (fitsBelow || !fitsAbove) {
		top = anchor.top + anchor.height + ANCHOR_GAP;
		caretSide = "top";
	} else {
		top = anchor.top - ANCHOR_GAP - bubbleH;
		caretSide = "bottom";
	}
	top = Math.min(
		Math.max(top, VIEWPORT_MARGIN),
		Math.max(VIEWPORT_MARGIN, vh - bubbleH - VIEWPORT_MARGIN),
	);

	const left = Math.min(
		Math.max(anchorCenterX - bubbleSize.width / 2, VIEWPORT_MARGIN),
		Math.max(VIEWPORT_MARGIN, vw - bubbleSize.width - VIEWPORT_MARGIN),
	);

	const caretCenter = Math.min(
		Math.max(anchorCenterX - left, 12),
		bubbleSize.width - 12,
	);

	return { top, left, caretSide, caretLeft: caretCenter - 4 };
};

export type WidgetTutorialTourProps = {
	widgetType: string;
	/** Tile layer element; used to resolve `targetSelector` and as fallback anchor. */
	layerRef: RefObject<HTMLElement | null>;
	onClose: () => void;
};

export function WidgetTutorialTour({
	widgetType,
	layerRef,
	onClose,
}: WidgetTutorialTourProps): JSX.Element | null {
	const { t } = useTranslation("widgets");
	const descriptor = getWidgetDescriptor(widgetType);
	const tutorial = descriptor?.tutorial;
	const steps = tutorial?.steps ?? [];
	const summaryKey = tutorial?.summaryKey;

	const resolveKey = useCallback(
		(key: string): string =>
			t(key.replace(/^widgets\./, ""), { defaultValue: "" }),
		[t],
	);

	const totalSteps = steps.length > 0 ? steps.length : summaryKey ? 1 : 0;
	const [stepIndex, setStepIndex] = useState(0);
	const [placement, setPlacement] = useState<Placement | null>(null);
	const bubbleRef = useRef<HTMLDialogElement | null>(null);

	const step: TutorialStep | undefined = steps[stepIndex];
	const isSummaryOnly = steps.length === 0;

	// Resolve the step anchor: the `[data-tutorial-target]` element when the
	// selector matches inside the tile, otherwise the widget body itself.
	// The layer is `position: absolute; inset: 0`, so without a positioned
	// ancestor its box can span far more than the widget (e.g. Storybook
	// embeds) and the fallback bubble lands bottom-center, detached from the
	// widget (#677). The first element child is the widget root and tracks
	// the real widget bounds in every host.
	const findAnchor = useCallback((): {
		el: Element;
		isTarget: boolean;
	} | null => {
		const layer = layerRef.current;
		if (!layer) return null;
		if (step?.targetSelector) {
			const el = layer.querySelector(step.targetSelector);
			if (el) return { el, isTarget: true };
		}
		return { el: layer.firstElementChild ?? layer, isTarget: false };
	}, [layerRef, step?.targetSelector]);

	// Returns false when the bubble or anchor is not measurable yet (e.g. the
	// widget body has not committed its `[data-tutorial-target]` nodes).
	const measureAndPlace = useCallback((): boolean => {
		const bubbleEl = bubbleRef.current;
		const anchor = findAnchor();
		if (!bubbleEl || !anchor || totalSteps === 0) return false;
		const bubbleRect = bubbleEl.getBoundingClientRect();
		setPlacement(
			computePlacement(toRect(anchor.el), {
				width: bubbleRect.width || BUBBLE_MAX_WIDTH,
				height: bubbleRect.height || 120,
			}),
		);
		return true;
	}, [findAnchor, totalSteps]);

	// Position once the bubble has laid out. Widget bodies can commit their
	// tutorial targets a frame or two after the layer mounts, so retry on
	// animation frames until the first successful measure, then keep the
	// bubble glued to the anchor across resizes and scrolls.
	// biome-ignore lint/correctness/useExhaustiveDependencies: stepIndex forces re-measure when consecutive steps share the same targetSelector
	useLayoutEffect(() => {
		if (measureAndPlace()) return;
		let frame = 0;
		let raf = 0;
		const retry = (): void => {
			frame += 1;
			if (measureAndPlace() || frame >= 30) return;
			raf = requestAnimationFrame(retry);
		};
		raf = requestAnimationFrame(retry);
		return () => cancelAnimationFrame(raf);
	}, [stepIndex, measureAndPlace]);

	useEffect(() => {
		if (totalSteps === 0) return;
		window.addEventListener("resize", measureAndPlace);
		window.addEventListener("scroll", measureAndPlace, true);
		return () => {
			window.removeEventListener("resize", measureAndPlace);
			window.removeEventListener("scroll", measureAndPlace, true);
		};
	}, [totalSteps, measureAndPlace]);

	const onCloseEvent = useEffectEvent(() => {
		onClose();
	});
	useEffect(() => {
		if (totalSteps === 0) return;
		const onKeyDown = (event: KeyboardEvent): void => {
			if (event.key === "Escape") onCloseEvent();
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [totalSteps]);

	if (totalSteps === 0) {
		return null;
	}

	const anchor = findAnchor();
	const anchorRect = anchor ? toRect(anchor.el) : null;

	const goNext = (): void => {
		if (stepIndex >= totalSteps - 1) {
			onClose();
		} else {
			setStepIndex((i) => i + 1);
			setPlacement(null);
		}
	};
	const goBack = (): void => {
		setStepIndex((i) => Math.max(0, i - 1));
		setPlacement(null);
	};

	const title = isSummaryOnly
		? descriptor?.nameKey
			? t(descriptor.nameKey.replace(/^widgets\./, ""), {
					defaultValue: "",
				})
			: ""
		: step?.titleKey
			? resolveKey(step.titleKey)
			: "";
	const body = isSummaryOnly
		? summaryKey
			? resolveKey(summaryKey)
			: ""
		: step?.bodyKey
			? resolveKey(step.bodyKey)
			: "";

	const caretStyle: CSSProperties | undefined = placement
		? {
				left: placement.caretLeft,
				...(placement.caretSide === "top"
					? { top: -4, transform: "rotate(180deg)" }
					: { bottom: -4 }),
			}
		: undefined;

	return createPortal(
		<>
			<div className={scrim} aria-hidden />
			{anchor?.isTarget && anchorRect ? (
				<div
					className={highlight}
					aria-hidden
					style={{
						top: anchorRect.top - 4,
						left: anchorRect.left - 4,
						width: anchorRect.width + 8,
						height: anchorRect.height + 8,
					}}
				/>
			) : null}
			<dialog
				ref={bubbleRef}
				className={bubble}
				open
				aria-label={title || undefined}
				style={{
					visibility: placement ? "visible" : "hidden",
					...(placement
						? { top: placement.top, left: placement.left }
						: { top: 0, left: 0 }),
				}}
			>
				<span className={cx(caret)} aria-hidden style={caretStyle} />
				<div className={bubbleHeader}>
					<span className={bubbleTitle}>{title}</span>
					<IconButton
						variant="ghost"
						size="xs"
						className={bubbleClose}
						aria-label={t("tutorial.chrome.close", {
							defaultValue: "Close",
						})}
						onClick={onClose}
					>
						<X size={12} aria-hidden />
					</IconButton>
				</div>
				<p className={bubbleBody}>{body}</p>
				{totalSteps > 1 ? (
					<div className={bubbleFooter}>
						<span className={bubbleProgress}>
							{t("tutorial.chrome.stepProgress", {
								defaultValue: "{{current}} / {{total}}",
								current: stepIndex + 1,
								total: totalSteps,
							})}
						</span>
						<div className={bubbleActions}>
							{stepIndex > 0 ? (
								// `default`, not `outline`: outline rests on
								// `border.strong` (#0e0e0e), a dark-on-dark
								// hairline that reads *dimmer* than the ghost
								// Skip's `border.subtle` — inverting the
								// intended Back > Skip hierarchy (#755).
								<Button variant="default" uiSize="sm" onClick={goBack}>
									{t("tutorial.chrome.back", { defaultValue: "Back" })}
								</Button>
							) : null}
							<Button variant="ghost" uiSize="sm" onClick={onClose}>
								{t("tutorial.chrome.skip", { defaultValue: "Skip" })}
							</Button>
							<Button variant="primary" uiSize="sm" onClick={goNext}>
								{stepIndex >= totalSteps - 1
									? t("tutorial.chrome.finish", {
											defaultValue: "Done",
										})
									: t("tutorial.chrome.next", { defaultValue: "Next" })}
							</Button>
						</div>
					</div>
				) : null}
			</dialog>
		</>,
		document.body,
	);
}
