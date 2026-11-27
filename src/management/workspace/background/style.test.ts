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

describe("toStyle layer colour fallbacks (issue #754)", () => {
	it("renders the dots pattern for a pattern layer without patternColor", () => {
		const result = toStyle({
			layers: [
				{
					id: "p1",
					type: "pattern",
					enabled: true,
					opacity: 60,
					patternType: "dots",
				},
			],
		});
		const image = String(result.backgroundImage);
		expect(image).toContain("radial-gradient");
		// The old fallback referenced undefined `--color-ws-transparent-rgb-*`
		// vars, which invalidated the whole background-image declaration.
		expect(image).not.toContain("ws-transparent-rgb");
		expect(image).not.toContain("var(--color-ws-pattern-fg)");
	});

	it("renders a color layer without an explicit color", () => {
		const result = toStyle({
			layers: [{ id: "c1", type: "color", enabled: true, opacity: 100 }],
		});
		const image = String(result.backgroundImage);
		expect(image).toContain("linear-gradient");
		expect(image).not.toContain("ws-transparent-rgb");
	});

	it("expands #rgb shorthand instead of emitting an invalid colour", () => {
		const result = toStyle({
			layers: [
				{
					id: "c2",
					type: "color",
					enabled: true,
					opacity: 100,
					color: "#fff",
				},
			],
		});
		const image = String(result.backgroundImage);
		expect(image).toContain("rgba(255,255,255,1)");
		expect(image).not.toContain("ws-transparent-rgb");
	});
});
