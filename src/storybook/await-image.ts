import { expect, waitFor } from "storybook/test";

/**
 * Shared play assertion for stories that render a thumbnail/image glyph.
 * Waits until the first `<img>` in the story has actually decoded
 * (`naturalWidth > 0`) — with the Storybook files-gateway fixture this
 * proves the mock pipeline produced a loadable image instead of the
 * flat placeholder (#458).
 *
 * `ThumbnailTile` mounts its `<img>` lazily: it only appears after the
 * IntersectionObserver reports the tile on-screen and the gateway
 * resolves, so both the element and its decode are polled inside
 * `waitFor` rather than checked up front.
 */
export const expectFirstImageLoaded = async (
	canvasElement: HTMLElement,
): Promise<void> => {
	await waitFor(() => {
		const img = canvasElement.querySelector("img");
		expect(img, "expected an <img> in the story").not.toBeNull();
		expect(img?.naturalWidth).toBeGreaterThan(0);
	});
};
