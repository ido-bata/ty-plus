import { type RefObject, useEffect, useState } from "react";

/**
 * Track the pixel width of a DOM element.
 *
 * Used by the curve editor to switch the mode toolbar to abbreviated labels
 * when the widget tile is too narrow for the full ones. Falls back to a
 * window resize listener when ResizeObserver is unavailable (jsdom).
 */
export const useElementWidth = (ref: RefObject<HTMLElement | null>): number => {
	const [width, setWidth] = useState(0);
	useEffect(() => {
		const element = ref.current;
		if (!element) return;
		const update = (): void => setWidth(element.clientWidth);
		update();
		if (typeof ResizeObserver === "undefined") {
			window.addEventListener("resize", update);
			return () => window.removeEventListener("resize", update);
		}
		const observer = new ResizeObserver(update);
		observer.observe(element);
		return () => observer.disconnect();
	}, [ref]);
	return width;
};
