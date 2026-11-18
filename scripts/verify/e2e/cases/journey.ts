/**
 * User-journey suite (Issue #108; matrix UC-B01, UC-C10, UC-C11, UC-H02, UC-J02).
 *
 * Drives real UI paths end to end and asserts artifacts, not just DOM:
 *
 * - UC-C11: catalog browser Run on a `.jsx` script preset → ExtendScript
 *   side effect (marker file written inside After Effects).
 * - UC-C10: catalog browser Run on a `.ffx` preset → effect lands on the
 *   selected AE layer (effect count/matchNames inspected via evalScript).
 * - UC-H02/UC-J02: create a local preset through the toolbar → PathDialog,
 *   verify presets.json + auto-placed workspace tile, run it by clicking
 *   the tile, reload the panel, run again. Managed root is snapshotted
 *   and restored around the whole chain.
 *
 * Note on scope: preset *deletion* goes through a host `confirm()` modal
 * (ExtendScript), which cannot be driven over CDP — cleanup here restores
 * the managed-root snapshot instead, which is the same end state.
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { E2EContext } from "../ctx";
import { check, type E2ECase } from "../report";
import type { LiveSurface } from "../surfaces";
import { listLiveSurfaces } from "../surfaces";
import {
	managedFilePath,
	reloadPanel1,
	reloadSurface,
	sleep,
	waitForDom,
	withManagedRootSnapshot,
} from "./shared";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const freshLive = (ctx: E2EContext) =>
	ctx.surfaces().then((s) => listLiveSurfaces(s));

export const findLive = async (
	ctx: E2EContext,
	match: (s: LiveSurface) => boolean,
	timeoutMs = 30_000,
): Promise<LiveSurface | null> => {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const live = await freshLive(ctx);
		const found = live.find(match);
		if (found) return found;
		await sleep(700);
	}
	return null;
};

/** Click the first element matching `selector`; returns the JS result. */
export const clickFirst = async (
	ctx: E2EContext,
	surface: LiveSurface,
	selector: string,
): Promise<unknown> =>
	ctx.evalJs(
		surface,
		`(() => {
			const el = document.querySelector(${JSON.stringify(selector)});
			if (!el) return "missing:" + ${JSON.stringify(selector)};
			el.click();
			return "clicked";
		})()`,
	);

/** Set a React-controlled input value (native setter + input event). */
export const setInputValue = async (
	ctx: E2EContext,
	surface: LiveSurface,
	selector: string,
	value: string,
): Promise<unknown> =>
	ctx.evalJs(
		surface,
		`(() => {
			const el = document.querySelector(${JSON.stringify(selector)});
			if (!el) return "missing:" + ${JSON.stringify(selector)};
			const setter = Object.getOwnPropertyDescriptor(
				window.HTMLInputElement.prototype, "value").set;
			setter.call(el, ${JSON.stringify(value)});
			el.dispatchEvent(new Event("input", { bubbles: true }));
			el.dispatchEvent(new Event("change", { bubbles: true }));
			return el.value;
		})()`,
	);

/** Evaluate a selector that picks an element by text content. */
export const clickButtonByText = async (
	ctx: E2EContext,
	surface: LiveSurface,
	text: string,
): Promise<unknown> =>
	ctx.evalJs(
		surface,
		`(() => {
			const want = ${JSON.stringify(text)};
			const btn = [...document.querySelectorAll("button")].find(
				(b) => (b.textContent || "").trim() === want && !b.disabled);
			if (!btn) return "missing-button:" + want;
			btn.click();
			return "clicked";
		})()`,
	);

/** Open the preset catalog browser (StatusBar "presets" tool). */
export const openPresetCatalog = async (
	ctx: E2EContext,
): Promise<LiveSurface> => {
	const panel = await ctx.requireSurface({ surfaceId: "panel-1" });
	// A wedged dialog-presets from a previous run cannot be reloaded
	// (Page.reload times out on a hung renderer) and `findLive` would pick
	// it again — close stale instances first (Issue #223).
	const stale = (await listLiveSurfaces(await ctx.surfaces())).filter(
		(s) => s.surfaceId === "dialog-presets",
	);
	for (const s of stale) {
		try {
			const conn = await ctx.cdp(s);
			await conn.send("Page.close", {}, 5_000);
		} catch {
			// best-effort
		}
	}
	if (stale.length > 0) await sleep(1_000);
	await clickFirst(ctx, panel, '[data-dialog-kind="presets"]');
	const dialog = await findLive(
		ctx,
		(s) => s.surfaceId === "dialog-presets",
		30_000,
	);
	if (!dialog) throw new Error("dialog-presets surface did not open");
	// dialog-presets is a pooled modeless surface: requestOpenExtension may
	// just refocus an instance booted before the catalog changed. Reload it
	// so the preset list reflects the current presets.json.
	await reloadSurface(ctx, dialog, 30_000);
	await waitForDom(
		ctx,
		dialog,
		`document.querySelectorAll("[data-preset-id]").length > 0 ||
		 document.body.innerHTML.length > 500`,
		30_000,
	);
	return dialog;
};

/** Click Run on a catalog row/card for `presetId` inside dialog-presets. */
export const runPresetFromCatalog = async (
	ctx: E2EContext,
	dialog: LiveSurface,
	presetId: string,
): Promise<unknown> =>
	ctx.evalJs(
		dialog,
		`(() => {
			const row = document.querySelector(
				${JSON.stringify(`[data-preset-id="${presetId}"]`)});
			if (!row) return "missing-row:" + ${JSON.stringify(presetId)};
			const btn = row.querySelector('button[aria-label="Run preset"]')
				|| row.querySelector('button[aria-label^="Run"]');
			if (!btn) return "missing-run-button";
			btn.click();
			return "clicked";
		})()`,
	);

/** userData dir on the AE host (allowed root for script/preset files). */
export const aeUserDataDir = async (ctx: E2EContext): Promise<string> => {
	const panel = await ctx.requireSurface({ surfaceId: "panel-1" });
	const out = await ctx.evalScriptOnPanel1("Folder.userData.fsName");
	const dir = String(out ?? "").trim();
	if (!dir || dir.startsWith("e2e-error")) {
		throw new Error(`cannot resolve Folder.userData: ${out}`);
	}
	return dir;
};

export const e2eFixtureDir = (userData: string): string =>
	path.join(userData, "ty-plus-e2e");

export const writeFixtureScript = async (
	dir: string,
	name: string,
	markerName: string,
): Promise<{ jsxPath: string; markerPath: string }> => {
	await mkdir(dir, { recursive: true });
	const jsxPath = path.join(dir, name);
	const markerPath = path.join(dir, markerName);
	const src = `(function(){
  var f = new File(${JSON.stringify(markerPath)});
  f.open("w");
  f.write(String((new Date()).getTime()) + "|" + app.version);
  f.close();
  $.writeln(${JSON.stringify(`e2e fixture ${name} executed`)});
})();
`;
	await writeFile(jsxPath, src, "utf8");
	return { jsxPath, markerPath };
};

export const readMarker = async (
	markerPath: string,
): Promise<string | null> => {
	try {
		return await readFile(markerPath, "utf8");
	} catch {
		return null;
	}
};

export const waitForFile = async (
	file: string,
	timeoutMs = 20_000,
): Promise<string | null> => {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const text = await readMarker(file);
		if (text !== null) return text;
		await sleep(500);
	}
	return null;
};

// ---------------------------------------------------------------------------
// cases
// ---------------------------------------------------------------------------

export const journeyCases: E2ECase[] = [
	{
		uc: "UC-C11",
		title: "script preset (.jsx) run from catalog executes in AE",
		async run(ctx: E2EContext) {
			const checks: ReturnType<typeof check>[] = [];
			const userData = await aeUserDataDir(ctx);
			// Reuse the device-gate script preset already in the catalog; it
			// writes marker.txt next to itself inside userData.
			const markerPath = path.join(
				userData,
				"ty-plus",
				"dg-presets",
				"marker.txt",
			);
			await rm(markerPath, { force: true });

			const dialog = await openPresetCatalog(ctx);
			const rowSeen = await waitForDom(
				ctx,
				dialog,
				`Boolean(document.querySelector('[data-preset-id="dg-script-marker"]'))`,
				20_000,
			);
			checks.push(
				check(
					"catalog lists dg-script-marker preset",
					Boolean(rowSeen),
					String(rowSeen).slice(0, 120),
				),
			);

			const ran = await runPresetFromCatalog(ctx, dialog, "dg-script-marker");
			checks.push(
				check("catalog Run button clicked", ran === "clicked", String(ran)),
			);

			const marker = await waitForFile(markerPath, 25_000);
			checks.push(
				check(
					"ExtendScript side effect: marker.txt written by AE",
					marker !== null,
					marker === null ? "marker.txt absent after run" : `content=${marker}`,
				),
			);
			return {
				detail: `marker=${marker ?? "none"}`,
				checks,
				evidence: marker !== null ? [markerPath] : [],
			};
		},
	},
	{
		uc: "UC-C10",
		title: ".ffx preset run applies effect to selected AE layer",
		async run(ctx: E2EContext) {
			const checks: ReturnType<typeof check>[] = [];
			const panel = await ctx.requireSurface({ surfaceId: "panel-1" });

			// Ensure a comp with a layer exists and is the active item.
			// `app.project.activeItem = comp` silently fails over evalScript;
			// `comp.openInViewer()` is the working way to activate a comp.
			const setup = await ctx.evalScriptOnPanel1(`(function(){
				var comp = null;
				for (var i = 1; i <= app.project.numItems; i++) {
					var it = app.project.item(i);
					if (it instanceof CompItem && it.name === "TYPlus E2E Comp") { comp = it; break; }
				}
				if (!comp) {
					comp = app.project.items.addComp("TYPlus E2E Comp", 320, 240, 1, 10, 30);
					comp.layers.addSolid([0.5, 0.5, 0.5], "E2E Solid", 320, 240, 1, 10);
				}
				try { comp.openInViewer(); } catch (e) {}
				if (comp.numLayers < 1) {
					comp.layers.addSolid([0.5, 0.5, 0.5], "E2E Solid", 320, 240, 1, 10);
				}
				var layer = comp.layer(1);
				for (var j = 1; j <= comp.numLayers; j++) {
					comp.layer(j).selected = (j === 1);
				}
				return JSON.stringify({
					comp: comp.name,
					layers: comp.numLayers,
					effectsBefore: layer.Effects ? layer.Effects.numProperties : -1,
				});
			})()`);
			let before: { effectsBefore?: number } = {};
			try {
				before = JSON.parse(String(setup)) as typeof before;
			} catch {
				before = {};
			}
			checks.push(
				check(
					"AE comp + selected layer ready",
					typeof before.effectsBefore === "number" && before.effectsBefore >= 0,
					String(setup).slice(0, 200),
				),
			);

			const dialog = await openPresetCatalog(ctx);
			const rowSeen = await waitForDom(
				ctx,
				dialog,
				`Boolean(document.querySelector('[data-preset-id="dg-ffx-fadein"]'))`,
				20_000,
			);
			checks.push(
				check(
					"catalog lists dg-ffx-fadein preset",
					Boolean(rowSeen),
					String(rowSeen).slice(0, 120),
				),
			);

			const ran = await runPresetFromCatalog(ctx, dialog, "dg-ffx-fadein");
			checks.push(
				check("catalog Run button clicked", ran === "clicked", String(ran)),
			);

			// Give AE a moment to apply the preset, then inspect the layer.
			await sleep(1500);
			const after = await ctx.evalScriptOnPanel1(`(function(){
				var comp = null;
				for (var i = 1; i <= app.project.numItems; i++) {
					var it = app.project.item(i);
					if (it instanceof CompItem && it.name === "TYPlus E2E Comp") { comp = it; break; }
				}
				if (!comp || comp.numLayers < 1) return "no-comp";
				var layer = comp.layer(1);
				var fx = [];
				if (layer.Effects) {
					for (var k = 1; k <= layer.Effects.numProperties; k++) {
						var p = layer.Effects.property(k);
						fx.push(p ? (p.matchName + "|" + p.name) : "null");
					}
				}
				return JSON.stringify({ numEffects: fx.length, fx: fx });
			})()`);
			let parsed: { numEffects?: number; fx?: string[] } = {};
			try {
				parsed = JSON.parse(String(after)) as typeof parsed;
			} catch {
				parsed = {};
			}
			const numEffects = parsed.numEffects ?? 0;
			checks.push(
				check(
					"layer gained effects from .ffx preset",
					numEffects > (before.effectsBefore ?? 0),
					`before=${before.effectsBefore} after=${numEffects} fx=${JSON.stringify(parsed.fx ?? [])}`,
				),
			);

			// Cleanup the E2E comp + solid footage items so repeat runs stay
			// deterministic.
			await ctx.evalScriptOnPanel1(`(function(){
				for (var i = app.project.numItems; i >= 1; i--) {
					var it = app.project.item(i);
					if (it instanceof CompItem && it.name === "TYPlus E2E Comp") it.remove();
					else if (it.name === "E2E Solid") it.remove();
				}
				return "cleaned";
			})()`);
			void panel;
			return {
				detail: `effects ${before.effectsBefore}→${numEffects}: ${JSON.stringify(parsed.fx ?? [])}`,
				checks,
			};
		},
	},
	{
		uc: "UC-H02",
		title:
			"preset journey: create via dialog → tile placed → run → reload → re-run (UC-J02 chain)",
		async run(ctx: E2EContext) {
			const checks: ReturnType<typeof check>[] = [];
			const userData = await aeUserDataDir(ctx);
			const dir = e2eFixtureDir(userData);
			const markerName = "e2e-journey-ran.txt";
			const { jsxPath, markerPath } = await writeFixtureScript(
				dir,
				"e2e-journey.jsx",
				markerName,
			);
			await rm(markerPath, { force: true });

			const catalogBefore = await ctx.readManagedJson<{
				presets?: unknown[];
			}>("presets", "presets.json");
			const presetCountBefore = catalogBefore?.presets?.length ?? 0;
			const wsBefore = await ctx.readManagedJson<{ gridCells?: unknown[] }>(
				"workspaces",
				"workspace-1.json",
			);
			const cellCountBefore = wsBefore?.gridCells?.length ?? 0;

			let presetId = "";
			await withManagedRootSnapshot(ctx, "uc-h02-preset-journey", async () => {
				const panel = await ctx.requireSurface({ surfaceId: "panel-1" });

				// 1. Open the Local Preset authoring dialog from the toolbar.
				const opened = await clickFirst(
					ctx,
					panel,
					'[data-ws-action="ty.ctx.create-file-preset"]',
				);
				checks.push(
					check(
						"toolbar create-file-preset clicked",
						opened === "clicked",
						String(opened),
					),
				);
				const addDialog = await findLive(
					ctx,
					(s) => s.surfaceId.startsWith("dialog-preset-add"),
					30_000,
				);
				if (!addDialog) throw new Error("preset-add dialog did not open");
				await waitForDom(
					ctx,
					addDialog,
					`Boolean(document.querySelector("[data-path-field] input"))`,
					30_000,
				);

				// 2. Fill path + name, click Create.
				const pathSet = await setInputValue(
					ctx,
					addDialog,
					"[data-path-field] input",
					jsxPath,
				);
				checks.push(
					check(
						"preset path field accepts file path",
						String(pathSet) === jsxPath,
						String(pathSet),
					),
				);
				const nameSet = await setInputValue(
					ctx,
					addDialog,
					'input[placeholder="Enter name..."]',
					"E2E Journey Script",
				);
				checks.push(
					check(
						"preset name field accepts title",
						String(nameSet) === "E2E Journey Script",
						String(nameSet),
					),
				);
				const created = await clickButtonByText(ctx, addDialog, "Create");
				checks.push(
					check("Create submitted", created === "clicked", String(created)),
				);

				// 3. presets.json gains a record pointing at the fixture.
				let recordId = "";
				const deadline = Date.now() + 25_000;
				while (Date.now() < deadline && !recordId) {
					const doc = await ctx.readManagedJson<{
						presets?: { id?: string; filePath?: string }[];
					}>("presets", "presets.json");
					const row = doc?.presets?.find((p) => p.filePath === jsxPath);
					if (row?.id) recordId = row.id;
					else await sleep(700);
				}
				presetId = recordId;
				checks.push(
					check(
						"presets.json persisted new record",
						Boolean(recordId),
						recordId ? `id=${recordId}` : "no record with fixture path",
					),
				);
				if (!recordId) {
					return {
						detail: "preset record not persisted — aborting journey",
						checks,
					};
				}

				// 4. Panel places a tile for the new preset (UC-B01 evidence).
				const tileSel = `[data-workspace-preset-tile] [data-preset-id="${recordId}"]`;
				const tileSeen = await waitForDom(
					ctx,
					panel,
					`Boolean(document.querySelector(${JSON.stringify(tileSel)}))`,
					30_000,
				);
				checks.push(
					check(
						"workspace tile rendered for new preset",
						Boolean(tileSeen),
						String(tileSeen).slice(0, 120),
					),
				);
				const wsAfter = await ctx.readManagedJson<{
					gridCells?: unknown[];
				}>("workspaces", "workspace-1.json");
				const cellCountAfter = wsAfter?.gridCells?.length ?? 0;
				checks.push(
					check(
						"workspace-1.json gridCells grew (tile persisted)",
						cellCountAfter > cellCountBefore,
						`before=${cellCountBefore} after=${cellCountAfter}`,
					),
				);

				// 5. First run: click the tile → AE executes the script.
				await rm(markerPath, { force: true });
				const run1 = await ctx.evalJs(
					panel,
					`(() => {
						const el = document.querySelector(${JSON.stringify(tileSel)});
						if (!el) return "missing-tile";
						el.click();
						return "clicked";
					})()`,
				);
				checks.push(
					check("tile click dispatched", run1 === "clicked", String(run1)),
				);
				const marker1 = await waitForFile(markerPath, 25_000);
				checks.push(
					check(
						"run #1 produced AE-side artifact",
						marker1 !== null,
						marker1 === null ? "marker absent" : `content=${marker1}`,
					),
				);

				// 6. Reload panel → tile persists → run again (再実行).
				const panel2 = await reloadPanel1(ctx, 45_000);
				const tileSeen2 = await waitForDom(
					ctx,
					panel2,
					`Boolean(document.querySelector(${JSON.stringify(tileSel)}))`,
					30_000,
				);
				checks.push(
					check(
						"tile survives panel reload",
						Boolean(tileSeen2),
						String(tileSeen2).slice(0, 120),
					),
				);
				await sleep(300);
				const run2 = await ctx.evalJs(
					panel2,
					`(() => {
						const el = document.querySelector(${JSON.stringify(tileSel)});
						if (!el) return "missing-tile-after-reload";
						el.click();
						return "clicked";
					})()`,
				);
				await sleep(1500);
				const marker2 = await readMarker(markerPath);
				checks.push(
					check(
						"run #2 after reload re-executed script",
						run2 === "clicked" && marker2 !== null && marker2 !== marker1,
						`click=${run2} marker1=${marker1} marker2=${marker2}`,
					),
				);

				const shot = await ctx.screenshot(panel2, "uc-h02-after-rerun");
				return {
					detail: `preset=${recordId} runs=2 marker=${marker2 ?? "none"}`,
					checks,
					evidence: [shot, jsxPath],
				};
			});

			// Snapshot restore ran; verify catalog count is back.
			const catalogAfter = await ctx.readManagedJson<{
				presets?: unknown[];
			}>("presets", "presets.json");
			checks.push(
				check(
					"presets.json restored after journey",
					(catalogAfter?.presets?.length ?? 0) === presetCountBefore,
					`before=${presetCountBefore} after=${catalogAfter?.presets?.length ?? "missing"}`,
				),
			);
			try {
				await reloadPanel1(ctx, 30_000);
			} catch {
				// restore already ran; reload is best-effort
			}
			return {
				detail: `preset journey completed (presetId=${presetId || "none"})`,
				checks,
				evidence: [managedFilePath(ctx, "presets", "presets.json")],
			};
		},
	},
];
