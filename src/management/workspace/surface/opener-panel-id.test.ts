import { describe, expect, test } from "vitest";

import {
	awaitOpenerWorkspacePanelIdFromCep,
	openerWorkspacePanelIdFromElement,
	resolveOpenerWorkspacePanelId,
} from "./opener-panel-id";

describe("resolveOpenerWorkspacePanelId", () => {
	test("prefers __TY_PLUS_OPENER_SURFACE_ID__", () => {
		const win = {
			location: { href: "about:blank" },
			__TY_PLUS_OPENER_SURFACE_ID__: "panel-4",
		} as unknown as Window;
		expect(resolveOpenerWorkspacePanelId(win)).toBe("panel-4");
	});

	test("reads openerSurfaceId from URL", () => {
		const win = {
			location: { href: "http://localhost/?openerSurfaceId=panel-3" },
		} as unknown as Window;
		expect(resolveOpenerWorkspacePanelId(win)).toBe("panel-3");
	});

	test("normalizes panel2 style query param", () => {
		const win = {
			location: { href: "http://x/?panel=panel2" },
		} as unknown as Window;
		expect(resolveOpenerWorkspacePanelId(win)).toBe("panel-2");
	});

	test("defaults to panel-1 when nothing matches", () => {
		const win = {
			location: { href: "about:blank" },
		} as unknown as Window;
		expect(resolveOpenerWorkspacePanelId(win)).toBe("panel-1");
	});
});

describe("awaitOpenerWorkspacePanelIdFromCep", () => {
	test("returns URL opener immediately without long wait", async () => {
		const win = {
			location: { href: "http://localhost/?openerSurfaceId=panel-4" },
		} as unknown as Window;
		const t0 = performance.now();
		const id = await awaitOpenerWorkspacePanelIdFromCep(win, 2800);
		expect(id).toBe("panel-4");
		expect(performance.now() - t0).toBeLessThan(200);
	});
});

describe("openerWorkspacePanelIdFromElement", () => {
	test("uses attribute when valid", () => {
		const btn = {
			getAttribute: (name: string) =>
				name === "data-opener-workspace-panel" ? "panel-5" : null,
		} as unknown as Element;
		expect(openerWorkspacePanelIdFromElement(btn, "panel-1")).toBe("panel-5");
	});

	test("uses fallback when attribute missing", () => {
		const btn = {
			getAttribute: () => null,
		} as unknown as Element;
		expect(openerWorkspacePanelIdFromElement(btn, "panel-2")).toBe("panel-2");
	});
});
