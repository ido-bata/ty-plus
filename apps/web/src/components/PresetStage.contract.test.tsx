import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { presetIconCanvas } from "@ty-plus/product/management/preset/contract";
import { Tile } from "@ty-plus/product/management/preset/workspace/Tile";
import { DEMO_PRESETS } from "../lib/demo-presets";

/**
 * Contract: the web demo must render the product's own preset tile
 * implementation — not a web-side copy. These assertions pin the shared
 * render path (`Tile` → `PresetCatalogGlyphHost` → `WorkspacePresetGlyph`)
 * so a future refactor that forks the markup fails here.
 */
describe("PresetStage product-component contract", () => {
	it("demo presets are real Preset contract objects with canvas icons", () => {
		expect(DEMO_PRESETS.length).toBeGreaterThan(0);
		for (const p of DEMO_PRESETS) {
			expect(p.id).toMatch(/^demo-/);
			expect(p.type).toBe("preset");
			expect(p.title.length).toBeGreaterThan(0);
			expect(p.icon).toMatchObject({ type: "canvas" });
		}
	});

	it("the product Tile renders the shared glyph host markup", () => {
		const preset = DEMO_PRESETS[0];
		const html = renderToString(
			<Tile preset={preset} label={preset.title} />,
		);
		// Product glyph host contract: data-preset-id + ws-preset-icon shell.
		expect(html).toContain(`data-preset-id="${preset.id}"`);
		expect(html).toContain("ws-preset-icon");
	});

	it("canvas icon presets resolve through the product icon pipeline", () => {
		const preset = {
			id: "demo-canvas",
			type: "preset" as const,
			title: "カーブ",
			filePath: "",
			icon: presetIconCanvas({ cubic: [0.5, 1.4, 0.6, 0.9] }),
		};
		const html = renderToString(<Tile preset={preset} label={preset.title} />);
		expect(html).toContain("ws-preset-icon--canvas");
		expect(html).toContain("<canvas");
	});
});
