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
};

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
			(s) => s.surfaceId === "dialog-widget-selector",
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
