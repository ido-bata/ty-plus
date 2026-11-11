import { useCallback, useState, type WheelEvent } from "react";

/** Thumbnail sizes are intentionally session-local; no storage adapter is used. */
const CARD_ZOOM_SIZES = [64, 96, 128, 192, 256, 384] as const;
export const DEFAULT_CARD_SIZE = 256;
const DEFAULT_CARD_ZOOM_STEP = 2;

export type CardZoomOptions = {
	initialSize?: number;
	step?: number;
	sizes?: readonly number[];
};

export type CardZoom = {
	cardSize: number;
	onWheel: (event: WheelEvent) => void;
};

function moveSize(
	size: number,
	delta: number,
	sizes: readonly number[],
): number {
	const current = Math.max(0, sizes.indexOf(size));
	const next = Math.min(sizes.length - 1, Math.max(0, current + delta));
	return sizes[next] ?? size;
}

/**
 * Handles Ctrl+wheel card zoom. The gesture is consumed only while the
 * directory-browser panel itself contains the active element; otherwise the
 * event continues to After Effects and cannot trigger an accelerator.
 */
export function useCardZoom(options: CardZoomOptions = {}): CardZoom {
	const sizes = options.sizes ?? CARD_ZOOM_SIZES;
	const [cardSize, setCardSize] = useState(
		options.initialSize ?? DEFAULT_CARD_SIZE,
	);
	const onWheel = useCallback(
		(event: WheelEvent): void => {
			if (!event.ctrlKey || !event.currentTarget) {
				return;
			}
			const panel = event.currentTarget;
			if (!panel.contains(document.activeElement)) {
				return;
			}
			const delta =
				event.deltaY < 0
					? (options.step ?? DEFAULT_CARD_ZOOM_STEP)
					: -(options.step ?? DEFAULT_CARD_ZOOM_STEP);
			setCardSize((current) => moveSize(current, delta, sizes));
			event.preventDefault();
			event.stopPropagation();
		},
		[options.step, sizes],
	);
	return { cardSize, onWheel };
}
