import type { RefCallback } from "react";
import { useEffect, useState } from "react";

/**
 * Tracks whether a DOM element is in the viewport using IntersectionObserver.
 *
 * Returns a callback ref to attach to the target element and a boolean
 * indicating whether the element is currently intersecting (visible).
 * Uses a 200px `rootMargin` so thumbnails start loading slightly before
 * they scroll into view, reducing perceived latency.
 *
 * The initial state is `false` — the hook is intentionally lazy: the
 * caller (e.g. `useThumbnail`) stays idle until the observer confirms
 * the element is on-screen. This is the contract `ThumbnailTile` relies
 * on to gate the thumbnail IPC pipeline (THB-PERF-003 lazy).
 *
 * When `IntersectionObserver` is unavailable (true SSR, very old
 * browsers, hostile embed shells), the hook flips to `true` so the
 * caller still does its work — better to load thumbnails eagerly than
 * to leave the UI permanently empty.
 *
 * The ref is a callback ref so the observer re-attaches when the
 * observed element changes identity (e.g. `ThumbnailTile` swaps its
 * inner placeholder for an `<img>` after the IPC resolves). Re-attaching
 * fixes a class of bug where the observer was previously bound to a
 * detached placeholder and never fired its first intersection callback
 * for the real target, leaving `enabled` permanently `false` in CEP.
 */
export function useIntersectionVisible(
	rootMargin = "200px",
): readonly [RefCallback<HTMLDivElement>, boolean] {
	const [visible, setVisible] = useState(false);
	const [element, setElement] = useState<HTMLDivElement | null>(null);

	useEffect(() => {
		const node = element;
		if (!node) {
			return;
		}
		if (typeof IntersectionObserver === "undefined") {
			setVisible(true);
			return;
		}
		const observer = new IntersectionObserver(
			([entry]) => {
				setVisible(entry.isIntersecting);
			},
			{ rootMargin, threshold: 0 },
		);
		observer.observe(node);
		return () => {
			observer.disconnect();
		};
	}, [element, rootMargin]);

	const ref: RefCallback<HTMLDivElement> = (node) => {
		setElement(node);
	};

	return [ref, visible] as const;
}
