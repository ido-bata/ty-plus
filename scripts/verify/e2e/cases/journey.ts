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
import { resolveLocaleKey, surfaceLang, templateAffixes } from "./i18n";
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
const setInputValue = async (
	ctx: E2EContext,
	surface: LiveSurface,
	selector: string,
	value: string,
): Promise<unknown> =>
	setInputValueByFinder(
		ctx,
		surface,
		`document.querySelector(${JSON.stringify(selector)})`,
		value,
		selector,
	);

/**
 * Same as `setInputValue` but takes a JS expression that evaluates to the
 * input element (or null). Used where no stable selector exists.
 */
const setInputValueByFinder = async (
	ctx: E2EContext,
	surface: LiveSurface,
	finder: string,
	value: string,
	tag = "input",
): Promise<unknown> =>
	ctx.evalJs(
		surface,
		`(() => {
			const el = (${finder});
			if (!el) return "missing:" + ${JSON.stringify(tag)};
			const setter = Object.getOwnPropertyDescriptor(
				window.HTMLInputElement.prototype, "value").set;
			setter.call(el, ${JSON.stringify(value)});
			el.dispatchEvent(new Event("input", { bubbles: true }));
			el.dispatchEvent(new Event("change", { bubbles: true }));
			return el.value;
		})()`,
	);

/**
 * Click a `<button>` whose trimmed text equals one of `labels` (already
 * resolved for the surface locale). Returns "clicked" or a missing tag.
 */
export const clickButtonByLabels = async (
	ctx: E2EContext,
	surface: LiveSurface,
	labels: readonly string[],
): Promise<unknown> =>
	ctx.evalJs(
		surface,
		`(() => {
			const wants = new Set(${JSON.stringify(labels)});
			const btn = [...document.querySelectorAll("button")].find(
				(b) => wants.has((b.textContent || "").trim()) && !b.disabled);
			if (!btn) return "missing-button:" + [...wants].join("|");
			btn.click();
			return "clicked";
		})()`,
	);

/** Open the preset catalog browser (StatusBar "presets" tool). */
export const openPresetCatalog = async (
	ctx: E2EContext,
): Promise<LiveSurface> => {
	const panel = await ctx.requireSurface({ surfaceId: "panel-1" });
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

/**
 * Resolve the localized aria-label matchers for a catalog row's Run
 * affordance (`presets:listDialog.runPresetAria` exact +
 * `runPresetNamed` `{{name}}` template affixes).
 */
const resolveRunAriaMatchers = async (
	ctx: E2EContext,
	dialog: LiveSurface,
): Promise<{ exact: string[]; affixes: { pre: string; post: string }[] }> => {
	const lang = await surfaceLang(ctx, dialog);
	const runAria = await resolveLocaleKey(
		lang,
		"presets:listDialog.runPresetAria",
	);
	const runNamed = await resolveLocaleKey(
		lang,
		"presets:listDialog.runPresetNamed",
	);
	const affix = templateAffixes(runNamed);
	return {
		exact: runAria ? [runAria] : [],
		affixes: affix ? [affix] : [],
	};
};

/** In-page JS: pick the Run button inside a `[data-preset-id]` row. */
const RUN_BUTTON_PICKER = `((row, exact, affixes) => {
	const btns = [...row.querySelectorAll("button")];
	const aria = (b) => b.getAttribute("aria-label") || "";
	const exactSet = new Set(exact);
	let btn = btns.find((b) => exactSet.has(aria(b)));
	if (!btn) {
		btn = btns.find((b) => {
			const a = aria(b);
			return affixes.some(({ pre, post }) =>
				a.length > pre.length + post.length &&
				a.startsWith(pre) && a.endsWith(post));
		});
	}
	// Fallback: the run affordance is always the row's first button
	// (list view: run/edit/delete; icon view: tile run, then edit/delete).
	if (!btn) btn = btns[0];
	return btn || null;
})`;

/**
 * Click Run on a catalog row/card for `presetId` inside dialog-presets.
 * Locale-independent: aria-labels are resolved for the dialog's locale,
 * with a positional fallback (see `RUN_BUTTON_PICKER`).
 */
export const runPresetFromCatalog = async (
	ctx: E2EContext,
	dialog: LiveSurface,
	presetId: string,
): Promise<unknown> => {
	const matchers = await resolveRunAriaMatchers(ctx, dialog);
	return ctx.evalJs(
		dialog,
		`(() => {
			const row = document.querySelector(
				${JSON.stringify(`[data-preset-id="${presetId}"]`)});
			if (!row) return "missing-row:" + ${JSON.stringify(presetId)};
			const pick = ${RUN_BUTTON_PICKER};
			const btn = pick(row, ${JSON.stringify(matchers.exact)}, ${JSON.stringify(matchers.affixes)});
			if (!btn) return "missing-run-button";
			btn.click();
			return "clicked";
		})()`,
	);
};

/**
 * Inspect (without clicking) the Run button of a catalog row: returns
 * `{ disabled, aria }` or null when the row/button is absent.
 */
export const catalogRunButtonState = async (
	ctx: E2EContext,
	dialog: LiveSurface,
	presetId: string,
): Promise<unknown> => {
	const matchers = await resolveRunAriaMatchers(ctx, dialog);
	return ctx.evalJs(
		dialog,
		`(() => {
			const row = document.querySelector(
				${JSON.stringify(`[data-preset-id="${presetId}"]`)});
			if (!row) return null;
			const pick = ${RUN_BUTTON_PICKER};
			const btn = pick(row, ${JSON.stringify(matchers.exact)}, ${JSON.stringify(matchers.affixes)});
			return btn
				? { disabled: Boolean(btn.disabled), aria: btn.getAttribute("aria-label") || "" }
				: null;
		})()`,
	);
};

/**
 * Click an action button inside a catalog `[data-preset-id]` row by its
 * localized aria-label, falling back to the button at `index` (list and
 * icon views order actions run/edit/delete identically).
 */
export const clickCatalogRowAction = async (
	ctx: E2EContext,
	dialog: LiveSurface,
	presetId: string,
	i18nKeys: readonly string[],
	index: number,
): Promise<unknown> => {
	const lang = await surfaceLang(ctx, dialog);
	const labels: string[] = [];
	for (const key of i18nKeys) {
		const value = await resolveLocaleKey(lang, key);
		if (value) labels.push(value);
	}
	return ctx.evalJs(
		dialog,
		`(() => {
			const row = document.querySelector(
				${JSON.stringify(`[data-preset-id="${presetId}"]`)});
			if (!row) return "missing-row:" + ${JSON.stringify(presetId)};
			const btns = [...row.querySelectorAll("button")];
			const wants = new Set(${JSON.stringify(labels)});
			const btn = btns.find((b) =>
					wants.has(b.getAttribute("aria-label") || ""))
				|| btns[${index}];
			if (!btn) return "missing-action";
			btn.click();
			return "clicked";
		})()`,
	);
};

/**
 * Find the live `dialog-preset-add*` pooled surface that is actually
 * rendering the PathDialog (contains `[data-path-field]`).
 *
 * The `dialog-preset-add(-N)` CEP pool is shared by every preset-tool
 * dialog: a pooled window opened earlier for e.g. the footage or code
 * preset dialog keeps its own route until retargeted, so matching on
 * `surfaceId` alone can return a window that has no path field at all.
 */
export const findPresetAddDialog = async (
	ctx: E2EContext,
	timeoutMs = 30_000,
): Promise<LiveSurface | null> => {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const live = await listLiveSurfaces(await ctx.surfaces());
		for (const s of live) {
			if (!s.surfaceId.startsWith("dialog-preset-add")) continue;
			try {
				const has = await ctx.evalJs(
					s,
					`Boolean(document.querySelector("[data-path-field] input"))`,
					5_000,
				);
				if (has) return s;
			} catch {
				// mid-navigation — try the next candidate
			}
		}
		await sleep(700);
	}
	return null;
};

/**
 * JS finder for the PathDialog name `<input>`, independent of locale:
 * the only text input that is not inside a `[data-path-field]` wrapper
 * (the file-path and description-image fields both are).
 */
const PRESET_NAME_INPUT = `[...document.querySelectorAll("input")].find(
	(i) => !i.closest("[data-path-field]")
		&& !["hidden", "checkbox", "file", "password", "submit", "button", "range", "color"]
			.includes(i.type))`;

/** Localized labels the PathDialog primary (Create) button can show. */
export const presetCreateLabels = async (
	ctx: E2EContext,
	dialog: LiveSurface,
): Promise<string[]> => {
	const lang = await surfaceLang(ctx, dialog);
	const out: string[] = [];
	for (const key of ["common:actions.create", "presets:catalogAdd.creating"]) {
		const value = await resolveLocaleKey(lang, key);
		if (value) out.push(value);
	}
	return out.length > 0 ? out : ["Create"];
};

/**
 * Fill the PathDialog file-path and name fields. The name input is
 * located by its localized placeholder first, then by the structural
 * finder (`PRESET_NAME_INPUT`) — either way it never depends on English.
 */
export const fillPresetAddDialog = async (
	ctx: E2EContext,
	dialog: LiveSurface,
	filePath: string,
	title: string,
): Promise<{ pathSet: unknown; nameSet: unknown }> => {
	const pathSet = await setInputValue(
		ctx,
		dialog,
		"[data-path-field] input",
		filePath,
	);
	const placeholder = await resolveLocaleKey(
		await surfaceLang(ctx, dialog),
		"presets:catalogAdd.namePlaceholder",
	);
	let nameSet: unknown = "missing";
	if (placeholder) {
		nameSet = await setInputValue(
			ctx,
			dialog,
			`input[placeholder=${JSON.stringify(placeholder)}]`,
			title,
		);
	}
	if (String(nameSet).startsWith("missing")) {
		nameSet = await setInputValueByFinder(
			ctx,
			dialog,
			PRESET_NAME_INPUT,
			title,
			"preset-name-input",
		);
	}
	return { pathSet, nameSet };
};

/** userData dir on the AE host (allowed root for script/preset files). */
export const aeUserDataDir = async (ctx: E2EContext): Promise<string> => {
	const _panel = await ctx.requireSurface({ surfaceId: "panel-1" });
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
				await waitForDom(
					ctx,
					panel,
					`Boolean(document.querySelector('[data-ws-action="ty.ctx.create-file-preset"]'))`,
					30_000,
				);
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
				const addDialog = await findPresetAddDialog(ctx, 30_000);
				if (!addDialog) throw new Error("preset-add dialog did not open");

				// 2. Fill path + name, click Create.
				const { pathSet, nameSet } = await fillPresetAddDialog(
					ctx,
					addDialog,
					jsxPath,
					"E2E Journey Script",
				);
				checks.push(
					check(
						"preset path field accepts file path",
						String(pathSet) === jsxPath,
						String(pathSet),
					),
				);
				checks.push(
					check(
						"preset name field accepts title",
						String(nameSet) === "E2E Journey Script",
						String(nameSet),
					),
				);
				const created = await clickButtonByLabels(
					ctx,
					addDialog,
					await presetCreateLabels(ctx, addDialog),
				);
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
