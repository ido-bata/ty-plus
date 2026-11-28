/**
 * Sandboxed managed-root isolation for E2E runs (Issue #108 follow-up).
 *
 * The live panels resolve their managed root through
 * `<AE install>/ty-plus-init.json` → `supportRoot` → `<supportRoot>/ty-plus`,
 * with `settings/app.json` / `settings/paths.json` `core.paths.*` as
 * overrides. This module exploits that contract to run an entire suite
 * against a throwaway copy of the managed root:
 *
 * 1. `prepareSandbox` copies the real managed root into a temp support
 *    root, repoints the locator + settings paths at the copy, reloads
 *    every live surface, and verifies a panel actually resolves the
 *    sandbox. From that point on the suite's `ctx.managedRoot()` IS the
 *    sandbox — cases cannot touch real user data by construction.
 * 2. `teardownSandbox` restores the original locator bytes, reloads the
 *    surfaces back onto the real root, then diffs the real root against
 *    the pre-run backup and repairs any drift (stray writes during the
 *    switch windows). The integrity report lands in the evidence dir.
 * 3. `recoverInterruptedSandbox` runs at startup: a previous run that
 *    died mid-switch leaves the locator pointed at a sandbox. The state
 *    file records everything needed to put the locator back.
 *
 * Per-case `withManagedRootSnapshot` keeps working unchanged — it now
 * snapshots the sandbox, which is cheap and disposable.
 */
import { createHash } from "node:crypto";
import {
	cp,
	mkdir,
	readdir,
	readFile,
	rm,
	rmdir,
	stat,
	writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { reloadSurface, sleep } from "./cases/shared";
import type { E2EContext } from "./ctx";
import { seedRealPresetPack } from "./real-preset-pack";
import { listLiveSurfaces } from "./surfaces";

const LOCATOR_NAME = "ty-plus-init.json";
const MANAGED_LEAF = "ty-plus";
const STATE_FILE = ".tmp/e2e-sandbox-state.json";

/**
 * Paths excluded from the integrity manifest. `tool-handoff/` holds
 * per-surface session handoff state that live dialogs rewrite whenever
 * they are open — after teardown restores the locator, an already-open
 * dialog legitimately writes it again, so it can never be byte-stable
 * while surfaces live. It carries no user data.
 */
const MANIFEST_EXCLUDES = ["tool-handoff/"];

type SandboxState = {
	active: boolean;
	realRoot: string;
	sandboxParent: string;
	sandboxRoot: string;
	initPath: string;
	originalInit: string;
	backupDir: string;
	startedAt: string;
};

export type SandboxSession = {
	realRoot: string;
	sandboxRoot: string;
	sandboxParent: string;
	initPath: string;
	backupDir: string;
	statePath: string;
};

const normalizeSlashes = (p: string): string => p.replace(/\\/g, "/");

const managedRootOf = (supportRoot: string): string =>
	`${normalizeSlashes(supportRoot).replace(/\/+$/, "")}/${MANAGED_LEAF}`;

/**
 * Locate the locator file that governs `managedRoot`. The locator sits in
 * the support root (macOS: the AE install dir; Windows: `Support Files`),
 * i.e. next to the managed root — but tolerate one extra level up.
 * Validation: the parsed `supportRoot` must resolve to exactly this
 * managed root, so a stale sibling locator can never be picked by
 * accident.
 */
const findLocator = async (
	managedRoot: string,
): Promise<{ initPath: string; raw: string } | null> => {
	const root = normalizeSlashes(managedRoot).replace(/\/+$/, "");
	let dir = path.dirname(root);
	for (let depth = 0; depth < 3; depth++) {
		const candidate = path.join(dir, LOCATOR_NAME);
		try {
			const raw = await readFile(candidate, "utf8");
			const parsed = JSON.parse(raw) as { supportRoot?: unknown };
			if (
				typeof parsed.supportRoot === "string" &&
				managedRootOf(parsed.supportRoot) === root
			) {
				return { initPath: candidate, raw };
			}
		} catch {
			// not here — walk up
		}
		const parent = path.dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return null;
};

const sha1File = async (file: string): Promise<string> =>
	createHash("sha1")
		.update(await readFile(file))
		.digest("hex");

/** rel-path → {sha1,size} manifest of every file under `dir`. */
const manifestTree = async (
	dir: string,
): Promise<Map<string, { sha1: string; size: number }>> => {
	const out = new Map<string, { sha1: string; size: number }>();
	const walk = async (current: string): Promise<void> => {
		let entries: import("node:fs").Dirent[];
		try {
			entries = await readdir(current, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			const full = path.join(current, entry.name);
			if (entry.isDirectory()) {
				await walk(full);
			} else if (entry.isFile()) {
				const rel = normalizeSlashes(path.relative(dir, full));
				if (MANIFEST_EXCLUDES.some((ex) => rel.startsWith(ex))) continue;
				const info = await stat(full);
				out.set(rel, { sha1: await sha1File(full), size: info.size });
			}
		}
	};
	await walk(dir);
	return out;
};

const diffManifests = (
	before: Map<string, { sha1: string; size: number }>,
	after: Map<string, { sha1: string; size: number }>,
): { changed: string[]; added: string[]; removed: string[] } => {
	const changed: string[] = [];
	const added: string[] = [];
	const removed: string[] = [];
	for (const [rel, sig] of after) {
		const prev = before.get(rel);
		if (!prev) added.push(rel);
		else if (prev.sha1 !== sig.sha1 || prev.size !== sig.size)
			changed.push(rel);
	}
	for (const rel of before.keys()) {
		if (!after.has(rel)) removed.push(rel);
	}
	return { changed, added, removed };
};

/** Copy backup state over the live root: restore changed/removed, delete added. */
const repairTree = async (
	backupDir: string,
	liveDir: string,
	diff: { changed: string[]; added: string[]; removed: string[] },
): Promise<void> => {
	for (const rel of diff.changed) {
		const src = path.join(backupDir, rel);
		const dst = path.join(liveDir, rel);
		await mkdir(path.dirname(dst), { recursive: true });
		await cp(src, dst, { force: true });
	}
	for (const rel of diff.removed) {
		const src = path.join(backupDir, rel);
		const dst = path.join(liveDir, rel);
		await mkdir(path.dirname(dst), { recursive: true });
		await cp(src, dst, { force: true });
	}
	for (const rel of diff.added) {
		await rm(path.join(liveDir, rel), { force: true });
	}
	// Prune directories that only existed for added files. rmdir (not
	// rm -rf) so a directory that still holds pre-existing content —
	// e.g. a sibling file the suite did not create — is left alone.
	const dirs = new Set<string>();
	for (const rel of diff.added) {
		let d = path.dirname(rel);
		while (d && d !== ".") {
			dirs.add(d);
			d = path.dirname(d);
		}
	}
	// Deepest first so nested added dirs collapse before their parents.
	for (const d of [...dirs].sort((a, b) => b.length - a.length)) {
		try {
			await rmdir(path.join(liveDir, d));
		} catch {
			// non-empty or already gone — fine
		}
	}
};

/**
 * Repoint the sandbox copy's path settings at the sandbox. Both
 * `settings/app.json` (`core.paths.*`) and `settings/paths.json` carry
 * absolute roots; leaving either pointing at the real install would let
 * preset/script/plugin writes escape the sandbox.
 */
const patchSandboxPaths = async (
	sandboxRoot: string,
	sandboxParent: string,
): Promise<void> => {
	const parent = normalizeSlashes(sandboxParent).replace(/\/+$/, "");
	const roots = {
		supportRoot: parent,
		presetRoot: `${parent}/Presets`,
		scriptRoot: `${parent}/Scripts`,
		pluginRoot: `${parent}/Plug-ins`,
	};
	for (const sub of ["Presets", "Scripts", "Plug-ins"]) {
		await mkdir(path.join(sandboxParent, sub), { recursive: true });
	}

	const appPath = path.join(sandboxRoot, "settings", "app.json");
	try {
		const app = JSON.parse(await readFile(appPath, "utf8")) as {
			core?: { paths?: Record<string, unknown> };
		};
		app.core = app.core ?? {};
		app.core.paths = { ...(app.core.paths ?? {}), ...roots };
		await writeFile(appPath, `${JSON.stringify(app, null, 2)}\n`);
	} catch {
		// no app.json in the copy — nothing to patch
	}

	const pathsPath = path.join(sandboxRoot, "settings", "paths.json");
	try {
		const raw = JSON.parse(await readFile(pathsPath, "utf8")) as Record<
			string,
			unknown
		>;
		await writeFile(
			pathsPath,
			`${JSON.stringify({ ...raw, ...roots }, null, 2)}\n`,
		);
	} catch {
		// no paths.json — nothing to patch
	}
};

/**
 * Plant a boot-visible marker in the sandbox copy: a unique accent color
 * in `settings/app.json` AND `styles/theme.css`. Boot either regenerates
 * theme.css from app.json or reads it directly — covering both keeps the
 * probe honest. `#e2b701` is arbitrary but collision-proof against any
 * real user accent.
 */
const SANDBOX_ACCENT = "#e2b701";
const markSandboxTheme = async (sandboxRoot: string): Promise<void> => {
	const appPath = path.join(sandboxRoot, "settings", "app.json");
	try {
		const app = JSON.parse(await readFile(appPath, "utf8")) as {
			ui?: Record<string, unknown>;
		};
		app.ui = { ...(app.ui ?? {}), accentColor: SANDBOX_ACCENT };
		await writeFile(appPath, `${JSON.stringify(app, null, 2)}\n`);
	} catch {
		// no app.json — theme.css patch below still marks the sandbox
	}
	const themePath = path.join(sandboxRoot, "styles", "theme.css");
	try {
		let css = await readFile(themePath, "utf8");
		css = css.replace(
			/--color-ty-accent:\s*#[0-9a-fA-F]{3,8}/,
			`--color-ty-accent: ${SANDBOX_ACCENT}`,
		);
		css = css.replace(
			/--accent-r:\s*\d+;\s*--accent-g:\s*\d+;\s*--accent-b:\s*\d+;/,
			"--accent-r: 226;\n  --accent-g: 183;\n  --accent-b: 1;",
		);
		await writeFile(themePath, css);
	} catch {
		// no theme.css — app.json marker alone may still surface
	}
};

/**
 * Fixture presets the suites share (dg-script-marker, dg-ffx-fadein).
 * Their backing files live under `<userData>/ty-plus/dg-presets/` —
 * outside the managed root — and their catalog records live in
 * `presets/presets.json`. Both were lost once to a snapshot/restore
 * accident, so the sandbox re-creates them deterministically instead of
 * depending on whatever the real catalog happens to contain.
 */
const FIXTURE_PRESETS = [
	{
		id: "dg-script-marker",
		type: "script",
		title: "DG Marker Script",
		fileName: "dg-marker.jsx",
		description: "e2e fixture script preset",
	},
	{
		id: "dg-ffx-fadein",
		type: "preset",
		title: "DG FadeIn (.ffx)",
		fileName: "dg-fadein.ffx",
		description: "e2e fixture animation preset",
	},
] as const;

const aeUserDataDir = async (ctx: E2EContext): Promise<string> => {
	const panel = await ctx.requireSurface({ surfaceId: "panel-1" });
	const userData = String(
		await ctx.evalScript(panel, "Folder.userData.fsName", 15_000),
	).trim();
	if (!userData || userData.startsWith("e2e-error")) {
		throw new Error(`Folder.userData unresolved: ${userData}`);
	}
	return userData;
};

const seedCatalogFixtures = async (
	ctx: E2EContext,
	sandboxRoot: string,
	realRoot: string,
): Promise<void> => {
	const userData = await aeUserDataDir(ctx);
	const fixtureDir = path.join(userData, "ty-plus", "dg-presets");
	await mkdir(fixtureDir, { recursive: true });

	// Script fixture: writes marker.txt next to itself inside AE.
	const markerJsx = path.join(fixtureDir, "dg-marker.jsx");
	const markerTxt = path.join(fixtureDir, "marker.txt");
	await writeFile(
		markerJsx,
		`(function(){\n` +
			`  var f = new File(${JSON.stringify(markerTxt)});\n` +
			`  f.open("w");\n` +
			`  f.write(String((new Date()).getTime()) + "|" + app.version);\n` +
			`  f.close();\n` +
			`  $.writeln("e2e fixture dg-marker executed");\n` +
			`})();\n`,
		"utf8",
	);

	// .ffx fixture: borrow a real animation preset from the AE install's
	// own Presets tree (read-only input, never modified).
	const ffxTarget = path.join(fixtureDir, "dg-fadein.ffx");
	const supportRoot = normalizeSlashes(path.dirname(realRoot));
	const presetsDir = path.join(supportRoot, "Presets");
	const ffx = await findFirstFileByExt(presetsDir, ".ffx");
	if (ffx) {
		await cp(ffx, ffxTarget, { force: true });
	} else {
		console.warn(
			`sandbox: no .ffx under ${presetsDir} — dg-ffx-fadein record skipped`,
		);
	}

	// Merge records into the sandbox catalog.
	const catalogPath = path.join(sandboxRoot, "presets", "presets.json");
	let catalog: { version?: number; presets?: Record<string, unknown>[] } = {
		version: 1,
		presets: [],
	};
	try {
		catalog = {
			version: 1,
			presets: [],
			...JSON.parse(await readFile(catalogPath, "utf8")),
		};
	} catch {
		// missing/corrupt catalog — seed fresh
	}
	const presets = Array.isArray(catalog.presets) ? catalog.presets : [];
	for (const fx of FIXTURE_PRESETS) {
		if (fx.fileName.endsWith(".ffx") && !ffx) continue;
		const filePath = path.join(fixtureDir, fx.fileName);
		const record = {
			id: fx.id,
			type: fx.type,
			title: fx.title,
			filePath,
			description: fx.description,
		};
		const idx = presets.findIndex((p) => p?.id === fx.id);
		if (idx >= 0) presets[idx] = record;
		else presets.push(record);
	}
	catalog.presets = presets;
	await mkdir(path.dirname(catalogPath), { recursive: true });
	await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
};

const findFirstFileByExt = async (
	dir: string,
	ext: string,
	depth = 0,
): Promise<string | null> => {
	if (depth > 6) return null;
	let entries: import("node:fs").Dirent[];
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return null;
	}
	// Animation presets live in In/Out/Transitions folders; visit those
	// first so a utility .ffx elsewhere in the tree does not win.
	const preferred = /^(in|out|in-out|transitions?|behaviors?)$/i;
	const dirs = entries
		.filter((e) => e.isDirectory())
		.sort(
			(a, b) => Number(preferred.test(b.name)) - Number(preferred.test(a.name)),
		);
	for (const e of entries) {
		if (!e.isDirectory() && e.name.toLowerCase().endsWith(ext)) {
			return path.join(dir, e.name);
		}
	}
	for (const e of dirs) {
		const found = await findFirstFileByExt(
			path.join(dir, e.name),
			ext,
			depth + 1,
		);
		if (found) return found;
	}
	return null;
};

const reloadAllSurfaces = async (ctx: E2EContext): Promise<void> => {
	const live = await listLiveSurfaces(await ctx.surfaces());
	await Promise.allSettled(live.map((s) => reloadSurface(ctx, s, 45_000)));
};

const writeState = async (
	statePath: string,
	state: SandboxState,
): Promise<void> => {
	await mkdir(path.dirname(statePath), { recursive: true });
	await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
};

const readState = async (statePath: string): Promise<SandboxState | null> => {
	try {
		return JSON.parse(await readFile(statePath, "utf8")) as SandboxState;
	} catch {
		return null;
	}
};

/**
 * If a previous run died between locator rewrite and teardown, put the
 * locator back before doing anything else. Best-effort surface reload:
 * panels may not be live yet, which is fine — they read the locator at
 * boot.
 */
export const recoverInterruptedSandbox = async (
	ctx: E2EContext,
	statePath = STATE_FILE,
): Promise<string | null> => {
	const state = await readState(statePath);
	if (!state?.active) return null;
	try {
		await writeFile(state.initPath, state.originalInit);
		await reloadAllSurfaces(ctx);
		// Repair any real-root drift the interrupted run left behind.
		const before = await manifestTree(state.backupDir);
		const after = await manifestTree(state.realRoot);
		const diff = diffManifests(before, after);
		if (diff.changed.length + diff.added.length + diff.removed.length > 0) {
			await repairTree(state.backupDir, state.realRoot, diff);
		}
		await writeState(statePath, { ...state, active: false });
		return `recovered interrupted sandbox (init=${state.initPath})`;
	} catch (error) {
		return `sandbox recovery failed: ${error instanceof Error ? error.message : String(error)}`;
	}
};

/**
 * Enter sandbox mode. Returns the session; the caller must pass the
 * returned `sandboxRoot` to the suite (ctx.options.managedRoot) and call
 * `teardownSandbox` in a finally.
 */
export const prepareSandbox = async (
	ctx: E2EContext,
	realRoot: string,
	_evidenceDir: string,
	statePath = STATE_FILE,
): Promise<SandboxSession> => {
	const locator = await findLocator(realRoot);
	if (!locator) {
		throw new Error(
			`cannot locate ${LOCATOR_NAME} governing ${realRoot} — ` +
				"refusing sandbox mode (pass --no-sandbox to run against the real root)",
		);
	}

	const stamp = new Date().toISOString().replace(/[:.]/g, "-");
	const sandboxParent = path.join(
		os.tmpdir(),
		"ty-plus-e2e-sandbox",
		`${stamp}-${process.pid}`,
	);
	const sandboxRoot = path.join(sandboxParent, MANAGED_LEAF);
	const backupDir = path.join(sandboxParent, "real-root-backup");

	// 1. Preserve real user data: full backup + content manifest.
	await mkdir(sandboxParent, { recursive: true });
	await cp(realRoot, backupDir, { recursive: true });

	// 2. Seed the sandbox with a copy of the real managed root, then
	//    repoint its path settings AND plant a boot-visible marker
	//    (accent color) so step 5 can prove panels resolved the sandbox.
	await cp(realRoot, sandboxRoot, { recursive: true });
	await patchSandboxPaths(sandboxRoot, sandboxParent);
	await markSandboxTheme(sandboxRoot);

	// 2b. Re-register the shared E2E fixture presets (dg-*) inside the
	//     sandbox catalog. Panels are still on the real root here, so
	//     ExtendScript can resolve Folder.userData for fixture paths.
	//     Best-effort: suites that do not need fixtures still run.
	try {
		await seedCatalogFixtures(ctx, sandboxRoot, realRoot);
	} catch (error) {
		console.warn(
			`sandbox: fixture seeding skipped — ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	// 2c. Real preset pack (Issue #633): nested folder groups + sibling
	//     .gif thumbnails + CJK/symbol paths, mirroring onboarding import.
	//     Best-effort like the dg-* fixtures — absent pack only warns.
	//     The pack is staged under Folder.userData because the host only
	//     executes presets inside its allowed roots (userData / extension
	//     dir / AE Support Files); records pointing at the source pack
	//     location would fail `assertAllowedFilePath` on Run.
	try {
		const userData = await aeUserDataDir(ctx);
		const pack = await seedRealPresetPack(
			sandboxRoot,
			path.join(userData, "ty-plus", "e2e-real-pack"),
		);
		if (pack) {
			console.log(
				`sandbox: real preset pack seeded — ${pack.presets} presets, ${pack.groups} groups (${pack.packRoot})`,
			);
		}
	} catch (error) {
		console.warn(
			`sandbox: real preset pack seeding skipped — ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	// 3. Record recovery state BEFORE touching the locator.
	const state: SandboxState = {
		active: true,
		realRoot: normalizeSlashes(realRoot),
		sandboxParent: normalizeSlashes(sandboxParent),
		sandboxRoot: normalizeSlashes(sandboxRoot),
		initPath: locator.initPath,
		originalInit: locator.raw,
		backupDir: normalizeSlashes(backupDir),
		startedAt: new Date().toISOString(),
	};
	await writeState(statePath, state);

	// 4. Repoint the locator, then reload every surface onto the sandbox.
	//    EVERYTHING past this point must restore the locator on failure —
	//    a throw here with the locator redirected strands the install on a
	//    temp root (observed when AE quit mid-prepare and the probe could
	//    not reach a panel).
	const sandboxLocator = {
		...(JSON.parse(locator.raw) as Record<string, unknown>),
		supportRoot: normalizeSlashes(sandboxParent),
		updatedAt: new Date().toISOString(),
	};
	const abortSandbox = async (reason: string): Promise<never> => {
		try {
			await writeFile(locator.initPath, locator.raw);
		} catch {
			// best-effort; state file still marks the session for recovery
		}
		await writeState(statePath, { ...state, active: false }).catch(() => {});
		throw new Error(reason);
	};
	await writeFile(
		locator.initPath,
		`${JSON.stringify(sandboxLocator, null, 2)}\n`,
	);
	try {
		await reloadAllSurfaces(ctx);

		// 5. Prove a panel resolved the sandbox: the marker accent color is
		//    only present if boot read the sandbox's settings/theme. A file-
		//    existence probe cannot distinguish roots — both see the same fs.
		//    The accent is applied by the async boot-time theme reconcile
		//    (theme-reconcile.ts), which lands a few seconds after
		//    Page.reload — poll instead of sampling once.
		const panel = await ctx.requireSurface({ surfaceId: "panel-1" });
		const accentProbe = `(() => {
			const v = getComputedStyle(document.documentElement)
				.getPropertyValue("--color-ty-accent") || "";
			return v.trim().toLowerCase().includes("e2b701") ? "sandbox" : "real:" + v.trim();
		})()`;
		const probeDeadline = Date.now() + 45_000;
		let probe: unknown = null;
		while (Date.now() < probeDeadline) {
			try {
				probe = await ctx.evalJs(panel, accentProbe, 15_000);
			} catch {
				// Transient CDP stall (host under load): keep polling until the
				// deadline instead of aborting the whole sandbox activation.
				probe = null;
			}
			if (probe === "sandbox") break;
			await sleep(500);
		}
		if (probe !== "sandbox") {
			return await abortSandbox(
				`panel did not resolve sandbox root (probe=${String(probe)}, ` +
					`expected accent ${SANDBOX_ACCENT})`,
			);
		}
	} catch (error) {
		if (error instanceof Error && error.message.startsWith("panel did not")) {
			throw error;
		}
		return await abortSandbox(
			`sandbox activation failed: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	return {
		realRoot: state.realRoot,
		sandboxRoot: state.sandboxRoot,
		sandboxParent: state.sandboxParent,
		initPath: locator.initPath,
		backupDir: state.backupDir,
		statePath,
	};
};

export type IntegrityReport = {
	realRoot: string;
	checkedAt: string;
	driftBeforeRepair: { changed: number; added: number; removed: number };
	filesRepaired: string[];
	cleanAfterRepair: boolean;
};

/**
 * Leave sandbox mode: restore the locator, reload surfaces back onto the
 * real root, then repair/verify real-root integrity against the backup.
 * Always returns a report — never throws for drift (it repairs instead);
 * throws only for locator-restore failures.
 */
export const teardownSandbox = async (
	ctx: E2EContext,
	session: SandboxSession,
	evidenceDir: string,
): Promise<IntegrityReport> => {
	// 1. Restore the locator bytes exactly as found.
	const state = await readState(session.statePath);
	const originalInit = state?.originalInit;
	if (!originalInit) {
		throw new Error("sandbox state file lost — cannot restore locator");
	}
	await writeFile(session.initPath, originalInit);

	// 2. Reload surfaces so panels resync from the real root. Stray
	//    sandbox-state writes can still land in the real root during this
	//    window — the repair pass below is the guarantee, not the timing.
	await reloadAllSurfaces(ctx);
	// Let debounced writes flush, then check once more after a beat.
	await sleep(2_000);

	// 3. Diff real root vs backup; repair drift; re-verify.
	const before = await manifestTree(session.backupDir);
	let after = await manifestTree(session.realRoot);
	let drift = diffManifests(before, after);
	const driftBeforeRepair = {
		changed: drift.changed.length,
		added: drift.added.length,
		removed: drift.removed.length,
	};
	const repaired: string[] = [
		...drift.changed,
		...drift.removed.map((r) => `restored:${r}`),
		...drift.added.map((r) => `removed:${r}`),
	];
	// Repair → settle → re-diff, up to 3 rounds: a straggler debounced
	// write can land between repair and verification.
	for (let round = 0; round < 3; round++) {
		if (drift.changed.length + drift.added.length + drift.removed.length === 0)
			break;
		if (round > 0) {
			for (const rel of [
				...drift.changed,
				...drift.removed.map((r) => `restored:${r}`),
				...drift.added.map((r) => `removed:${r}`),
			]) {
				if (!repaired.includes(rel)) repaired.push(rel);
			}
		}
		await repairTree(session.backupDir, session.realRoot, drift);
		await sleep(1_500);
		after = await manifestTree(session.realRoot);
		drift = diffManifests(before, after);
	}
	const clean =
		drift.changed.length + drift.added.length + drift.removed.length === 0;

	const report: IntegrityReport = {
		realRoot: session.realRoot,
		checkedAt: new Date().toISOString(),
		driftBeforeRepair,
		filesRepaired: repaired,
		cleanAfterRepair: clean,
	};
	try {
		await writeFile(
			path.join(evidenceDir, "sandbox-integrity.json"),
			`${JSON.stringify(report, null, 2)}\n`,
		);
	} catch {
		// evidence dir may not exist yet — report still returned
	}
	await writeState(session.statePath, {
		...(state as SandboxState),
		active: false,
	});
	return report;
};
