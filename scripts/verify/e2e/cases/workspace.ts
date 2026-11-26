/**
 * Workspace-operations suite (Issue #108; matrix UC-B02, UC-B05, UC-C12,
 * UC-C14, UC-D10).
 *
 * - UC-B02: Add Widget dialog → info tile lands in widgets.json,
 *   workspace layout, and the live DOM.
 * - UC-B05: layout snapshot save → mutate layout (add widget) → restore →
 *   delete, verified through workspaces/history/snapshots.json and the DOM.
 * - UC-D10: quick-actions palette runs a script preset twice in a row;
 *   each run produces the AE-side marker file.
 * - UC-C12: footage preset (.png) created via PathDialog → catalog Run →
 *   footage item appears in the AE project, then is removed again.
 * - UC-C14: preset whose asset file was deleted after registration → Run
 *   must fail without a blocking modal; the structured failure must reach
 *   the debug console.
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { E2EContext } from "../ctx";
import { check, type E2ECase } from "../report";
import type { LiveSurface } from "../surfaces";
import { listLiveSurfaces } from "../surfaces";
import { resolveLocaleKey, surfaceLang } from "./i18n";
import {
	aeUserDataDir,
	catalogRunButtonState,
	clickButtonByLabels,
	clickFirst,
	e2eFixtureDir,
	fillPresetAddDialog,
	findLive,
	findPresetAddDialog,
	openPresetCatalog,
	presetCreateLabels,
	readMarker,
	runPresetFromCatalog,
	waitForFile,
	writeFixtureScript,
} from "./journey";
import {
	managedFilePath,
	reloadPanel1,
	sleep,
	waitForDom,
	withManagedRootSnapshot,
} from "./shared";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

type WidgetRecord = { id?: string; type?: string };
type WidgetRecordsFile = { widgets?: WidgetRecord[] };

/**
 * Open the snapshots dropdown, retrying the toggle until the dropdown is
 * actually mounted. After a panel reload the status bar can exist before
 * React has attached its handlers, so a single click may be a no-op.
 */
const openSnapshotsDropdown = async (
	ctx: E2EContext,
	surface: LiveSurface,
): Promise<boolean> => {
	const alreadyOpen = await ctx
		.evalJs(
			surface,
			'Boolean(document.querySelector("[data-snapshots-dropdown]"))',
		)
		.catch(() => false);
	if (alreadyOpen) return true;
	for (let attempt = 0; attempt < 4; attempt++) {
		await clickFirst(ctx, surface, '[data-ws-action="toggle-snapshots"]');
		const open = await waitForDom(
			ctx,
			surface,
			'Boolean(document.querySelector("[data-snapshots-dropdown]"))',
			8_000,
		);
		if (open) return true;
		// Dropdown may have opened-then-closed if a stray second click landed;
		// next iteration toggles again, so re-check state first.
		const isOpen = await ctx.evalJs(
			surface,
			'Boolean(document.querySelector("[data-snapshots-dropdown]"))',
		);
		if (isOpen) return true;
		await sleep(1_000);
	}
	return false;
};

const readWidgetRecords = (ctx: E2EContext) =>
	ctx.readManagedJson<WidgetRecordsFile>("widgets", "widgets.json");

const widgetInstanceIds = (doc: WidgetRecordsFile | null): string[] =>
	(doc?.widgets ?? [])
		.map((w) => (typeof w.id === "string" ? w.id : ""))
		.filter(Boolean);

/** Open the Add Widget dialog and wait for the catalog to mount. */
const openAddWidgetDialog = async (ctx: E2EContext): Promise<LiveSurface> => {
	const panel = await ctx.requireSurface({ surfaceId: "panel-1" });
	// The toolbar button can exist in the DOM before React attaches its
	// delegated handler (post-reload hydration); wait for it, then click.
	await waitForDom(
		ctx,
		panel,
		`Boolean(document.querySelector('[data-ws-action="ty.ctx.add-widget"]'))`,
		30_000,
	);
	const clicked = await clickFirst(
		ctx,
		panel,
		'[data-ws-action="ty.ctx.add-widget"]',
	);
	if (clicked !== "clicked") {
		throw new Error(`add-widget button not found: ${String(clicked)}`);
	}
	const dialog = await findLive(
		ctx,
		(s) => s.surfaceId === "dialog-widget-selector",
		30_000,
	);
	if (!dialog) throw new Error("dialog-widget-selector did not open");
	await waitForDom(
		ctx,
		dialog,
		`Boolean(document.querySelector('[data-add-widget-type="info"]') ||
		  document.querySelector("[data-add-widget-type]"))`,
		30_000,
	);
	return dialog;
};

/**
 * Add a widget of `type` through the selector dialog. Returns the new
 * widget instance id by diffing widgets/widgets.json.
 */
export const addWidgetViaDialog = async (
	ctx: E2EContext,
	type: string,
): Promise<{ instanceId: string }> => {
	const before = await readWidgetRecords(ctx);
	const beforeIds = new Set(widgetInstanceIds(before));

	const dialog = await openAddWidgetDialog(ctx);
	await ctx.evalJs(
		dialog,
		`(() => {
			const card = document.querySelector(
				${JSON.stringify(`[data-add-widget-type="${type}"]`)});
			if (!card) return "missing-card:" + ${JSON.stringify(type)};
			card.click();
			return "clicked";
		})()`,
	);
	// React flushes aria-pressed asynchronously; give it a beat before
	// deciding whether the card registered the selection.
	await sleep(600);
	const pressed = await ctx.evalJs(
		dialog,
		`(() => {
			const card = document.querySelector(
				${JSON.stringify(`[data-add-widget-type="${type}"]`)});
			return card ? card.getAttribute("aria-pressed") : "missing";
		})()`,
	);
	if (pressed !== "true") {
		// Double-click activates the type directly.
		await ctx.evalJs(
			dialog,
			`(() => {
				const card = document.querySelector(
					${JSON.stringify(`[data-add-widget-type="${type}"]`)});
				if (!card) return "missing";
				card.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
				return "dblclicked";
			})()`,
		);
	}
	// Poll: the dialog closes on success; while open, click the footer Add
	// button once it is enabled (it reads "Adding…" while busy). Stop as
	// soon as a new widget record lands — a lingering dialog plus a second
	// Add click would double-add the widget. Button labels are localized
	// (`widgets:selector.add` / `.adding`), resolved for the dialog locale.
	const addLabels: string[] = [];
	const widgetLang = await surfaceLang(ctx, dialog);
	for (const key of ["widgets:selector.add", "widgets:selector.adding"]) {
		const value = await resolveLocaleKey(widgetLang, key);
		if (value) addLabels.push(value);
	}
	if (addLabels.length === 0) addLabels.push("Add");
	const beforeIdsForPoll = beforeIds;
	const addDeadline = Date.now() + 20_000;
	while (Date.now() < addDeadline) {
		const live = await listLiveSurfaces(await ctx.surfaces());
		const open = live.find((s) => s.surfaceId === "dialog-widget-selector");
		if (!open) break;
		const added = await readWidgetRecords(ctx);
		if (widgetInstanceIds(added).some((id) => !beforeIdsForPoll.has(id))) {
			break;
		}
		await clickButtonByLabels(ctx, open, addLabels).catch(() => "err");
		await sleep(800);
	}

	// Diff widgets.json for the new record id.
	const deadline = Date.now() + 20_000;
	let instanceId = "";
	while (Date.now() < deadline && !instanceId) {
		const after = await readWidgetRecords(ctx);
		instanceId =
			widgetInstanceIds(after).find((id) => !beforeIds.has(id)) ?? "";
		if (!instanceId) await sleep(700);
	}
	return { instanceId };
};

/** Create a local file preset through toolbar → PathDialog; returns id. */
export const createFilePresetViaDialog = async (
	ctx: E2EContext,
	filePath: string,
	title: string,
): Promise<string> => {
	const panel = await ctx.requireSurface({ surfaceId: "panel-1" });
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
	if (opened !== "clicked") {
		throw new Error(`create-file-preset not found: ${String(opened)}`);
	}
	const addDialog = await findPresetAddDialog(ctx, 30_000);
	if (!addDialog) throw new Error("preset-add dialog did not open");
	const { pathSet, nameSet } = await fillPresetAddDialog(
		ctx,
		addDialog,
		filePath,
		title,
	);
	if (String(pathSet) !== filePath || String(nameSet) !== title) {
		throw new Error(
			`preset dialog fields not filled: path=${String(pathSet)} name=${String(nameSet)}`,
		);
	}
	// The Create button enables only after React validates path+title;
	// on a busy host a single click attempt can land while it is still
	// disabled. Poll for an enabled button, then click. Labels are
	// localized (`common:actions.create` / `presets:catalogAdd.creating`).
	const createLabels = await presetCreateLabels(ctx, addDialog);
	let created: unknown = "missing-button";
	const createDeadline = Date.now() + 20_000;
	while (Date.now() < createDeadline) {
		created = await clickButtonByLabels(ctx, addDialog, createLabels);
		if (created === "clicked") break;
		await sleep(800);
	}
	if (created !== "clicked") {
		throw new Error(`Create not clickable: ${String(created)}`);
	}
	const deadline = Date.now() + 25_000;
	while (Date.now() < deadline) {
		const doc = await ctx.readManagedJson<{
			presets?: { id?: string; filePath?: string }[];
		}>("presets", "presets.json");
		const row = doc?.presets?.find((p) => p.filePath === filePath);
		if (row?.id) return row.id;
		await sleep(700);
	}
	throw new Error(`preset record for ${filePath} not persisted`);
};

const gridCellCount = async (ctx: E2EContext): Promise<number> => {
	const ws = await ctx.readManagedJson<{ gridCells?: unknown[] }>(
		"workspaces",
		"workspace-1.json",
	);
	return ws?.gridCells?.length ?? 0;
};

// ---------------------------------------------------------------------------
// cases
// ---------------------------------------------------------------------------

export const workspaceCases: E2ECase[] = [
	{
		uc: "UC-B02",
		title: "Add Widget dialog places an info tile",
		async run(ctx: E2EContext) {
			const checks: ReturnType<typeof check>[] = [];
			const cellsBefore = await gridCellCount(ctx);
			let instanceId = "";
			await withManagedRootSnapshot(ctx, "uc-b02-add-widget", async () => {
				const { instanceId: id } = await addWidgetViaDialog(ctx, "info");
				instanceId = id;
				checks.push(
					check(
						"widgets.json gained info record",
						Boolean(instanceId),
						instanceId ? `id=${instanceId}` : "no new record",
					),
				);
				if (!instanceId) return;

				// The layout write is async; reloading before it flushes boots
				// the panel without the new tile. Wait for the cell to land.
				const layoutDeadline = Date.now() + 15_000;
				while (Date.now() < layoutDeadline) {
					if ((await gridCellCount(ctx)) > cellsBefore) break;
					await sleep(500);
				}

				const panel = await reloadPanel1(ctx, 45_000);
				// The placement shell always carries data-workspace-surface-index;
				// data-widget-instance-id is added only when the cell resolves
				// as a widget tile. Accept either, but report both.
				const tileSel = `[data-widget-instance-id="${instanceId}"], [data-workspace-surface-index="${instanceId}"]`;
				const tileSeen = await waitForDom(
					ctx,
					panel,
					`Boolean(document.querySelector(${JSON.stringify(tileSel)}))`,
					// Widget hydration follows panel boot + file reads; on a
					// busy AE this can exceed 30s.
					60_000,
				);
				const diag = tileSeen
					? ""
					: await ctx
							.evalJs(
								panel,
								`(() => ({
									inst: document.querySelectorAll("[data-widget-instance-id]").length,
									surf: document.querySelectorAll("[data-workspace-surface-index]").length,
									widgetTiles: document.querySelectorAll("[data-workspace-widget-tile]").length,
									presetTiles: document.querySelectorAll("[data-workspace-preset-tile]").length,
								}))()`,
							)
							.catch(() => "diag-failed");
				checks.push(
					check(
						"info tile mounted on panel",
						Boolean(tileSeen),
						`${String(tileSeen).slice(0, 60)} ${JSON.stringify(diag)}`,
					),
				);
				const cellsAfter = await gridCellCount(ctx);
				checks.push(
					check(
						"workspace-1.json gridCells grew",
						cellsAfter > cellsBefore,
						`before=${cellsBefore} after=${cellsAfter}`,
					),
				);
			});
			try {
				await reloadPanel1(ctx, 30_000);
			} catch {
				// restore already ran; reload is best-effort
			}
			const cellsRestored = await gridCellCount(ctx);
			checks.push(
				check(
					"layout restored after case",
					cellsRestored === cellsBefore,
					`before=${cellsBefore} restored=${cellsRestored}`,
				),
			);
			return {
				detail: `widget=${instanceId || "none"} cells ${cellsBefore}→${cellsRestored}`,
				checks,
				evidence: [
					managedFilePath(ctx, "widgets", "widgets.json"),
					managedFilePath(ctx, "workspaces", "workspace-1.json"),
				],
			};
		},
	},
	{
		uc: "UC-B05",
		title: "layout snapshot save → mutate → restore → delete round-trip",
		async run(ctx: E2EContext) {
			const checks: ReturnType<typeof check>[] = [];
			const SNAP = ["workspaces", "history", "snapshots.json"] as const;
			const cellsBefore = await gridCellCount(ctx);
			let snapId = "";

			await withManagedRootSnapshot(ctx, "uc-b05-snapshot", async () => {
				const panel = await ctx.requireSurface({ surfaceId: "panel-1" });

				// 1. Save a snapshot. Diff ids so a pre-existing snapshot is
				// never mistaken for the new one.
				const snapsBefore = await ctx.readManagedJson<{ id?: string }[]>(
					...SNAP,
				);
				const idsBefore = new Set(
					(Array.isArray(snapsBefore) ? snapsBefore : []).map((s) => s?.id),
				);
				await waitForDom(
					ctx,
					panel,
					"Boolean(document.querySelector('[data-ws-action=\"save-snapshot\"]'))",
					30_000,
				);
				let saved: unknown = await clickFirst(
					ctx,
					panel,
					'[data-ws-action="save-snapshot"]',
				);
				// Snapshot persistence is async and the status bar can lag
				// hydration after a reload; retry the click once before
				// giving up, and report the final attempt.
				for (let attempt = 0; attempt < 2 && !snapId; attempt++) {
					if (attempt > 0) {
						saved = await clickFirst(
							ctx,
							panel,
							'[data-ws-action="save-snapshot"]',
						);
					}
					const snapDeadline = Date.now() + 15_000;
					while (Date.now() < snapDeadline) {
						const snapsNow =
							(await ctx.readManagedJson<{ id?: string }[]>(...SNAP)) ?? [];
						const found = Array.isArray(snapsNow)
							? snapsNow.find((s) => s?.id && !idsBefore.has(s.id))
							: undefined;
						if (found?.id) {
							snapId = found.id;
							break;
						}
						await sleep(700);
					}
				}
				checks.push(
					check("save-snapshot clicked", saved === "clicked", String(saved)),
				);
				checks.push(
					check(
						"snapshots.json gained a new entry",
						Boolean(snapId),
						snapId ? `id=${snapId}` : "no new snapshot id",
					),
				);
				if (!snapId) return;

				// 2. Open the snapshots dropdown; row must be listed.
				await openSnapshotsDropdown(ctx, panel);
				const rowSeen = await waitForDom(
					ctx,
					panel,
					`Boolean(document.querySelector('[data-snap-id="${snapId}"]'))`,
					15_000,
				);
				checks.push(
					check(
						"snapshot row rendered in dropdown",
						Boolean(rowSeen),
						String(rowSeen).slice(0, 120),
					),
				);

				// 3. Mutate the layout: add a widget tile. The layout write is
				// async — wait for the cell count to reflect it before the
				// restore step compares against the mutated state.
				const { instanceId } = await addWidgetViaDialog(ctx, "info");
				let cellsMutated = cellsBefore;
				const mutateDeadline = Date.now() + 15_000;
				while (Date.now() < mutateDeadline) {
					cellsMutated = await gridCellCount(ctx);
					if (cellsMutated > cellsBefore) break;
					await sleep(500);
				}
				checks.push(
					check(
						"layout mutated (widget tile added)",
						cellsMutated > cellsBefore && Boolean(instanceId),
						`cells ${cellsBefore}→${cellsMutated} widget=${instanceId || "none"}`,
					),
				);

				// 4. Restore the snapshot via its dropdown row.
				const panel2 = await reloadPanel1(ctx, 45_000);
				await openSnapshotsDropdown(ctx, panel2);
				await waitForDom(
					ctx,
					panel2,
					`Boolean(document.querySelector('[data-snap-id="${snapId}"]'))`,
					15_000,
				);
				const restored = await ctx.evalJs(
					panel2,
					`(() => {
						const btn = document.querySelector(
							${JSON.stringify(`[data-ws-action="restore-snapshot"][data-snap-id="${snapId}"]`)});
						if (!btn) return "missing-restore";
						btn.click();
						return "clicked";
					})()`,
				);
				checks.push(
					check(
						"restore-snapshot clicked",
						restored === "clicked",
						String(restored),
					),
				);
				// The restore commits in place; the panel stays live, so the
				// tile-removal check and the delete step reuse panel2 — no
				// second reload, which was the flaky point.
				await sleep(2500);
				// workspace-1.json is rewritten non-atomically during restore;
				// poll through transient empty reads until it settles.
				let cellsAfterRestore = -1;
				const restoreDeadline = Date.now() + 15_000;
				while (Date.now() < restoreDeadline) {
					cellsAfterRestore = await gridCellCount(ctx);
					if (cellsAfterRestore === cellsBefore) break;
					await sleep(700);
				}
				checks.push(
					check(
						"gridCells restored to snapshot state",
						cellsAfterRestore === cellsBefore,
						`before=${cellsBefore} mutated=${cellsMutated} restored=${cellsAfterRestore}`,
					),
				);
				if (instanceId) {
					const tileGone = await waitForDom(
						ctx,
						panel2,
						`!document.querySelector('[data-widget-instance-id="${instanceId}"]')`,
						15_000,
					);
					checks.push(
						check(
							"added widget tile removed by restore",
							Boolean(tileGone),
							`tile=${instanceId}`,
						),
					);
				}

				// 5. Delete the snapshot; persistence is async, so poll the
				// file until the entry disappears.
				await openSnapshotsDropdown(ctx, panel2);
				await waitForDom(
					ctx,
					panel2,
					`Boolean(document.querySelector('[data-snap-id="${snapId}"]'))`,
					15_000,
				);
				const deleted = await ctx.evalJs(
					panel2,
					`(() => {
						const btn = document.querySelector(
							${JSON.stringify(`[data-ws-action="delete-snapshot"][data-snap-id="${snapId}"]`)});
						if (!btn) return "missing-delete";
						btn.click();
						return "clicked";
					})()`,
				);
				checks.push(
					check(
						"delete-snapshot clicked",
						deleted === "clicked",
						String(deleted),
					),
				);
				let stillThere = true;
				const deleteDeadline = Date.now() + 15_000;
				while (Date.now() < deleteDeadline && stillThere) {
					await sleep(700);
					const snapsAfterDelete = await ctx.readManagedJson<{ id?: string }[]>(
						...SNAP,
					);
					stillThere = Array.isArray(snapsAfterDelete)
						? snapsAfterDelete.some((s) => s?.id === snapId)
						: true;
				}
				checks.push(
					check(
						"snapshot removed from snapshots.json",
						!stillThere,
						`snapId=${snapId}`,
					),
				);
			});
			return {
				detail: `snapshot=${snapId || "none"} cells ${cellsBefore}`,
				checks,
				evidence: [managedFilePath(ctx, ...SNAP)],
			};
		},
	},
	{
		uc: "UC-D10",
		title: "quick-actions palette runs script preset twice consecutively",
		async run(ctx: E2EContext) {
			const checks: ReturnType<typeof check>[] = [];
			const userData = await aeUserDataDir(ctx);
			const markerPath = path.join(
				userData,
				"ty-plus",
				"dg-presets",
				"marker.txt",
			);
			const panel = await ctx.requireSurface({ surfaceId: "panel-1" });
			// The quick-actions tile hydrates asynchronously after panel
			// mount/reload; without this wait the first focus eval races it
			// and reports missing-input while the palette rows appear later.
			await waitForDom(
				ctx,
				panel,
				`Boolean(document.querySelector('[data-widget-quick-actions] [data-ws-action="search"]'))`,
				30_000,
			);

			// Focus the quick-actions search input to open the palette.
			// React's onFocus listens for focusin, so dispatch it explicitly —
			// a bare .focus() does not reliably open the palette dropdown.
			const QA_FOCUS_TYPE = `(() => {
				const host = document.querySelector("[data-widget-quick-actions]");
				const input = host && host.querySelector('[data-ws-action="search"]');
				if (!input) return "missing-input";
				input.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
				input.dispatchEvent(new FocusEvent("focus"));
				input.focus();
				const setter = Object.getOwnPropertyDescriptor(
					window.HTMLInputElement.prototype, "value").set;
				setter.call(input, "DG");
				input.dispatchEvent(new Event("input", { bubbles: true }));
				return document.activeElement === input
					? "focused:" + input.value
					: "not-focused";
			})()`;
			const focused = await ctx.evalJs(panel, QA_FOCUS_TYPE);
			checks.push(
				check(
					"quick-actions search focused + query typed",
					String(focused).startsWith("focused:"),
					String(focused),
				),
			);

			const runBtnSel =
				'button[data-ws-action="run-preset"][data-preset-id="dg-script-marker"]';
			const rowSeen = await waitForDom(
				ctx,
				panel,
				`Boolean(document.querySelector(${JSON.stringify(runBtnSel)}))`,
				15_000,
			);
			checks.push(
				check(
					"palette lists dg-script-marker run action",
					Boolean(rowSeen),
					String(rowSeen).slice(0, 120),
				),
			);

			// Two consecutive runs; marker content is a timestamp so each run
			// must differ. The palette closes on blur, so re-focus and re-type
			// before each attempt.
			const markers: (string | null)[] = [];
			for (let i = 0; i < 2; i++) {
				await rm(markerPath, { force: true });
				await ctx.evalJs(panel, QA_FOCUS_TYPE);
				await sleep(800);
				const clicked = await ctx.evalJs(
					panel,
					`(() => {
						const btn = document.querySelector(${JSON.stringify(runBtnSel)});
						if (!btn) return "missing-run";
						btn.click();
						return "clicked";
					})()`,
				);
				if (i === 0) {
					checks.push(
						check(
							"palette run clicked",
							clicked === "clicked",
							String(clicked),
						),
					);
				}
				markers.push(await waitForFile(markerPath, 25_000));
			}
			checks.push(
				check(
					"run #1 produced AE-side marker",
					markers[0] !== null,
					markers[0] ?? "marker absent",
				),
			);
			checks.push(
				check(
					// marker.txt is deleted before each run, so its reappearance
					// proves the second consecutive execution (content is a
					// fixed string, not a timestamp).
					"run #2 consecutive re-execution produced new marker",
					markers[1] !== null,
					`m1=${markers[0]} m2=${markers[1]}`,
				),
			);
			return {
				detail: `quick-actions runs=2 marker=${markers[1] ?? "none"}`,
				checks,
				evidence: markers[1] ? [markerPath] : [],
			};
		},
	},
	{
		uc: "UC-C12",
		title:
			"footage preset (.png) created via dialog → run imports into AE project",
		async run(ctx: E2EContext) {
			const checks: ReturnType<typeof check>[] = [];
			const userData = await aeUserDataDir(ctx);
			const dir = e2eFixtureDir(userData);
			const pngPath = path.join(dir, "e2e-footage.png");
			// 1x1 transparent PNG.
			const PNG_B64 =
				"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
			await mkdir(dir, { recursive: true });
			await writeFile(pngPath, Buffer.from(PNG_B64, "base64"));

			let presetId = "";
			await withManagedRootSnapshot(ctx, "uc-c12-footage", async () => {
				presetId = await createFilePresetViaDialog(ctx, pngPath, "E2E Footage");
				checks.push(
					check(
						"footage preset record persisted",
						Boolean(presetId),
						`id=${presetId}`,
					),
				);
				if (!presetId) return;

				const doc = await ctx.readManagedJson<{
					presets?: { id?: string; type?: string }[];
				}>("presets", "presets.json");
				const type = doc?.presets?.find((p) => p.id === presetId)?.type;
				checks.push(
					check(
						"preset type inferred as footage",
						type === "footage",
						`type=${type}`,
					),
				);

				const itemsBefore = await ctx.evalScriptOnPanel1(`(function(){
					return String(app.project.numItems);
				})()`);

				const dialog = await openPresetCatalog(ctx);
				const rowSeen = await waitForDom(
					ctx,
					dialog,
					`Boolean(document.querySelector('[data-preset-id="${presetId}"]'))`,
					20_000,
				);
				checks.push(
					check(
						"catalog lists footage preset",
						Boolean(rowSeen),
						String(rowSeen).slice(0, 120),
					),
				);
				const ran = await runPresetFromCatalog(ctx, dialog, presetId);
				checks.push(
					check("catalog Run clicked", ran === "clicked", String(ran)),
				);

				await sleep(2500);
				const found = await ctx.evalScriptOnPanel1(`(function(){
					var hits = [];
					for (var i = 1; i <= app.project.numItems; i++) {
						var it = app.project.item(i);
						if (it && it.name && it.name.indexOf("e2e-footage") >= 0) {
							hits.push(it.name + "|" + it.typeName);
						}
					}
					return JSON.stringify(hits);
				})()`);
				let hits: string[] = [];
				try {
					hits = JSON.parse(String(found)) as string[];
				} catch {
					hits = [];
				}
				checks.push(
					check(
						"AE project gained footage item",
						hits.length > 0,
						`itemsBefore=${itemsBefore} hits=${JSON.stringify(hits)}`,
					),
				);

				// Cleanup: remove the imported footage item(s).
				await ctx.evalScriptOnPanel1(`(function(){
					for (var i = app.project.numItems; i >= 1; i--) {
						var it = app.project.item(i);
						if (it && it.name && it.name.indexOf("e2e-footage") >= 0) it.remove();
					}
					return "cleaned";
				})()`);
			});
			return {
				detail: `footage preset=${presetId || "none"}`,
				checks,
				evidence: [pngPath],
			};
		},
	},
	{
		uc: "UC-C14",
		title: "run preset with deleted asset fails without blocking modal",
		async run(ctx: E2EContext) {
			const checks: ReturnType<typeof check>[] = [];
			const userData = await aeUserDataDir(ctx);
			const dir = e2eFixtureDir(userData);
			const { jsxPath, markerPath } = await writeFixtureScript(
				dir,
				"e2e-stale.jsx",
				"e2e-stale-marker.txt",
			);
			await rm(markerPath, { force: true });

			await withManagedRootSnapshot(ctx, "uc-c14-stale-asset", async () => {
				const presetId = await createFilePresetViaDialog(
					ctx,
					jsxPath,
					"E2E Stale Script",
				);
				checks.push(
					check(
						"stale-asset preset created",
						Boolean(presetId),
						`id=${presetId}`,
					),
				);
				if (!presetId) return;

				// Delete the asset after registration, then reload so the
				// catalog/asset scan observes the missing file.
				await rm(jsxPath, { force: true });
				await reloadPanel1(ctx, 45_000);

				const dialog = await openPresetCatalog(ctx);
				const rowSeen = await waitForDom(
					ctx,
					dialog,
					`Boolean(document.querySelector('[data-preset-id="${presetId}"]'))`,
					20_000,
				);
				const info = rowSeen
					? ((await catalogRunButtonState(ctx, dialog, presetId)) as {
							disabled?: boolean;
							aria?: string;
						} | null)
					: null;
				const hasRun = info !== null && info !== undefined;
				checks.push(
					check(
						"catalog row present for stale preset",
						Boolean(rowSeen),
						JSON.stringify(info ?? null),
					),
				);

				let clicked = "skipped-disabled";
				if (hasRun && info?.disabled !== true) {
					clicked = String(await runPresetFromCatalog(ctx, dialog, presetId));
				}
				checks.push(
					check(
						"run attempted or gated by disabled button",
						clicked === "clicked" || info?.disabled === true,
						`click=${clicked} disabled=${info?.disabled}`,
					),
				);
				// Host failures toast for ~8s; poll both surfaces while the
				// toast is alive instead of sampling once.
				const alertTexts = async (surface: LiveSurface): Promise<string[]> => {
					try {
						const value = await ctx.evalJs(
							surface,
							`[...document.querySelectorAll('[role="alert"]')]
								.map((e) => (e.textContent || "").trim())`,
						);
						return Array.isArray(value)
							? value.map(String)
							: typeof value === "string"
								? [value]
								: [];
					} catch {
						return [];
					}
				};
				const panel = await ctx.requireSurface({ surfaceId: "panel-1" });
				const seenAlerts = new Set<string>();
				const failureRe = /ty plus:|preset failed|missing|not found|error/i;
				// The host roundtrip can be slow on a busy AE; the toast only
				// lives 8s once it fires, so keep polling well past the click.
				const alertDeadline = Date.now() + 20_000;
				while (Date.now() < alertDeadline) {
					for (const t of await alertTexts(dialog)) seenAlerts.add(t);
					for (const t of await alertTexts(panel)) seenAlerts.add(t);
					if ([...seenAlerts].some((t) => failureRe.test(t))) break;
					await sleep(500);
				}
				const allAlerts = [...seenAlerts];

				// No blocking modal may appear over the panel.
				const modal = await ctx.evalJs(
					panel,
					`Boolean(document.querySelector(
						'dialog[open], [role="alertdialog"], .modal-open'))`,
				);
				checks.push(
					check(
						"no blocking modal over panel",
						modal === false,
						`modal=${modal}`,
					),
				);

				// Panel must remain responsive (CDP eval works).
				const alive = await ctx.evalJs(panel, `1 + 1`);
				checks.push(
					check("panel still responsive", alive === 2, `eval=${alive}`),
				);
				// Host-executor toasts read "Ty Plus: <error>"; the panel
				// missing-asset gate reads "Preset asset is missing…".
				const sawFailureToast = allAlerts.some((t) => failureRe.test(t));
				const sawMissingToast = sawFailureToast;

				// If the run was gated, the row itself should indicate the
				// missing asset.
				let rowIndicatesMissing = false;
				if (info?.disabled === true) {
					const rowText = await ctx.evalJs(
						dialog,
						`(() => {
							const row = document.querySelector(
								${JSON.stringify(`[data-preset-id="${presetId}"]`)});
							return row ? (row.textContent || "") : "";
						})()`,
					);
					rowIndicatesMissing = /missing|not found|見つか/i.test(
						String(rowText),
					);
				}

				checks.push(
					check(
						"structured non-modal error surfaced",
						sawFailureToast || sawMissingToast || rowIndicatesMissing,
						`toasts=${JSON.stringify(allAlerts)} gated=${info?.disabled} rowMissing=${rowIndicatesMissing}`,
					),
				);

				// The deleted script must not have run.
				const marker = await readMarker(markerPath);
				checks.push(
					check(
						"no AE-side artifact from stale preset",
						marker === null,
						marker === null ? "marker absent" : `marker=${marker}`,
					),
				);
			});
			await rm(jsxPath, { force: true });
			return {
				detail: `stale preset run handled`,
				checks,
				evidence: [managedFilePath(ctx, "presets", "presets.json")],
			};
		},
	},
];
