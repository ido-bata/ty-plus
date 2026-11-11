import { describe, expect, it } from "vitest";
import { indexFromPanelId } from "./persistence";

describe("indexFromPanelId", () => {
	it("maps panel-N hyphen form", () => {
		expect(indexFromPanelId("panel-1")).toBe(1);
		expect(indexFromPanelId("panel-5")).toBe(5);
	});

	it("maps panelN compact form (settings key normalization)", () => {
		expect(indexFromPanelId("panel1")).toBe(1);
		expect(indexFromPanelId("panel4")).toBe(4);
	});

	it("defaults to 1 for unknown ids", () => {
		expect(indexFromPanelId("")).toBe(1);
		expect(indexFromPanelId("other")).toBe(1);
		expect(indexFromPanelId("panel-99")).toBe(1);
	});
});
