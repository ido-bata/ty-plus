import {
	getCepPathReaderFromWindow,
	normalizeCepSystemPath,
} from "@/management/ae/cep/runtime";
import type { Preset, PresetType } from "@/management/preset/contract";
import { presetIconImage } from "@/management/preset/contract";
import { coercePersistedPresetIcon } from "@/management/preset/icon-data";
import {
	findSiblingImagePathForPresetFile,
	type SiblingListingEntry,
} from "@/management/preset/sibling-thumbnail";

export type FileBrowserFileType =
	| "image"
	| "video"
	| "audio"
	| "font"
	| "ae-project"
	| "ae-preset"
	| "mogrt"
	| "psd"
	| "ai"
	| "c4d"
	| "json"
	| "text"
	| "script"
	| "plugin"
	| "image-sequence"
	| "unknown";

export type FileBrowserEntry = {
	name: string;
	path: string;
	isDirectory: boolean;
	isPackage?: boolean;
	size: number;
	modifiedAt: string;
	extension: string;
	fileType: FileBrowserFileType;
	previewUrl?: string;
};

type QuickActionRootKind = "preset" | "script" | "plugin";

type QuickActionRootFileRow = Preset;

export type QuickActionDirectorySignature = {
	path: string;
	mtimeMs: number;
	size: number;
};

type QuickActionRootIndex = {
	rootFiles: readonly QuickActionRootFileRow[];
	directorySignatures: readonly QuickActionDirectorySignature[];
};

type QuickActionRootIndexProgress = QuickActionRootIndex & {
	completed: boolean;
};

type QuickActionRootIndexProgressHandler = (
	progress: QuickActionRootIndexProgress,
) => void | Promise<void>;

export type FileBrowserService = {
	getDefaultDirectory(): string;
	getParentDirectory(dirPath: string): string;
	/** Parent of `dirPath`, or `null` when already at a filesystem root. */
	getAncestorDirectoryOrNull(dirPath: string): string | null;
	listDirectory(dirPath: string): Promise<FileBrowserEntry[]>;
	searchDirectory(dirPath: string, query: string): Promise<FileBrowserEntry[]>;
	/**
	 * Recursively collect runnable files under preset/script/plugin anchor roots
	 * (for quick-actions palette). Dedupes by path; caps total entries.
	 */
	walkQuickActionRootFiles(
		roots: readonly {
			path: string;
			rootKind: QuickActionRootKind;
		}[],
	): Promise<readonly QuickActionRootFileRow[]>;
	buildQuickActionRootIndex(
		roots: readonly {
			path: string;
			rootKind: QuickActionRootKind;
		}[],
	): Promise<QuickActionRootIndex>;
	buildQuickActionRootIndexIncremental(
		roots: readonly {
			path: string;
			rootKind: QuickActionRootKind;
		}[],
		onProgress: QuickActionRootIndexProgressHandler,
	): Promise<QuickActionRootIndex>;
	hasQuickActionDirectoryChanges(
		signatures: readonly QuickActionDirectorySignature[],
	): Promise<boolean>;
};

type CepNodeFsDirent = {
	name: string;
	isDirectory(): boolean;
	isFile(): boolean;
};

type CepNodeFs = {
	promises?: {
		readdir(
			dirPath: string,
			options: { withFileTypes: true },
		): Promise<CepNodeFsDirent[]>;
		stat(filePath: string): Promise<{
			size?: number;
			mtime?: Date;
		}>;
	};
	readdir?: (
		dirPath: string,
		options: { withFileTypes: true },
		callback: (error: Error | null, entries?: CepNodeFsDirent[]) => void,
	) => void;
	stat?: (
		filePath: string,
		callback: (
			error: Error | null,
			stat?: { size?: number; mtime?: Date },
		) => void,
	) => void;
};

type CepNodePath = {
	sep: string;
	resolve(...parts: string[]): string;
	dirname(value: string): string;
	extname(value: string): string;
	basename(value: string): string;
	normalize(value: string): string;
};

type CepNodeOs = {
	homedir(): string;
};

type CepNodeRequire = (id: string) => unknown;

const FILE_BROWSER_TYPE_MAP: Record<string, FileBrowserFileType> = {
	".png": "image",
	".jpg": "image",
	".jpeg": "image",
	".gif": "image",
	".tiff": "image",
	".tif": "image",
	".exr": "image",
	".svg": "image",
	".webp": "image",
	".bmp": "image",
	".mp4": "video",
	".mov": "video",
	".avi": "video",
	".mkv": "video",
	".mp3": "audio",
	".wav": "audio",
	".aac": "audio",
	".flac": "audio",
	".otf": "font",
	".ttf": "font",
	".woff": "font",
	".woff2": "font",
	".aep": "ae-project",
	".aepx": "ae-project",
	".aet": "ae-project",
	".ffx": "ae-preset",
	".mogrt": "mogrt",
	".plugin": "plugin",
	".aex": "plugin",
	".psd": "psd",
	".ai": "ai",
	".c4d": "c4d",
	".json": "json",
	".jsx": "script",
	".jsxbin": "script",
	".txt": "text",
	".md": "text",
};

const IMAGE_TYPES = new Set<FileBrowserFileType>(["image", "psd", "ai"]);

const normalizeListedPath = (value: string): string => {
	const unified = value.replaceAll("\\", "/");
	// Windows drive root: keep the trailing slash. "C:/" is the C: drive
	// root and readdir lists it; "C:" is the process CWD on the C: drive
	// and readdir on it lists an unrelated folder. The CEP path module
	// can produce either form via resolve+dirname, so we canonicalize
	// both to the drive root here.
	const driveMatch = /^([A-Za-z]:)\/?$/.exec(unified);
	if (driveMatch) {
		return `${driveMatch[1]}/`;
	}
	return unified.replace(/\/+$/, "") || value;
};

const readCepNodeRequireFromWindow = (win: Window): CepNodeRequire | null => {
	const maybe = win as Window & {
		cep_node?: { require?: CepNodeRequire };
	};
	if (typeof maybe.cep_node?.require === "function") {
		return maybe.cep_node.require;
	}
	return null;
};

const classifyFileBrowserEntryType = (
	fileName: string,
): FileBrowserFileType => {
	const lower = fileName.trim().toLowerCase();
	const match = /\.[^\\/]+$/.exec(lower);
	if (!match) {
		return "unknown";
	}
	return FILE_BROWSER_TYPE_MAP[match[0]] ?? "unknown";
};

const isPluginBundleName = (fileName: string): boolean =>
	fileName.trim().toLowerCase().endsWith(".plugin");

const pngSequenceStem = (fileName: string): string | null => {
	const match = /^(.*?)(\d+)\.png$/i.exec(fileName.trim());
	if (!match) {
		return null;
	}
	return `${match[1]}#${match[2].length}`;
};

const rootKindToPresetType = (rootKind: QuickActionRootKind): PresetType =>
	rootKind === "preset"
		? "preset"
		: rootKind === "script"
			? "script"
			: "plugin";

const quickActionPresetId = (
	rootKind: QuickActionRootKind,
	filePath: string,
): string =>
	`quick:${rootKind}:${filePath.replaceAll("\\", "/").toLowerCase()}`;

const toFileUrl = (filePath: string): string => {
	const normalized = normalizeListedPath(filePath);
	if (/^[A-Za-z]:\//.test(normalized)) {
		return `file:///${encodeURI(normalized)}`;
	}
	return `file://${encodeURI(normalized)}`;
};

const resolveInitialDirectory = (
	pathMod: CepNodePath,
	osMod: CepNodeOs,
	win?: Window,
): string => {
	const homeDir = osMod.homedir?.();
	if (typeof homeDir === "string" && homeDir.trim()) {
		return normalizeListedPath(pathMod.resolve(homeDir));
	}

	if (win) {
		const cep = getCepPathReaderFromWindow(win);
		const userData = cep?.getSystemPath?.("userData");
		if (typeof userData === "string" && userData.trim()) {
			return normalizeCepSystemPath(userData);
		}
	}

	return "/";
};

const resolveParentDir = (
	pathMod: CepNodePath,
	currentDir: string,
): string | null => {
	const normalized = normalizeListedPath(currentDir);
	if (!normalized) {
		return null;
	}
	// Windows drive-rooted path: drive letter + ":" + optional "/" + rest.
	// We do this explicitly because the CEP path module may behave like
	// path.posix.dirname, where dirname("C:/Users") returns "C:" (drive-
	// relative) and dirname("C:/") returns "." - both of which send the
	// caller to an unrelated folder on the C: drive instead of up one
	// directory.
	const driveMatch = /^([A-Za-z]:)(?:\/(.*))?$/.exec(normalized);
	if (driveMatch) {
		const drive = driveMatch[1]; // "C:"
		const rest = driveMatch[2] ?? "";
		if (!rest) {
			// Drive root (C:/) or drive-relative (C:): no parent above the
			// drive root at the filesystem level.
			return null;
		}
		const lastSlash = rest.lastIndexOf("/");
		if (lastSlash < 0) {
			// One path component under the drive (e.g. "C:/Users"): the
			// parent is the drive root.
			return `${drive}/`;
		}
		return `${drive}/${rest.slice(0, lastSlash)}`;
	}
	// Unix-style path: defer to pathMod.dirname which is correct here.
	const parent = normalizeListedPath(pathMod.dirname(currentDir));
	if (!parent || parent === currentDir) {
		return null;
	}
	return parent;
};

const buildFileBrowserService = (options: {
	window?: Window;
	cepNodeRequire?: CepNodeRequire;
}): FileBrowserService => {
	const requireFn =
		options.cepNodeRequire ??
		(options.window ? readCepNodeRequireFromWindow(options.window) : null);

	if (!requireFn) {
		throw new Error("CEP Node file access is not available in this surface.");
	}

	const fsMod = requireFn("fs") as CepNodeFs;
	const pathMod = requireFn("path") as CepNodePath;
	const osMod = requireFn("os") as CepNodeOs;
	const fsPromises = fsMod.promises ?? createLegacyNodeFsAdapter(fsMod);
	if (!fsPromises) {
		throw new Error("CEP Node fs API is not available in this host runtime.");
	}

	const directoryLooksLikePngSequence = async (
		dirPath: string,
	): Promise<boolean> => {
		let entries: CepNodeFsDirent[];
		try {
			entries = await fsPromises.readdir(dirPath, { withFileTypes: true });
		} catch {
			return false;
		}
		const counts = new Map<string, number>();
		for (const entry of entries) {
			if (!entry.isFile()) {
				continue;
			}
			const stem = pngSequenceStem(entry.name);
			if (!stem) {
				continue;
			}
			const next = (counts.get(stem) ?? 0) + 1;
			if (next >= 2) {
				return true;
			}
			counts.set(stem, next);
		}
		return false;
	};

	const createEntry = async (
		currentDir: string,
		dirent: CepNodeFsDirent,
	): Promise<FileBrowserEntry> => {
		const fullPath = normalizeListedPath(
			pathMod.resolve(currentDir, dirent.name),
		);
		// stat can fail with EPERM/EACCES for entries like sibling user profile
		// directories under C:\Users\ that the running process cannot read.
		// The entry is still listable from the parent readdir result, so fall
		// back to dirent-only data and placeholder mtime/size so a single
		// inaccessible child does not poison the whole listing.
		let statResult: { size?: number; mtime?: Date } | null = null;
		try {
			statResult = await fsPromises.stat(fullPath);
		} catch (error) {
			const code = (error as NodeJS.ErrnoException | undefined)?.code;
			if (code !== "EPERM" && code !== "EACCES") {
				throw error;
			}
		}
		const isPluginBundle =
			dirent.isDirectory() && isPluginBundleName(dirent.name);
		const isPngSequence =
			dirent.isDirectory() &&
			!isPluginBundle &&
			statResult !== null &&
			(await directoryLooksLikePngSequence(fullPath));
		const isDirectory =
			dirent.isDirectory() && !isPluginBundle && !isPngSequence;
		const extension = isDirectory
			? ""
			: isPngSequence
				? ".png-sequence"
				: (pathMod.extname(dirent.name) || "").toLowerCase();
		const fileType: FileBrowserFileType = isDirectory
			? "unknown"
			: isPngSequence
				? "image-sequence"
				: classifyFileBrowserEntryType(dirent.name);
		const previewUrl =
			!isDirectory && IMAGE_TYPES.has(fileType)
				? toFileUrl(fullPath)
				: undefined;
		return {
			name: dirent.name,
			path: fullPath,
			isDirectory,
			...(isPluginBundle || isPngSequence ? { isPackage: true } : {}),
			size: typeof statResult?.size === "number" ? statResult.size : 0,
			modifiedAt:
				statResult?.mtime instanceof Date
					? statResult.mtime.toISOString()
					: new Date(0).toISOString(),
			extension,
			fileType,
			previewUrl,
		} satisfies FileBrowserEntry;
	};
	const sortEntries = (entries: FileBrowserEntry[]) => {
		entries.sort((left, right) => {
			if (left.isDirectory !== right.isDirectory) {
				return left.isDirectory ? -1 : 1;
			}
			return left.name.localeCompare(right.name, undefined, {
				numeric: true,
				sensitivity: "base",
			});
		});
		return entries;
	};
	const yieldToUi = async (): Promise<void> => {
		const scheduler =
			options.window?.setTimeout ?? globalThis.setTimeout.bind(globalThis);
		await new Promise<void>((resolve) => scheduler(resolve, 0));
	};
	const MAX_SEARCH_DEPTH = 8;
	const MAX_SEARCH_RESULTS = 1000;
	const walkMatches = async (
		currentDir: string,
		query: string,
		bucket: FileBrowserEntry[],
		rootDir: string,
		depth = 0,
	): Promise<void> => {
		if (depth > MAX_SEARCH_DEPTH || bucket.length >= MAX_SEARCH_RESULTS) return;
		const relative = pathMod
			.resolve(currentDir)
			.slice(pathMod.resolve(rootDir).length)
			.replaceAll("\\", "/");
		if (relative.startsWith("../") || relative === "..") return;
		const dirents = await fsPromises.readdir(currentDir, {
			withFileTypes: true,
		});
		for (const dirent of dirents) {
			if (bucket.length >= MAX_SEARCH_RESULTS) return;
			const entry = await createEntry(currentDir, dirent);
			if (
				entry.name.toLowerCase().includes(query) ||
				entry.path.toLowerCase().includes(query) ||
				entry.fileType.toLowerCase().includes(query)
			) {
				bucket.push(entry);
			}
			if (dirent.isDirectory()) {
				await walkMatches(entry.path, query, bucket, rootDir, depth + 1);
			}
		}
	};

	const buildQuickActionRootIndexCore = async (
		roots: readonly { path: string; rootKind: QuickActionRootKind }[],
		onProgress?: QuickActionRootIndexProgressHandler,
	): Promise<QuickActionRootIndex> => {
		const out: QuickActionRootFileRow[] = [];
		const directorySignatures: QuickActionDirectorySignature[] = [];
		const seenPaths = new Set<string>();
		const seenDirs = new Set<string>();
		const skipDir = new Set(
			["node_modules", ".git", ".svn", "__macosx"].map((s) => s.toLowerCase()),
		);
		const allowExt = new Set([
			".ffx",
			".jsx",
			".jsxbin",
			".js",
			".mogrt",
			".aex",
			".plugin",
		]);
		const siblingImageExt = new Set([
			".png",
			".jpg",
			".jpeg",
			".gif",
			".webp",
			".svg",
		]);
		let visitedEntries = 0;
		let lastProgressFileCount = 0;
		let lastProgressDirectoryCount = 0;
		let lastProgressAt = 0;

		const reportProgress = async (completed: boolean): Promise<void> => {
			if (!onProgress) {
				return;
			}
			const now = Date.now();
			const fileDelta = out.length - lastProgressFileCount;
			const directoryDelta =
				directorySignatures.length - lastProgressDirectoryCount;
			if (!completed && fileDelta < 100 && directoryDelta < 50) {
				if (now - lastProgressAt < 1000) {
					return;
				}
			}
			lastProgressFileCount = out.length;
			lastProgressDirectoryCount = directorySignatures.length;
			lastProgressAt = now;
			await onProgress({
				rootFiles: [...out],
				directorySignatures: [...directorySignatures],
				completed,
			});
		};

		const walkDir = async (
			dir: string,
			rootKind: QuickActionRootKind,
		): Promise<void> => {
			const currentDir = normalizeListedPath(
				dir?.trim() ? pathMod.resolve(dir) : dir,
			);
			const dirKey = currentDir.replaceAll("\\", "/").toLowerCase();
			if (seenDirs.has(dirKey)) {
				return;
			}
			seenDirs.add(dirKey);
			let dirents: CepNodeFsDirent[];
			try {
				const stat = await fsPromises.stat(currentDir);
				directorySignatures.push({
					path: currentDir,
					mtimeMs: stat.mtime instanceof Date ? stat.mtime.getTime() : 0,
					size: typeof stat.size === "number" ? stat.size : 0,
				});
				dirents = await fsPromises.readdir(currentDir, {
					withFileTypes: true,
				});
			} catch {
				return;
			}
			const siblingEntries: SiblingListingEntry[] = [];
			for (const entry of dirents) {
				if (!entry.isFile()) continue;
				const ext = (pathMod.extname(entry.name) || "").toLowerCase();
				if (!siblingImageExt.has(ext)) continue;
				siblingEntries.push({
					name: entry.name,
					path: normalizeListedPath(pathMod.resolve(currentDir, entry.name)),
					isDirectory: false,
				});
			}
			const direntChunkSize = 100;
			const processDirentChunk = async (chunkStart: number): Promise<void> => {
				const chunkEnd = Math.min(chunkStart + direntChunkSize, dirents.length);
				const $chunkWalkPromises: Promise<void>[] = [];
				const $chunkReportPromises: Promise<void>[] = [];
				for (let j = chunkStart; j < chunkEnd; j++) {
					const dirent = dirents[j];
					visitedEntries += 1;
					const isPluginBundle =
						dirent.isDirectory() && isPluginBundleName(dirent.name);
					if (dirent.isDirectory() && skipDir.has(dirent.name.toLowerCase())) {
						continue;
					}
					if (dirent.isDirectory() && !isPluginBundle) {
						$chunkWalkPromises.push(
							walkDir(
								normalizeListedPath(pathMod.resolve(currentDir, dirent.name)),
								rootKind,
							),
						);
					} else {
						const ext = (pathMod.extname(dirent.name) || "").toLowerCase();
						if (!allowExt.has(ext)) {
							continue;
						}
						const filePath = normalizeListedPath(
							pathMod.resolve(currentDir, dirent.name),
						);
						const key = filePath.replaceAll("\\", "/").toLowerCase();
						if (seenPaths.has(key)) {
							continue;
						}
						seenPaths.add(key);
						const type = rootKindToPresetType(rootKind);
						const siblingImage = findSiblingImagePathForPresetFile(
							filePath,
							siblingEntries,
						);
						out.push({
							id: quickActionPresetId(rootKind, filePath),
							type,
							title: dirent.name,
							filePath,
							icon: siblingImage
								? presetIconImage(siblingImage)
								: coercePersistedPresetIcon(type, undefined),
						});
						$chunkReportPromises.push(reportProgress(false));
					}
				}
				await Promise.all($chunkWalkPromises);
				await Promise.all($chunkReportPromises);
				// Yield to UI before the next chunk
				if (chunkEnd < dirents.length) {
					await yieldToUi();
					await processDirentChunk(chunkEnd);
				}
			};
			await processDirentChunk(0);
		};

		const $rootWalkPromises: Promise<void>[] = [];
		for (const r of roots) {
			const p = r.path?.trim();
			if (!p) continue;
			$rootWalkPromises.push(walkDir(p, r.rootKind));
		}
		await Promise.all($rootWalkPromises);
		await reportProgress(false);
		out.sort((a, b) =>
			a.title.localeCompare(b.title, undefined, {
				sensitivity: "base",
			}),
		);
		directorySignatures.sort((a, b) =>
			a.path.localeCompare(b.path, undefined, { sensitivity: "base" }),
		);
		await reportProgress(true);
		return { rootFiles: out, directorySignatures };
	};

	const buildQuickActionRootIndex = async (
		roots: readonly { path: string; rootKind: QuickActionRootKind }[],
	): Promise<QuickActionRootIndex> => buildQuickActionRootIndexCore(roots);

	const buildQuickActionRootIndexIncremental = async (
		roots: readonly { path: string; rootKind: QuickActionRootKind }[],
		onProgress: QuickActionRootIndexProgressHandler,
	): Promise<QuickActionRootIndex> =>
		buildQuickActionRootIndexCore(roots, onProgress);

	const walkQuickActionRootFiles = async (
		roots: readonly { path: string; rootKind: QuickActionRootKind }[],
	): Promise<readonly QuickActionRootFileRow[]> =>
		(await buildQuickActionRootIndex(roots)).rootFiles;

	const hasQuickActionDirectoryChanges = async (
		signatures: readonly QuickActionDirectorySignature[],
	): Promise<boolean> => {
		const changed = await checkSignaturesChanged(signatures);
		return changed;
	};

	const checkSignaturesChanged = async (
		signatures: readonly QuickActionDirectorySignature[],
	): Promise<boolean> => {
		const BATCH_SIZE = 25;
		for (let i = 0; i < signatures.length; i += BATCH_SIZE) {
			const batch = signatures.slice(i, i + BATCH_SIZE);
			const results = await Promise.all(
				batch.map(async (sig) => {
					try {
						const stat = await fsPromises.stat(sig.path);
						const mtimeMs =
							stat.mtime instanceof Date ? stat.mtime.getTime() : 0;
						const size = typeof stat.size === "number" ? stat.size : 0;
						return mtimeMs !== sig.mtimeMs || size !== sig.size;
					} catch {
						return true;
					}
				}),
			);
			if (results.some((changed) => changed)) {
				return true;
			}
			if (i + BATCH_SIZE < signatures.length) {
				await yieldToUi();
			}
		}
		return false;
	};

	return {
		getDefaultDirectory(): string {
			return resolveInitialDirectory(pathMod, osMod, options.window);
		},
		getAncestorDirectoryOrNull(dirPath: string): string | null {
			const resolved = normalizeListedPath(
				dirPath?.trim()
					? pathMod.resolve(dirPath)
					: resolveInitialDirectory(pathMod, osMod, options.window),
			);
			return resolveParentDir(pathMod, resolved);
		},
		getParentDirectory(dirPath: string): string {
			const resolved = normalizeListedPath(pathMod.resolve(dirPath));
			return resolveParentDir(pathMod, resolved) ?? resolved;
		},
		async listDirectory(targetDir: string): Promise<FileBrowserEntry[]> {
			const currentDir = normalizeListedPath(
				targetDir?.trim()
					? pathMod.resolve(targetDir)
					: resolveInitialDirectory(pathMod, osMod, options.window),
			);
			const dirents = await fsPromises.readdir(currentDir, {
				withFileTypes: true,
			});
			return sortEntries(
				await Promise.all(
					dirents.map((dirent) => createEntry(currentDir, dirent)),
				),
			);
		},
		async searchDirectory(
			dirPath: string,
			query: string,
		): Promise<FileBrowserEntry[]> {
			const currentDir = normalizeListedPath(
				dirPath?.trim()
					? pathMod.resolve(dirPath)
					: resolveInitialDirectory(pathMod, osMod, options.window),
			);
			const normalizedQuery = query.trim().toLowerCase();
			if (!normalizedQuery) {
				return [];
			}
			const matches: FileBrowserEntry[] = [];
			await walkMatches(currentDir, normalizedQuery, matches, currentDir);
			return sortEntries(matches);
		},
		walkQuickActionRootFiles: walkQuickActionRootFiles,
		buildQuickActionRootIndex,
		buildQuickActionRootIndexIncremental,
		hasQuickActionDirectoryChanges,
	};
};

const _createFileBrowserService = buildFileBrowserService;

const createLegacyNodeFsAdapter = (
	fsMod: CepNodeFs,
): {
	readdir(
		dirPath: string,
		options: { withFileTypes: true },
	): Promise<CepNodeFsDirent[]>;
	stat(filePath: string): Promise<{ size?: number; mtime?: Date }>;
} | null => {
	if (typeof fsMod.readdir !== "function" || typeof fsMod.stat !== "function") {
		return null;
	}
	return {
		readdir(dirPath, options) {
			return new Promise((resolve, reject) => {
				fsMod.readdir?.(dirPath, options, (error, entries) => {
					if (error) {
						reject(error);
						return;
					}
					resolve(entries ?? []);
				});
			});
		},
		stat(filePath) {
			return new Promise((resolve, reject) => {
				fsMod.stat?.(filePath, (error, stat) => {
					if (error) {
						reject(error);
						return;
					}
					resolve(stat ?? {});
				});
			});
		},
	};
};

export const canUseCepNodeFileBrowser = (win: Window): boolean =>
	readCepNodeRequireFromWindow(win) !== null;

export const createCepNodeFileBrowserService = (options: {
	win: Window;
}): FileBrowserService =>
	buildFileBrowserService({
		window: options.win,
	});
