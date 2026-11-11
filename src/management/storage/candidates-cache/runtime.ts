import { parseRootPathsFromSettingsJson } from "@/management/preset/catalog-add/parse-root-paths";
import type { Preset } from "@/management/preset/contract";
import {
	readCandidates,
	writeCandidates,
} from "@/management/storage/candidates-cache/candidates";
import {
	canUseCepNodeFileBrowser,
	createCepNodeFileBrowserService,
	type QuickActionDirectorySignature,
} from "@/management/storage/file-browser-service";
import { readSettings } from "@/management/workspace/persistence/store";

const CANDIDATES_PRELOAD_DELAY_MS = 3500;
const CANDIDATES_BUILD_DELAY_MS = 12000;
const CANDIDATES_REVALIDATE_DELAY_MS = 18000;
const CANDIDATES_READ_LIMIT = 1200;
const CANDIDATES_EFFECT_READ_LIMIT = 800;
const CANDIDATES_PROGRESS_WRITE_INTERVAL_MS = 12000;

type CandidatesSnapshotRoot = {
	path: string;
	rootKind: "preset" | "script" | "plugin";
};

export type CandidatesSnapshot = {
	roots: readonly CandidatesSnapshotRoot[];
	rootFiles: readonly Preset[];
	pluginEffects: readonly {
		filePath: string;
		matchName: string;
		displayName: string;
	}[];
};

type CandidatesSystemPaths = {
	presetRoot?: string;
	scriptRoot?: string;
	pluginRoot?: string;
};

/**
 * Resolve candidate cache roots from `settings/app.json` `core.paths.*`.
 *
 * The candidate cache indexes the **user-chosen** preset/script/plugin roots
 * (the same source the directory browser "Anchors" view, `PathDialog`, and
 * `FolderDirectoryPicker` already use), not the CEP gateway's AE-install-rooted
 * paths. The global `getDataServices().resolveSystemPaths()` returns the latter
 * and is intentionally kept as-is for the cloud-preset download flow
 * (`use-cases.ts` -> `resolvePresetDownloadPath`) which needs write access to
 * the AE install folder.
 */
const resolveCandidateRootsFromSettings = async (
	win: Window,
): Promise<CandidatesSystemPaths> => {
	try {
		const raw = await readSettings(win);
		const parsed = parseRootPathsFromSettingsJson(raw ?? undefined);
		return parsed;
	} catch {
		return {};
	}
};

const listeners = new Set<() => void>();
let snapshot: CandidatesSnapshot | null = null;
let maintenanceStarted = false;
let rebuildPromise: Promise<void> | null = null;

const normalizeRootKey = (
	roots: readonly { path: string; rootKind: string }[],
): string =>
	JSON.stringify(
		roots.map((r) => ({
			path: r.path.replaceAll("\\", "/").replace(/\/+$/, "").toLowerCase(),
			rootKind: r.rootKind,
		})),
	);

const resolveCandidateRoots = (
	paths: CandidatesSystemPaths,
): CandidatesSnapshotRoot[] => {
	const roots: CandidatesSnapshotRoot[] = [];
	const seenRoot = new Set<string>();
	const pushRoot = (
		p: string | undefined,
		kind: CandidatesSnapshotRoot["rootKind"],
	): void => {
		const t = p?.trim();
		if (!t) return;
		const k = t.replaceAll("\\", "/").replace(/\/+$/, "").toLowerCase();
		if (seenRoot.has(k)) return;
		seenRoot.add(k);
		roots.push({ path: t, rootKind: kind });
	};
	pushRoot(paths?.presetRoot, "preset");
	pushRoot(paths?.scriptRoot, "script");
	pushRoot(paths?.pluginRoot, "plugin");
	return roots;
};

const emit = (): void => {
	for (const listener of listeners) {
		listener();
	}
};

export const getCandidatesSnapshot = (): CandidatesSnapshot | null => snapshot;

export const subscribeCandidatesSnapshot = (
	listener: () => void,
): (() => void) => {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
};

export const preloadCandidatesSnapshot = async (
	win: Window,
): Promise<"hit" | "miss"> => {
	const paths = await resolveCandidateRootsFromSettings(win);
	const roots = resolveCandidateRoots(paths);
	if (roots.length === 0) {
		snapshot = { roots: [], rootFiles: [], pluginEffects: [] };
		emit();
		return "hit";
	}
	const cached = await readCandidates(win, {
		maxRootFiles: CANDIDATES_READ_LIMIT,
		maxPluginEffects: CANDIDATES_EFFECT_READ_LIMIT,
		includeDirectorySignatures: false,
	});
	if (!cached || normalizeRootKey(cached.roots) !== normalizeRootKey(roots)) {
		return "miss";
	}
	snapshot = {
		roots: cached.roots,
		rootFiles: cached.rootFiles,
		pluginEffects: cached.pluginEffects,
	};
	emit();
	return "hit";
};

const writeIndexCache = async (
	win: Window,
	roots: readonly CandidatesSnapshotRoot[],
	rootFiles: readonly Preset[],
	directorySignatures: readonly QuickActionDirectorySignature[],
	pluginEffects: CandidatesSnapshot["pluginEffects"],
): Promise<void> => {
	await writeCandidates(win, {
		version: 1,
		updatedAt: new Date().toISOString(),
		roots,
		rootFiles,
		directorySignatures,
		pluginEffects,
	});
};

export const triggerCandidatesRebuild = async (win: Window): Promise<void> => {
	await rebuildCandidatesIndex(win);
};

const rebuildCandidatesIndex = async (win: Window): Promise<void> => {
	if (rebuildPromise) {
		return rebuildPromise;
	}
	rebuildPromise = (async () => {
		if (!canUseCepNodeFileBrowser(win)) {
			return;
		}
		const paths = await resolveCandidateRootsFromSettings(win);
		const roots = resolveCandidateRoots(paths);
		if (roots.length === 0) {
			return;
		}
		const service = createCepNodeFileBrowserService({ win });
		let rootFiles: readonly Preset[] = [];
		let directorySignatures: readonly QuickActionDirectorySignature[] = [];
		let lastWriteAt = 0;
		const index = await service.buildQuickActionRootIndexIncremental(
			roots,
			async (progress) => {
				rootFiles = progress.rootFiles;
				directorySignatures = progress.directorySignatures;
				const now = Date.now();
				if (
					!progress.completed &&
					now - lastWriteAt < CANDIDATES_PROGRESS_WRITE_INTERVAL_MS
				) {
					return;
				}
				lastWriteAt = now;
				await writeIndexCache(
					win,
					roots,
					progress.rootFiles,
					progress.directorySignatures,
					[],
				);
			},
		);
		rootFiles = index.rootFiles;
		directorySignatures = index.directorySignatures;
		await writeIndexCache(win, roots, rootFiles, directorySignatures, []);
		await preloadCandidatesSnapshot(win);
	})().finally(() => {
		rebuildPromise = null;
	});
	return rebuildPromise;
};

const startCandidatesMaintenance = (win: Window): void => {
	if (maintenanceStarted) {
		return;
	}
	maintenanceStarted = true;
	win.setTimeout(() => {
		void (async () => {
			const preloadState = await preloadCandidatesSnapshot(win);
			if (preloadState === "miss") {
				win.setTimeout(() => {
					void rebuildCandidatesIndex(win).catch((error) => {
						console.warn("[ty-plus] candidates index rebuild failed", error);
					});
				}, CANDIDATES_BUILD_DELAY_MS);
				return;
			}
			win.setTimeout(() => {
				void (async () => {
					if (!canUseCepNodeFileBrowser(win)) {
						return;
					}
					const cached = await readCandidates(win, {
						maxRootFiles: 0,
						includePluginEffects: false,
					});
					if (!cached || cached.directorySignatures.length === 0) {
						await rebuildCandidatesIndex(win);
						return;
					}
					const service = createCepNodeFileBrowserService({ win });
					const changed = await service.hasQuickActionDirectoryChanges(
						cached.directorySignatures,
					);
					if (changed) {
						await rebuildCandidatesIndex(win);
					}
				})().catch((error) => {
					console.warn("[ty-plus] candidates index validation failed", error);
				});
			}, CANDIDATES_REVALIDATE_DELAY_MS);
		})().catch((error) => {
			console.warn("[ty-plus] candidates index maintenance failed", error);
		});
	}, CANDIDATES_PRELOAD_DELAY_MS);
};

export const startCandidatesPreload = (win: Window): void => {
	startCandidatesMaintenance(win);
};
