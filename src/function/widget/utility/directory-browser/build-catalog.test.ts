import { describe, expect, it } from "vitest";
import { buildRows } from "./build-catalog";

describe("buildRows", () => {
	it("drops legacy panel ids and writes the active catalog id slice", () => {
		const rows = buildRows({
			diskRows: [
				{ id: "panel1", dir: "old" },
				{ id: "fb-1", dir: "keep" },
			],
			legacyRowPredicate: (id) => /^panel\d+$/i.test(id),
			panelKey: "panel-1",
			catalogId: "fb-1",
			globalSlice: { fileBrowserCurrentDir: "/x" },
		});
		expect(rows).toEqual([
			expect.objectContaining({
				id: "fb-1",
				fileBrowserCurrentDir: "/x",
			}),
		]);
	});
});
