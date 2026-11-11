import { describe, expect, it } from "vitest";
import {
	cssQuoteFamily,
	filterFontRowsByQuery,
	groupFontRowsByFamily,
	normalizeLocalFontRows,
	parseCssWeight,
	rowsFromFontOptions,
} from "./local-fonts";

describe("parseCssWeight", () => {
	it("parses numeric token", () => {
		expect(parseCssWeight("", "Foo 700 Bar")).toBe(700);
	});

	it("parses named weights", () => {
		expect(parseCssWeight("Bold", "")).toBe(700);
		expect(parseCssWeight("Light", "")).toBe(300);
		expect(parseCssWeight("Regular", "")).toBe(400);
	});
});

describe("rowsFromFontOptions", () => {
	it("maps value to PostScript and label to display names", () => {
		const rows = rowsFromFontOptions([
			{ value: "Helvetica-Bold", label: "Helvetica Bold" },
		]);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.postscriptName).toBe("Helvetica-Bold");
		expect(rows[0]?.family).toBe("Helvetica Bold");
	});
});

describe("normalizeLocalFontRows", () => {
	it("sorts by family then weight", () => {
		const rows = normalizeLocalFontRows([
			{ family: "B", fullName: "B", postscriptName: "pB", style: "Bold" },
			{ family: "A", fullName: "A", postscriptName: "pA", style: "Regular" },
		]);
		expect(rows.map((r) => r.family)).toEqual(["A", "B"]);
	});
});

describe("filterFontRowsByQuery", () => {
	const rows = normalizeLocalFontRows([
		{
			family: "Alpha",
			fullName: "Alpha R",
			postscriptName: "a",
			style: "Regular",
		},
		{
			family: "Beta",
			fullName: "Beta Bold",
			postscriptName: "b",
			style: "Bold",
		},
	]);

	it("filters by query on family", () => {
		expect(filterFontRowsByQuery(rows, "beta")).toHaveLength(1);
		expect(filterFontRowsByQuery(rows, "nosuch")).toHaveLength(0);
	});
});

describe("groupFontRowsByFamily", () => {
	it("clusters rows and sorts families", () => {
		const rows = normalizeLocalFontRows([
			{
				family: "Zed",
				fullName: "Zed R",
				postscriptName: "z-r",
				style: "Regular",
			},
			{
				family: "Alpha",
				fullName: "Alpha B",
				postscriptName: "a-b",
				style: "Bold",
			},
			{
				family: "Alpha",
				fullName: "Alpha R",
				postscriptName: "a-r",
				style: "Regular",
			},
		]);
		const groups = groupFontRowsByFamily(rows);
		expect(groups.map((g) => g.family)).toEqual(["Alpha", "Zed"]);
		expect(groups[0]?.faces.map((f) => f.postscriptName)).toEqual([
			"a-r",
			"a-b",
		]);
	});
});

describe("cssQuoteFamily", () => {
	it("escapes quotes and backslashes", () => {
		expect(cssQuoteFamily(`A"b\\`)).toBe(`"A\\"b\\\\"`);
	});
});
