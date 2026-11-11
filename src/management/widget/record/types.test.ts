/**
 * Tests for widget record domain types
 *
 * @vitest-environment node
 */

import { describe, expect, it } from "vitest";
import {
	parseRecordsJsonValue,
	serializeRecords,
	type WidgetRecord,
} from "./types";

describe("WidgetRecord types", () => {
	describe("WidgetRecord type guard", () => {
		it("accepts valid widget record", () => {
			const record: WidgetRecord = {
				id: "widget-1",
				type: "quick-actions",
				param: { query: "test" },
			};
			expect(record.id).toBe("widget-1");
			expect(record.type).toBe("quick-actions");
			expect(record.param).toEqual({ query: "test" });
		});

		it("accepts empty param", () => {
			const record: WidgetRecord = {
				id: "widget-1",
				type: "info",
				param: {},
			};
			expect(record.param).toEqual({});
		});
	});

	describe("parseRecordsJsonValue", () => {
		it("parses valid { version, widgets } structure", () => {
			const input = {
				version: 1,
				widgets: [
					{ id: "w1", type: "search", param: { query: "test" } },
					{ id: "w2", type: "info", param: {} },
				],
			};
			const result = parseRecordsJsonValue(input);
			expect(result).toHaveLength(2);
			expect(result[0].id).toBe("w1");
			expect(result[0].type).toBe("quick-actions");
			expect(result[0].param).toEqual({ query: "test" });
		});

		it("drops records with missing/empty id", () => {
			const input = {
				version: 1,
				widgets: [
					{ id: "w1", type: "search", param: {} },
					{ id: "", type: "info", param: {} },
					{ type: "menu", param: {} },
					{ id: "   ", type: "info", param: {} },
				],
			};
			const result = parseRecordsJsonValue(input);
			expect(result).toHaveLength(1);
			expect(result[0].id).toBe("w1");
			expect(result[0].type).toBe("quick-actions");
		});

		it("drops records with unsupported widget type", () => {
			const input = {
				version: 1,
				widgets: [
					{ id: "w1", type: "search", param: {} },
					{ id: "w2", type: "unknown-type", param: {} },
					{ id: "w3", type: "invalid", param: {} },
				],
			};
			const result = parseRecordsJsonValue(input);
			expect(result).toHaveLength(1);
			expect(result[0].id).toBe("w1");
			expect(result[0].type).toBe("quick-actions");
		});

		it("defaults missing param to {}", () => {
			const input = {
				version: 1,
				widgets: [{ id: "w1", type: "search" }],
			};
			const result = parseRecordsJsonValue(input);
			expect(result).toHaveLength(1);
			expect(result[0].type).toBe("quick-actions");
			expect(result[0].param).toEqual({});
		});

		it("drops array param", () => {
			const input = {
				version: 1,
				widgets: [{ id: "w1", type: "search", param: [] }],
			};
			const result = parseRecordsJsonValue(input);
			expect(result).toHaveLength(0);
		});

		it("drops non-object param (primitive)", () => {
			const input = {
				version: 1,
				widgets: [
					{ id: "w1", type: "search", param: "not-an-object" },
					{ id: "w2", type: "search", param: 123 },
				],
			};
			const result = parseRecordsJsonValue(input);
			expect(result).toHaveLength(0);
		});

		it("returns empty array for null/undefined input", () => {
			expect(parseRecordsJsonValue(null)).toEqual([]);
			expect(parseRecordsJsonValue(undefined)).toEqual([]);
		});

		it("returns empty array for non-object input", () => {
			expect(parseRecordsJsonValue("string")).toEqual([]);
			expect(parseRecordsJsonValue(123)).toEqual([]);
			expect(parseRecordsJsonValue(true)).toEqual([]);
		});

		it("returns empty array when widgets is not an array", () => {
			const input = { version: 1, widgets: "not-an-array" };
			expect(parseRecordsJsonValue(input)).toEqual([]);
		});

		it("parses direct object as single widget (backwards compat)", () => {
			const input = { id: "w1", type: "search", param: { query: "test" } };
			const result = parseRecordsJsonValue(input);
			expect(result).toHaveLength(1);
			expect(result[0].id).toBe("w1");
			expect(result[0].type).toBe("quick-actions");
		});

		it("drops non-object items in widgets array", () => {
			const input = {
				version: 1,
				widgets: [
					{ id: "w1", type: "search", param: {} },
					null,
					"string",
					123,
					undefined,
					[],
				],
			};
			const result = parseRecordsJsonValue(input);
			expect(result).toHaveLength(1);
			expect(result[0].type).toBe("quick-actions");
		});
	});

	describe("serializeRecords", () => {
		it("outputs { version: 1, widgets: [...] }", () => {
			const records: WidgetRecord[] = [
				{ id: "w1", type: "quick-actions", param: { query: "test" } },
				{ id: "w2", type: "info", param: {} },
			];
			const result = serializeRecords(records);
			const parsed = JSON.parse(result);
			expect(parsed.version).toBe(1);
			expect(parsed.widgets).toHaveLength(2);
			expect(parsed.widgets[0].id).toBe("w1");
			expect(parsed.widgets[1].id).toBe("w2");
		});

		it("formats with 2-space indentation", () => {
			const records: WidgetRecord[] = [
				{
					id: "w1",
					type: "quick-actions",
					param: { nested: { key: "value" } },
				},
			];
			const result = serializeRecords(records);
			// Should use 2-space indentation (not compact)
			expect(result).toContain("  ");
			// Should NOT be compact single-line JSON
			expect(result).not.toMatch(/^\{"version":1,"widgets":\[/);
		});

		it("includes trailing newline", () => {
			const records: WidgetRecord[] = [
				{ id: "w1", type: "quick-actions", param: {} },
			];
			const result = serializeRecords(records);
			expect(result.endsWith("\n")).toBe(true);
		});

		it("serializes empty records array", () => {
			const result = serializeRecords([]);
			const parsed = JSON.parse(result);
			expect(parsed.version).toBe(1);
			expect(parsed.widgets).toEqual([]);
		});

		it("round-trips through parse and serialize", () => {
			const original: WidgetRecord[] = [
				{ id: "w1", type: "quick-actions", param: { query: "test" } },
			];
			const serialized = serializeRecords(original);
			const parsed = parseRecordsJsonValue(JSON.parse(serialized));
			expect(parsed).toEqual(original);
		});
	});
});
