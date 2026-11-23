import { describe, expect, it } from "vitest";
import { motionPreviewX } from "./MotionPreview";

// The marker drawn at the playhead extends ~9px around its anchor (halo
// radius), so the time-axis mapping must keep `x(t) ± 9` inside [0, width]
// for every t in [0, 1] — including the endpoints that used to clip.
describe("motionPreviewX", () => {
	it.each([120, 200, 320])(
		"keeps the marker halo inside the canvas (width %i)",
		(width) => {
			for (const t of [0, 0.25, 0.5, 0.75, 1]) {
				const x = motionPreviewX(t, width);
				expect(x - 9).toBeGreaterThanOrEqual(0);
				expect(x + 9).toBeLessThanOrEqual(width);
			}
		},
	);

	it("stays monotonic across the segment", () => {
		const width = 200;
		let previous = motionPreviewX(0, width);
		for (let i = 1; i <= 20; i += 1) {
			const x = motionPreviewX(i / 20, width);
			expect(x).toBeGreaterThan(previous);
			previous = x;
		}
	});
});
