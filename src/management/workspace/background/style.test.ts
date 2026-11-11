/**
 * Regression test for the workspace grid background default.
 *
 * Bug: `DEFAULT_GRID_BG` referenced an undefined CSS variable
 * (`var(--color-ty-surface-00)`), causing the workspace grid to render with a
 * transparent / fully-black background on Mac ZXP installs where the only
 * fallback was the empty CSS variable (which collapses to `initial` →
 * transparent → app background or pure black depending on host).
 *
 * The defined token is `color-ty-bg-surface` (#252525). The default background
 * must point at the defined token, never at a name that doesn't resolve.
 */
import { describe, expect, it } from "vitest";
import { toStyle } from "./style";

describe("toStyle default grid background", () => {
	it("uses the defined --color-ty-bg-surface token when no background is supplied", () => {
		const result = toStyle(null);
		expect(result.backgroundColor).toBe("var(--color-ty-bg-surface)");
	});

	it("uses the defined --color-ty-bg-surface token when bg has no enabled layers", () => {
		const result = toStyle({ layers: [] });
		expect(result.backgroundColor).toBe("var(--color-ty-bg-surface)");
	});

	it("uses the defined --color-ty-bg-surface token when all layers are disabled", () => {
		const result = toStyle({
			layers: [
				{
					id: "l1",
					type: "color",
					enabled: false,
					color: "#ff0000",
					opacity: 100,
				},
			],
		});
		expect(result.backgroundColor).toBe("var(--color-ty-bg-surface)");
	});

	it("uses the defined --color-ty-bg-surface token alongside enabled layers", () => {
		const result = toStyle({
			layers: [
				{
					id: "l1",
					type: "color",
					enabled: true,
					color: "#ff0000",
					opacity: 100,
				},
			],
		});
		expect(result.backgroundColor).toBe("var(--color-ty-bg-surface)");
	});

	it("does not reference the undefined --color-ty-surface-00 token", () => {
		// Sanity check: the bug was a typo'd variable name. Belt-and-braces
		// guard so future refactors don't reintroduce it.
		const result = toStyle(null);
		expect(String(result.backgroundColor)).not.toContain("color-ty-surface-00");
	});
});
