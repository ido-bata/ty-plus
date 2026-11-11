import { describe, expect, it } from "vitest";

import {
	formatStageLabel,
	ringDashOffset,
	stageToProgress,
} from "./download-progress";

describe("stageToProgress", () => {
	describe("real Content-Length known (download stage, 5–70% slice)", () => {
		it("sits at the slice start (5%) when no bytes are loaded yet", () => {
			// The download stage owns the 5–70% slice of the bar; before the
			// first byte arrives the fill is at the slice start, not 0%.
			expect(stageToProgress("download", 0, 1000)).toBe(5);
		});

		it("reaches the slice end (70%) when all bytes are loaded", () => {
			// 100% of the download slice is filled; the remaining 30% of the
			// bar is reserved for the icon / register stages that follow.
			expect(stageToProgress("download", 1000, 1000)).toBe(70);
		});

		it("interpolates linearly within the slice", () => {
			// 25% of the slice's bytes → 5 + 65 * 0.25 = 21
			expect(stageToProgress("download", 250, 1000)).toBe(21);
			// 75% of the slice's bytes → 5 + 65 * 0.75 = 54
			expect(stageToProgress("download", 750, 1000)).toBe(54);
		});

		it("interpolates within the icon slice (75–95%)", () => {
			expect(stageToProgress("icon", 0, 100)).toBe(75);
			expect(stageToProgress("icon", 50, 100)).toBe(85);
			expect(stageToProgress("icon", 100, 100)).toBe(95);
		});

		it("clamps a bytesLoaded greater than bytesTotal to the slice end", () => {
			// Floating-point or off-by-one chunk counts can overshoot; the
			// ring must not jump past the slice end.
			expect(stageToProgress("download", 1500, 1000)).toBe(70);
			expect(stageToProgress("icon", 150, 100)).toBe(95);
		});

		it("clamps negative bytesLoaded to the slice start", () => {
			expect(stageToProgress("download", -1, 1000)).toBe(5);
		});
	});

	describe("Content-Length missing (signed Supabase / S3 URLs)", () => {
		// Without a real total the fill relies on a running estimate that
		// leads the loaded by LOOKAHEAD. The ratio is `bytesLoaded /
		// max(MIN, bytesLoaded + LOOKAHEAD)`, so the fill grows smoothly
		// as bytes arrive instead of snapping to the slice end on the
		// first chunk.
		it("grows the fill as bytes arrive, monotonically", () => {
			const points = [
				stageToProgress("download", 0, 0),
				stageToProgress("download", 10_000, 0),
				stageToProgress("download", 50_000, 0),
				stageToProgress("download", 100_000, 0),
				stageToProgress("download", 500_000, 0),
				stageToProgress("download", 1_000_000, 0),
				stageToProgress("download", 5_000_000, 0),
			];
			// Each point should be greater than or equal to the previous one —
			// the ring must never move backwards during an install.
			for (let i = 1; i < points.length; i++) {
				expect(points[i]).toBeGreaterThanOrEqual(points[i - 1]);
			}
		});

		it("sits at the slice start (5%) when no bytes have arrived", () => {
			// bytesLoaded: 0 is the very first progress event, before the
			// first chunk lands. The fill must be at the slice start so the
			// user sees a clean step when bytes begin arriving.
			expect(stageToProgress("download", 0, 0)).toBe(5);
		});

		it("gives a visible fill for small files (50KB reaches 59% of the bar)", () => {
			// 50KB / max(60KB, 60KB) = 50/60 ≈ 0.833
			// 5 + 65 * 0.833 ≈ 59
			expect(stageToProgress("download", 50_000, 0)).toBe(59);
		});

		it("gives a near-full download slice for medium files (500KB reaches 69%)", () => {
			// 500KB / max(60KB, 510KB) = 500/510 ≈ 0.980
			// 5 + 65 * 0.980 ≈ 69
			expect(stageToProgress("download", 500_000, 0)).toBe(69);
		});

		it("asymptotically approaches the slice end (70%) for very large files", () => {
			// 10MB / max(60KB, 10.01MB) ≈ 0.999
			// 5 + 65 * 0.999 ≈ 70
			expect(stageToProgress("download", 10_000_000, 0)).toBe(70);
		});

		it("icon slice interpolates within 75–95% (100KB reaches 93%)", () => {
			// 100KB / max(60KB, 110KB) = 100/110 ≈ 0.909
			// 75 + 20 * 0.909 ≈ 93
			const smallIcon = stageToProgress("icon", 100_000, 0);
			expect(smallIcon).toBe(93);
		});
	});

	describe("stages without bytes tracking (single-event jumps)", () => {
		// fetch, write, and register are sub-second single-event stages.
		// They don't carry byte-level progress — the fill jumps straight
		// to the end of their slice on the first event.
		it("fetch jumps to 5% (end of its 0–5% slice)", () => {
			expect(stageToProgress("fetch")).toBe(5);
		});

		it("write jumps to 75% (end of its 70–75% slice)", () => {
			expect(stageToProgress("write")).toBe(75);
		});

		it("register jumps to 100% (end of its 95–100% slice)", () => {
			expect(stageToProgress("register")).toBe(100);
		});
	});
});

describe("formatStageLabel", () => {
	it("renders the human-readable stage name followed by the percent", () => {
		expect(formatStageLabel("download", 42)).toBe("Downloading… 42%");
	});

	it("renders 0% for an empty download", () => {
		expect(formatStageLabel("fetch", 0)).toBe("Fetching metadata… 0%");
	});

	it("renders 100% for a completed stage", () => {
		expect(formatStageLabel("register", 100)).toBe("Registering preset… 100%");
	});

	it("clamps out-of-range percents to 0-100", () => {
		expect(formatStageLabel("download", 150)).toBe("Downloading… 100%");
		expect(formatStageLabel("download", -10)).toBe("Downloading… 0%");
	});
});

describe("ringDashOffset", () => {
	const RADIUS = 10;
	const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

	it("returns the full circumference at 0%", () => {
		expect(ringDashOffset(0, RADIUS)).toBeCloseTo(CIRCUMFERENCE);
	});

	it("returns 0 at 100%", () => {
		expect(ringDashOffset(100, RADIUS)).toBeCloseTo(0);
	});

	it("returns half the circumference at 50%", () => {
		expect(ringDashOffset(50, RADIUS)).toBeCloseTo(CIRCUMFERENCE / 2);
	});

	it("clamps negative percents to the full circumference", () => {
		expect(ringDashOffset(-25, RADIUS)).toBeCloseTo(CIRCUMFERENCE);
	});

	it("clamps percents above 100 to 0", () => {
		expect(ringDashOffset(120, RADIUS)).toBeCloseTo(0);
	});
});
