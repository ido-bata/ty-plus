import { describe, expect, it } from "vitest";
import { resolveCatalogDescriptionKey } from "./description-key";

describe("resolveCatalogDescriptionKey (#161)", () => {
	it("prefers an explicit descriptionKey and strips the widgets. prefix", () => {
		expect(
			resolveCatalogDescriptionKey({
				type: "easing",
				descriptionKey: "widgets.selector.descriptions.easing",
			}),
		).toBe("selector.descriptions.easing");
	});

	it("falls back to selector.descriptions.<type> without descriptionKey", () => {
		expect(resolveCatalogDescriptionKey({ type: "menu" })).toBe(
			"selector.descriptions.menu",
		);
	});

	it("handles kebab-case widget types", () => {
		expect(
			resolveCatalogDescriptionKey({
				type: "directory-browser",
				descriptionKey: "widgets.selector.descriptions.directory-browser",
			}),
		).toBe("selector.descriptions.directory-browser");
	});
});
