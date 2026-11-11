import { describe, expect, it } from "vitest";
import {
	isLegacyFileBrowserCatalogRowId,
	resolveFileBrowserCatalogInstanceId,
} from "./store";

describe("resolveFileBrowserCatalogInstanceId", () => {
	it("returns the first directory-browser widget id", () => {
		expect(
			resolveFileBrowserCatalogInstanceId([
				{
					id: "wsi:aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee",
					widgetType: "quick-actions",
				},
				{
					id: "wsi:bbbbbbbb-cccc-4ddd-eeee-ffffffffffff",
					widgetType: "directory-browser",
				},
			]),
		).toBe("wsi:bbbbbbbb-cccc-4ddd-eeee-ffffffffffff");
	});

	it("matches legacy file-browser widget ids", () => {
		expect(
			resolveFileBrowserCatalogInstanceId([
				{
					id: "wsi:bbbbbbbb-cccc-4ddd-eeee-ffffffffffff",
					widgetType: "file-browser",
				},
			]),
		).toBe("wsi:bbbbbbbb-cccc-4ddd-eeee-ffffffffffff");
	});

	it("returns null when no directory-browser widget exists", () => {
		expect(
			resolveFileBrowserCatalogInstanceId([
				{
					id: "wsi:aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee",
					widgetType: "quick-actions",
				},
			]),
		).toBeNull();
	});
});

describe("isLegacyFileBrowserCatalogRowId", () => {
	it("detects panel-prefixed legacy keys", () => {
		expect(isLegacyFileBrowserCatalogRowId("panel1")).toBe(true);
		expect(isLegacyFileBrowserCatalogRowId("panel-2")).toBe(true);
		expect(
			isLegacyFileBrowserCatalogRowId(
				"wsi:aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee",
			),
		).toBe(false);
	});
});
