import { describe, expect, it } from "vitest";
import {
	cleanInline,
	releaseExcerpt,
	truncateAtBoundary,
} from "./release-excerpt";

describe("truncateAtBoundary", () => {
	it("returns short text unchanged", () => {
		expect(truncateAtBoundary("short text", 100)).toBe("short text");
	});

	it("cuts at the last sentence end within the limit", () => {
		const text =
			"First sentence here. Second sentence is quite long and goes on.";
		const out = truncateAtBoundary(text, 30);
		expect(out.endsWith("…")).toBe(true);
		expect(out).toContain("First sentence here.");
		expect(out).not.toContain("Second");
	});

	it("never cuts inside a word when a space boundary exists", () => {
		const text = "alpha beta gamma delta epsilon zeta eta theta iota kappa";
		const out = truncateAtBoundary(text, 30);
		expect(out).toBe("alpha beta gamma delta epsilon…");
	});

	it("handles Japanese sentence punctuation", () => {
		const text =
			"これは最初の文です。これは二番目のとても長い文で、途中で切れてはいけません。";
		const out = truncateAtBoundary(text, 20);
		expect(out).toBe("これは最初の文です。…");
	});
});

describe("cleanInline", () => {
	it("unwraps links, code, and emphasis", () => {
		expect(
			cleanInline("See [the guide](https://x.dev) and `code` **bold**"),
		).toBe("See the guide and code bold");
	});
});

describe("releaseExcerpt", () => {
	it("keeps bullets as separate items without mid-word cuts", () => {
		const body = [
			"## What's new",
			"• Added the new widget picker with **search**",
			"• Fixed a very long bullet that describes many changes across the panel and keeps going well beyond the limit",
			"• Third item",
			"• Fourth item should not appear",
		].join("\n");
		const { bullets, prose } = releaseExcerpt(body, { bulletMax: 100 });
		expect(bullets).toHaveLength(3);
		expect(bullets[0]).toBe("Added the new widget picker with search");
		expect(bullets[1].endsWith("…")).toBe(true);
		expect(bullets[2]).toBe("Third item");
		expect(prose).toBeNull();
	});

	it("supports markdown dash and asterisk bullets", () => {
		const body = "- one\n* two\n• three";
		expect(releaseExcerpt(body).bullets).toEqual(["one", "two", "three"]);
	});

	it("falls back to a boundary-truncated prose line", () => {
		const body =
			"This release improves the workspace grid and adds several quality-of-life fixes for everyday panel use. It also polishes settings.";
		const { bullets, prose } = releaseExcerpt(body, { proseMax: 60 });
		expect(bullets).toEqual([]);
		expect(prose).not.toBeNull();
		expect(prose?.endsWith("…")).toBe(true);
		expect(prose?.length).toBeLessThanOrEqual(61);
	});

	it("skips headings, html comments, and short noise lines for prose", () => {
		const body =
			"## Notes\n> quote\nshort\n" +
			"A meaningful paragraph that is long enough to qualify as prose for the excerpt.";
		const { prose } = releaseExcerpt(body);
		expect(prose).toContain("meaningful paragraph");
	});
});
