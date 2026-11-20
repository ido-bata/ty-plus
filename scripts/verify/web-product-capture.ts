#!/usr/bin/env bun
/**
 * Product capture for the official website (Issue #309).
 *
 * Drives the live CEP panel over CDP to reproduce real product states —
 * preset tiles bound from the local catalog, the Local Presets dialog,
 * and the Add Widget selector — and saves PNG evidence. The managed root
 * is snapshotted before any mutation and restored afterwards, so the
 * user's workspace data is never permanently changed.
 *
 * Requires After Effects running with the ty-plus dev extension panel
 * open (CDP ports come from the installed bundle's `.debug` file).
 *
 * Usage:
 *   bun run scripts/verify/web-product-capture.ts \
 *     --extension-dir "$HOME/Library/Application Support/Adobe/CEP/extensions/app.ty-plus.dev" \
 *     --managed-root "/Applications/Adobe After Effects 2026/ty-plus" \
 *     --out /tmp/ty-plus-captures
 */
import { mkdir, writeFile } from "node:fs/promises";
import { clickFirst, findLive } from "./e2e/cases/journey";
import {
	reloadPanel1,
	sleep,
	waitForDom,
	withManagedRootSnapshot,
} from "./e2e/cases/shared";
import { E2EContext, type E2EOptions } from "./e2e/ctx";
import type { LiveSurface } from "./e2e/surfaces";

const option = (name: string): string | undefined =>
	process.argv
		.slice(2)
		.find((a) => a.startsWith(`--${name}=`))
		?.split("=")
		.slice(1)
		.join("=");

const extensionDir = option("extension-dir");
const managedRoot = option("managed-root");
const outDir = option("out");
if (!extensionDir || !managedRoot || !outDir) {
	console.error(
		"usage: web-product-capture.ts --extension-dir=<> --managed-root=<> --out=<>",
	);
	process.exit(1);
}

await mkdir(outDir, { recursive: true });

const ctx = new E2EContext({
	extensionDir,
	managedRoot,
	evidenceDir: outDir,
} satisfies E2EOptions);

/** The workspace scroll container (class hook `ws-scroll-*`), not nested editors. */
const SCROLLER_EXPR = `(() => {
	const el = document.querySelector("[class*=ws-scroll]");
	return el || [...document.querySelectorAll("*")].filter((n) => {
		const s = getComputedStyle(n);
		return (s.overflowY === "auto" || s.overflowY === "scroll") &&
			n.clientHeight > 400 && n.scrollHeight > n.clientHeight + 50;
	}).sort((a, b) => b.clientHeight - a.clientHeight)[0] || null;
})()`;

/** Scroll the workspace container to a CSS-pixel offset. */
const scrollPanelTo = async (
	surface: LiveSurface,
	y: number,
): Promise<void> => {
	await ctx.evalJs(
		surface,
		`(() => {
			const pick = ${SCROLLER_EXPR};
			if (pick) pick.scrollTop = ${y};
			else window.scrollTo(0, ${y});
			return pick ? "scrolled" : "window";
		})()`,
	);
	await sleep(400);
};

type PresetRecord = {
	id: string;
	type?: string;
	title?: string;
	filePath?: string;
	icon?: unknown;
};

/**
 * Degenerate icon = the identical low-contrast easing curve every catalog
 * row showed in review-309: a canvas icon pinned to the default cubic with
 * no color overrides. The product renders whatever `icon` says, so the
 * fixture replaces only this degenerate case with a text icon carrying the
 * preset title — a first-class icon type the product's icon editor writes.
 */
const isDegenerateCanvasIcon = (icon: unknown): boolean => {
	if (typeof icon !== "object" || icon === null) return false;
	const i = icon as { type?: string; param?: Record<string, unknown> };
	if (i.type !== "canvas") return false;
	const cubic = i.param?.cubic;
	const isDefaultCubic =
		Array.isArray(cubic) &&
		cubic.length === 4 &&
		cubic.every((v, idx) => v === [0.25, 0.1, 0.25, 1][idx]);
	return (
		isDefaultCubic &&
		i.param?.color === undefined &&
		i.param?.backgroundColor === undefined
	);
};

const iconTextFor = (title: string | undefined, id: string): unknown => ({
	type: "text",
	param: { text: (title ?? id).trim().slice(0, 6) || id.slice(0, 6) || "?" },
});

type WorkspaceDoc = {
	gridCells?: {
		id: string;
		x: number;
		y: number;
		width: number;
		height: number;
	}[];
};

await withManagedRootSnapshot(ctx, "web-product-capture", async () => {
	const presetsDoc = await ctx.readManagedJson<{ presets?: PresetRecord[] }>(
		"presets",
		"presets.json",
	);
	const presets = (presetsDoc?.presets ?? []).filter(
		(p): p is PresetRecord & { id: string } =>
			typeof p.id === "string" && p.id.length > 0,
	);
	if (presets.length === 0) throw new Error("no preset records found");

	// Prefer animation (.ffx) presets, then any other catalog entries.
	const ffx = presets.filter((p) => p.type === "preset");
	const others = presets.filter((p) => p.type !== "preset");
	const demoPresets = [...ffx, ...others].slice(0, 8);
	console.log(
		`seeding ${demoPresets.length} preset tiles:`,
		demoPresets.map((p) => p.title ?? p.id).join(", "),
	);

	// Give demo presets distinguishable icons where the catalog row carries
	// none or only the degenerate shared curve — tiles must identify the
	// preset, not just prove a DOM node exists.
	const demoIds = new Set(demoPresets.map((p) => p.id));
	let iconFixes = 0;
	const fixedPresets = (presetsDoc?.presets ?? []).map((p) => {
		if (!demoIds.has(p.id)) return p;
		if (p.icon != null && !isDegenerateCanvasIcon(p.icon)) return p;
		iconFixes += 1;
		return { ...p, icon: iconTextFor(p.title, p.id) };
	});
	if (iconFixes > 0) {
		await writeFile(
			ctx.managedPath("presets", "presets.json"),
			`${JSON.stringify({ ...(presetsDoc ?? {}), presets: fixedPresets }, null, 2)}\n`,
		);
		console.log(`normalized ${iconFixes} preset icons to title text`);
	}

	const workspace = await ctx.readManagedJson<WorkspaceDoc>(
		"workspaces",
		"workspace-1.json",
	);
	const existing = workspace?.gridCells ?? [];
	const usedIds = new Set(existing.map((c) => c.id));
	const freePresets = demoPresets.filter((p) => !usedIds.has(p.id));

	// Place the preset-tile block in the free right-hand columns directly
	// below the top widget band so it is reachable with a short scroll.
	const PRESET_Y0 = 6;
	const presetCells = freePresets.map((p, i) => ({
		id: p.id,
		x: 6 + (i % 2) * 3,
		y: PRESET_Y0 + Math.floor(i / 2) * 3,
		width: 3,
		height: 3,
	}));

	const nextDoc: WorkspaceDoc = {
		gridCells: [...existing, ...presetCells],
	};
	await writeFile(
		ctx.managedPath("workspaces", "workspace-1.json"),
		`${JSON.stringify(nextDoc, null, 2)}\n`,
	);

	const panel = await reloadPanel1(ctx, 60_000);

	// Wait until preset tiles hydrate.
	const tileCount = await waitForDom(
		ctx,
		panel,
		`document.querySelectorAll("[data-workspace-preset-tile]").length >= ${Math.min(presetCells.length, 1)}`,
		60_000,
	);
	console.log("preset tile probe:", JSON.stringify(tileCount));
	const actualTiles = await ctx.evalJs(
		panel,
		`document.querySelectorAll("[data-workspace-preset-tile]").length`,
	);
	console.log("preset tiles rendered:", actualTiles);

	// Verify tile identity, not just presence: every seeded preset id must
	// resolve to a tile whose glyph carries distinguishable content.
	const tileProbe = await ctx.evalJs(
		panel,
		`[...document.querySelectorAll("[data-workspace-preset-tile]")].map((el) => ({
			presetId: el.querySelector("[data-preset-id]")?.getAttribute("data-preset-id") ?? null,
			text: (el.textContent ?? "").trim().slice(0, 24),
		}))`,
	);
	console.log("preset tile identity probe:", JSON.stringify(tileProbe));
	const renderedIds = new Set(
		(Array.isArray(tileProbe) ? tileProbe : [])
			.map((t) => (t as { presetId?: string | null }).presetId)
			.filter(Boolean),
	);
	const missingIds = freePresets
		.map((p) => p.id)
		.filter((id) => !renderedIds.has(id));
	if (missingIds.length > 0) {
		console.warn("preset tiles missing catalog ids:", missingIds);
	}

	// 1) Top viewport (toolbar + first widget rows). CEF ignores
	// captureBeyondViewport, so regions are captured as scrolled viewports.
	await scrollPanelTo(panel, 0);
	await sleep(500);
	await ctx.screenshot(panel, "product-workspace-top");

	// 3) Preset tile region — scroll so the first preset tile sits near the
	// top of the workspace viewport, then capture.
	if (typeof actualTiles === "number" && actualTiles > 0) {
		const tileTop = await ctx.evalJs(
			panel,
			`(() => {
				const el = document.querySelector("[data-workspace-preset-tile]");
				if (!el) return -1;
				const pick = ${SCROLLER_EXPR};
				const r = el.getBoundingClientRect();
				const base = pick ? pick.getBoundingClientRect().top : 0;
				return pick ? pick.scrollTop + (r.top - base) : r.top + window.scrollY;
			})()`,
		);
		if (typeof tileTop === "number" && tileTop > 0) {
			await scrollPanelTo(panel, Math.max(0, tileTop - 100));
			await ctx.screenshot(panel, "product-preset-tiles");
			// One more viewport lower to show the full preset block.
			await scrollPanelTo(panel, Math.max(0, tileTop + 500));
			await ctx.screenshot(panel, "product-preset-tiles-2");
		}

		// 3b) Hover preview — the product's selection path: pointer-enter on a
		// preset tile publishes presetHoverId and the info widget resolves the
		// preset's name/type/path. Capture that real state, and assert the
		// filePath actually reached the DOM (not just that a tile exists).
		const hovered = demoPresets[0];
		if (hovered?.filePath) {
			// Real pointer path: synthetic PointerEvent dispatch did not reach
			// React's enter/leave delegation in CEF, so drive CDP
			// Input.dispatchMouseEvent at the tile center instead.
			const tileCenter = await ctx.evalJs(
				panel,
				`(() => {
					const host = document.querySelector('[data-workspace-preset-tile] [data-preset-id="${hovered.id}"]');
					if (!host) return null;
					const r = host.getBoundingClientRect();
					return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
				})()`,
			);
			let hoveredOk = "no-tile";
			if (
				tileCenter &&
				typeof tileCenter === "object" &&
				"x" in tileCenter &&
				"y" in tileCenter
			) {
				const c = tileCenter as { x: number; y: number };
				const conn = await ctx.cdp(panel);
				await conn.send("Input.dispatchMouseEvent", {
					type: "mouseMoved",
					x: c.x,
					y: c.y,
				});
				await sleep(1200);
				hoveredOk = "mouseMoved";
			}
			console.log("preset hover dispatch:", hoveredOk);
			const infoShowsPreset = await waitForDom(
				ctx,
				panel,
				`document.body.innerText.includes(${JSON.stringify(hovered.filePath)})`,
				15_000,
			);
			console.log("info widget shows hovered preset:", infoShowsPreset);
			if (infoShowsPreset) {
				// Scroll so the info widget (the element now carrying the
				// preset's filePath) is inside the viewport, then capture.
				await ctx.evalJs(
					panel,
					`(() => {
						const pick = ${SCROLLER_EXPR};
						const leaf = [...document.querySelectorAll("*")]
							.filter((n) => n.children.length === 0)
							.find((n) => (n.textContent ?? "").includes(${JSON.stringify(hovered.filePath)}));
						if (!leaf) return "no-leaf";
						let box = leaf;
						while (box.parentElement && box.parentElement !== document.body) {
							const p = box.parentElement;
							const r = p.getBoundingClientRect();
							if (r.width > 500 || r.height > 300) break;
							box = p;
						}
						const r = box.getBoundingClientRect();
						const base = pick ? pick.getBoundingClientRect().top : 0;
						const target = pick
							? pick.scrollTop + (r.top - base) - 120
							: r.top + window.scrollY - 120;
						if (pick) pick.scrollTop = Math.max(0, target);
						else window.scrollTo(0, Math.max(0, target));
						return "scrolled";
					})()`,
				);
				await sleep(500);
				await ctx.screenshot(panel, "product-preset-hover");
			}
		}
	}

	// 4) Local Presets dialog (catalog browser).
	const openedPresets = await clickFirst(
		ctx,
		panel,
		'[data-ws-action="open-dialog"][data-dialog-kind="presets"]',
	);
	console.log("open presets dialog:", openedPresets);
	const presetsDialog = await findLive(
		ctx,
		(s) => s.surfaceId.includes("preset") && s.kind === "dialog",
		30_000,
	);
	if (presetsDialog) {
		await waitForDom(
			ctx,
			presetsDialog,
			`document.body.innerHTML.length > 500`,
			30_000,
		);
		await sleep(800);
		await ctx.screenshot(presetsDialog, "product-presets-dialog");
		await ctx.evalJs(presetsDialog, "window.close()");
		await sleep(500);
	} else {
		console.log("presets dialog surface not found");
	}

	// 5) Add Widget selector dialog — retry the click once; the toolbar
	// action is delegated and can no-op while the panel is still settling.
	let widgetDialog = null;
	for (let attempt = 0; attempt < 2 && !widgetDialog; attempt++) {
		const openedWidget = await clickFirst(
			ctx,
			panel,
			'[data-ws-action="ty.ctx.add-widget"]',
		);
		console.log(
			`open add-widget dialog (attempt ${attempt + 1}):`,
			openedWidget,
		);
		widgetDialog = await findLive(
			ctx,
			(s) => s.surfaceId.includes("widget-selector"),
			45_000,
		);
	}
	if (widgetDialog) {
		await waitForDom(
			ctx,
			widgetDialog,
			`Boolean(document.querySelector("[data-add-widget-type]"))`,
			30_000,
		);
		await sleep(600);
		await ctx.screenshot(widgetDialog, "product-add-widget-dialog");
		await ctx.evalJs(widgetDialog, "window.close()");
	} else {
		console.log("widget selector dialog surface not found");
	}

	console.log(`captures written to ${outDir}`);
});
