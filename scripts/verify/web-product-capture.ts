#!/usr/bin/env bun
/**
 * Product capture for the official website (Issues #309, #319, #322).
 *
 * Drives the live CEP panel over CDP to reproduce real product states —
 * a composed demo workspace (utility widgets + distinguishable preset
 * tiles + one info widget), preset hover/selection info display, a real
 * preset execution on an After Effects comp, the Local Presets dialog,
 * and the Add Widget selector — and saves PNG evidence. The managed
 * root AND the AE project item list are restored afterwards, so neither
 * user data nor the user's project is permanently changed.
 *
 * Fixture policy: catalog `icon` values are structured product data the
 * icon editor writes. The fixture only replaces *degenerate* icons (the
 * identical default cubic every scanned preset carries — see issue #325)
 * with semantic canvas icons, and composes a realistic workspace layout.
 * It never fabricates UI states: every captured state is produced by
 * real pointer input or real product code paths.
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

/** Bounding-box center of the first element matching `selector`. */
const centerOf = async (
	surface: LiveSurface,
	selector: string,
): Promise<{ x: number; y: number } | null> => {
	const r = await ctx.evalJs(
		surface,
		`(() => {
			const el = document.querySelector(${JSON.stringify(selector)});
			if (!el) return null;
			const b = el.getBoundingClientRect();
			return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
		})()`,
	);
	return r && typeof r === "object" && "x" in r
		? (r as { x: number; y: number })
		: null;
};

/**
 * Real pointer click through CDP Input domain. `modifiers` follows the
 * CDP bitmask (Alt=1, Ctrl=2, Meta=4, Shift=8). Plain click on a preset
 * tile executes the preset; Ctrl/Cmd/Shift click toggles selection.
 */
const clickAt = async (
	surface: LiveSurface,
	x: number,
	y: number,
	modifiers = 0,
): Promise<void> => {
	const conn = await ctx.cdp(surface);
	await conn.send("Input.dispatchMouseEvent", {
		type: "mouseMoved",
		x,
		y,
	});
	await conn.send("Input.dispatchMouseEvent", {
		type: "mousePressed",
		x,
		y,
		button: "left",
		clickCount: 1,
		modifiers,
	});
	await conn.send("Input.dispatchMouseEvent", {
		type: "mouseReleased",
		x,
		y,
		button: "left",
		clickCount: 1,
		modifiers,
	});
};

type PresetRecord = {
	id: string;
	type?: string;
	title?: string;
	filePath?: string;
	icon?: unknown;
};

/**
 * Degenerate icon = the identical low-contrast easing curve every scanned
 * catalog row carries (issue #325): a canvas icon pinned to the default
 * cubic with no color overrides. The fixture replaces only this case
 * with a semantic canvas icon — a first-class icon type the product's
 * icon editor writes — so tiles are distinguishable in captures.
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

type SemanticIcon = { cubic: [number, number, number, number]; color: string };

/**
 * Semantic easing icons keyed by preset title keywords. Cubics reflect
 * the motion character (overshoot for pop/jump, symmetric for loops,
 * linear for yoyo) and colors stay inside a muted product palette.
 */
const semanticIconFor = (title: string | undefined): SemanticIcon => {
	const t = title ?? "";
	if (t.includes("ポップして揺れ"))
		return { cubic: [0.5, 1.4, 0.6, 0.9], color: "#e8b4b8" };
	if (t.includes("ポップ"))
		return { cubic: [0.34, 1.56, 0.64, 1], color: "#f0b27a" };
	if (t.includes("ジャンプ"))
		return { cubic: [0.68, -0.55, 0.27, 1.55], color: "#c3a6e8" };
	if (t.includes("スピン"))
		return { cubic: [0.55, 0.06, -0.68, 0.19], color: "#e8a0bf" };
	if (t.includes("スライド"))
		return { cubic: [0.16, 1, 0.3, 1], color: "#9fd8a8" };
	if (t.includes("ヨーヨー") || t.includes("ループ"))
		return { cubic: [0.45, 0, 0.55, 1], color: "#8fd0e0" };
	if (t.includes("アウト"))
		return { cubic: [0.65, 0, 0.35, 1], color: "#a8b0c0" };
	if (t.includes("フェード"))
		return { cubic: [0.4, 0, 0.2, 1], color: "#8ab4f8" };
	return { cubic: [0.25, 0.1, 0.25, 1], color: "#9aa4b8" };
};

const iconCanvasFor = (title: string | undefined): unknown => {
	const s = semanticIconFor(title);
	return { type: "canvas", param: { ...s } };
};

type WidgetsDoc = {
	widgets?: { id: string; type: string; param?: unknown }[];
};

/**
 * Demo workspace composition (grid units; cellSize 48px, 12 columns).
 *
 * - Top band keeps the user's real utility widgets (quick actions, lock,
 *   menu, easing, align, anchor point).
 * - Preset zone: 9 tiles in varied footprints so tiles are not a row of
 *   identical squares, each bound to a real catalog preset.
 * - One info widget beside the preset zone shows hover/selection state;
 *   one font-viewer adds a second widget kind. The four extra empty
 *   "info" widgets and the second font-viewer that made every capture
 *   repeat "No preset selected" are removed from the fixture.
 */
const DEMO_LAYOUT = {
	// Existing widget ids reused at their current top-band positions.
	widgets: [
		{ id: "6bbb83ca-95f3-4579-84d1-4ccea1c3b433", x: 0, y: 0, w: 5, h: 2 }, // quick-actions
		{ id: "714d97da-a553-49ba-93a9-5a81ed41682a", x: 5, y: 0, w: 1, h: 1 }, // layout-lock
		{ id: "51fa1e68-b247-43bc-b5c1-10dee26e7ae1", x: 6, y: 0, w: 1, h: 1 }, // menu
		{ id: "5aaaf392-4a28-4cf8-a89e-0f7e414b41d4", x: 5, y: 1, w: 4, h: 5 }, // easing
		{ id: "2d7709cc-2c0c-4266-abcb-5442f624aa61", x: 9, y: 2, w: 2, h: 3 }, // align
		{ id: "889ade40-dd4c-414d-83c1-c1f99f4dbb21", x: 9, y: 0, w: 3, h: 2 }, // anchor-point
		{ id: "1e9cf148-cd19-4aed-95e3-b4b09fa1ece7", x: 0, y: 12, w: 4, h: 4 }, // info
		{ id: "87853e83-b6fd-48d1-85db-c8cf2923b780", x: 4, y: 12, w: 4, h: 4 }, // font-viewer
	],
	// Preset tiles placed by catalog id (filled in at runtime).
	presetCells: [
		{ slot: "fadeIn", x: 0, y: 6, w: 3, h: 3 },
		{ slot: "popIn", x: 3, y: 6, w: 3, h: 3 },
		{ slot: "slideIn", x: 6, y: 6, w: 3, h: 3 },
		{ slot: "jumpIn", x: 9, y: 6, w: 3, h: 3 },
		{ slot: "spinIn", x: 0, y: 9, w: 2, h: 3 },
		{ slot: "fadeOut", x: 2, y: 9, w: 3, h: 3 },
		{ slot: "popOut", x: 5, y: 9, w: 3, h: 3 },
		{ slot: "breath", x: 8, y: 9, w: 2, h: 3 },
		{ slot: "yoyo", x: 10, y: 9, w: 2, h: 3 },
		{ slot: "popShake", x: 8, y: 12, w: 4, h: 4 },
	],
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

	// Slot → preset: prefer animation (.ffx) presets whose title matches the
	// slot keyword, falling back to catalog order.
	const ffx = presets.filter((p) => p.type === "preset");
	const pickByKeyword = (kw: string): PresetRecord | undefined =>
		ffx.find((p) => (p.title ?? "").includes(kw)) ??
		presets.find((p) => (p.title ?? "").includes(kw));
	const slotPreset = (slot: string): PresetRecord | undefined => {
		const kw =
			slot === "fadeIn"
				? "フェードイン"
				: slot === "popIn"
					? "ポップイン"
					: slot === "slideIn"
						? "スライドイン"
						: slot === "jumpIn"
							? "ジャンプイン"
							: slot === "spinIn"
								? "スピンイン"
								: slot === "fadeOut"
									? "フェードアウト"
									: slot === "popOut"
										? "ポップアウト"
										: slot === "breath"
											? "呼吸"
											: slot === "yoyo"
												? "ヨーヨー"
												: "ポップして揺れ";
		return pickByKeyword(kw);
	};
	const assigned = new Map<string, PresetRecord>();
	const usedIds = new Set<string>();
	for (const cell of DEMO_LAYOUT.presetCells) {
		const found =
			slotPreset(cell.slot) ??
			[...ffx, ...presets.filter((p) => p.type !== "preset")].find(
				(p) => !usedIds.has(p.id),
			);
		if (!found || usedIds.has(found.id)) continue;
		usedIds.add(found.id);
		assigned.set(cell.slot, found);
	}
	const demoPresets = [...assigned.values()];
	console.log(
		`demo presets:`,
		demoPresets.map((p) => `${p.title ?? p.id}`).join(", "),
	);
	if (demoPresets.length < 4) {
		throw new Error(`only ${demoPresets.length} presets resolved for demo`);
	}

	// Replace degenerate icons on demo presets with semantic canvas icons.
	const demoIds = new Set(demoPresets.map((p) => p.id));
	let iconFixes = 0;
	const fixedPresets = (presetsDoc?.presets ?? []).map((p) => {
		if (!demoIds.has(p.id)) return p;
		if (p.icon != null && !isDegenerateCanvasIcon(p.icon)) return p;
		iconFixes += 1;
		return { ...p, icon: iconCanvasFor(p.title) };
	});
	if (iconFixes > 0) {
		await writeFile(
			ctx.managedPath("presets", "presets.json"),
			`${JSON.stringify({ ...(presetsDoc ?? {}), presets: fixedPresets }, null, 2)}\n`,
		);
		console.log(`normalized ${iconFixes} preset icons to semantic canvas`);
	}

	// Compose the demo workspace: widget cells at their authored positions,
	// preset cells bound to catalog ids, and drop the removed widget ids
	// from widgets.json so unplaced widgets cannot resurface.
	const gridCells = [
		...DEMO_LAYOUT.widgets.map((w) => ({
			id: w.id,
			x: w.x,
			y: w.y,
			width: w.w,
			height: w.h,
		})),
		...DEMO_LAYOUT.presetCells.flatMap((c) => {
			const p = assigned.get(c.slot);
			return p ? [{ id: p.id, x: c.x, y: c.y, width: c.w, height: c.h }] : [];
		}),
	];
	await writeFile(
		ctx.managedPath("workspaces", "workspace-1.json"),
		`${JSON.stringify({ gridCells }, null, 2)}\n`,
	);

	const widgetsDoc = await ctx.readManagedJson<WidgetsDoc>(
		"widgets",
		"widgets.json",
	);
	const placedWidgetIds = new Set(DEMO_LAYOUT.widgets.map((w) => w.id));
	const keptWidgets = (widgetsDoc?.widgets ?? []).filter((w) =>
		placedWidgetIds.has(w.id),
	);
	if (keptWidgets.length !== widgetsDoc?.widgets?.length) {
		await writeFile(
			ctx.managedPath("widgets", "widgets.json"),
			`${JSON.stringify({ ...(widgetsDoc ?? {}), widgets: keptWidgets }, null, 2)}\n`,
		);
		console.log(
			`widgets.json: kept ${keptWidgets.length}/${widgetsDoc?.widgets?.length} placed widgets`,
		);
	}

	const panel = await reloadPanel1(ctx, 60_000);

	// Wait until preset tiles hydrate, then verify identity.
	await waitForDom(
		ctx,
		panel,
		`document.querySelectorAll("[data-workspace-preset-tile]").length >= ${Math.min(assigned.size, 1)}`,
		60_000,
	);
	const actualTiles = await ctx.evalJs(
		panel,
		`document.querySelectorAll("[data-workspace-preset-tile]").length`,
	);
	console.log("preset tiles rendered:", actualTiles);

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
	const missingIds = demoPresets
		.map((p) => p.id)
		.filter((id) => !renderedIds.has(id));
	if (missingIds.length > 0) {
		console.warn("preset tiles missing catalog ids:", missingIds);
	}

	// Sanity: exactly one info widget should exist in the fixture.
	const infoModes = await ctx.evalJs(
		panel,
		`[...document.querySelectorAll("[data-mode]")].map((e) => e.getAttribute("data-mode"))`,
	);
	console.log("info widget modes:", JSON.stringify(infoModes));

	// ── Captures ──────────────────────────────────────────────────────
	// 1) Top viewport: utility widget band.
	await scrollPanelTo(panel, 0);
	await sleep(500);
	await ctx.screenshot(panel, "product-workspace-top");

	// 2) Preset zone — scroll so the first preset row sits near the top.
	const firstTileTop = await ctx.evalJs(
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
	if (typeof firstTileTop === "number" && firstTileTop > 0) {
		await scrollPanelTo(panel, Math.max(0, firstTileTop - 120));
		await ctx.screenshot(panel, "product-preset-tiles");
	}

	// 3) Hover state — real CDP pointer move over a preset tile; the info
	//    widget resolves the hovered preset's name/type/path. The widget
	//    renders a single card (`data-mode="single"`) whose trailing source
	//    label reads "hover"; it shows the preset title and file basename
	//    (never the full path).
	const hoverTarget = assigned.get("popIn") ?? demoPresets[0];
	const infoCardShows = async (
		title: string,
		source: "hover" | "selection",
	): Promise<boolean> => {
		// The card's source label is localized and capitalized in English
		// ("Hover"/"ホバー", "Selection"/"選択"), so match case-insensitively
		// across the shipped locales instead of the raw source token.
		const sourceNeedle = source === "hover" ? "hover|ホバー" : "selection|選択";
		return waitForDom(
			ctx,
			panel,
			`(() => {
				const card = document.querySelector('[data-mode="single"]');
				if (!card) return false;
				const text = card.innerText || "";
				return text.includes(${JSON.stringify(title)}) && new RegExp(${JSON.stringify(sourceNeedle)}, "i").test(text);
			})()`,
			15_000,
		);
	};
	if (hoverTarget) {
		const c = await centerOf(
			panel,
			`[data-workspace-preset-tile] [data-preset-id="${hoverTarget.id}"]`,
		);
		if (c) {
			const conn = await ctx.cdp(panel);
			await conn.send("Input.dispatchMouseEvent", {
				type: "mouseMoved",
				x: c.x,
				y: c.y,
			});
			console.log("hover dispatched at", JSON.stringify(c));
		}
		const hoverOk = hoverTarget.title
			? await infoCardShows(hoverTarget.title, "hover")
			: false;
		console.log("info widget shows hovered preset:", hoverOk);
		if (hoverOk) {
			await ctx.screenshot(panel, "product-preset-hover");
		}
	}

	// 4) Selection state — Ctrl+click toggles selection (plain click would
	//    execute the preset). The info widget switches to "selection" mode.
	const selectTarget = assigned.get("fadeOut") ?? demoPresets[1];
	if (selectTarget?.title) {
		let selOk = false;
		// Try each selection modifier the product accepts. Ctrl+click is a
		// secondary click on macOS (context menu), so it is last.
		for (const [name, mod] of [
			["cmd", 4],
			["shift", 8],
			["ctrl", 2],
		] as const) {
			if (selOk) break;
			const c = await centerOf(
				panel,
				`[data-workspace-preset-tile] [data-preset-id="${selectTarget.id}"]`,
			);
			if (!c) break;
			// Move pointer away first so hover does not mask selection.
			const conn = await ctx.cdp(panel);
			await conn.send("Input.dispatchMouseEvent", {
				type: "mouseMoved",
				x: 4,
				y: 4,
			});
			await clickAt(panel, c.x, c.y, mod);
			console.log(`${name}+click dispatched for`, selectTarget.title);
			selOk = await infoCardShows(selectTarget.title, "selection");
			console.log(`info widget shows selected preset (${name}):`, selOk);
		}
		if (!selOk) {
			// Debug: dump what the info widget and tile selection actually show.
			const dbg = await ctx.evalJs(
				panel,
				`(() => {
					const card = document.querySelector('[data-mode="single"], [data-mode="empty"], [data-mode="multi"]');
					const tile = document.querySelector('[data-workspace-preset-tile] [data-preset-id="${selectTarget.id}"]');
					const shell = tile?.closest("[data-placement-index]");
					return {
						mode: card?.getAttribute("data-mode") ?? null,
						cardText: (card?.innerText ?? "").slice(0, 200),
						shellClass: shell?.className ?? null,
						shellAttrs: shell ? [...shell.attributes].map(a => a.name + "=" + a.value).join(" ") : null,
					};
				})()`,
			);
			console.log("selection debug:", JSON.stringify(dbg));
		}
		if (selOk) {
			// Scroll so the info widget row is in frame.
			await scrollPanelTo(panel, Math.max(0, (firstTileTop as number) + 500));
			await sleep(400);
			await ctx.screenshot(panel, "product-preset-selected");
			// Deselect again so later states start clean. Cmd+click does not
			// toggle on this host, so click empty grid space instead (the
			// workspace clears all selection on a plain background click).
			const emptyPt = await ctx.evalJs(
				panel,
				`(() => {
					const scroll = document.querySelector(".ws-scroll") ?? document.querySelector("[data-ws-scroll]");
					if (!scroll) return null;
					const r = scroll.getBoundingClientRect();
					for (let y = r.top + 8; y < r.bottom - 8; y += 24) {
						for (let x = r.left + 8; x < r.right - 8; x += 24) {
							const el = document.elementFromPoint(x, y);
							if (!el) continue;
							if (el.closest("[data-workspace-surface-index]")) continue;
							if (!el.closest(".ws-scroll") && !el.closest("[data-ws-scroll]")) continue;
							return { x, y };
						}
					}
					return null;
				})()`,
			);
			const pt = emptyPt as { x: number; y: number } | null;
			if (pt) await clickAt(panel, pt.x, pt.y, 0);
			await sleep(400);
		}
	}

	// 5) Preset execution — real product path: plain click on a preset tile
	//    runs executePreset against the active AE comp/layer. Verify the
	//    effect actually landed via ExtendScript, and capture the result.
	const runTarget = assigned.get("fadeIn") ?? demoPresets[0];
	const createdCompName = "ty-plus-web-capture-demo";
	let compCreated = false;
	// Bail out of the execution section if the panel stopped answering —
	// a hung renderer must not take down dialog captures or the restore.
	let panelAlive = true;
	try {
		await ctx.evalJs(panel, "1+1", 10_000);
	} catch {
		panelAlive = false;
		console.warn("panel unresponsive — skipping preset execution section");
	}
	if (runTarget && panelAlive) {
		try {
			const fxProbe = `(function(){
				var comp = null;
				for (var i = 1; i <= app.project.numItems; i++) {
					var it = app.project.item(i);
					if (it instanceof CompItem && it.name === ${JSON.stringify(createdCompName)}) { comp = it; break; }
				}
				if (!comp || comp.numLayers < 1) return "no-comp";
				var layer = comp.layer(1);
				var fx = [];
				if (layer.Effects) {
					for (var k = 1; k <= layer.Effects.numProperties; k++) {
						var p = layer.Effects.property(k);
						fx.push(p ? p.matchName : "null");
					}
				}
				return JSON.stringify(fx);
			})()`;
			const setup = await ctx.evalScriptOnPanel1(`(function(){
				var comp = null;
				for (var i = 1; i <= app.project.numItems; i++) {
					var it = app.project.item(i);
					if (it instanceof CompItem && it.name === ${JSON.stringify(createdCompName)}) { comp = it; break; }
				}
				if (!comp) {
					comp = app.project.items.addComp(${JSON.stringify(createdCompName)}, 640, 360, 1, 4, 30);
					comp.layers.addSolid([0.15, 0.35, 0.85], "demo-solid", 640, 360, 1, 4);
				}
				try { comp.openInViewer(); } catch (e) {}
				if (comp.numLayers < 1) {
					comp.layers.addSolid([0.15, 0.35, 0.85], "demo-solid", 640, 360, 1, 4);
				}
				for (var j = 1; j <= comp.numLayers; j++) {
					comp.layer(j).selected = (j === 1);
				}
				return "ok:" + comp.name + ":layers=" + comp.numLayers;
			})()`);
			console.log("demo comp setup:", setup);
			compCreated = String(setup).startsWith("ok:");

			if (compCreated) {
				const effectsBefore = await ctx.evalScriptOnPanel1(fxProbe);
				console.log("effects before run:", effectsBefore);

				// Re-assert the demo comp is the active item right before the
				// click; preset execution targets the active comp's selection.
				await ctx.evalScriptOnPanel1(`(function(){
					var comp = null;
					for (var i = 1; i <= app.project.numItems; i++) {
						var it = app.project.item(i);
						if (it instanceof CompItem && it.name === ${JSON.stringify(createdCompName)}) { comp = it; break; }
					}
					if (comp) {
						try { comp.openInViewer(); } catch (e) {}
						for (var j = 1; j <= comp.numLayers; j++) comp.layer(j).selected = (j === 1);
					}
					return comp ? "ok" : "missing";
				})()`);

				let effectsAfter = "[]";
				for (let attempt = 0; attempt < 2; attempt++) {
					// Scroll the tile into view first — centerOf reports
					// viewport coordinates and off-screen tiles give misses.
					await ctx.evalJs(
						panel,
						`(() => {
							const el = document.querySelector('[data-workspace-preset-tile] [data-preset-id="${runTarget.id}"]');
							el?.scrollIntoView({ block: "center", inline: "center" });
							return Boolean(el);
						})()`,
					);
					await sleep(400);
					const runCenter = await centerOf(
						panel,
						`[data-workspace-preset-tile] [data-preset-id="${runTarget.id}"]`,
					);
					if (runCenter) {
						await clickAt(panel, runCenter.x, runCenter.y, 0);
						console.log(
							`plain click dispatched for ${runTarget.title} (attempt ${attempt + 1})`,
						);
					}
					await sleep(4000);
					effectsAfter = await ctx.evalScriptOnPanel1(fxProbe);
					console.log("effects after run:", effectsAfter);
					if (effectsAfter !== "[]" && effectsAfter !== effectsBefore) break;
				}
				const applied = effectsBefore !== effectsAfter && effectsAfter !== "[]";
				console.log("preset application verified:", applied);
				if (applied) {
					await ctx.screenshot(panel, "product-preset-run");
				}
			}
		} catch (e) {
			console.warn("preset execution section failed:", String(e).slice(0, 200));
		}
	}

	// 6) Lower preset zone (info widget + font viewer + large tile).
	if (typeof firstTileTop === "number" && firstTileTop > 0) {
		await scrollPanelTo(panel, Math.max(0, firstTileTop + 700));
		await sleep(400);
		await ctx.screenshot(panel, "product-preset-zone-2");
	}

	// 7) Local Presets dialog (catalog browser). Scroll to top first so
	//    toolbar actions are in their normal visible state.
	await scrollPanelTo(panel, 0);
	await sleep(400);
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

	// 8) Add Widget selector dialog. The action id also appears on context
	//    menu rows, so click the visible match rather than the first node.
	let widgetDialog = null;
	for (let attempt = 0; attempt < 2 && !widgetDialog; attempt++) {
		const openedWidget = await ctx.evalJs(
			panel,
			`(() => {
				const els = [...document.querySelectorAll('[data-ws-action="ty.ctx.add-widget"]')];
				const info = els.map((el) => {
					const r = el.getBoundingClientRect();
					return { w: r.width, h: r.height, text: (el.textContent ?? "").trim().slice(0, 40) };
				});
				const visible = els.find((el) => {
					const r = el.getBoundingClientRect();
					return r.width > 0 && r.height > 0;
				});
				if (visible) { visible.click(); return "clicked:" + JSON.stringify(info); }
				return "no-visible:" + JSON.stringify(info);
			})()`,
		);
		console.log(
			`open add-widget dialog (attempt ${attempt + 1}):`,
			String(openedWidget).slice(0, 300),
		);
		widgetDialog = await findLive(
			ctx,
			(s) => s.surfaceId.includes("widget-selector"),
			45_000,
		);
	}
	if (!widgetDialog) {
		const liveIds = (await ctx.liveSurfaces()).map((s) => s.surfaceId);
		console.log(
			"widget selector dialog surface not found; live:",
			liveIds.join(", "),
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

	// ── Cleanup: remove the demo comp from the user's AE project ──────
	if (compCreated) {
		const removed = await ctx.evalScriptOnPanel1(`(function(){
			try {
				for (var i = app.project.numItems; i >= 1; i--) {
					var it = app.project.item(i);
					if (it instanceof CompItem && it.name === ${JSON.stringify(createdCompName)}) {
						it.remove();
					}
				}
				return "removed";
			} catch (e) { return "err:" + e; }
		})()`);
		console.log("demo comp cleanup:", removed);
	}

	console.log(`captures written to ${outDir}`);
});
