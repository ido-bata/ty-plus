/**
 * @vitest-environment jsdom
 */

import { describe, expect, it, vi } from "vitest";
import type {
	DirectoryBrowserSelectionKind,
	DirectoryBrowserShellSelectionMode,
} from "@/management/storage/ui/DirectoryBrowser";
import {
	buildDirectoryBrowserMenu,
	type DirectoryBrowserMenuActions,
	type DirectoryBrowserMenuContext,
	handleDirectoryBrowserMenuSelect,
	parseDirectoryBrowserMenuHit,
} from "./DirectoryBrowserMenu";

const baseCtx: DirectoryBrowserMenuContext = {
	surface: "onboarding",
	viewMode: "list",
	selectionMode: "both",
	isSelected: () => false,
	canGoUp: true,
	canRefresh: true,
};

function actionsStub(): DirectoryBrowserMenuActions & {
	calls: { name: string; args: unknown[] }[];
} {
	const calls: { name: string; args: unknown[] }[] = [];
	return {
		calls,
		onRefresh: () => {
			calls.push({ name: "refresh", args: [] });
		},
		onGoUp: () => {
			calls.push({ name: "go-up", args: [] });
		},
		onOpenEntry: (path: string) => {
			calls.push({ name: "open", args: [path] });
		},
		onToggleSelected: (path: string, kind: string) => {
			calls.push({ name: "toggle", args: [path, kind] });
		},
	};
}

describe("parseDirectoryBrowserMenuHit", () => {
	it("returns null outside the browser body", () => {
		const el = document.createElement("div");
		expect(parseDirectoryBrowserMenuHit(el)).toBeNull();
		expect(parseDirectoryBrowserMenuHit(null)).toBeNull();
	});

	it("returns a body hit for empty entry attributes", () => {
		const body = document.createElement("div");
		body.setAttribute("data-directory-browser-body", "");
		const row = document.createElement("button");
		row.setAttribute("data-directory-browser-entry", "");
		body.appendChild(row);
		expect(parseDirectoryBrowserMenuHit(row)).toEqual({ target: "body" });
	});

	it("returns an entry hit for dir and file rows", () => {
		const body = document.createElement("div");
		body.setAttribute("data-directory-browser-body", "");
		const row = document.createElement("button");
		row.setAttribute("data-directory-browser-entry", "");
		row.setAttribute("data-entry-kind", "dir");
		row.setAttribute("data-entry-path", "/a/b");
		body.appendChild(row);
		expect(parseDirectoryBrowserMenuHit(row)).toEqual({
			target: "entry",
			kind: "dir",
			path: "/a/b",
		});
	});
});

describe("buildDirectoryBrowserMenu", () => {
	it("builds Refresh + Go up for body hits", () => {
		const payload = buildDirectoryBrowserMenu(baseCtx, { target: "body" });
		expect(payload.menu.map((item) => item.label)).toEqual([
			"Refresh",
			"Go Up",
		]);
	});

	it("builds Open + Select + Refresh + Go up for dir entries", () => {
		const payload = buildDirectoryBrowserMenu(baseCtx, {
			target: "entry",
			kind: "dir",
			path: "/a/b",
		});
		expect(payload.menu.map((item) => item.label)).toEqual([
			"Open",
			"Select",
			"Refresh",
			"Go Up",
		]);
	});

	it("labels the toggle Deselect when already selected", () => {
		const payload = buildDirectoryBrowserMenu(
			{
				...baseCtx,
				isSelected: (path, kind) => path === "/a/b" && kind === "folder",
			},
			{ target: "entry", kind: "dir", path: "/a/b" },
		);
		expect(payload.menu[1]?.label).toBe("Deselect");
	});

	it("omits Refresh when canRefresh is false and disables Go up", () => {
		const payload = buildDirectoryBrowserMenu(
			{ ...baseCtx, canRefresh: false, canGoUp: false },
			{ target: "body" },
		);
		expect(payload.menu).toHaveLength(1);
		expect(payload.menu[0]).toMatchObject({
			label: "Go Up",
			enabled: false,
		});
	});

	it("appends surface contributions", () => {
		const payload = buildDirectoryBrowserMenu(
			{
				...baseCtx,
				contributions: [{ id: "custom", label: "Custom" }],
			},
			{ target: "body" },
		);
		expect(payload.menu.map((item) => item.label)).toEqual([
			"Refresh",
			"Go Up",
			"Custom",
		]);
	});
});

describe("selectionMode enforcement", () => {
	const cases: {
		selectionMode: DirectoryBrowserShellSelectionMode;
		hitKind: "dir" | "file";
		selectionKind: DirectoryBrowserSelectionKind;
		allowed: boolean;
	}[] = [
		{
			selectionMode: "files",
			hitKind: "file",
			selectionKind: "file",
			allowed: true,
		},
		{
			selectionMode: "files",
			hitKind: "dir",
			selectionKind: "folder",
			allowed: false,
		},
		{
			selectionMode: "folders",
			hitKind: "file",
			selectionKind: "file",
			allowed: false,
		},
		{
			selectionMode: "folders",
			hitKind: "dir",
			selectionKind: "folder",
			allowed: true,
		},
		{
			selectionMode: "both",
			hitKind: "file",
			selectionKind: "file",
			allowed: true,
		},
		{
			selectionMode: "both",
			hitKind: "dir",
			selectionKind: "folder",
			allowed: true,
		},
	];

	for (const { selectionMode, hitKind, selectionKind, allowed } of cases) {
		it(`${allowed ? "keeps" : "omits"} the ${selectionKind} toggle when selectionMode is ${selectionMode}`, () => {
			const payload = buildDirectoryBrowserMenu(
				{ ...baseCtx, selectionMode },
				{ target: "entry", kind: hitKind, path: "/a/b" },
			);
			const labels = payload.menu.map((item) => item.label);
			expect(labels.includes("Select")).toBe(allowed);
			expect(
				payload.menu.some(
					(item) =>
						item.id?.startsWith(`ty.dir-browser.select:${selectionKind}:`) ===
						true,
				),
			).toBe(allowed);
		});

		it(`${allowed ? "dispatches" : "refuses"} a ${selectionKind} toggle id when selectionMode is ${selectionMode}`, () => {
			const actions = actionsStub();
			const handled = handleDirectoryBrowserMenuSelect(
				`ty.dir-browser.select:${selectionKind}:${encodeURIComponent("/a/b")}`,
				{ ...baseCtx, selectionMode },
				actions,
			);
			expect(handled).toBe(allowed);
			expect(actions.calls).toEqual(
				allowed ? [{ name: "toggle", args: ["/a/b", selectionKind] }] : [],
			);
		});
	}

	it("still offers Open for directories when folder selection is disallowed", () => {
		const payload = buildDirectoryBrowserMenu(
			{ ...baseCtx, selectionMode: "files" },
			{ target: "entry", kind: "dir", path: "/a/b" },
		);
		expect(payload.menu.map((item) => item.label)).toEqual([
			"Open",
			"Refresh",
			"Go Up",
		]);
	});
});

describe("handleDirectoryBrowserMenuSelect", () => {
	it("dispatches refresh and go-up", () => {
		const actions = actionsStub();
		expect(
			handleDirectoryBrowserMenuSelect(
				"ty.dir-browser.refresh",
				baseCtx,
				actions,
			),
		).toBe(true);
		expect(
			handleDirectoryBrowserMenuSelect(
				"ty.dir-browser.go-up",
				baseCtx,
				actions,
			),
		).toBe(true);
		expect(actions.calls.map((call) => call.name)).toEqual([
			"refresh",
			"go-up",
		]);
	});

	it("dispatches open and toggle with decoded paths", () => {
		const actions = actionsStub();
		const encoded = encodeURIComponent("C:/a b/c");
		expect(
			handleDirectoryBrowserMenuSelect(
				`ty.dir-browser.open:${encoded}`,
				baseCtx,
				actions,
			),
		).toBe(true);
		expect(
			handleDirectoryBrowserMenuSelect(
				`ty.dir-browser.deselect:file:${encoded}`,
				baseCtx,
				actions,
			),
		).toBe(true);
		expect(actions.calls).toEqual([
			{ name: "open", args: ["C:/a b/c"] },
			{ name: "toggle", args: ["C:/a b/c", "file"] },
		]);
	});

	it("routes contributions to onCustomAction", () => {
		const onCustomAction = vi.fn();
		const ctx: DirectoryBrowserMenuContext = {
			...baseCtx,
			contributions: [{ id: "custom", label: "Custom" }],
		};
		expect(
			handleDirectoryBrowserMenuSelect("custom", ctx, {
				...actionsStub(),
				onCustomAction,
			}),
		).toBe(true);
		expect(onCustomAction).toHaveBeenCalledWith("custom");
	});

	it("returns false for unknown ids", () => {
		const actions = actionsStub();
		expect(
			handleDirectoryBrowserMenuSelect("ty.something-else", baseCtx, actions),
		).toBe(false);
		expect(actions.calls).toHaveLength(0);
	});
});
