/**
 * Widget suite (Issue #108; matrix UC-D11).
 *
 * Widget state lives in `widgets/state/<name>.json`. The easing widget is
 * the cleanest round-trip: it reads its per-instance row at mount
 * (`readWidgetStateJson(window, "easing", { instanceId })` in
 * `function/widget/core/easing/Component.tsx`) and renders the mode
 * segmented control from the restored state, so a file-level write is
 * observable in the DOM after a real panel reload — no widget UI driving
 * required.
 *
 * File shape (written by `writeWidgetStateJson` with `instanceId`):
 * `{ version: 1, instances: [{ id, mode, ... }] }`.
 *
 * The legacy `"loop"` mode was split into its own widget; a stored loop
 * state must coerce to `"curve"` (the mode it was based on) and the mode
 * strip must expose only curve/bounce/elastic.
 */

import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { E2EContext } from "../ctx";
import { check, type E2ECase } from "../report";
import { resolveLocaleKey, surfaceLang } from "./i18n";
import { aeUserDataDir, e2eFixtureDir } from "./journey";
import {
	findWidgetInstanceIdByType,
	managedFilePath,
	readManagedFileBytes,
	reloadPanel1,
	sleep,
	waitForDom,
	widgetTileSelector,
	withManagedRootSnapshot,
	writeManagedFile,
} from "./shared";
import { addWidgetViaDialog } from "./workspace";

type WidgetRecord = { id?: string; type?: string };
type WidgetRecordsFile = { widgets?: WidgetRecord[] };

type EasingStateFile = {
	version?: number;
	instances?: Record<string, unknown>[];
};

const EASING_STATE = ["widgets", "state", "easing.json"] as const;

const findEasingInstanceId = async (
	ctx: E2EContext,
): Promise<string | null> => {
	const doc = await ctx.readManagedJson<WidgetRecordsFile>(
		"widgets",
		"widgets.json",
	);
	const record = (doc?.widgets ?? []).find((w) => w.type === "easing");
	const id = typeof record?.id === "string" ? record.id.trim() : "";
	return id || null;
};

export const widgetCases: E2ECase[] = [
	{
		uc: "UC-D11",
		title:
			"easing widget state file restores mode after reload (legacy loop coerces to curve)",
		precondition: async (ctx) => {
			const typed = ctx as E2EContext;
			try {
				const instanceId = await findEasingInstanceId(typed);
				if (!instanceId) {
					return "no easing widget record in widgets/widgets.json";
				}
				const panel = await typed.requireSurface({ surfaceId: "panel-1" });
				const mounted = await typed.evalJs(
					panel,
					`Boolean(document.querySelector('[data-widget-instance-id="${instanceId}"]'))`,
				);
				return mounted
					? null
					: `easing widget ${instanceId} not mounted on panel-1`;
			} catch (error) {
				return `precondition failed: ${error instanceof Error ? error.message : String(error)}`;
			}
		},
		async run(ctx: E2EContext) {
			const checks: ReturnType<typeof check>[] = [];
			const instanceId = (await findEasingInstanceId(ctx)) as string;

			await withManagedRootSnapshot(ctx, "uc-d11-widget-state", async () => {
				// Merge into any existing catalog rows for other instances.
				const existingText = await ctx.readManagedText(...EASING_STATE);
				let instances: Record<string, unknown>[] = [];
				if (existingText) {
					try {
						const parsed = JSON.parse(existingText) as EasingStateFile;
						if (Array.isArray(parsed.instances)) {
							instances = parsed.instances.filter(
								(row): row is Record<string, unknown> =>
									Boolean(row) && typeof row === "object",
							);
						}
					} catch {
						instances = [];
					}
				}
				instances = instances.filter((row) => row.id !== instanceId);
				instances.push({
					id: instanceId,
					mode: "loop",
					applyMode: "pair",
					backgroundPattern: "dot",
					autoApply: true,
					labelColor: 0,
					customColors: {},
				});
				await writeManagedFile(
					ctx,
					[...EASING_STATE],
					`${JSON.stringify({ version: 1, instances }, null, 2)}\n`,
				);

				const panel = await reloadPanel1(ctx);
				const scope = `[data-widget-instance-id="${instanceId}"]`;
				const probe = `(() => {
					const host = document.querySelector(${JSON.stringify(scope)});
					if (!host) return { mounted: false };
					const buttons = [...host.querySelectorAll("[role='toolbar'] button")];
					return {
						mounted: true,
						modeCount: buttons.length,
						pressed: buttons.findIndex(
							(b) => b.getAttribute("aria-pressed") === "true"
						),
					};
				})()`;
				const state = (await waitForDom(
					ctx,
					panel,
					`(() => { const r = ${probe}; return r.mounted && r.modeCount === 3 ? r : null; })()`,
					30_000,
				)) as {
					mounted?: boolean;
					modeCount?: number;
					pressed?: number;
				} | null;

				checks.push(
					check(
						"easing widget tile mounted after reload",
						Boolean(state?.mounted),
						state ? "mounted" : "tile absent",
					),
				);
				checks.push(
					check(
						"mode strip exposes only curve/bounce/elastic (3 segments)",
						state?.modeCount === 3,
						`modeCount=${state?.modeCount ?? "absent"} expected=3`,
					),
				);
				checks.push(
					check(
						"stored loop mode coerced to curve (first segment pressed)",
						state?.pressed === 0,
						`pressedIndex=${state?.pressed ?? "none"} expected=0`,
					),
				);
			});
			try {
				await reloadPanel1(ctx, 30_000);
			} catch {
				// restore already ran; reload is best-effort
			}
			const restored = await readManagedFileBytes(ctx, ...EASING_STATE);
			checks.push(
				check(
					"widgets/state/easing.json restored after case",
					restored !== null,
					managedFilePath(ctx, ...EASING_STATE),
				),
			);
			return {
				detail: `instance=${instanceId}`,
				checks,
			};
		},
	},

	// -------------------------------------------------------------------
	// Issue #786 — widget operations
	// -------------------------------------------------------------------
	{
		uc: "UC-D02",
		title:
			"easing Apply with no AE keyframe selection surfaces the structured no-selection notice",
		precondition: async (ctx) => {
			const typed = ctx as E2EContext;
			try {
				const instanceId = await findWidgetInstanceIdByType(typed, "easing");
				if (!instanceId) return "no easing widget record";
				const panel = await typed.requireSurface({ surfaceId: "panel-1" });
				const mounted = await typed.evalJs(
					panel,
					`Boolean(document.querySelector(${JSON.stringify(
						`${widgetTileSelector(instanceId)} [data-ws-action="easing-apply-current"]`,
					)}))`,
				);
				return mounted ? null : "easing apply button not mounted";
			} catch (error) {
				return `precondition failed: ${error instanceof Error ? error.message : String(error)}`;
			}
		},
		async run(ctx: E2EContext) {
			const checks: ReturnType<typeof check>[] = [];
			const instanceId = (await findWidgetInstanceIdByType(
				ctx,
				"easing",
			)) as string;
			const applySel = `${widgetTileSelector(instanceId)} [data-ws-action="easing-apply-current"]`;

			// A fresh comp with no layers guarantees `getEasingSelectionCount`
			// returns pairs=0 (comp.selectedProperties is empty), so the
			// explicit Apply deterministically takes the empty-selection
			// notice path instead of touching AE keyframes.
			const setup = await ctx.evalScriptOnPanel1(`(function(){
				var comp = null;
				for (var i = 1; i <= app.project.numItems; i++) {
					var it = app.project.item(i);
					if (it instanceof CompItem && it.name === "TYPlus E2E Easing Comp") { comp = it; break; }
				}
				if (!comp) {
					comp = app.project.items.addComp("TYPlus E2E Easing Comp", 320, 240, 1, 10, 30);
				}
				try { comp.openInViewer(); } catch (e) {}
				return "comp-ready";
			})()`);
			checks.push(
				check(
					"empty AE comp activated for selection gate",
					String(setup).includes("comp-ready"),
					String(setup).slice(0, 120),
				),
			);

			const panel = await ctx.requireSurface({ surfaceId: "panel-1" });
			await waitForDom(
				ctx,
				panel,
				`Boolean(document.querySelector(${JSON.stringify(applySel)}))`,
				30_000,
			);
			const clicked = await ctx.evalJs(
				panel,
				`(() => {
					const btn = document.querySelector(${JSON.stringify(applySel)});
					if (!btn) return "missing";
					btn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
					btn.click();
					return "clicked";
				})()`,
			);
			checks.push(
				check("easing apply triggered", clicked === "clicked", String(clicked)),
			);

			// applyCurve → host getEasingSelectionCount → pairs=0 →
			// notificationStore warning (role=alert) with the localized
			// noKeyframesSelected text.
			const lang = await surfaceLang(ctx, panel);
			const noticeText =
				(await resolveLocaleKey(lang, "widgets:easing.noKeyframesSelected")) ??
				"no keyframes selected";
			const needle = noticeText.slice(0, 24);
			const noticeSeen = await waitForDom(
				ctx,
				panel,
				`(() => [...document.querySelectorAll('[role="alert"]')]
					.some((el) => (el.textContent || "").includes(${JSON.stringify(needle)})))()`,
				30_000,
			);
			checks.push(
				check(
					"empty-selection notice surfaced (non-blocking)",
					Boolean(noticeSeen),
					`needle=${JSON.stringify(needle)} seen=${String(noticeSeen).slice(0, 80)}`,
				),
			);
			// Panel must stay responsive — the apply path never blocked.
			const alive = await ctx.evalJs(panel, `1 + 1`);
			checks.push(
				check(
					"panel still responsive after apply",
					alive === 2,
					`eval=${alive}`,
				),
			);

			await ctx.evalScriptOnPanel1(`(function(){
				for (var i = app.project.numItems; i >= 1; i--) {
					var it = app.project.item(i);
					if (it instanceof CompItem && it.name === "TYPlus E2E Easing Comp") it.remove();
				}
				return "cleaned";
			})()`);
			return {
				detail: `easing apply empty-selection path (widget=${instanceId})`,
				checks,
			};
		},
	},
	{
		uc: "UC-D05",
		title: "align widget aligns two selected AE layers (align-left)",
		precondition: async (ctx) => {
			const typed = ctx as E2EContext;
			try {
				const alignId = await findWidgetInstanceIdByType(typed, "align");
				if (!alignId) return "no align widget record";
				const panel = await typed.requireSurface({ surfaceId: "panel-1" });
				const mounted = await typed.evalJs(
					panel,
					`Boolean(document.querySelector(${JSON.stringify(
						`${widgetTileSelector(alignId)} [data-ws-action="align-left"]`,
					)}))`,
				);
				return mounted ? null : "align widget not mounted";
			} catch (error) {
				return `precondition failed: ${error instanceof Error ? error.message : String(error)}`;
			}
		},
		async run(ctx: E2EContext) {
			const checks: ReturnType<typeof check>[] = [];
			const alignId = (await findWidgetInstanceIdByType(
				ctx,
				"align",
			)) as string;
			const tileSel = widgetTileSelector(alignId);

			// Two same-size solids at different positions, both selected.
			// layer.selected is scriptable; comp.selectedProperties is not,
			// which is why align (selectedLayers) is E2E-drivable while
			// easing keyframe selection is not.
			const setup = await ctx.evalScriptOnPanel1(`(function(){
				var comp = null;
				for (var i = 1; i <= app.project.numItems; i++) {
					var it = app.project.item(i);
					if (it instanceof CompItem && it.name === "TYPlus E2E Align Comp") { comp = it; break; }
				}
				if (!comp) {
					comp = app.project.items.addComp("TYPlus E2E Align Comp", 320, 240, 1, 10, 30);
				}
				while (comp.numLayers > 0) comp.layer(1).remove();
				var l1 = comp.layers.addSolid([0.8, 0.2, 0.2], "E2E Align A", 100, 100, 1, 10);
				var l2 = comp.layers.addSolid([0.2, 0.2, 0.8], "E2E Align B", 100, 100, 1, 10);
				l1.property("ADBE Transform Group").property("ADBE Position").setValue([120, 120]);
				l2.property("ADBE Transform Group").property("ADBE Position").setValue([260, 200]);
				for (var j = 1; j <= comp.numLayers; j++) comp.layer(j).selected = true;
				try { comp.openInViewer(); } catch (e) {}
				return "ready:" + comp.selectedLayers.length;
			})()`);
			checks.push(
				check(
					"two AE layers selected in active comp",
					String(setup).includes("ready:2"),
					String(setup).slice(0, 120),
				),
			);

			const panel = await ctx.requireSurface({ surfaceId: "panel-1" });
			await waitForDom(
				ctx,
				panel,
				`Boolean(document.querySelector(${JSON.stringify(`${tileSel} [data-ws-action="align-left"]`)}))`,
				30_000,
			);
			// Activate the widget so its getSelectionCount effect refetches;
			// align buttons stay disabled until selectionCount >= 1.
			await ctx.evalJs(
				panel,
				`(() => {
					const tile = document.querySelector(${JSON.stringify(tileSel)});
					if (tile) tile.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
					return "activated";
				})()`,
			);
			const enabled = await waitForDom(
				ctx,
				panel,
				`(() => {
					const btn = document.querySelector(${JSON.stringify(`${tileSel} [data-ws-action="align-left"]`)});
					return btn && !btn.disabled && btn.getAttribute("aria-disabled") !== "true";
				})()`,
				30_000,
			);
			checks.push(
				check(
					"align-left enabled once AE selection seen",
					Boolean(enabled),
					String(enabled).slice(0, 80),
				),
			);
			if (!enabled) return { detail: "align widget selection gate", checks };

			// Pick "selection" target explicitly, then align-left.
			await ctx.evalJs(
				panel,
				`(() => {
					const t = document.querySelector(${JSON.stringify(`${tileSel} [data-ws-action="align-target-selection"]`)});
					if (t) t.click();
					return "target";
				})()`,
			);
			await sleep(400);
			const clicked = await ctx.evalJs(
				panel,
				`(() => {
					const btn = document.querySelector(${JSON.stringify(`${tileSel} [data-ws-action="align-left"]`)});
					if (!btn || btn.disabled) return "disabled";
					btn.click();
					return "clicked";
				})()`,
			);
			checks.push(
				check("align-left clicked", clicked === "clicked", String(clicked)),
			);

			// alignLayers → ExtendScript aligns left edges → equal position x
			// for identical-width solids.
			const positions = async (): Promise<{
				x1?: number;
				x2?: number;
			} | null> => {
				const raw = await ctx.evalScriptOnPanel1(`(function(){
					var comp = null;
					for (var i = 1; i <= app.project.numItems; i++) {
						var it = app.project.item(i);
						if (it instanceof CompItem && it.name === "TYPlus E2E Align Comp") { comp = it; break; }
					}
					if (!comp || comp.numLayers < 2) return "no-comp";
					var p1 = comp.layer(2).property("ADBE Transform Group").property("ADBE Position").value;
					var p2 = comp.layer(1).property("ADBE Transform Group").property("ADBE Position").value;
					return JSON.stringify({ x1: p1[0], x2: p2[0] });
				})()`);
				try {
					return JSON.parse(String(raw)) as { x1?: number; x2?: number };
				} catch {
					return null;
				}
			};
			let aligned: { x1?: number; x2?: number } | null = null;
			const alignDeadline = Date.now() + 25_000;
			while (Date.now() < alignDeadline) {
				const p = await positions();
				if (
					p &&
					typeof p.x1 === "number" &&
					typeof p.x2 === "number" &&
					Math.abs(p.x1 - p.x2) < 0.5
				) {
					aligned = p;
					break;
				}
				await sleep(800);
			}
			checks.push(
				check(
					"AE layer positions aligned left (x equal)",
					Boolean(aligned),
					`positions=${JSON.stringify(aligned)}`,
				),
			);

			await ctx.evalScriptOnPanel1(`(function(){
				for (var i = app.project.numItems; i >= 1; i--) {
					var it = app.project.item(i);
					if (it instanceof CompItem && it.name === "TYPlus E2E Align Comp") it.remove();
				}
				return "cleaned";
			})()`);
			return {
				detail: `align-left applied (widget=${alignId})`,
				checks,
			};
		},
	},
	{
		uc: "UC-D06",
		title: "anchor-point widget moves AE anchor to top-left of selected layer",
		precondition: async (ctx) => {
			const typed = ctx as E2EContext;
			try {
				const anchorId = await findWidgetInstanceIdByType(
					typed,
					"anchor-point",
				);
				if (!anchorId) return "no anchor-point widget record";
				const panel = await typed.requireSurface({ surfaceId: "panel-1" });
				const mounted = await typed.evalJs(
					panel,
					`Boolean(document.querySelector(${JSON.stringify(
						`${widgetTileSelector(anchorId)} [data-ws-action="anchor-point"][data-anchor="top-left"]`,
					)}))`,
				);
				return mounted ? null : "anchor-point widget not mounted";
			} catch (error) {
				return `precondition failed: ${error instanceof Error ? error.message : String(error)}`;
			}
		},
		async run(ctx: E2EContext) {
			const checks: ReturnType<typeof check>[] = [];
			const anchorId = (await findWidgetInstanceIdByType(
				ctx,
				"anchor-point",
			)) as string;
			const tileSel = widgetTileSelector(anchorId);

			const setup = await ctx.evalScriptOnPanel1(`(function(){
				var comp = null;
				for (var i = 1; i <= app.project.numItems; i++) {
					var it = app.project.item(i);
					if (it instanceof CompItem && it.name === "TYPlus E2E Anchor Comp") { comp = it; break; }
				}
				if (!comp) {
					comp = app.project.items.addComp("TYPlus E2E Anchor Comp", 320, 240, 1, 10, 30);
				}
				while (comp.numLayers > 0) comp.layer(1).remove();
				var layer = comp.layers.addSolid([0.3, 0.7, 0.3], "E2E Anchor Solid", 200, 150, 1, 10);
				layer.property("ADBE Transform Group").property("ADBE Position").setValue([160, 120]);
				for (var j = 1; j <= comp.numLayers; j++) comp.layer(j).selected = (j === 1);
				try { comp.openInViewer(); } catch (e) {}
				var a = layer.property("ADBE Transform Group").property("ADBE Anchor Point").value;
				return "ready anchor=" + a[0] + "," + a[1];
			})()`);
			checks.push(
				check(
					"AE comp + selected layer ready",
					String(setup).startsWith("ready"),
					String(setup).slice(0, 120),
				),
			);

			const panel = await ctx.requireSurface({ surfaceId: "panel-1" });
			const btnSel = `${tileSel} [data-ws-action="anchor-point"][data-anchor="top-left"]`;
			await waitForDom(
				ctx,
				panel,
				`Boolean(document.querySelector(${JSON.stringify(btnSel)}))`,
				30_000,
			);
			const clicked = await ctx.evalJs(
				panel,
				`(() => {
					const btn = document.querySelector(${JSON.stringify(btnSel)});
					if (!btn) return "missing";
					btn.click();
					return "clicked";
				})()`,
			);
			checks.push(
				check(
					"anchor-point top-left clicked",
					clicked === "clicked",
					String(clicked),
				),
			);

			// The script sets anchor = sourceRect.top-left; verify the AE-side
			// anchor now equals the layer's source rect origin.
			const probe = async (): Promise<{
				anchor?: number[];
				rectLeft?: number;
				rectTop?: number;
			} | null> => {
				const raw = await ctx.evalScriptOnPanel1(`(function(){
					var comp = null;
					for (var i = 1; i <= app.project.numItems; i++) {
						var it = app.project.item(i);
						if (it instanceof CompItem && it.name === "TYPlus E2E Anchor Comp") { comp = it; break; }
					}
					if (!comp || comp.numLayers < 1) return "no-comp";
					var layer = comp.layer(1);
					var a = layer.property("ADBE Transform Group").property("ADBE Anchor Point").value;
					var r = layer.sourceRectAtTime(comp.time, false);
					return JSON.stringify({ anchor: [a[0], a[1]], rectLeft: r.left, rectTop: r.top });
				})()`);
				try {
					return JSON.parse(String(raw)) as {
						anchor?: number[];
						rectLeft?: number;
						rectTop?: number;
					};
				} catch {
					return null;
				}
			};
			let matched: {
				anchor?: number[];
				rectLeft?: number;
				rectTop?: number;
			} | null = null;
			const anchorDeadline = Date.now() + 25_000;
			while (Date.now() < anchorDeadline) {
				const p = await probe();
				if (
					p?.anchor &&
					typeof p.rectLeft === "number" &&
					typeof p.rectTop === "number" &&
					Math.abs(p.anchor[0] - p.rectLeft) < 0.5 &&
					Math.abs(p.anchor[1] - p.rectTop) < 0.5
				) {
					matched = p;
					break;
				}
				await sleep(800);
			}
			checks.push(
				check(
					"AE anchor moved to layer source-rect top-left",
					Boolean(matched),
					`probe=${JSON.stringify(matched)}`,
				),
			);

			await ctx.evalScriptOnPanel1(`(function(){
				for (var i = app.project.numItems; i >= 1; i--) {
					var it = app.project.item(i);
					if (it instanceof CompItem && it.name === "TYPlus E2E Anchor Comp") it.remove();
				}
				return "cleaned";
			})()`);
			return {
				detail: `anchor-point top-left applied (widget=${anchorId})`,
				checks,
			};
		},
	},
	{
		uc: "UC-D07",
		title: "info widget shows preset details when a preset tile is selected",
		precondition: async (ctx) => {
			const typed = ctx as E2EContext;
			try {
				const infoId = await findWidgetInstanceIdByType(typed, "info");
				if (!infoId) return "no info widget record";
				const panel = await typed.requireSurface({ surfaceId: "panel-1" });
				const mounted = await typed.evalJs(
					panel,
					`Boolean(document.querySelector(${JSON.stringify(
						`${widgetTileSelector(infoId)} [data-mode]`,
					)})) && document.querySelectorAll("[data-workspace-preset-tile]").length > 0`,
				);
				return mounted ? null : "info widget or preset tile not mounted";
			} catch (error) {
				return `precondition failed: ${error instanceof Error ? error.message : String(error)}`;
			}
		},
		async run(ctx: E2EContext) {
			const checks: ReturnType<typeof check>[] = [];
			const infoId = (await findWidgetInstanceIdByType(ctx, "info")) as string;
			const infoModeSel = `${widgetTileSelector(infoId)} [data-mode]`;
			const panel = await ctx.requireSurface({ surfaceId: "panel-1" });

			// Pick the first preset tile and read its catalog id + title.
			const presetInfo = (await ctx.evalJs(
				panel,
				`(() => {
					const tile = document.querySelector("[data-workspace-preset-tile]");
					if (!tile) return null;
					const idEl = tile.querySelector("[data-preset-id]");
					return {
						surfaceIndex: tile.getAttribute("data-workspace-surface-index"),
						presetId: idEl ? idEl.getAttribute("data-preset-id") : null,
						title: (tile.textContent || "").trim().slice(0, 80),
					};
				})()`,
			)) as {
				surfaceIndex?: string;
				presetId?: string | null;
				title?: string;
			} | null;
			checks.push(
				check(
					"preset tile located for selection",
					Boolean(presetInfo?.surfaceIndex),
					JSON.stringify(presetInfo).slice(0, 160),
				),
			);
			if (!presetInfo?.surfaceIndex) {
				return { detail: "no preset tile", checks };
			}

			const modeBefore = await ctx.evalJs(
				panel,
				`(() => {
					const el = document.querySelector(${JSON.stringify(infoModeSel)});
					return el ? el.getAttribute("data-mode") : "missing";
				})()`,
			);
			// Ctrl/Cmd+click toggles tile selection (plain click is
			// activation-only; selection requires a modifier per handler.ts).
			const selected = await ctx.evalJs(
				panel,
				`(() => {
					const tile = document.querySelector(
						'[data-workspace-surface-index="${presetInfo.surfaceIndex}"]');
					if (!tile) return "missing-tile";
					tile.dispatchEvent(new MouseEvent("click", {
						bubbles: true, cancelable: true, ctrlKey: true, metaKey: true }));
					return "clicked";
				})()`,
			);
			checks.push(
				check(
					"preset tile ctrl+click dispatched",
					selected === "clicked",
					String(selected),
				),
			);

			const modeAfter = await waitForDom(
				ctx,
				panel,
				`(() => {
					const el = document.querySelector(${JSON.stringify(infoModeSel)});
					return el && el.getAttribute("data-mode") !== "empty" ? el.getAttribute("data-mode") : null;
				})()`,
				20_000,
			);
			checks.push(
				check(
					"info widget left empty mode on selection",
					Boolean(modeAfter),
					`before=${String(modeBefore)} after=${String(modeAfter)}`,
				),
			);
			const infoText = String(
				(await ctx.evalJs(
					panel,
					`(() => {
						const el = document.querySelector(${JSON.stringify(infoModeSel)});
						return el ? (el.textContent || "") : "";
					})()`,
				)) ?? "",
			);
			// The preset title from the tile DOM should appear inside the
			// info card (PresetInfoBody renders the resolved preset).
			const tileTitle = String(presetInfo.title ?? "").slice(0, 24);
			checks.push(
				check(
					"info widget renders selected preset identity",
					tileTitle.length > 0
						? infoText.includes(tileTitle)
						: infoText.trim().length > 0,
					`mode=${String(modeAfter)} textHead=${infoText.slice(0, 80)}`,
				),
			);
			return {
				detail: `info selection mode=${String(modeAfter)}`,
				checks,
			};
		},
	},
	{
		uc: "UC-D08",
		title: "font-viewer widget lists fonts and search filters the catalog",
		// The widget is added inside the case (addWidgetViaDialog), so there
		// is no persistent precondition.
		async run(ctx: E2EContext) {
			const checks: ReturnType<typeof check>[] = [];
			await withManagedRootSnapshot(ctx, "uc-d08-font-viewer", async () => {
				const { instanceId } = await addWidgetViaDialog(ctx, "font-viewer");
				checks.push(
					check(
						"font-viewer widget record created",
						Boolean(instanceId),
						`id=${instanceId || "none"}`,
					),
				);
				if (!instanceId) return;
				const panel = await reloadPanel1(ctx, 60_000);
				const tileSel = widgetTileSelector(instanceId);
				const listSel = `${tileSel} [data-font-viewer-list]`;
				const mounted = await waitForDom(
					ctx,
					panel,
					`Boolean(document.querySelector(${JSON.stringify(listSel)}))`,
					60_000,
				);
				checks.push(
					check(
						"font-viewer list mounted",
						Boolean(mounted),
						String(mounted).slice(0, 80),
					),
				);
				if (!mounted) return;

				// Wait for the catalog to settle: rows, empty state, or an
				// error banner — font enumeration via app.fonts can take a
				// while on a busy AE.
				const settled = await waitForDom(
					ctx,
					panel,
					`(() => {
						const host = document.querySelector(${JSON.stringify(tileSel)});
						if (!host) return false;
						const rows = host.querySelectorAll("[data-font-face-id]").length;
						const text = host.textContent || "";
						const done = rows > 0 || /no matching fonts|no fonts|error/i.test(text);
						return done ? rows : null;
					})()`,
					90_000,
					2_000,
				);
				const rowCount = typeof settled === "number" ? settled : 0;
				checks.push(
					check(
						"font catalog settled (rows or explicit empty/error state)",
						settled !== null && settled !== false,
						`rows=${rowCount} settled=${JSON.stringify(settled).slice(0, 60)}`,
					),
				);

				// Search field (aria-label localized via widgets:fontViewer.searchAria).
				const lang = await surfaceLang(ctx, panel);
				const searchAria =
					(await resolveLocaleKey(lang, "widgets:fontViewer.searchAria")) ??
					"Search fonts";
				const searchSel = `${tileSel} input[aria-label=${JSON.stringify(searchAria)}]`;
				const searchMounted = await waitForDom(
					ctx,
					panel,
					`Boolean(document.querySelector(${JSON.stringify(searchSel)}))`,
					20_000,
				);
				checks.push(
					check(
						"font search field mounted",
						Boolean(searchMounted),
						`aria=${JSON.stringify(searchAria)}`,
					),
				);
				if (!searchMounted || rowCount === 0) return;

				// Type a nonsense query → the filtered list must empty out
				// (or show the no-matches state); clearing restores rows.
				const typeQuery = `(() => {
					const input = document.querySelector(${JSON.stringify(searchSel)});
					if (!input) return "missing";
					const setter = Object.getOwnPropertyDescriptor(
						window.HTMLInputElement.prototype, "value").set;
					setter.call(input, "zzqq-e2e-no-such-font-786");
					input.dispatchEvent(new Event("input", { bubbles: true }));
					return "typed";
				})()`;
				await ctx.evalJs(panel, typeQuery);
				const filtered = await waitForDom(
					ctx,
					panel,
					`(() => {
						const host = document.querySelector(${JSON.stringify(tileSel)});
						if (!host) return null;
						const rows = host.querySelectorAll("[data-font-face-id]").length;
						const noMatch = /no matching fonts/i.test(host.textContent || "");
						return rows === 0 || noMatch ? { rows, noMatch } : null;
					})()`,
					20_000,
					700,
				);
				checks.push(
					check(
						"search filters font list to zero matches",
						Boolean(filtered),
						JSON.stringify(filtered).slice(0, 120),
					),
				);
				await ctx.evalJs(
					panel,
					`(() => {
						const input = document.querySelector(${JSON.stringify(searchSel)});
						if (!input) return "missing";
						const setter = Object.getOwnPropertyDescriptor(
							window.HTMLInputElement.prototype, "value").set;
						setter.call(input, "");
						input.dispatchEvent(new Event("input", { bubbles: true }));
						return "cleared";
					})()`,
				);
				const restored = await waitForDom(
					ctx,
					panel,
					`(() => {
						const host = document.querySelector(${JSON.stringify(tileSel)});
						return host ? host.querySelectorAll("[data-font-face-id]").length : 0;
					})()`,
					20_000,
					700,
				);
				checks.push(
					check(
						"clearing search restores font rows",
						typeof restored === "number" && restored > 0,
						`rows=${String(restored)}`,
					),
				);
			});
			return {
				detail: "font-viewer add + search round-trip",
				checks,
			};
		},
	},
	{
		uc: "UC-D09",
		title:
			"directory-browser widget opens a folder, lists entries, filters, and navigates",
		async run(ctx: E2EContext) {
			const checks: ReturnType<typeof check>[] = [];
			const userData = await aeUserDataDir(ctx);
			const fixtureRoot = path.join(e2eFixtureDir(userData), "dir-browser-e2e");
			const subDir = path.join(fixtureRoot, "e2e-subdir");
			try {
				await mkdir(subDir, { recursive: true });
				await writeFile(path.join(fixtureRoot, "e2e-dir-alpha.jsx"), "// a\n");
				await writeFile(path.join(fixtureRoot, "e2e-dir-beta.txt"), "b\n");
				await writeFile(path.join(subDir, "e2e-sub-file.jsx"), "// s\n");

				await withManagedRootSnapshot(ctx, "uc-d09-dir-browser", async () => {
					const { instanceId } = await addWidgetViaDialog(
						ctx,
						"directory-browser",
					);
					checks.push(
						check(
							"directory-browser widget record created",
							Boolean(instanceId),
							`id=${instanceId || "none"}`,
						),
					);
					if (!instanceId) return;
					const panel = await reloadPanel1(ctx, 60_000);
					const tileSel = widgetTileSelector(instanceId);
					const mounted = await waitForDom(
						ctx,
						panel,
						`Boolean(document.querySelector(${JSON.stringify(
							`${tileSel} [data-directory-browser-search]`,
						)}))`,
						60_000,
					);
					checks.push(
						check(
							"directory-browser search UI mounted",
							Boolean(mounted),
							String(mounted).slice(0, 80),
						),
					);
					if (!mounted) return;

					// Open the fixture folder through the same CustomEvent the
					// workspace context menu dispatches (browser-open-dir).
					const opened = await ctx.evalJs(
						panel,
						`(() => {
							const root = document.querySelector("[data-ty-workspace-panel-root]");
							if (!root) return "no-root";
							root.dispatchEvent(new CustomEvent("browser-open-dir", {
								detail: { "data-file-path": ${JSON.stringify(fixtureRoot)} },
							}));
							return "dispatched";
						})()`,
					);
					checks.push(
						check(
							"browser-open-dir event dispatched",
							opened === "dispatched",
							String(opened),
						),
					);
					const entries = await waitForDom(
						ctx,
						panel,
						`(() => {
							const host = document.querySelector(${JSON.stringify(tileSel)});
							if (!host) return null;
							const n = host.querySelectorAll("[data-directory-browser-entry]").length;
							return n >= 2 ? n : null;
						})()`,
						60_000,
						1_500,
					);
					checks.push(
						check(
							"fixture folder entries listed",
							typeof entries === "number" && entries >= 2,
							`entries=${String(entries)}`,
						),
					);
					if (typeof entries !== "number" || entries < 2) return;

					// Search narrows the listing to the matching file.
					const searchInput = `${tileSel} [data-directory-browser-search] input`;
					await ctx.evalJs(
						panel,
						`(() => {
							const input = document.querySelector(${JSON.stringify(searchInput)});
							if (!input) return "missing";
							const setter = Object.getOwnPropertyDescriptor(
								window.HTMLInputElement.prototype, "value").set;
							setter.call(input, "e2e-dir-alpha");
							input.dispatchEvent(new Event("input", { bubbles: true }));
							return "typed";
						})()`,
					);
					const filtered = await waitForDom(
						ctx,
						panel,
						`(() => {
							const host = document.querySelector(${JSON.stringify(tileSel)});
							if (!host) return null;
							const rows = [...host.querySelectorAll("[data-directory-browser-entry]")];
							const alpha = rows.filter((r) =>
								(r.getAttribute("data-entry-path") || "").includes("e2e-dir-alpha"));
							return rows.length === 1 && alpha.length === 1 ? rows.length : null;
						})()`,
						25_000,
						800,
					);
					checks.push(
						check(
							"search filters entries to the matching file",
							Boolean(filtered),
							`filtered=${String(filtered)}`,
						),
					);
					await ctx.evalJs(
						panel,
						`(() => {
							const input = document.querySelector(${JSON.stringify(searchInput)});
							if (!input) return "missing";
							const setter = Object.getOwnPropertyDescriptor(
								window.HTMLInputElement.prototype, "value").set;
							setter.call(input, "");
							input.dispatchEvent(new Event("input", { bubbles: true }));
							return "cleared";
						})()`,
					);

					// Single-click the sub-directory entry → navigates into it
					// (single-click-navigation is the widget's own contract).
					const dirClicked = await ctx.evalJs(
						panel,
						`(() => {
							const host = document.querySelector(${JSON.stringify(tileSel)});
							const row = host && host.querySelector(
								'[data-entry-kind="dir"][data-entry-path$="e2e-subdir"]');
							if (!row) return "missing-dir-entry";
							row.click();
							return "clicked";
						})()`,
					);
					checks.push(
						check(
							"sub-directory entry clicked",
							dirClicked === "clicked",
							String(dirClicked),
						),
					);
					const subEntries = await waitForDom(
						ctx,
						panel,
						`(() => {
							const host = document.querySelector(${JSON.stringify(tileSel)});
							if (!host) return null;
							const rows = [...host.querySelectorAll("[data-directory-browser-entry]")];
							const sub = rows.filter((r) =>
								(r.getAttribute("data-entry-path") || "").includes("e2e-sub-file"));
							return sub.length === 1 ? sub.length : null;
						})()`,
						45_000,
						1_200,
					);
					checks.push(
						check(
							"navigation into sub-directory listed its file",
							Boolean(subEntries),
							`subEntries=${String(subEntries)}`,
						),
					);
					const canGoUp = await ctx.evalJs(
						panel,
						`(() => {
							const host = document.querySelector(${JSON.stringify(tileSel)});
							return host ? host.getAttribute("data-directory-browser-can-go-up") : "missing";
						})()`,
					);
					checks.push(
						check(
							"go-up affordance enabled inside sub-directory",
							canGoUp === "true",
							`canGoUp=${String(canGoUp)}`,
						),
					);
				});
			} finally {
				await rm(fixtureRoot, { recursive: true, force: true });
			}
			return {
				detail: "directory-browser open/search/navigate",
				checks,
				evidence: [fixtureRoot],
			};
		},
	},
];
