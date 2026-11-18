import {
	type ReactNode,
	type RefObject,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";

/**
 * Anchored popover primitive.
 *
 * Popovers rendered inside dialog bodies are clipped by ancestor
 * `overflow: hidden` (e.g. the preset edit dialog content). This primitive
 * portals the popover to `document.body` and positions it with `position:
 * fixed` relative to the anchor element's viewport rect, flipping above the
 * anchor when there is more room above, and clamping to the viewport.
 *
 * Consumers own the surface styling (border / background / radius / shadow)
 * via `className`; this component owns placement, viewport clamping,
 * outside-pointer dismissal, and Escape dismissal so every anchored overlay
 * shares one contract.
 */

const VIEWPORT_MARGIN = 8;
const ANCHOR_GAP = 4;

type PopoverPlacement = "below" | "above";

type PopoverPosition = {
	top: number;
	left: number;
	width?: number;
	maxHeight: string;
};

export type AnchoredPopoverProps = {
	open: boolean;
	onClose: () => void;
	/** Element the popover is anchored to (usually the trigger's container). */
	anchorRef: RefObject<HTMLElement | null>;
	children: ReactNode;
	/** Surface styling only — placement styles are applied inline. */
	className?: string;
	/** Horizontal alignment of the popover against the anchor. */
	align?: "start" | "end";
	/** When true, the popover width matches the anchor width. */
	matchAnchorWidth?: boolean;
	/**
	 * CSS max-height cap for the popover content. Combined with the measured
	 * viewport space via `min()`, so the popover can never exceed the space on
	 * its chosen side of the anchor.
	 */
	maxHeight?: string;
	/**
	 * Stacking order for the portaled surface. Defaults to 50, which suits
	 * dialog-embedded consumers; surfaces rendered inside higher stacking
	 * contexts (e.g. workspace widget hosts) must pass a larger value.
	 */
	zIndex?: number;
	role?: string;
	id?: string;
	"aria-labelledby"?: string;
	tabIndex?: number;
};

export function AnchoredPopover(props: AnchoredPopoverProps): ReactNode {
	const {
		open,
		onClose,
		anchorRef,
		children,
		className,
		align = "start",
		matchAnchorWidth = false,
		maxHeight = "70vh",
		zIndex = 50,
		role,
		id,
		"aria-labelledby": ariaLabelledby,
		tabIndex,
	} = props;

	const popRef = useRef<HTMLDivElement | null>(null);
	const [position, setPosition] = useState<PopoverPosition | null>(null);

	useLayoutEffect(() => {
		if (!open) {
			setPosition(null);
			return;
		}
		const update = (): void => {
			const anchor = anchorRef.current;
			const pop = popRef.current;
			if (!anchor || !pop) return;

			const rect = anchor.getBoundingClientRect();
			const viewportW = window.innerWidth;
			const viewportH = window.innerHeight;
			const spaceBelow = viewportH - rect.bottom - VIEWPORT_MARGIN - ANCHOR_GAP;
			const spaceAbove = rect.top - VIEWPORT_MARGIN - ANCHOR_GAP;

			const contentHeight = Math.max(pop.scrollHeight, pop.offsetHeight);
			const placement: PopoverPlacement =
				contentHeight <= spaceBelow
					? "below"
					: spaceAbove > spaceBelow
						? "above"
						: spaceBelow >= spaceAbove
							? "below"
							: "above";
			const space = Math.max(
				placement === "below" ? spaceBelow : spaceAbove,
				0,
			);
			const effectiveHeight = Math.min(contentHeight, space);

			const width = matchAnchorWidth ? rect.width : undefined;
			const popWidth = width ?? pop.offsetWidth;
			const rawLeft = align === "end" ? rect.right - popWidth : rect.left;
			const left = Math.min(
				Math.max(rawLeft, VIEWPORT_MARGIN),
				Math.max(viewportW - popWidth - VIEWPORT_MARGIN, VIEWPORT_MARGIN),
			);
			const top =
				placement === "below"
					? rect.bottom + ANCHOR_GAP
					: rect.top - effectiveHeight - ANCHOR_GAP;

			setPosition({
				top,
				left,
				width,
				maxHeight: `min(${maxHeight}, ${space}px)`,
			});
		};
		update();
		window.addEventListener("resize", update);
		window.addEventListener("scroll", update, true);
		return () => {
			window.removeEventListener("resize", update);
			window.removeEventListener("scroll", update, true);
		};
	}, [open, anchorRef, align, matchAnchorWidth, maxHeight]);

	useEffect(() => {
		if (!open) return;
		const onDocMouseDown = (event: MouseEvent): void => {
			const target = event.target as Node | null;
			if (!target) return;
			if (anchorRef.current?.contains(target)) return;
			if (popRef.current?.contains(target)) return;
			onClose();
		};
		const onKeyDown = (event: KeyboardEvent): void => {
			if (event.key === "Escape") {
				onClose();
			}
		};
		document.addEventListener("mousedown", onDocMouseDown);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("mousedown", onDocMouseDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [open, onClose, anchorRef]);

	if (!open) return null;

	return createPortal(
		<div
			ref={popRef}
			role={role}
			id={id}
			aria-labelledby={ariaLabelledby}
			tabIndex={tabIndex}
			className={className}
			style={{
				position: "fixed",
				top: position?.top ?? 0,
				left: position?.left ?? 0,
				width: position?.width,
				maxHeight: position?.maxHeight,
				zIndex,
				visibility: position ? "visible" : "hidden",
			}}
		>
			{children}
		</div>,
		document.body,
	);
}
