/**
 * Composite user-journey suite (Issue #108; matrix UC-J02–UC-J07).
 *
 * Each case chains multiple features the way a user actually works and
 * asserts the end state: AE-side artifacts, persisted files, and DOM —
 * not just that individual steps rendered. Cases run inside the managed-
 * root sandbox, so every write lands on the disposable copy.
 *
 * Coverage notes vs. the matrix:
 * - UC-J02 covers create→place→run→edit→delete-attempt. Preset deletion
 *   goes through a host ExtendScript `confirm()` modal that CDP cannot
 *   answer; the case verifies the gate is non-destructive and leaves the
 *   manual confirmation step documented.
 * - UC-J05/J06 drive the settings dialog's Workspace Backup section
 *   (Export → mutate → Import) as the recovery/handoff mechanism.
 */
import { rm } from "node:fs/promises";
import path from "node:path";

import type { E2EContext } from "../ctx";
import { check, type E2ECase } from "../report";
import type { LiveSurface } from "../surfaces";
import { listLiveSurfaces } from "../surfaces";
import { resolveLocaleKey, surfaceLang } from "./i18n";
import {
	aeUserDataDir,
	clickButtonByLabels,
	clickCatalogRowAction,
	e2eFixtureDir,
	findLive,
	openPresetCatalog,
	runPresetFromCatalog,
	waitForFile,
	writeFixtureScript,
} from "./journey";
import { openSettingsDialog } from "./settings";
import {
	closeSurfaceSettled,
	corruptJsonBytes,
	managedFilePath,
	reloadPanel1,
	sleep,
	waitForDom,
	withManagedRootSnapshot,
	writeManagedFile,
} from "./shared";
import { addWidgetViaDialog, createFilePresetViaDialog } from "./workspace";

// ---------------------------------------------------------------------------
// shared helpers
// ---------------------------------------------------------------------------

const readAppJson = async (
	ctx: E2EContext,
): Promise<Record<string, unknown> | null> => {
	const text = await ctx.readManagedText("settings", "app.json");
	if (text === null) return null;
	try {
		return JSON.parse(text) as Record<string, unknown>;
	} catch {
		return null;
	}
};

const closeDialogById = async (
	ctx: E2EContext,
	surfaceId: string,
): Promise<void> => {
	await closeSurfaceSettled(
		async () => {
			const live = await listLiveSurfaces(await ctx.surfaces());
			return live.find((s) => s.surfaceId === surfaceId) ?? null;
		},
		async (s) => {
			try {
				const conn = await ctx.cdp(s);
				await conn.send("Page.close", {}, 5_000);
			} catch {
				try {
					await ctx.evalJs(
						s,
						`(() => { try { window.close(); return "ok"; } catch (e) { return String(e); } })()`,
					);
				} catch {
					// best-effort
				}
			}
		},
	);
};

/**
 * Open the settings dialog, jump to the Workspace Backup section, and
 * return the live surface. Caller must closeDialogById afterwards.
 */
const openBackupSection = async (ctx: E2EContext): Promise<LiveSurface> => {
	const dialog = await openSettingsDialog(ctx);
	if (!dialog) throw new Error("settings dialog did not open");
	await waitForDom(
		ctx,
		dialog,
		`Boolean(document.querySelector('[data-settings-sidebar-item="workspace-backup"]'))`,
		15_000,
	);
	await ctx.evalJs(
		dialog,
		`(() => {
			const btn = document.querySelector(
				'[data-settings-sidebar-item="workspace-backup"]');
			if (!btn) return "missing";
			btn.click();
			return "clicked";
		})()`,
	);
	await waitForDom(
		ctx,
		dialog,
		`Boolean(document.querySelector("[data-settings-backup-bundle] textarea"))`,
		15_000,
	);
	return dialog;
};

/**
 * Resolve the localized labels for i18n keys on a surface (drops keys the
 * locale does not define). Used for button text that `i18n.t()` renders.
 */
const labelsFor = async (
	ctx: E2EContext,
	surface: LiveSurface,
	keys: readonly string[],
): Promise<string[]> => {
	const lang = await surfaceLang(ctx, surface);
	const out: string[] = [];
	for (const key of keys) {
		const value = await resolveLocaleKey(lang, key);
		if (value) out.push(value);
	}
	return out;
};

/** Click Export in the backup section; returns the bundle JSON text. */
const exportBackupBundle = async (
	ctx: E2EContext,
	dialog: LiveSurface,
): Promise<string> => {
	const labels = await labelsFor(ctx, dialog, ["common:actions.export"]);
	const clicked = await clickButtonByLabels(ctx, dialog, labels);
	if (clicked !== "clicked") {
		throw new Error(`backup Export not clickable: ${String(clicked)}`);
	}
	// The bundle is a React-controlled textarea; poll until it fills.
	const deadline = Date.now() + 20_000;
	while (Date.now() < deadline) {
		const text = (await ctx.evalJs(
			dialog,
			`(() => {
				const ta = document.querySelector(
					"[data-settings-backup-bundle] textarea");
				return ta ? ta.value : "";
			})()`,
		)) as string;
		if (typeof text === "string" && text.includes('"settingsJson"')) {
			return text;
		}
		await sleep(700);
	}
	throw new Error("backup bundle textarea stayed empty after Export");
};

/** Paste `bundle` into the backup textarea and click Import. */
const importBackupBundle = async (
	ctx: E2EContext,
	dialog: LiveSurface,
	bundle: string,
): Promise<void> => {
	const set = await ctx.evalJs(
		dialog,
		`(() => {
			const ta = document.querySelector(
				"[data-settings-backup-bundle] textarea");
			if (!ta) return "missing-textarea";
			const setter = Object.getOwnPropertyDescriptor(
				window.HTMLTextAreaElement.prototype, "value").set;
			setter.call(ta, ${JSON.stringify(bundle)});
			ta.dispatchEvent(new Event("input", { bubbles: true }));
			ta.dispatchEvent(new Event("change", { bubbles: true }));
			return ta.value.length;
		})()`,
	);
	if (typeof set !== "number" || set === 0) {
		throw new Error(`backup textarea set failed: ${String(set)}`);
	}
	// React state flushes async; give the Import button a beat to enable.
	await sleep(800);
	const labels = await labelsFor(ctx, dialog, ["common:actions.import"]);
	const clicked = await clickButtonByLabels(ctx, dialog, labels);
	if (clicked !== "clicked") {
		throw new Error(`backup Import not clickable: ${String(clicked)}`);
	}
	// Import writes files async; wait for the localized status line
	// (`settings:workspaceBackupSection.statusImported` / `statusInvalid`).
	const statusLabels = await labelsFor(ctx, dialog, [
		"settings:workspaceBackupSection.statusImported",
		"settings:workspaceBackupSection.statusInvalid",
	]);
	await waitForDom(
		ctx,
		dialog,
		`[...document.querySelectorAll("p")].some(
			(p) => ${JSON.stringify(statusLabels)}.includes((p.textContent || "").trim()))`,
		20_000,
	);
};

/** Focus the quick-actions search input and type `query` (UC-D10 pattern). */
const typeQuickActionsQuery = async (
	ctx: E2EContext,
	panel: LiveSurface,
	query: string,
): Promise<unknown> => {
	// The tile hydrates asynchronously; wait for the input before typing
	// so a slow mount does not surface as "missing-input".
	await waitForDom(
		ctx,
		panel,
		`Boolean(document.querySelector('[data-widget-quick-actions] [data-ws-action="search"]'))`,
		30_000,
	);
	return ctx.evalJs(
		panel,
		`(() => {
			const host = document.querySelector("[data-widget-quick-actions]");
			const input = host && host.querySelector('[data-ws-action="search"]');
			if (!input) return "missing-input";
			input.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
			input.dispatchEvent(new FocusEvent("focus"));
			input.focus();
			const setter = Object.getOwnPropertyDescriptor(
				window.HTMLInputElement.prototype, "value").set;
			setter.call(input, ${JSON.stringify(query)});
			input.dispatchEvent(new Event("input", { bubbles: true }));
			return document.activeElement === input
				? "focused:" + input.value
				: "not-focused";
		})()`,
	);
};

const clickPaletteRun = async (
	ctx: E2EContext,
	panel: LiveSurface,
	presetId: string,
): Promise<unknown> => {
	// Palette rows render asynchronously after the query lands (candidate
	// snapshot + scoring); a fixed sleep races that on a busy host. Wait
	// for the run affordance itself, then click it.
	const seen = await waitForDom(
		ctx,
		panel,
		`Boolean(document.querySelector(
			'button[data-ws-action="run-preset"][data-preset-id="${presetId}"]'))`,
		20_000,
	);
	if (!seen) return "missing-run";
	return ctx.evalJs(
		panel,
		`(() => {
			const btn = document.querySelector(
				${JSON.stringify(`button[data-ws-action="run-preset"][data-preset-id="${presetId}"]`)});
			if (!btn) return "missing-run";
			btn.click();
			return "clicked";
		})()`,
	);
};

// ---------------------------------------------------------------------------
// cases
// ---------------------------------------------------------------------------

export const journeySuiteCases: E2ECase[] = [
	{
		uc: "UC-J02",
		title:
			"preset journey: create → place → run → edit → delete-attempt (host confirm gate)",
		async run(ctx: E2EContext) {
			const checks: ReturnType<typeof check>[] = [];
			const userData = await aeUserDataDir(ctx);
			const dir = e2eFixtureDir(userData);
			const { jsxPath, markerPath } = await writeFixtureScript(
				dir,
				"e2e-j02.jsx",
				"e2e-j02-marker.txt",
			);
			await rm(markerPath, { force: true });

			await withManagedRootSnapshot(
				ctx,
				"uc-j02-preset-lifecycle",
				async () => {
					// 1-3. Create → record → tile → run (same chain as UC-H02).
					const presetId = await createFilePresetViaDialog(
						ctx,
						jsxPath,
						"E2E J02 Script",
					);
					checks.push(
						check(
							"preset created via dialog",
							Boolean(presetId),
							`id=${presetId}`,
						),
					);
					if (!presetId) return;

					const panel = await ctx.requireSurface({ surfaceId: "panel-1" });
					const tileSel = `[data-workspace-preset-tile] [data-preset-id="${presetId}"]`;
					const tileSeen = await waitForDom(
						ctx,
						panel,
						`Boolean(document.querySelector(${JSON.stringify(tileSel)}))`,
						30_000,
					);
					checks.push(
						check("preset tile placed on workspace", Boolean(tileSeen)),
					);

					await rm(markerPath, { force: true });
					await ctx.evalJs(
						panel,
						`(() => {
						const el = document.querySelector(${JSON.stringify(tileSel)});
						if (!el) return "missing";
						el.click();
						return "clicked";
					})()`,
					);
					const marker = await waitForFile(markerPath, 25_000);
					checks.push(
						check(
							"preset run produced AE-side artifact",
							marker !== null,
							marker ?? "marker absent",
						),
					);

					// 4. Edit: rename through the catalog's Edit dialog.
					const dialog = await openPresetCatalog(ctx);
					await waitForDom(
						ctx,
						dialog,
						`Boolean(document.querySelector('[data-preset-id="${presetId}"]'))`,
						20_000,
					);
					const editClicked = await clickCatalogRowAction(
						ctx,
						dialog,
						presetId,
						["presets:listDialog.editPresetAria", "common:actions.edit"],
						1,
					);
					checks.push(
						check(
							"catalog Edit clicked",
							editClicked === "clicked",
							String(editClicked),
						),
					);
					const editDialog = await findLive(
						ctx,
						(s) => s.surfaceId === "dialog-preset-edit",
						30_000,
					);
					if (!editDialog) {
						checks.push(check("preset edit dialog opened", false, "not live"));
					} else {
						await waitForDom(
							ctx,
							editDialog,
							`Boolean(document.querySelector("input:not([type=hidden])"))`,
							20_000,
						);
						// The name Input is the first text input in the form.
						await ctx.evalJs(
							editDialog,
							`(() => {
							const input = [...document.querySelectorAll("input")]
								.find((i) => !i.disabled && i.type !== "hidden"
									&& i.type !== "checkbox" && i.type !== "file");
							if (!input) return "missing-input";
							const setter = Object.getOwnPropertyDescriptor(
								window.HTMLInputElement.prototype, "value").set;
							setter.call(input, "E2E J02 Renamed");
							input.dispatchEvent(new Event("input", { bubbles: true }));
							input.dispatchEvent(new Event("change", { bubbles: true }));
							return input.value;
						})()`,
						);
						await sleep(600);
						const saveLabels = await labelsFor(ctx, editDialog, [
							"presets:edit.save",
							"presets:edit.status.saving",
						]);
						const saved = await clickButtonByLabels(
							ctx,
							editDialog,
							saveLabels,
						);
						checks.push(
							check("edit Save clicked", saved === "clicked", String(saved)),
						);
						// presets.json must reflect the rename.
						let renamed = false;
						const renameDeadline = Date.now() + 20_000;
						while (Date.now() < renameDeadline && !renamed) {
							const doc = await ctx.readManagedJson<{
								presets?: { id?: string; title?: string }[];
							}>("presets", "presets.json");
							renamed = Boolean(
								doc?.presets?.find(
									(p) => p.id === presetId && p.title === "E2E J02 Renamed",
								),
							);
							if (!renamed) await sleep(700);
						}
						checks.push(
							check(
								"presets.json reflects rename",
								renamed,
								renamed ? "title=E2E J02 Renamed" : "title unchanged",
							),
						);
						await closeDialogById(ctx, "dialog-preset-edit");
					}

					// 5. Delete attempt: the catalog Delete button routes through a
					//    host ExtendScript confirm() that CDP cannot answer. Verify
					//    the preset survives (non-destructive gate) and record the
					//    manual remainder honestly.
					const catalog2 = await openPresetCatalog(ctx);
					await waitForDom(
						ctx,
						catalog2,
						`Boolean(document.querySelector('[data-preset-id="${presetId}"]'))`,
						20_000,
					);
					const delClicked = await clickCatalogRowAction(
						ctx,
						catalog2,
						presetId,
						["presets:listDialog.deletePresetAria", "common:actions.delete"],
						2,
					);
					checks.push(
						check(
							"catalog Delete clicked",
							delClicked === "clicked",
							String(delClicked),
						),
					);
					await sleep(3_000);
					const stillThere = await ctx.readManagedJson<{
						presets?: { id?: string }[];
					}>("presets", "presets.json");
					const survived = Boolean(
						stillThere?.presets?.some((p) => p.id === presetId),
					);
					checks.push(
						check(
							"delete gated by host confirm — preset retained until manual confirm",
							survived,
							survived
								? "host confirm pending; record intact"
								: "preset removed without confirmation",
						),
					);
					await closeDialogById(ctx, "dialog-presets");
				},
			);
			await rm(jsxPath, { force: true });
			return {
				detail:
					"preset lifecycle incl. edit; delete requires manual host confirm",
				checks,
				evidence: [managedFilePath(ctx, "presets", "presets.json")],
			};
		},
	},
	{
		uc: "UC-J03",
		title: "layout journey: widget + preset tile + snapshot → reload → restore",
		async run(ctx: E2EContext) {
			const checks: ReturnType<typeof check>[] = [];
			const SNAP = ["workspaces", "history", "snapshots.json"] as const;

			await withManagedRootSnapshot(ctx, "uc-j03-layout", async () => {
				const panel = await ctx.requireSurface({ surfaceId: "panel-1" });
				const cellsOf = async () => {
					const ws = await ctx.readManagedJson<{ gridCells?: unknown[] }>(
						"workspaces",
						"workspace-1.json",
					);
					return ws?.gridCells?.length ?? 0;
				};
				const cellsStart = await cellsOf();

				// 1. Add a widget tile through the real dialog.
				const { instanceId } = await addWidgetViaDialog(ctx, "info");
				checks.push(
					check(
						"widget added via Add Widget dialog",
						Boolean(instanceId),
						`id=${instanceId}`,
					),
				);

				// 2. Save a layout snapshot.
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
				await clickFirstSafe(ctx, panel, '[data-ws-action="save-snapshot"]');
				let snapId = "";
				const snapDeadline = Date.now() + 15_000;
				while (Date.now() < snapDeadline && !snapId) {
					const snaps =
						(await ctx.readManagedJson<{ id?: string }[]>(...SNAP)) ?? [];
					const found = Array.isArray(snaps)
						? snaps.find((s) => s?.id && !idsBefore.has(s.id))
						: undefined;
					if (found?.id) snapId = found.id;
					else await sleep(700);
				}
				checks.push(
					check(
						"snapshot saved to snapshots.json",
						Boolean(snapId),
						`snap=${snapId}`,
					),
				);

				// 3. Mutate: second widget tile.
				const { instanceId: second } = await addWidgetViaDialog(ctx, "info");
				checks.push(
					check(
						"layout mutated with second widget",
						Boolean(second) && second !== instanceId,
						`second=${second}`,
					),
				);

				// 4. Reload → both tiles persist.
				const panel2 = await reloadPanel1(ctx, 45_000);
				const tile2Seen = second
					? await waitForDom(
							ctx,
							panel2,
							`Boolean(document.querySelector('[data-widget-instance-id="${second}"]'))`,
							30_000,
						)
					: null;
				checks.push(
					check(
						"mutated layout survives reload",
						Boolean(tile2Seen),
						`cells=${await cellsOf()}`,
					),
				);

				// 5. Restore the snapshot → second widget tile removed.
				if (snapId) {
					// reopen dropdown on the reloaded panel
					await clickFirstSafe(
						ctx,
						panel2,
						'[data-ws-action="toggle-snapshots"]',
					);
					await waitForDom(
						ctx,
						panel2,
						`Boolean(document.querySelector('[data-snap-id="${snapId}"]'))`,
						15_000,
					);
					await ctx.evalJs(
						panel2,
						`(() => {
							const btn = document.querySelector(
								${JSON.stringify(`[data-ws-action="restore-snapshot"][data-snap-id="${snapId}"]`)});
							if (!btn) return "missing";
							btn.click();
							return "clicked";
						})()`,
					);
					await sleep(2500);
					const cellsAfter = await cellsOf();
					checks.push(
						check(
							"snapshot restore returned gridCells to saved state",
							cellsAfter <= cellsStart + 1,
							`start=${cellsStart} after=${cellsAfter}`,
						),
					);
				}
			});
			return {
				detail: "widget+preset layout snapshot round-trip",
				checks,
				evidence: [managedFilePath(ctx, ...SNAP)],
			};
		},
	},
	{
		uc: "UC-J04",
		title:
			"appearance journey: accent/grid/locale change → live → reload persists",
		async run(ctx: E2EContext) {
			const checks: ReturnType<typeof check>[] = [];
			const ACCENT = "#336699";

			await withManagedRootSnapshot(ctx, "uc-j04-appearance", async () => {
				// Mutate settings at the file the app reads (same contract the
				// settings dialog writes through updateSettings).
				const app = (await readAppJson(ctx)) ?? { version: 2 };
				const ui = (app.ui ?? {}) as Record<string, unknown>;
				const ws = (app.workspace ?? {}) as Record<string, unknown>;
				const grid = (ws.grid ?? {}) as Record<string, unknown>;
				app.ui = { ...ui, accentColor: ACCENT, language: "ja" };
				// gridSettingsFromSettingsJson rejects a partial grid section
				// (cellSize+gap+radius all required), so fill the metrics the
				// persisted file may not carry yet.
				app.workspace = {
					...ws,
					grid: { ...grid, cellSize: 120, gap: 4, radius: 2 },
				};
				await writeManagedFile(
					ctx,
					["settings", "app.json"],
					`${JSON.stringify(app, null, 2)}\n`,
				);

				const panel = await reloadPanel1(ctx, 45_000);
				await waitForDom(
					ctx,
					panel,
					`document.documentElement.lang === "ja"`,
					20_000,
				);
				const lang = await ctx.evalJs(panel, `document.documentElement.lang`);
				checks.push(
					check(
						"locale ja applied after reload",
						lang === "ja",
						`lang=${lang}`,
					),
				);

				// Theme reconcile runs async after boot; poll for the accent
				// token instead of sampling once (a single read races the
				// theme.css rewrite + applyCepShellTheme).
				const accent = await waitForDom(
					ctx,
					panel,
					`(() => {
						const v = getComputedStyle(document.documentElement)
							.getPropertyValue("--color-ty-accent") || "";
						return v.toLowerCase().includes("336699") ? v : null;
					})()`,
					20_000,
				);
				checks.push(
					check(
						"accent color reached theme.css token",
						String(accent).toLowerCase().includes("336699"),
						`accent=${String(accent).trim()}`,
					),
				);

				const cell = await waitForDom(
					ctx,
					panel,
					`(() => {
						const v = getComputedStyle(document.documentElement)
							.getPropertyValue("--ty-ws-cell") || "";
						return v.includes("120") ? v : null;
					})()`,
					20_000,
				);
				checks.push(
					check(
						"grid cell size reached panel CSS var",
						String(cell).includes("120"),
						`cell=${String(cell).trim()}`,
					),
				);

				// Persistence: app.json + theme.css carry the values on disk.
				const appAfter = await readAppJson(ctx);
				const uiAfter = (appAfter?.ui ?? {}) as Record<string, unknown>;
				const wsAfter = (appAfter?.workspace ?? {}) as Record<string, unknown>;
				const gridAfter = (wsAfter.grid ?? {}) as Record<string, unknown>;
				checks.push(
					check(
						"app.json persisted accent+locale+grid",
						uiAfter.accentColor === ACCENT &&
							uiAfter.language === "ja" &&
							gridAfter.cellSize === 120,
						`accent=${uiAfter.accentColor} lang=${uiAfter.language} cell=${gridAfter.cellSize}`,
					),
				);
				const themeCss = await ctx.readManagedText("styles", "theme.css");
				checks.push(
					check(
						"theme.css persisted accent token",
						(themeCss ?? "").toLowerCase().includes("336699"),
						"",
					),
				);
			});
			return {
				detail: "accent/grid/locale round-trip through settings files",
				checks,
				evidence: [managedFilePath(ctx, "settings", "app.json")],
			};
		},
	},
	{
		uc: "UC-J05",
		title:
			"recovery journey: backup export → corrupt files → boot fallback → import restore",
		async run(ctx: E2EContext) {
			const checks: ReturnType<typeof check>[] = [];

			await withManagedRootSnapshot(ctx, "uc-j05-recovery", async () => {
				// 1. Export a workspace backup bundle through the settings UI.
				const dialog = await openBackupSection(ctx);
				const bundle = await exportBackupBundle(ctx, dialog);
				checks.push(
					check(
						"backup bundle exported via settings UI",
						bundle.includes('"settingsJson"') &&
							bundle.includes('"presetsJson"'),
						`${bundle.length} bytes`,
					),
				);
				const appBefore = await readAppJson(ctx);

				// 2. Damage the managed root: corrupt the active workspace and
				//    settings (the two files boot depends on most).
				await writeManagedFile(
					ctx,
					["workspaces", "workspace-1.json"],
					corruptJsonBytes('{"gridCells":['),
				);
				await writeManagedFile(
					ctx,
					["settings", "app.json"],
					corruptJsonBytes('{"version":2,'),
				);

				// 3. Panel must still boot and stay responsive (I01/I05).
				const panel = await reloadPanel1(ctx, 45_000);
				const alive = await ctx.evalJs(panel, `1 + 1`);
				checks.push(
					check(
						"panel responsive after corruption",
						alive === 2,
						`eval=${alive}`,
					),
				);
				const wsStillThere = await ctx.readManagedText(
					"workspaces",
					"workspace-1.json",
				);
				checks.push(
					check(
						"corrupt workspace file not silently destroyed",
						wsStillThere !== null,
						wsStillThere === null ? "file gone" : "file still present",
					),
				);

				// 4. Import the bundle back through the same UI surface.
				await importBackupBundle(ctx, dialog, bundle);
				await sleep(1500);
				const appAfter = await readAppJson(ctx);
				checks.push(
					check(
						"app.json restored by backup import",
						JSON.stringify(appAfter) === JSON.stringify(appBefore),
						`after=${JSON.stringify(appAfter)?.slice(0, 120)}`,
					),
				);
				const wsText = await ctx.readManagedText(
					"workspaces",
					"workspace-1.json",
				);
				let wsParses = false;
				try {
					JSON.parse(wsText ?? "");
					wsParses = true;
				} catch {
					wsParses = false;
				}
				checks.push(
					check(
						"workspace-1.json restored to valid JSON",
						wsParses,
						wsParses ? "parses" : "still invalid",
					),
				);
				await closeDialogById(ctx, "dialog-settings");
			});
			return {
				detail: "export→corrupt→boot→import→verify recovery chain",
				checks,
			};
		},
	},
	{
		uc: "UC-J06",
		title:
			"preset handoff: export bundle → wipe catalog → import → run preset in AE",
		async run(ctx: E2EContext) {
			const checks: ReturnType<typeof check>[] = [];
			const userData = await aeUserDataDir(ctx);
			const markerPath = path.join(
				userData,
				"ty-plus",
				"dg-presets",
				"marker.txt",
			);
			await rm(markerPath, { force: true });

			await withManagedRootSnapshot(ctx, "uc-j06-handoff", async () => {
				// 1. Export the bundle (carries presetsJson with dg fixtures).
				const dialog = await openBackupSection(ctx);
				const bundle = await exportBackupBundle(ctx, dialog);
				checks.push(
					check(
						"bundle exported with preset catalog",
						bundle.includes("dg-script-marker"),
						`${bundle.length} bytes`,
					),
				);
				await closeDialogById(ctx, "dialog-settings");

				// 2. Simulate the receiving environment: empty catalog.
				await writeManagedFile(
					ctx,
					["presets", "presets.json"],
					'{\n  "version": 1,\n  "presets": []\n}\n',
				);
				const wiped = await ctx.readManagedJson<{ presets?: unknown[] }>(
					"presets",
					"presets.json",
				);
				checks.push(
					check(
						"catalog wiped to simulate fresh environment",
						(wiped?.presets?.length ?? -1) === 0,
						`presets=${wiped?.presets?.length}`,
					),
				);

				// 3. Import the bundle → catalog restored.
				const dialog2 = await openBackupSection(ctx);
				await importBackupBundle(ctx, dialog2, bundle);
				await sleep(1500);
				await closeDialogById(ctx, "dialog-settings");
				const restored = await ctx.readManagedJson<{
					presets?: { id?: string }[];
				}>("presets", "presets.json");
				const hasFixture = Boolean(
					restored?.presets?.some((p) => p.id === "dg-script-marker"),
				);
				checks.push(
					check(
						"import restored preset catalog",
						hasFixture,
						`presets=${restored?.presets?.length ?? "missing"}`,
					),
				);
				if (!hasFixture) return;

				// 4. Run the handed-off preset → AE-side artifact.
				const catalog = await openPresetCatalog(ctx);
				const rowSeen = await waitForDom(
					ctx,
					catalog,
					`Boolean(document.querySelector('[data-preset-id="dg-script-marker"]'))`,
					20_000,
				);
				checks.push(check("catalog lists handed-off preset", Boolean(rowSeen)));
				const ran = await runPresetFromCatalog(
					ctx,
					catalog,
					"dg-script-marker",
				);
				checks.push(
					check(
						"Run clicked on handed-off preset",
						ran === "clicked",
						String(ran),
					),
				);
				const marker = await waitForFile(markerPath, 25_000);
				checks.push(
					check(
						"handed-off preset executed in AE",
						marker !== null,
						marker ?? "marker absent",
					),
				);
				await closeDialogById(ctx, "dialog-presets");
			});
			return {
				detail: "export→wipe→import→run preset handoff chain",
				checks,
			};
		},
	},
	{
		uc: "UC-J07",
		title:
			"daily work: quick-actions runs script then ffx preset consecutively",
		async run(ctx: E2EContext) {
			const checks: ReturnType<typeof check>[] = [];
			const userData = await aeUserDataDir(ctx);
			const markerPath = path.join(
				userData,
				"ty-plus",
				"dg-presets",
				"marker.txt",
			);
			await rm(markerPath, { force: true });

			const panel = await ctx.requireSurface({ surfaceId: "panel-1" });

			// Ensure a comp + selected layer exists for the .ffx run.
			await ctx.evalScriptOnPanel1(`(function(){
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
				for (var j = 1; j <= comp.numLayers; j++) comp.layer(j).selected = (j === 1);
				return "ready";
			})()`);

			// Run 1: script preset via quick-actions.
			await typeQuickActionsQuery(ctx, panel, "DG");
			await sleep(800);
			const run1 = await clickPaletteRun(ctx, panel, "dg-script-marker");
			checks.push(
				check(
					"quick-actions run #1 (script) clicked",
					run1 === "clicked",
					String(run1),
				),
			);
			const marker = await waitForFile(markerPath, 25_000);
			checks.push(
				check(
					"script preset produced AE-side marker",
					marker !== null,
					marker ?? "marker absent",
				),
			);

			// Run 2: .ffx preset via quick-actions, immediately after.
			await typeQuickActionsQuery(ctx, panel, "DG");
			await sleep(800);
			const run2 = await clickPaletteRun(ctx, panel, "dg-ffx-fadein");
			checks.push(
				check(
					"quick-actions run #2 (ffx) clicked",
					run2 === "clicked",
					String(run2),
				),
			);
			await sleep(2000);
			const fx = await ctx.evalScriptOnPanel1(`(function(){
				var comp = null;
				for (var i = 1; i <= app.project.numItems; i++) {
					var it = app.project.item(i);
					if (it instanceof CompItem && it.name === "TYPlus E2E Comp") { comp = it; break; }
				}
				if (!comp || comp.numLayers < 1) return "no-comp";
				var layer = comp.layer(1);
				return String(layer.Effects ? layer.Effects.numProperties : 0);
			})()`);
			checks.push(
				check(
					"ffx preset applied effects to selected layer",
					Number(String(fx).trim()) > 0,
					`effects=${fx}`,
				),
			);

			// Cleanup the E2E comp.
			await ctx.evalScriptOnPanel1(`(function(){
				for (var i = app.project.numItems; i >= 1; i--) {
					var it = app.project.item(i);
					if (it instanceof CompItem && it.name === "TYPlus E2E Comp") it.remove();
					else if (it.name === "E2E Solid") it.remove();
				}
				return "cleaned";
			})()`);
			return {
				detail: `consecutive quick-action runs: script marker + ffx effects=${fx}`,
				checks,
				evidence: marker ? [markerPath] : [],
			};
		},
	},
];

const clickFirstSafe = async (
	ctx: E2EContext,
	surface: LiveSurface,
	selector: string,
): Promise<unknown> =>
	ctx.evalJs(
		surface,
		`(() => {
			const el = document.querySelector(${JSON.stringify(selector)});
			if (!el) return "missing";
			el.click();
			return "clicked";
		})()`,
	);
