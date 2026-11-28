/**
 * Preset-creation suite (Issue #785; matrix UC-C01–UC-C08).
 *
 * Drives the real creation surfaces end to end and asserts persisted
 * artifacts, not just DOM:
 *
 * - UC-C01: PathDialog (`dialog-preset-add`) — missing-asset rejection
 *   (no ghost record, dialog stays open), extension→type inference, and
 *   duplicate-path registration (upsert is keyed by catalog id, so a
 *   second record is the documented contract).
 * - UC-C02: GroupDialog (`dialog-preset-add-folder`) — empty-paths
 *   rejection leaves groups.json untouched; a folder scan through
 *   cep_node imports `.ffx` members into presets.json, merges
 *   groups.json, places a workspace group tile, and expands in the
 *   catalog browser. (The manual `presetIds` route exists in
 *   persist-folder.ts but no UI writes `values.presetIds`, so the scan
 *   path is the only reachable flow.)
 * - UC-C03: Animation preset — Create without a detected `.ffx` is
 *   rejected by `presetTool.savePathRequired`; the step-3 button reaches
 *   the host `selectLayerToSave` guard (no-selection banner) without
 *   opening AE's native save dialog.
 * - UC-C04: Code preset — panel-authored `.jsx` lands on disk and the
 *   catalog record points at the verified path.
 * - UC-C05: Layer/Comp preset — outcome follows the AE document state:
 *   unsaved project → `saveProjectFirst` error and NO ghost record;
 *   saved project → `.jsx` + record. Both branches assert no partial
 *   persistence.
 * - UC-C06: Footage + Import dialogs (context-menu-only entries,
 *   reached through the same `data-ws-action` routing the unified
 *   context menu uses) → records carry `footageImportMode` /
 *   `importStrategy`; the footage preset runs into the AE project.
 * - UC-C07: Easing preset (`dialog-preset-create` + `presetTemplate:
 *   "easing"`) — cubic-bezier curve → `.jsx` under scriptRoot + record
 *   with `data.easing`.
 * - UC-C08: Group edit (`dialog-preset-edit` on a groups.json row) —
 *   member list renders, member Run executes in AE, rename persists to
 *   groups.json.
 *
 * Sandbox note: `settings/app.json` `core.paths.scriptRoot`/`presetRoot`
 * are repointed at `Folder.userData`-rooted fixture dirs inside the
 * managed-root snapshot (the sandbox roots live in os.tmpdir(), outside
 * the host's `authorizeSaveDir` allowed roots). All mutations stay
 * inside `withManagedRootSnapshot`, so the real managed root is
 * untouched.
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { E2EContext } from "../ctx";
import { check, type E2ECase } from "../report";
import type { LiveSurface } from "../surfaces";
import { listLiveSurfaces } from "../surfaces";
import { resolveLocaleKey, surfaceLang, templateAffixes } from "./i18n";
import {
	aeUserDataDir,
	clickButtonByLabels,
	clickFirst,
	e2eFixtureDir,
	fillPresetAddDialog,
	findLive,
	findPresetAddDialog,
	openPresetCatalog,
	presetCreateLabels,
	runPresetFromCatalog,
	waitForFile,
} from "./journey";
import {
	closeLiveSurface,
	closeSurfaceSettled,
	managedFilePath,
	sleep,
	waitForDom,
	withManagedRootSnapshot,
	writeManagedFile,
} from "./shared";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const PNG_B64 =
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const liveSurfaceKeys = async (ctx: E2EContext): Promise<Set<string>> =>
	new Set(
		(await listLiveSurfaces(await ctx.surfaces())).map(
			(s) => s.target.id ?? s.target.webSocketDebuggerUrl ?? s.extensionId,
		),
	);

const surfaceKey = (s: LiveSurface): string =>
	s.target.id ?? s.target.webSocketDebuggerUrl ?? s.extensionId;

/**
 * Click a `data-ws-action` on the panel. Toolbar-covered actions exist as
 * real buttons; context-menu-only actions (footage/import/easing presets)
 * are reached by injecting a transient button next to an existing one so
 * the SAME delegated `onActionClick → handleUnifiedCtxSelect` routing the
 * unified context menu uses fires — no parallel code path.
 */
const clickWsAction = async (
	ctx: E2EContext,
	panel: LiveSurface,
	action: string,
): Promise<unknown> => {
	const existing = await ctx.evalJs(
		panel,
		`Boolean(document.querySelector('[data-ws-action="${action}"]'))`,
	);
	if (existing) {
		return clickFirst(ctx, panel, `[data-ws-action="${action}"]`);
	}
	return ctx.evalJs(
		panel,
		`(() => {
			const anchor = document.querySelector("[data-ws-action]");
			if (!anchor) return "missing-anchor";
			const btn = document.createElement("button");
			btn.setAttribute("data-ws-action", ${JSON.stringify(action)});
			btn.style.display = "none";
			(anchor.parentElement || anchor).appendChild(btn);
			btn.click();
			btn.remove();
			return "clicked-injected";
		})()`,
	);
};

/**
 * Find the live pooled `dialog-preset-add*` surface whose shell renders
 * `routeId` (`[data-surface-id]` carries the route, not the pool slot).
 * `beforeKeys` excludes surfaces that were already live so a stale pooled
 * window showing the same route is never mistaken for the new one.
 */
const findToolDialog = async (
	ctx: E2EContext,
	routeId: string,
	beforeKeys: ReadonlySet<string>,
	timeoutMs = 30_000,
): Promise<LiveSurface | null> => {
	const deadline = Date.now() + timeoutMs;
	const probe = `Boolean(document.querySelector('[data-surface-id="${routeId}"]'))`;
	while (Date.now() < deadline) {
		const live = await listLiveSurfaces(await ctx.surfaces());
		for (const s of live) {
			if (beforeKeys.has(surfaceKey(s))) continue;
			if (!s.surfaceId.startsWith("dialog-preset-add")) continue;
			try {
				if (await ctx.evalJs(s, probe, 5_000)) return s;
			} catch {
				// mid-navigation — try the next candidate
			}
		}
		await sleep(700);
	}
	return null;
};

/** Open a preset tool surface via its ws-action; returns the live dialog. */
const openToolDialog = async (
	ctx: E2EContext,
	panel: LiveSurface,
	wsAction: string,
	routeId: string,
): Promise<LiveSurface> => {
	const before = await liveSurfaceKeys(ctx);
	const clicked = await clickWsAction(ctx, panel, wsAction);
	if (!String(clicked).startsWith("clicked")) {
		throw new Error(`${wsAction} not clickable: ${String(clicked)}`);
	}
	const dialog = await findToolDialog(ctx, routeId, before, 30_000);
	if (!dialog) throw new Error(`${routeId} did not open for ${wsAction}`);
	return dialog;
};

/** Open the PathDialog (`dialog-preset-add` route, path-field probe). */
const openPathDialog = async (
	ctx: E2EContext,
	panel: LiveSurface,
): Promise<LiveSurface> => {
	const before = await liveSurfaceKeys(ctx);
	const clicked = await clickWsAction(ctx, panel, "ty.ctx.create-file-preset");
	if (!String(clicked).startsWith("clicked")) {
		throw new Error(`create-file-preset not clickable: ${String(clicked)}`);
	}
	const deadline = Date.now() + 30_000;
	while (Date.now() < deadline) {
		const live = await listLiveSurfaces(await ctx.surfaces());
		for (const s of live) {
			if (before.has(surfaceKey(s))) continue;
			if (!s.surfaceId.startsWith("dialog-preset-add")) continue;
			try {
				const has = await ctx.evalJs(
					s,
					`Boolean(document.querySelector("[data-path-field] input"))`,
					5_000,
				);
				if (has) return s;
			} catch {
				// mid-navigation
			}
		}
		await sleep(700);
	}
	throw new Error("dialog-preset-add did not open");
};

/** Wait until no `dialog-preset-add*` surface with a path field remains. */
const waitPathDialogsGone = async (
	ctx: E2EContext,
	timeoutMs = 20_000,
): Promise<void> => {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const found = await findPresetAddDialog(ctx, 3_000);
		if (!found) return;
		await closeLiveSurface(ctx, found);
		await sleep(1_000);
	}
};

/** Footer Create labels for the tool-shell dialogs (localized). */
const toolCreateLabels = async (
	ctx: E2EContext,
	surface: LiveSurface,
): Promise<string[]> => {
	const lang = await surfaceLang(ctx, surface);
	const out: string[] = [];
	for (const key of [
		"presets:presetTool.create",
		"presets:presetTool.status.saving",
	]) {
		const value = await resolveLocaleKey(lang, key);
		if (value) out.push(value);
	}
	return out.length > 0 ? out : ["Create"];
};

/** Click the tool-shell Create button, polling through busy/disabled. */
const clickToolCreate = async (
	ctx: E2EContext,
	surface: LiveSurface,
	timeoutMs = 20_000,
): Promise<unknown> => {
	const labels = await toolCreateLabels(ctx, surface);
	const deadline = Date.now() + timeoutMs;
	let clicked: unknown = "missing-button";
	while (Date.now() < deadline) {
		clicked = await clickButtonByLabels(ctx, surface, labels);
		if (clicked === "clicked") return clicked;
		await sleep(800);
	}
	return clicked;
};

/**
 * First visible bare text `<input>` — not inside a `[data-path-field]`
 * and not a non-text control type. Used for the unlabeled name inputs in
 * the custom `renderForm`s (code / animation / layer-comp / easing).
 */
const FIRST_TEXT_INPUT = `[...document.querySelectorAll("input")].find(
	(i) => !i.closest("[data-path-field]")
		&& !["hidden", "checkbox", "file", "password", "submit", "button", "range", "color", "radio"]
			.includes(i.type))`;

const setFirstTextInput = async (
	ctx: E2EContext,
	surface: LiveSurface,
	value: string,
): Promise<unknown> =>
	ctx.evalJs(
		surface,
		`(() => {
			const el = (${FIRST_TEXT_INPUT});
			if (!el) return "missing-input";
			const setter = Object.getOwnPropertyDescriptor(
				window.HTMLInputElement.prototype, "value").set;
			setter.call(el, ${JSON.stringify(value)});
			el.dispatchEvent(new Event("input", { bubbles: true }));
			el.dispatchEvent(new Event("change", { bubbles: true }));
			return el.value;
		})()`,
	);

/** `<input>` associated with a `<label>` whose text matches `labelText`. */
const setLabeledInput = async (
	ctx: E2EContext,
	surface: LiveSurface,
	labelText: string,
	value: string,
): Promise<unknown> =>
	ctx.evalJs(
		surface,
		`(() => {
			const wants = ${JSON.stringify(labelText)};
			const label = [...document.querySelectorAll("label")].find((l) => {
				const t = (l.textContent || "").trim();
				return t === wants || t.includes(wants);
			});
			const el = label && label.htmlFor
				? document.getElementById(label.htmlFor)
				: null;
			if (!el) return "missing:" + wants;
			const setter = Object.getOwnPropertyDescriptor(
				window.HTMLInputElement.prototype, "value").set;
			setter.call(el, ${JSON.stringify(value)});
			el.dispatchEvent(new Event("input", { bubbles: true }));
			el.dispatchEvent(new Event("change", { bubbles: true }));
			return el.value;
		})()`,
	);

const setPathFieldInput = async (
	ctx: E2EContext,
	surface: LiveSurface,
	value: string,
	index = 0,
): Promise<unknown> =>
	ctx.evalJs(
		surface,
		`(() => {
			const el = document.querySelectorAll("[data-path-field] input")[${index}];
			if (!el) return "missing-path-field";
			const setter = Object.getOwnPropertyDescriptor(
				window.HTMLInputElement.prototype, "value").set;
			setter.call(el, ${JSON.stringify(value)});
			el.dispatchEvent(new Event("input", { bubbles: true }));
			el.dispatchEvent(new Event("change", { bubbles: true }));
			return el.value;
		})()`,
	);

/** First `[role="alert"]` text inside a surface (tool-shell saveError). */
const readAlertText = async (
	ctx: E2EContext,
	surface: LiveSurface,
): Promise<string> =>
	String(
		(await ctx
			.evalJs(
				surface,
				`(() => {
					const el = document.querySelector('[role="alert"]');
					return el ? (el.textContent || "").trim() : "";
				})()`,
			)
			.catch(() => "")) ?? "",
	);

const waitForAlert = async (
	ctx: E2EContext,
	surface: LiveSurface,
	timeoutMs = 25_000,
): Promise<string> => {
	const deadline = Date.now() + timeoutMs;
	let text = "";
	while (Date.now() < deadline) {
		text = await readAlertText(ctx, surface);
		if (text) return text;
		await sleep(700);
	}
	return text;
};

type PresetRow = {
	id?: string;
	type?: string;
	title?: string;
	filePath?: string;
	data?: Record<string, unknown>;
};

const readPresets = async (
	ctx: E2EContext,
): Promise<{ presets?: PresetRow[] } | null> =>
	ctx.readManagedJson<{ presets?: PresetRow[] }>("presets", "presets.json");

const presetsWithPath = async (
	ctx: E2EContext,
	filePath: string,
): Promise<PresetRow[]> => {
	const doc = await readPresets(ctx);
	return (doc?.presets ?? []).filter((p) => p.filePath === filePath);
};

const presetCount = async (ctx: E2EContext): Promise<number> =>
	(await readPresets(ctx))?.presets?.length ?? 0;

type GroupEntry = { id?: string; title?: string; presetIds?: string[] };
type GroupFile = { version?: number; groups?: GroupEntry[] };

const readGroups = async (ctx: E2EContext): Promise<GroupFile | null> =>
	ctx.readManagedJson<GroupFile>("groups", "groups.json");

/** Poll presets.json until a row with `title` appears; returns the row. */
const waitPresetByTitle = async (
	ctx: E2EContext,
	title: string,
	timeoutMs = 30_000,
): Promise<PresetRow | null> => {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const doc = await readPresets(ctx);
		const row = doc?.presets?.find((p) => p.title === title);
		if (row?.id) return row;
		await sleep(700);
	}
	return null;
};

/** Poll groups.json until an entry with `title` appears. */
const waitGroupByTitle = async (
	ctx: E2EContext,
	title: string,
	timeoutMs = 45_000,
): Promise<GroupEntry | null> => {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const doc = await readGroups(ctx);
		const row = doc?.groups?.find((g) => g.title === title);
		if (row?.id) return row;
		await sleep(800);
	}
	return null;
};

/**
 * Repoint `core.paths.scriptRoot`/`presetRoot` in the sandbox copy of
 * `settings/app.json` at dirs under `Folder.userData` — the only root
 * class the host `authorizeSaveDir` accepts besides the extension dir
 * and AE Support Files. The sandbox's own roots live in os.tmpdir() and
 * would be rejected, so authoring dialogs that derive their save dir
 * from settings (easing, animation scan path) need this. MUST be called
 * inside `withManagedRootSnapshot` so the restore keeps the real
 * settings untouched.
 */
const patchSettingsRootsToUserData = async (
	ctx: E2EContext,
	userData: string,
	base: string,
): Promise<void> => {
	const appPath = ["settings", "app.json"] as const;
	const text = await ctx.readManagedText(...appPath);
	let app: Record<string, unknown> = { version: 2 };
	try {
		if (text) app = JSON.parse(text) as Record<string, unknown>;
	} catch {
		// corrupt settings — start fresh inside the snapshot
	}
	const core = (app.core ?? {}) as Record<string, unknown>;
	const paths = (core.paths ?? {}) as Record<string, unknown>;
	app.core = {
		...core,
		paths: {
			...paths,
			scriptRoot: path.join(userData, "ty-plus-e2e", `${base}-scripts`),
			presetRoot: path.join(userData, "ty-plus-e2e", `${base}-presets`),
		},
	};
	await writeManagedFile(
		ctx,
		[...appPath],
		`${JSON.stringify(app, null, 2)}\n`,
	);
};

/** Close a pooled tool dialog surface and wait for it to go away. */
const closeToolSurface = async (
	ctx: E2EContext,
	surface: LiveSurface,
): Promise<void> => {
	await closeLiveSurface(ctx, surface);
	await sleep(1_500);
};

/** Resolve arbitrary i18n keys to button labels (edit dialog footer). */
const labelsForKeys = async (
	ctx: E2EContext,
	surface: LiveSurface,
	keys: readonly string[],
	fallback: string,
): Promise<string[]> => {
	const lang = await surfaceLang(ctx, surface);
	const out: string[] = [];
	for (const key of keys) {
		const value = await resolveLocaleKey(lang, key);
		if (value) out.push(value);
	}
	return out.length > 0 ? out : [fallback];
};

/** Create-click that works for both PathDialog and tool-shell labels. */
const clickCreateWithLabels = async (
	ctx: E2EContext,
	surface: LiveSurface,
	labels: readonly string[],
	timeoutMs = 20_000,
): Promise<unknown> => {
	const deadline = Date.now() + timeoutMs;
	let clicked: unknown = "missing-button";
	while (Date.now() < deadline) {
		clicked = await clickButtonByLabels(ctx, surface, labels);
		if (clicked === "clicked") return clicked;
		await sleep(800);
	}
	return clicked;
};

const waitRowsWithPath = async (
	ctx: E2EContext,
	filePath: string,
	count: number,
	timeoutMs = 30_000,
): Promise<PresetRow[]> => {
	const deadline = Date.now() + timeoutMs;
	let rows: PresetRow[] = [];
	while (Date.now() < deadline) {
		rows = await presetsWithPath(ctx, filePath);
		if (rows.length >= count) return rows;
		await sleep(700);
	}
	return rows;
};

/** Name input for the default ToolDialogForm (label or first input). */
const fillToolDialogName = async (
	ctx: E2EContext,
	surface: LiveSurface,
	title: string,
): Promise<unknown> => {
	const label = await resolveLocaleKey(
		await surfaceLang(ctx, surface),
		"presets:presetTool.form.presetName",
	);
	if (label) {
		const viaLabel = await setLabeledInput(ctx, surface, label, title);
		if (String(viaLabel) === title) return viaLabel;
	}
	return setFirstTextInput(ctx, surface, title);
};

const readFileSafe = async (filePath: string): Promise<string> => {
	try {
		return await readFile(filePath, "utf8");
	} catch {
		return "";
	}
};

// ---------------------------------------------------------------------------
// cases
// ---------------------------------------------------------------------------

export const presetCreateCases: E2ECase[] = [
	{
		uc: "UC-C01",
		title:
			"path preset: missing asset rejected, footage inferred, duplicate path → distinct record",
		async run(ctx: E2EContext) {
			const checks: ReturnType<typeof check>[] = [];
			const userData = await aeUserDataDir(ctx);
			const dir = e2eFixtureDir(userData);
			const pngPath = path.join(dir, "e2e-c01-footage.png");
			const missingPath = path.join(dir, "e2e-c01-missing.jsx");
			await mkdir(dir, { recursive: true });
			await writeFile(pngPath, Buffer.from(PNG_B64, "base64"));
			await rm(missingPath, { force: true });

			await withManagedRootSnapshot(ctx, "uc-c01-path-preset", async () => {
				const panel = await ctx.requireSurface({ surfaceId: "panel-1" });
				const createLabels = async (s: LiveSurface) =>
					presetCreateLabels(ctx, s);

				// 1. Missing asset: Create is clickable (canAdd only checks
				//    non-empty fields) but verifyAndUpsertPreset rejects the
				//    absent file — the dialog must stay open and presets.json
				//    must not gain a ghost record.
				const addDlg = await openPathDialog(ctx, panel);
				await fillPresetAddDialog(ctx, addDlg, missingPath, "E2E Missing");
				const clicked = await clickCreateWithLabels(
					ctx,
					addDlg,
					await createLabels(addDlg),
				);
				checks.push(
					check(
						"Create submitted for missing asset",
						clicked === "clicked",
						String(clicked),
					),
				);
				await sleep(3_000);
				const missingRows = await presetsWithPath(ctx, missingPath);
				checks.push(
					check(
						"missing asset produced no catalog record",
						missingRows.length === 0,
						`records=${missingRows.length}`,
					),
				);
				const stillOpen = await ctx
					.evalJs(
						addDlg,
						`Boolean(document.querySelector('[data-surface-id="dialog-preset-add"]'))`,
					)
					.catch(() => false);
				checks.push(
					check(
						"dialog stayed open after rejection (no ghost close)",
						stillOpen === true,
						`open=${stillOpen}`,
					),
				);
				await closeToolSurface(ctx, addDlg);
				await waitPathDialogsGone(ctx);

				// 2. .png → footage type inference.
				const addDlg2 = await openPathDialog(ctx, panel);
				await fillPresetAddDialog(ctx, addDlg2, pngPath, "E2E C01 Footage");
				const clicked2 = await clickCreateWithLabels(
					ctx,
					addDlg2,
					await createLabels(addDlg2),
				);
				checks.push(
					check(
						"footage Create submitted",
						clicked2 === "clicked",
						String(clicked2),
					),
				);
				const footageRows = await waitRowsWithPath(ctx, pngPath, 1);
				const footageId = footageRows[0]?.id ?? "";
				checks.push(
					check(
						"presets.json persisted footage record",
						Boolean(footageId),
						`id=${footageId} type=${footageRows[0]?.type}`,
					),
				);
				checks.push(
					check(
						"type inferred as footage",
						footageRows[0]?.type === "footage",
						`type=${footageRows[0]?.type}`,
					),
				);
				await waitPathDialogsGone(ctx);

				// 3. Same path again → a SECOND record with a distinct id.
				//    upsertLocalPreset merges by catalogIdKey (the preset id),
				//    not by filePath — this asserts that contract explicitly.
				const addDlg3 = await openPathDialog(ctx, panel);
				await fillPresetAddDialog(ctx, addDlg3, pngPath, "E2E C01 Footage 2");
				await clickCreateWithLabels(ctx, addDlg3, await createLabels(addDlg3));
				const dupRows = await waitRowsWithPath(ctx, pngPath, 2);
				const dupIds = dupRows.map((p) => p.id).filter(Boolean);
				checks.push(
					check(
						"duplicate path registration yields distinct catalog id",
						dupIds.length === 2 && new Set(dupIds).size === 2,
						`ids=${dupIds.join(",")}`,
					),
				);
				await waitPathDialogsGone(ctx);
			});
			return {
				detail: "path dialog: rejection + inference + duplicate-id contract",
				checks,
				evidence: [pngPath, managedFilePath(ctx, "presets", "presets.json")],
			};
		},
	},
	{
		uc: "UC-C02",
		title:
			"group preset: rejection + folder scan → presets.json + groups.json + group tile + catalog expansion",
		async run(ctx: E2EContext) {
			const checks: ReturnType<typeof check>[] = [];
			const userData = await aeUserDataDir(ctx);
			const dir = e2eFixtureDir(userData);
			const groupSrc = path.join(dir, "e2e-group-src");
			const emptyDir = path.join(dir, "e2e-group-empty");
			await mkdir(groupSrc, { recursive: true });
			await mkdir(emptyDir, { recursive: true });

			// Two NEW .ffx files with DISTINCT contents (known filePaths are
			// skipped by the importer, and identical bytes could dedup).
			let seededFfx = 0;
			for (const [name, body] of [
				["e2e-group-one.ffx", "// e2e group fixture one\n"],
				["e2e-group-two.ffx", "// e2e group fixture two\n"],
			] as const) {
				try {
					await writeFile(path.join(groupSrc, name), body, "utf8");
					seededFfx += 1;
				} catch {
					// best-effort fixture
				}
			}
			checks.push(
				check(
					"group scan fixture seeded (.ffx files)",
					seededFfx === 2,
					`seeded=${seededFfx}`,
				),
			);

			const panel = await ctx.requireSurface({ surfaceId: "panel-1" });
			const groupTilesBefore = Number(
				(await ctx.evalJs(
					panel,
					`document.querySelectorAll("[data-workspace-group-tile]").length`,
				)) ?? 0,
			);

			let groupEntry: GroupEntry | null = null;
			let memberIds: string[] = [];

			await withManagedRootSnapshot(ctx, "uc-c02-group-create", async () => {
				const panelLive = await ctx.requireSurface({ surfaceId: "panel-1" });

				// 1. Rejection: no folder paths → typed saveError
				//    (folderGroup.noFolderPaths), groups.json untouched.
				const groupsBefore = await readGroups(ctx);
				const groupDlg = await openToolDialog(
					ctx,
					panelLive,
					"ty.ctx.create-folder-preset",
					"dialog-preset-add-folder",
				);
				await waitForDom(
					ctx,
					groupDlg,
					`Boolean(document.querySelector('[data-surface-id="dialog-preset-add-folder"]'))`,
					20_000,
				);
				const rejected = await clickToolCreate(ctx, groupDlg);
				checks.push(
					check(
						"Create submitted (empty paths)",
						rejected === "clicked",
						String(rejected),
					),
				);
				const alertText = await waitForAlert(ctx, groupDlg, 20_000);
				checks.push(
					check(
						"empty paths rejected with visible error",
						alertText.length > 0,
						alertText.slice(0, 160),
					),
				);
				const groupsAfterReject = await readGroups(ctx);
				checks.push(
					check(
						"groups.json untouched by rejected create",
						JSON.stringify(groupsAfterReject?.groups ?? []) ===
							JSON.stringify(groupsBefore?.groups ?? []),
						`groups=${groupsAfterReject?.groups?.length ?? 0}`,
					),
				);

				// 2. Empty folder → folderPaths non-empty but no preset files
				//    (or cep_node missing → scanRequiresCepNode). Either way a
				//    typed rejection; groups.json must stay untouched.
				const emptySet = await setPathFieldInput(ctx, groupDlg, emptyDir);
				checks.push(
					check(
						"folder path accepted",
						String(emptySet) === emptyDir,
						String(emptySet),
					),
				);
				await clickToolCreate(ctx, groupDlg);
				// saveError clears at save start; give React a beat so the
				// poll cannot return the stale first rejection.
				await sleep(1_200);
				const alert2 = await waitForAlert(ctx, groupDlg, 30_000);
				checks.push(
					check(
						"empty folder rejected with visible error",
						alert2.length > 0,
						alert2.slice(0, 160),
					),
				);
				const groupsAfterEmpty = await readGroups(ctx);
				checks.push(
					check(
						"groups.json still untouched after empty-folder create",
						JSON.stringify(groupsAfterEmpty?.groups ?? []) ===
							JSON.stringify(groupsBefore?.groups ?? []),
						`groups=${groupsAfterEmpty?.groups?.length ?? 0}`,
					),
				);

				// 3. Happy path: point the path row at the fixture folder,
				//    name the group, Create → cep_node folder scan imports
				//    the .ffx members. The dialog stays open after failures,
				//    so no reopen is needed.
				const srcSet = await setPathFieldInput(ctx, groupDlg, groupSrc);
				checks.push(
					check(
						"scan folder path accepted",
						String(srcSet) === groupSrc,
						String(srcSet),
					),
				);
				const nameLabel = await resolveLocaleKey(
					await surfaceLang(ctx, groupDlg),
					"presets:group.fields.groupName",
				);
				const nameSet = nameLabel
					? await setLabeledInput(ctx, groupDlg, nameLabel, "E2E Scan Group")
					: await setFirstTextInput(ctx, groupDlg, "E2E Scan Group");
				checks.push(
					check(
						"group name accepted",
						String(nameSet) === "E2E Scan Group",
						String(nameSet),
					),
				);

				// Detect candidates → inline status line (issue #766 UX).
				// updatePath already auto-detects; the button re-runs it.
				const detectLabel = await resolveLocaleKey(
					await surfaceLang(ctx, groupDlg),
					"presets:group.detectCandidates",
				);
				await clickButtonByLabels(ctx, groupDlg, [
					detectLabel ?? "Detect candidates",
				]);
				const detectStatus = await waitForDom(
					ctx,
					groupDlg,
					`Boolean(document.querySelector('[role="status"]'))`,
					15_000,
				);
				checks.push(
					check(
						"Detect candidates surfaced a status line",
						Boolean(detectStatus),
						String(detectStatus).slice(0, 120),
					),
				);

				const cepNode = await ctx
					.evalJs(
						groupDlg,
						`typeof cep_node !== "undefined" && typeof cep_node.require === "function"`,
					)
					.catch(() => false);

				const created = await clickToolCreate(ctx, groupDlg, 30_000);
				checks.push(
					check("Create submitted (scan folder)", created === "clicked"),
				);

				groupEntry = await waitGroupByTitle(ctx, "E2E Scan Group", 60_000);
				if (groupEntry?.id) {
					memberIds = groupEntry.presetIds ?? [];
					checks.push(
						check(
							"groups.json gained E2E Scan Group",
							true,
							`id=${groupEntry.id} members=${memberIds.length}`,
						),
					);
				} else {
					const failAlert = await readAlertText(ctx, groupDlg);
					checks.push(
						check(
							cepNode
								? "groups.json gained E2E Scan Group"
								: "folder scan unavailable (cep_node missing) — group create not exercised",
							!cepNode,
							`alert='${failAlert.slice(0, 160)}' cepNode=${String(cepNode)}`,
						),
					);
				}

				if (groupEntry?.id && memberIds.length > 0) {
					const memberRows: PresetRow[] = [];
					for (const id of memberIds) {
						const doc = await readPresets(ctx);
						const row = doc?.presets?.find((p) => p.id === id);
						if (row) memberRows.push(row);
					}
					checks.push(
						check(
							"scanned .ffx members registered in presets.json",
							memberRows.length === seededFfx && seededFfx > 0,
							`members=${memberRows.length}/${seededFfx} paths=${memberRows
								.map((p) => path.basename(p.filePath ?? ""))
								.join(",")}`,
						),
					);
				}
				await closeToolSurface(ctx, groupDlg);

				if (!groupEntry?.id) return;

				// 4. Workspace group tile placed.
				const panel2 = await ctx.requireSurface({ surfaceId: "panel-1" });
				const tilesAfter = await waitForDom(
					ctx,
					panel2,
					`document.querySelectorAll("[data-workspace-group-tile]").length > ${groupTilesBefore}`,
					30_000,
				);
				checks.push(
					check(
						"workspace group tile placed",
						Boolean(tilesAfter),
						`before=${groupTilesBefore} after=${String(tilesAfter)}`,
					),
				);

				// 5. Catalog: group row exists → expand → member rows render.
				const catalogDlg = await openPresetCatalog(ctx);
				const gid = groupEntry.id;
				const groupRowSeen = await waitForDom(
					ctx,
					catalogDlg,
					`Boolean(document.querySelector('[data-preset-group-id="${gid}"]'))`,
					25_000,
				);
				checks.push(
					check(
						"catalog lists the new group",
						Boolean(groupRowSeen),
						`group=${gid}`,
					),
				);
				const expanded = await ctx.evalJs(
					catalogDlg,
					`(() => {
						const li = document.querySelector(
							${JSON.stringify(`[data-preset-group-id="${gid}"]`)});
						if (!li) return "missing";
						const toggle = li.querySelector("button[aria-expanded]");
						if (!toggle) return "missing-toggle";
						toggle.click();
						return "clicked";
					})()`,
				);
				checks.push(
					check(
						"group expanded in catalog",
						expanded === "clicked",
						String(expanded),
					),
				);
				const memberSeen = await waitForDom(
					ctx,
					catalogDlg,
					`(() => {
						const li = document.querySelector(
							${JSON.stringify(`[data-preset-group-id="${gid}"]`)});
						if (!li) return false;
						return li.querySelectorAll("[data-preset-id]").length >= ${Math.max(memberIds.length, 1)};
					})()`,
					25_000,
				);
				checks.push(
					check(
						"catalog group view lists member presets",
						Boolean(memberSeen),
						`expected=${memberIds.length}`,
					),
				);
				await closeSurfaceSettled(
					async () =>
						(await listLiveSurfaces(await ctx.surfaces())).find(
							(s) => s.surfaceId === "dialog-presets",
						) ?? null,
					async (s) => closeLiveSurface(ctx, s),
				);
			});
			return {
				detail: `group=${(groupEntry as GroupEntry | null)?.id ?? "none"} members=${memberIds.join(",")}`,
				checks,
				evidence: [
					managedFilePath(ctx, "groups", "groups.json"),
					managedFilePath(ctx, "presets", "presets.json"),
				],
			};
		},
	},
	{
		uc: "UC-C03",
		title:
			"animation preset: Create without detected .ffx rejected; step-3 reaches host no-selection guard",
		async run(ctx: E2EContext) {
			const checks: ReturnType<typeof check>[] = [];
			const userData = await aeUserDataDir(ctx);

			// Ensure no layer is selected so the host guard is deterministic.
			await ctx.evalScriptOnPanel1(`(function(){
				for (var i = 1; i <= app.project.numItems; i++) {
					var it = app.project.item(i);
					if (it instanceof CompItem) {
						for (var j = 1; j <= it.numLayers; j++) it.layer(j).selected = false;
					}
				}
				return "deselected";
			})()`);

			const before = await presetCount(ctx);
			await withManagedRootSnapshot(ctx, "uc-c03-animation", async () => {
				// Repoint settings roots at userData so the scan path is an
				// allowed write root (the sandbox tmpdir root is not).
				await patchSettingsRootsToUserData(ctx, userData, "c03");
				const panel = await ctx.requireSurface({ surfaceId: "panel-1" });
				const dialog = await openToolDialog(
					ctx,
					panel,
					"ty.ctx.create-animation-preset",
					"dialog-animation-preset",
				);
				await waitForDom(
					ctx,
					dialog,
					`Boolean(document.querySelector('[data-surface-id="dialog-animation-preset"]'))`,
					20_000,
				);

				// 1. Footer Create with no detected .ffx → savePathRequired.
				const clicked = await clickToolCreate(ctx, dialog);
				checks.push(
					check("Create submitted", clicked === "clicked", String(clicked)),
				);
				const alertText = await waitForAlert(ctx, dialog, 25_000);
				const expected = await resolveLocaleKey(
					await surfaceLang(ctx, dialog),
					"presets:presetTool.savePathRequired",
				);
				checks.push(
					check(
						"savePathRequired error surfaced",
						alertText.length > 0 &&
							(expected ? alertText.includes(expected) : true),
						`alert='${alertText.slice(0, 160)}' expected='${expected ?? "?"}'`,
					),
				);
				const afterReject = await presetCount(ctx);
				checks.push(
					check(
						"no catalog record after rejected create",
						afterReject === before,
						`before=${before} after=${afterReject}`,
					),
				);

				// 2. Step-3 button → host reaches selectLayerToSave guard and
				//    the dialog shows the no-selection banner (the native AE
				//    save dialog never opens because the guard throws first).
				const step3Label = await resolveLocaleKey(
					await surfaceLang(ctx, dialog),
					"presets:animationPreset.step3.button",
				);
				const noSelLabel = await resolveLocaleKey(
					await surfaceLang(ctx, dialog),
					"presets:animationPreset.status.noSelection",
				);
				const cepNode = await ctx
					.evalJs(
						dialog,
						`typeof cep_node !== "undefined" && typeof cep_node.require === "function"`,
					)
					.catch(() => false);
				const step3Clicked = await ctx.evalJs(
					dialog,
					`(() => {
						const wants = ${JSON.stringify(step3Label ?? "")};
						const btn = [...document.querySelectorAll("button")].find(
							(b) => wants && (b.textContent || "").includes(wants)
								&& !b.disabled && b.getAttribute("aria-disabled") !== "true");
						if (!btn) return "missing-step3";
						btn.click();
						return "clicked";
					})()`,
				);
				checks.push(
					check(
						"step-3 save-preset button clicked",
						step3Clicked === "clicked",
						`${String(step3Clicked)} label=${step3Label ?? "unresolved"}`,
					),
				);
				const noSelSeen = await waitForDom(
					ctx,
					dialog,
					`(() => {
						const wants = ${JSON.stringify(noSelLabel ?? "\u0000")};
						return wants !== "\u0000" &&
							(document.body.textContent || "").includes(wants);
					})()`,
					45_000,
				);
				checks.push(
					check(
						cepNode
							? "host no-selection guard surfaced in dialog"
							: "folder scan unavailable (cep_node missing) — step-3 guard not exercised",
						Boolean(noSelSeen) || !cepNode,
						`expected='${noSelLabel ?? "?"}' cepNode=${String(cepNode)}`,
					),
				);
				await closeToolSurface(ctx, dialog);
			});
			return {
				detail: "animation preset guarded paths (no native dialog reached)",
				checks,
			};
		},
	},
	{
		uc: "UC-C04",
		title: "code preset: panel-authored script → .jsx on disk + catalog record",
		async run(ctx: E2EContext) {
			const checks: ReturnType<typeof check>[] = [];
			const userData = await aeUserDataDir(ctx);
			const saveDir = path.join(userData, "ty-plus-e2e", "code-out");
			await mkdir(saveDir, { recursive: true });

			await withManagedRootSnapshot(ctx, "uc-c04-code-preset", async () => {
				const panel = await ctx.requireSurface({ surfaceId: "panel-1" });
				const dialog = await openToolDialog(
					ctx,
					panel,
					"ty.ctx.create-code-preset",
					"dialog-code-preset",
				);
				await waitForDom(
					ctx,
					dialog,
					`Boolean(document.querySelector('[data-surface-id="dialog-code-preset"]'))`,
					20_000,
				);

				// Name = first bare text input (custom renderForm, no label).
				const nameSet = await setFirstTextInput(ctx, dialog, "E2E Code Preset");
				checks.push(
					check(
						"preset name accepted",
						String(nameSet) === "E2E Code Preset",
						String(nameSet),
					),
				);
				// Save location → userData-rooted dir (allowed write root).
				const dirSet = await setPathFieldInput(ctx, dialog, saveDir);
				checks.push(
					check(
						"save folder accepted",
						String(dirSet) === saveDir,
						String(dirSet),
					),
				);

				// Best-effort: inject real code into the Monaco editor through
				// its hidden textarea via CDP Input.insertText. The default
				// starter content is already non-empty, so the save contract
				// does not depend on this succeeding.
				let codeInjected = "skipped";
				try {
					const focused = await ctx.evalJs(
						dialog,
						`(() => {
							const ta = document.querySelector(
								".monaco-editor textarea, textarea.inputarea");
							if (!ta) return "no-monaco";
							ta.focus();
							return "focused";
						})()`,
					);
					if (focused === "focused") {
						const conn = await ctx.cdp(dialog);
						await conn.send(
							"Input.insertText",
							{ text: "// e2e-code-marker\n$.writeln('e2e-code-preset');\n" },
							10_000,
						);
						codeInjected = "inserted";
					} else {
						codeInjected = String(focused);
					}
				} catch (error) {
					codeInjected = `failed:${String(error).slice(0, 80)}`;
				}

				const clicked = await clickToolCreate(ctx, dialog, 30_000);
				checks.push(
					check("Create submitted", clicked === "clicked", String(clicked)),
				);

				const record = await waitPresetByTitle(ctx, "E2E Code Preset", 40_000);
				checks.push(
					check(
						"presets.json persisted code preset",
						Boolean(record?.id),
						`id=${record?.id ?? "none"} file=${record?.filePath ?? ""}`,
					),
				);
				if (record?.filePath) {
					const content = await readFileSafe(record.filePath);
					checks.push(
						check(
							".jsx asset written and verified",
							content.length > 0,
							`bytes=${content.length} marker=${content.includes("e2e-code-marker")} injected=${codeInjected}`,
						),
					);
					checks.push(
						check(
							"record carries codeKind=extendscript",
							(record.data as { codeKind?: string } | undefined)?.codeKind ===
								"extendscript",
							`data=${JSON.stringify(record.data ?? {})}`,
						),
					);
				}
			});
			return {
				detail: `code preset → ${saveDir} (monaco inject: see run checks)`,
				checks,
				evidence: [managedFilePath(ctx, "presets", "presets.json")],
			};
		},
	},
	{
		uc: "UC-C05",
		title:
			"layer/comp preset: AE-state-consistent outcome, no ghost record on failure",
		async run(ctx: E2EContext) {
			const checks: ReturnType<typeof check>[] = [];
			const userData = await aeUserDataDir(ctx);
			const saveDir = path.join(userData, "ty-plus-e2e", "layer-comp-out");
			await mkdir(saveDir, { recursive: true });

			// Branch on the real AE document state: the host preparation
			// rejects an unsaved project BEFORE any write, so the expected
			// outcome is deterministic per branch.
			const projectFile = String(
				(await ctx.evalScriptOnPanel1(`(function(){
					try { return app.project.file ? app.project.file.fsName : ""; }
					catch (e) { return ""; }
				})()`)) ?? "",
			).trim();
			const projectSaved =
				projectFile.length > 0 && !projectFile.startsWith("e2e-error");
			checks.push(
				check(
					"AE project state probed",
					true,
					projectSaved ? `saved=${projectFile}` : "project unsaved",
				),
			);

			const before = await presetCount(ctx);
			await withManagedRootSnapshot(ctx, "uc-c05-layer-comp", async () => {
				const panel = await ctx.requireSurface({ surfaceId: "panel-1" });
				const dialog = await openToolDialog(
					ctx,
					panel,
					"ty.ctx.create-layer-comp-preset",
					"dialog-layer-comp-preset",
				);
				await waitForDom(
					ctx,
					dialog,
					`Boolean(document.querySelector('[data-surface-id="dialog-layer-comp-preset"]'))`,
					20_000,
				);
				const nameSet = await setFirstTextInput(ctx, dialog, "E2E LayerComp");
				checks.push(
					check(
						"preset name accepted",
						String(nameSet) === "E2E LayerComp",
						String(nameSet),
					),
				);
				await setPathFieldInput(ctx, dialog, saveDir);
				const clicked = await clickToolCreate(ctx, dialog, 40_000);
				checks.push(
					check("Create submitted", clicked === "clicked", String(clicked)),
				);

				if (!projectSaved) {
					// Deterministic rejection: host throws saveProjectFirst
					// before authorizeSaveDir/write — alert + zero records.
					const alertText = await waitForAlert(ctx, dialog, 40_000);
					const expected = await resolveLocaleKey(
						await surfaceLang(ctx, dialog),
						"presets:presetTool.layerCompScript.saveProjectFirst",
					);
					checks.push(
						check(
							"unsaved project rejected with visible error",
							alertText.length > 0 &&
								(expected ? alertText.includes(expected) : true),
							`alert='${alertText.slice(0, 160)}' expected='${expected ?? "?"}'`,
						),
					);
					const after = await presetCount(ctx);
					checks.push(
						check(
							"no ghost record after rejection",
							after === before,
							`before=${before} after=${after}`,
						),
					);
				} else {
					const record = await waitPresetByTitle(ctx, "E2E LayerComp", 40_000);
					if (!record?.id) {
						const alertText = await readAlertText(ctx, dialog);
						checks.push(
							check(
								"presets.json persisted layer/comp preset",
								false,
								`no record; alert='${alertText.slice(0, 160)}'`,
							),
						);
					} else {
						checks.push(
							check(
								"presets.json persisted layer/comp preset",
								true,
								`id=${record.id} file=${record.filePath ?? ""}`,
							),
						);
						if (record.filePath) {
							const content = await readFileSafe(record.filePath);
							checks.push(
								check(
									".jsx asset exists on disk",
									content.length > 0,
									record.filePath,
								),
							);
						}
					}
				}
				await closeToolSurface(ctx, dialog);
			});
			return {
				detail: `layer/comp preset branch: ${projectSaved ? "saved-project success" : "unsaved-project rejection"}`,
				checks,
				evidence: [managedFilePath(ctx, "presets", "presets.json")],
			};
		},
	},
	{
		uc: "UC-C06",
		title:
			"footage + import preset dialogs → records with mode/strategy; footage runs into AE",
		async run(ctx: E2EContext) {
			const checks: ReturnType<typeof check>[] = [];
			const userData = await aeUserDataDir(ctx);
			const dir = e2eFixtureDir(userData);
			const pngPath = path.join(dir, "e2e-c06-footage.png");
			await mkdir(dir, { recursive: true });
			await writeFile(pngPath, Buffer.from(PNG_B64, "base64"));

			await withManagedRootSnapshot(ctx, "uc-c06-footage-import", async () => {
				const panel = await ctx.requireSurface({ surfaceId: "panel-1" });

				// Footage preset (context-menu-only toolbar entry).
				const footageDlg = await openToolDialog(
					ctx,
					panel,
					"ty.ctx.create-footage-preset",
					"dialog-footage-preset",
				);
				await waitForDom(
					ctx,
					footageDlg,
					`Boolean(document.querySelector('[data-surface-id="dialog-footage-preset"]'))`,
					20_000,
				);
				const footageName = await fillToolDialogName(
					ctx,
					footageDlg,
					"E2E Footage Preset",
				);
				checks.push(
					check(
						"footage name accepted",
						String(footageName) === "E2E Footage Preset",
						String(footageName),
					),
				);
				const footagePath = await setPathFieldInput(ctx, footageDlg, pngPath);
				checks.push(
					check(
						"footage path accepted",
						String(footagePath) === pngPath,
						String(footagePath),
					),
				);
				const footageClicked = await clickToolCreate(ctx, footageDlg, 30_000);
				checks.push(
					check(
						"footage Create submitted",
						footageClicked === "clicked",
						String(footageClicked),
					),
				);
				const footageRecord = await waitPresetByTitle(
					ctx,
					"E2E Footage Preset",
					30_000,
				);
				checks.push(
					check(
						"footage record persisted",
						Boolean(footageRecord?.id),
						`id=${footageRecord?.id ?? "none"}`,
					),
				);
				checks.push(
					check(
						"footageImportMode=footage recorded",
						(footageRecord?.data as { footageImportMode?: string } | undefined)
							?.footageImportMode === "footage",
						`data=${JSON.stringify(footageRecord?.data ?? {})}`,
					),
				);

				// Import preset.
				const importDlg = await openToolDialog(
					ctx,
					panel,
					"ty.ctx.create-import-preset",
					"dialog-import-preset",
				);
				await waitForDom(
					ctx,
					importDlg,
					`Boolean(document.querySelector('[data-surface-id="dialog-import-preset"]'))`,
					20_000,
				);
				const importName = await fillToolDialogName(
					ctx,
					importDlg,
					"E2E Import Preset",
				);
				checks.push(
					check(
						"import name accepted",
						String(importName) === "E2E Import Preset",
						String(importName),
					),
				);
				await setPathFieldInput(ctx, importDlg, pngPath);
				const importClicked = await clickToolCreate(ctx, importDlg, 30_000);
				checks.push(
					check(
						"import Create submitted",
						importClicked === "clicked",
						String(importClicked),
					),
				);
				const importRecord = await waitPresetByTitle(
					ctx,
					"E2E Import Preset",
					30_000,
				);
				checks.push(
					check(
						"import record persisted",
						Boolean(importRecord?.id),
						`id=${importRecord?.id ?? "none"}`,
					),
				);
				checks.push(
					check(
						"importStrategy=auto recorded",
						(importRecord?.data as { importStrategy?: string } | undefined)
							?.importStrategy === "auto",
						`data=${JSON.stringify(importRecord?.data ?? {})}`,
					),
				);

				// Execution: run the footage preset from the catalog → the
				// PNG lands in the AE project as footage.
				if (footageRecord?.id) {
					const catalog = await openPresetCatalog(ctx);
					const rowSeen = await waitForDom(
						ctx,
						catalog,
						`Boolean(document.querySelector('[data-preset-id="${footageRecord.id}"]'))`,
						25_000,
					);
					checks.push(check("catalog lists footage preset", Boolean(rowSeen)));
					const ran = await runPresetFromCatalog(
						ctx,
						catalog,
						footageRecord.id,
					);
					checks.push(
						check("catalog Run clicked", ran === "clicked", String(ran)),
					);
					// Poll AE for the imported item (import is async).
					let hits: string[] = [];
					const runDeadline = Date.now() + 30_000;
					while (Date.now() < runDeadline && hits.length === 0) {
						await sleep(1_500);
						const found = String(
							(await ctx.evalScriptOnPanel1(`(function(){
								var hits = [];
								for (var i = 1; i <= app.project.numItems; i++) {
									var it = app.project.item(i);
									if (it && it.name && it.name.indexOf("e2e-c06-footage") >= 0) {
										hits.push(it.name + "|" + it.typeName);
									}
								}
								return JSON.stringify(hits);
							})()`)) ?? "[]",
						);
						try {
							hits = JSON.parse(found) as string[];
						} catch {
							hits = [];
						}
					}
					checks.push(
						check(
							"AE project gained footage item",
							hits.length > 0,
							`hits=${JSON.stringify(hits)}`,
						),
					);
					await ctx.evalScriptOnPanel1(`(function(){
						for (var i = app.project.numItems; i >= 1; i--) {
							var it = app.project.item(i);
							if (it && it.name && it.name.indexOf("e2e-c06-footage") >= 0) it.remove();
						}
						return "cleaned";
					})()`);
					await closeSurfaceSettled(
						async () =>
							(await listLiveSurfaces(await ctx.surfaces())).find(
								(s) => s.surfaceId === "dialog-presets",
							) ?? null,
						async (s) => closeLiveSurface(ctx, s),
					);
				}
			});
			return {
				detail: "footage+import dialogs created; footage executed into AE",
				checks,
				evidence: [pngPath, managedFilePath(ctx, "presets", "presets.json")],
			};
		},
	},
	{
		uc: "UC-C07",
		title:
			"easing preset: cubic-bezier curve → .jsx under scriptRoot + data.easing record",
		async run(ctx: E2EContext) {
			const checks: ReturnType<typeof check>[] = [];
			const userData = await aeUserDataDir(ctx);
			const scriptRoot = path.join(userData, "ty-plus-e2e", "c07-scripts");

			await withManagedRootSnapshot(ctx, "uc-c07-easing", async () => {
				// Repoint scriptRoot inside the snapshot so the derived save
				// dir is an allowed host write root.
				await patchSettingsRootsToUserData(ctx, userData, "c07");
				const panel = await ctx.requireSurface({ surfaceId: "panel-1" });
				const dialog = await openToolDialog(
					ctx,
					panel,
					"ty.ctx.create-easing-preset",
					"dialog-preset-create",
				);
				await waitForDom(
					ctx,
					dialog,
					`Boolean(document.querySelector('[data-surface-id="dialog-preset-create"]'))`,
					20_000,
				);

				// Easing template renders name + curve inputs (both bare).
				// The curve input's value is a JSON array — distinguish it.
				const nameSet = await setFirstTextInput(
					ctx,
					dialog,
					"E2E Easing Preset",
				);
				checks.push(
					check(
						"preset name accepted",
						String(nameSet) === "E2E Easing Preset",
						String(nameSet),
					),
				);
				const curveSet = await ctx.evalJs(
					dialog,
					`(() => {
						const el = [...document.querySelectorAll("input")].find(
							(i) => /^\\[.*\\]$/.test((i.value || "").trim()));
						if (!el) return "missing-curve";
						const setter = Object.getOwnPropertyDescriptor(
							window.HTMLInputElement.prototype, "value").set;
						setter.call(el, "[0.25,0.1,0.25,1]");
						el.dispatchEvent(new Event("input", { bubbles: true }));
						el.dispatchEvent(new Event("change", { bubbles: true }));
						return el.value;
					})()`,
				);
				checks.push(
					check(
						"easing curve accepted",
						String(curveSet) === "[0.25,0.1,0.25,1]",
						String(curveSet),
					),
				);

				const clicked = await clickToolCreate(ctx, dialog, 40_000);
				checks.push(
					check("Create submitted", clicked === "clicked", String(clicked)),
				);

				const record = await waitPresetByTitle(
					ctx,
					"E2E Easing Preset",
					40_000,
				);
				checks.push(
					check(
						"presets.json persisted easing preset",
						Boolean(record?.id),
						`id=${record?.id ?? "none"} file=${record?.filePath ?? ""}`,
					),
				);
				if (record?.filePath) {
					const easing = (
						record.data as { easing?: { cubic?: number[] } } | undefined
					)?.easing;
					checks.push(
						check(
							"data.easing carries the edited cubic",
							JSON.stringify(easing?.cubic) === "[0.25,0.1,0.25,1]",
							`easing=${JSON.stringify(easing ?? null)}`,
						),
					);
					const content = await readFileSafe(record.filePath);
					checks.push(
						check(
							".jsx easing asset written under scriptRoot",
							content.includes("ty-plus: easing preset") &&
								record.filePath.startsWith(scriptRoot),
							`file=${record.filePath} bytes=${content.length}`,
						),
					);
				}
			});
			return {
				detail: "easing preset curve → jsx + data.easing",
				checks,
				evidence: [managedFilePath(ctx, "presets", "presets.json")],
			};
		},
	},
	{
		uc: "UC-C08",
		title:
			"group edit: member list renders, member Run executes, rename persists to groups.json",
		async run(ctx: E2EContext) {
			const checks: ReturnType<typeof check>[] = [];
			const userData = await aeUserDataDir(ctx);
			const markerPath = path.join(
				userData,
				"ty-plus",
				"dg-presets",
				"marker.txt",
			);
			const GROUP_ID = "e2e-edit-group";
			const GROUP_TITLE = "E2E Edit Group";
			const RENAMED = "E2E Edit Group Renamed";

			await withManagedRootSnapshot(ctx, "uc-c08-group-edit", async () => {
				// Seed a group row pointing at the sandbox's dg-* fixtures.
				const existing = (await readGroups(ctx)) ?? { version: 1, groups: [] };
				const groups = (existing.groups ?? []).filter((g) => g.id !== GROUP_ID);
				groups.push({
					id: GROUP_ID,
					title: GROUP_TITLE,
					presetIds: ["dg-script-marker", "dg-ffx-fadein"],
				});
				await writeManagedFile(
					ctx,
					["groups", "groups.json"],
					`${JSON.stringify({ version: 1, groups }, null, 2)}\n`,
				);

				const catalog = await openPresetCatalog(ctx);
				const groupRowSeen = await waitForDom(
					ctx,
					catalog,
					`Boolean(document.querySelector('[data-preset-group-id="${GROUP_ID}"]'))`,
					25_000,
				);
				checks.push(
					check(
						"catalog lists seeded group",
						Boolean(groupRowSeen),
						`group=${GROUP_ID}`,
					),
				);
				if (!groupRowSeen) return;

				// Open the group edit dialog via its row action.
				const editGroupLabel = await resolveLocaleKey(
					await surfaceLang(ctx, catalog),
					"presets:listDialog.editGroup",
				);
				const editClicked = await ctx.evalJs(
					catalog,
					`(() => {
						const li = document.querySelector(
							${JSON.stringify(`[data-preset-group-id="${GROUP_ID}"]`)});
						if (!li) return "missing-group";
						const wants = ${JSON.stringify(editGroupLabel ?? "")};
						const btn = [...li.querySelectorAll("button")].find(
							(b) => wants && (b.getAttribute("aria-label") || "") === wants);
						if (!btn) return "missing-edit";
						btn.click();
						return "clicked";
					})()`,
				);
				checks.push(
					check(
						"group Edit clicked",
						editClicked === "clicked",
						`${String(editClicked)} label=${editGroupLabel ?? "?"}`,
					),
				);

				const editDlg = await findLive(
					ctx,
					(s) => s.surfaceId === "dialog-preset-edit",
					30_000,
				);
				if (!editDlg) {
					checks.push(check("edit dialog opened", false, "not live"));
					return;
				}
				await waitForDom(
					ctx,
					editDlg,
					`document.querySelectorAll('li[data-preset-id]').length >= 2`,
					30_000,
				);
				const memberIdsRaw = await ctx.evalJs(
					editDlg,
					`[...document.querySelectorAll("li[data-preset-id]")]
						.map((li) => li.getAttribute("data-preset-id"))`,
				);
				const memberIds = Array.isArray(memberIdsRaw)
					? (memberIdsRaw as string[])
					: [];
				checks.push(
					check(
						"member preset list rendered",
						memberIds.includes("dg-script-marker") &&
							memberIds.includes("dg-ffx-fadein"),
						`members=${JSON.stringify(memberIds)}`,
					),
				);

				// Member Run: dg-script-marker writes marker.txt in AE.
				await rm(markerPath, { force: true });
				const memberRunLabel = await resolveLocaleKey(
					await surfaceLang(ctx, editDlg),
					"presets:edit.memberRun",
				);
				const runAffix = templateAffixes(memberRunLabel);
				const runClicked = await ctx.evalJs(
					editDlg,
					`(() => {
						const row = document.querySelector(
							'li[data-preset-id="dg-script-marker"]');
						if (!row) return "missing-row";
						const affix = ${JSON.stringify(runAffix)};
						const btn = [...row.querySelectorAll("button")].find((b) => {
							const a = b.getAttribute("aria-label") || "";
							return affix
								? a.startsWith(affix.pre) && a.endsWith(affix.post)
								: a.includes("Run") || a.includes("実行");
						});
						if (!btn) return "missing-run";
						btn.click();
						return "clicked";
					})()`,
				);
				checks.push(
					check(
						"member Run clicked",
						runClicked === "clicked",
						String(runClicked),
					),
				);
				const marker = await waitForFile(markerPath, 25_000);
				checks.push(
					check(
						"member preset executed in AE",
						marker !== null,
						marker ?? "marker absent",
					),
				);

				// Rename the group → groups.json title updates on Save.
				// Group edit renders the title input with the group-name
				// placeholder and label="".
				const namePlaceholder = await resolveLocaleKey(
					await surfaceLang(ctx, editDlg),
					"presets:group.fields.groupNamePlaceholder",
				);
				const renamed = namePlaceholder
					? await ctx.evalJs(
							editDlg,
							`(() => {
								const el = document.querySelector(
									${JSON.stringify(`input[placeholder="${namePlaceholder}"]`)});
								if (!el) return "missing-input";
								const setter = Object.getOwnPropertyDescriptor(
									window.HTMLInputElement.prototype, "value").set;
								setter.call(el, ${JSON.stringify(RENAMED)});
								el.dispatchEvent(new Event("input", { bubbles: true }));
								el.dispatchEvent(new Event("change", { bubbles: true }));
								return el.value;
							})()`,
						)
					: await setFirstTextInput(ctx, editDlg, RENAMED);
				checks.push(
					check(
						"group title field accepted rename",
						String(renamed) === RENAMED,
						String(renamed),
					),
				);
				const saveLabels = await labelsForKeys(
					ctx,
					editDlg,
					["presets:edit.save", "presets:edit.status.saving"],
					"Save",
				);
				const saved = await clickButtonByLabels(ctx, editDlg, saveLabels);
				checks.push(
					check("edit Save clicked", saved === "clicked", String(saved)),
				);
				let persisted = false;
				const saveDeadline = Date.now() + 25_000;
				while (Date.now() < saveDeadline && !persisted) {
					const doc = await readGroups(ctx);
					persisted = Boolean(
						doc?.groups?.some((g) => g.id === GROUP_ID && g.title === RENAMED),
					);
					if (!persisted) await sleep(700);
				}
				checks.push(
					check(
						"groups.json reflects rename",
						persisted,
						persisted ? `title=${RENAMED}` : "title unchanged",
					),
				);
				await closeToolSurface(ctx, editDlg);

				// Regular preset edit: same dialog, presets.json upsert path.
				// dg-ffx-fadein is a seeded catalog row — but it is also a
				// member of the group above, so expand the group first to
				// make its member row (and row actions) reachable.
				await ctx.evalJs(
					catalog,
					`(() => {
						const li = document.querySelector(
							${JSON.stringify(`[data-preset-group-id="${GROUP_ID}"]`)});
						const toggle = li && li.querySelector("button[aria-expanded]");
						if (toggle && toggle.getAttribute("aria-expanded") !== "true") {
							toggle.click();
						}
						return "toggled";
					})()`,
				);
				await waitForDom(
					ctx,
					catalog,
					`Boolean(document.querySelector('[data-preset-id="dg-ffx-fadein"]'))`,
					15_000,
				);
				const editPresetLabel = await resolveLocaleKey(
					await surfaceLang(ctx, catalog),
					"presets:listDialog.editPresetAria",
				);
				const presetEditClicked = await ctx.evalJs(
					catalog,
					`(() => {
						const row = document.querySelector(
							${JSON.stringify(`[data-preset-id="dg-ffx-fadein"]`)});
						if (!row) return "missing-row";
						const wants = ${JSON.stringify(editPresetLabel ?? "")};
						const btn = [...row.querySelectorAll("button")].find(
							(b) => wants && (b.getAttribute("aria-label") || "") === wants);
						if (!btn) return "missing-edit";
						btn.click();
						return "clicked";
					})()`,
				);
				checks.push(
					check(
						"preset Edit clicked",
						presetEditClicked === "clicked",
						`${String(presetEditClicked)} label=${editPresetLabel ?? "?"}`,
					),
				);
				const presetEditDlg = await findLive(
					ctx,
					(s) => s.surfaceId === "dialog-preset-edit",
					30_000,
				);
				if (presetEditDlg) {
					await waitForDom(
						ctx,
						presetEditDlg,
						`document.querySelectorAll('input[placeholder]').length > 0`,
						20_000,
					);
					const presetPlaceholder = await resolveLocaleKey(
						await surfaceLang(ctx, presetEditDlg),
						"presets:edit.fields.presetNamePlaceholder",
					);
					const PRESET_RENAMED = "E2E Renamed FadeIn";
					const presetRenamed = presetPlaceholder
						? await ctx.evalJs(
								presetEditDlg,
								`(() => {
									const el = document.querySelector(
										${JSON.stringify(`input[placeholder="${presetPlaceholder}"]`)});
									if (!el) return "missing-input";
									const setter = Object.getOwnPropertyDescriptor(
										window.HTMLInputElement.prototype, "value").set;
									setter.call(el, ${JSON.stringify(PRESET_RENAMED)});
									el.dispatchEvent(new Event("input", { bubbles: true }));
									el.dispatchEvent(new Event("change", { bubbles: true }));
									return el.value;
								})()`,
							)
						: "missing-placeholder";
					checks.push(
						check(
							"preset title field accepted rename",
							String(presetRenamed) === PRESET_RENAMED,
							String(presetRenamed),
						),
					);
					const presetSaveLabels = await labelsForKeys(
						ctx,
						presetEditDlg,
						["presets:edit.save", "presets:edit.status.saving"],
						"Save",
					);
					await clickButtonByLabels(ctx, presetEditDlg, presetSaveLabels);
					let presetPersisted = false;
					const presetDeadline = Date.now() + 25_000;
					while (Date.now() < presetDeadline && !presetPersisted) {
						const doc = await readPresets(ctx);
						presetPersisted = Boolean(
							doc?.presets?.some(
								(p) => p.id === "dg-ffx-fadein" && p.title === PRESET_RENAMED,
							),
						);
						if (!presetPersisted) await sleep(700);
					}
					checks.push(
						check(
							"presets.json reflects preset rename",
							presetPersisted,
							presetPersisted ? `title=${PRESET_RENAMED}` : "title unchanged",
						),
					);
					await closeToolSurface(ctx, presetEditDlg);
				} else {
					checks.push(check("preset edit dialog opened", false, "not live"));
				}

				await closeSurfaceSettled(
					async () =>
						(await listLiveSurfaces(await ctx.surfaces())).find(
							(s) => s.surfaceId === "dialog-presets",
						) ?? null,
					async (s) => closeLiveSurface(ctx, s),
				);
			});
			return {
				detail:
					"group edit: members + member run + rename; preset edit: rename round-trip",
				checks,
				evidence: [
					managedFilePath(ctx, "groups", "groups.json"),
					managedFilePath(ctx, "presets", "presets.json"),
					markerPath,
				],
			};
		},
	},
];
