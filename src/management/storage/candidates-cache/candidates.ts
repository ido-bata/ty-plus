import type { Preset } from "@/management/preset/contract";
import {
	coercePersistedPresetIcon,
	normalizeRecordCatalogIds,
} from "@/management/preset/icon-data";
import { readJson, writeJson } from "@/management/storage/persistence";

const MAX_ROOT_FILES_PER_CHUNK = 400;
const MAX_DIRECTORY_SIGNATURES_PER_CHUNK = 400;
const MAX_PLUGIN_EFFECTS_PER_CHUNK = 400;

type CandidatesRootKind = "preset" | "script" | "plugin";

type CandidatesRoot = {
	path: string;
	rootKind: CandidatesRootKind;
};

type CandidatesRootFile = Preset;

type CandidatesDirectorySignature = {
	path: string;
	mtimeMs: number;
	size: number;
};

type CandidatesPluginEffect = {
	filePath: string;
	matchName: string;
	displayName: string;
};

export type CandidatesCache = {
	version: 1;
	updatedAt: string;
	roots: readonly CandidatesRoot[];
	rootFiles: readonly CandidatesRootFile[];
	directorySignatures: readonly CandidatesDirectorySignature[];
	pluginEffects: readonly CandidatesPluginEffect[];
};

type CandidatesChunkRef = {
	id: string;
	label: string;
	count: number;
};

type CandidatesManifest = Omit<
	CandidatesCache,
	"rootFiles" | "directorySignatures" | "pluginEffects"
> & {
	chunks: readonly CandidatesChunkRef[];
	directorySignatureChunks?: readonly CandidatesChunkRef[];
	pluginEffectChunks?: readonly CandidatesChunkRef[];
	rootFiles?: readonly CandidatesRootFile[];
	directorySignatures?: readonly CandidatesDirectorySignature[];
	pluginEffects?: readonly CandidatesPluginEffect[];
};

type CandidatesChunk = {
	version: 1;
	id: string;
	rootFiles: readonly CandidatesRootFile[];
};

type CandidatesDirectorySignatureChunk = {
	version: 1;
	id: string;
	directorySignatures: readonly CandidatesDirectorySignature[];
};

type CandidatesPluginEffectChunk = {
	version: 1;
	id: string;
	pluginEffects: readonly CandidatesPluginEffect[];
};

const isRootKind = (value: unknown): value is CandidatesRootKind =>
	value === "preset" || value === "script" || value === "plugin";

const isPresetType = (value: unknown): value is Preset["type"] =>
	value === "preset" ||
	value === "script" ||
	value === "plugin" ||
	value === "footage";

const rootKindForPreset = (row: CandidatesRootFile): CandidatesRootKind =>
	row.type === "script"
		? "script"
		: row.type === "plugin"
			? "plugin"
			: "preset";

const normalizePath = (value: string): string =>
	value.replaceAll("\\", "/").replace(/\/+$/, "");

const normalizePathKey = (value: string): string =>
	normalizePath(value).toLowerCase();

const stableHash = (value: string): string => {
	let hash = 5381;
	for (let i = 0; i < value.length; i += 1) {
		hash = (hash * 33) ^ value.charCodeAt(i);
	}
	return (hash >>> 0).toString(36);
};

const safeChunkId = (label: string): string =>
	`chunk-${stableHash(label)}-${
		label
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 48) || "root"
	}`;

const makeDirectorySignatureChunks = (
	rows: readonly CandidatesDirectorySignature[],
): Array<{
	ref: CandidatesChunkRef;
	chunk: CandidatesDirectorySignatureChunk;
}> => {
	const chunks: Array<{
		ref: CandidatesChunkRef;
		chunk: CandidatesDirectorySignatureChunk;
	}> = [];
	for (let i = 0; i < rows.length; i += MAX_DIRECTORY_SIGNATURES_PER_CHUNK) {
		const slice = rows.slice(i, i + MAX_DIRECTORY_SIGNATURES_PER_CHUNK);
		const label = `directory-signatures/${Math.floor(i / MAX_DIRECTORY_SIGNATURES_PER_CHUNK) + 1}`;
		const id = `directory-signatures-${stableHash(label)}`;
		chunks.push({
			ref: { id, label, count: slice.length },
			chunk: { version: 1, id, directorySignatures: slice },
		});
	}
	return chunks;
};

const makePluginEffectChunks = (
	rows: readonly CandidatesPluginEffect[],
): Array<{
	ref: CandidatesChunkRef;
	chunk: CandidatesPluginEffectChunk;
}> => {
	const chunks: Array<{
		ref: CandidatesChunkRef;
		chunk: CandidatesPluginEffectChunk;
	}> = [];
	for (let i = 0; i < rows.length; i += MAX_PLUGIN_EFFECTS_PER_CHUNK) {
		const slice = rows.slice(i, i + MAX_PLUGIN_EFFECTS_PER_CHUNK);
		const label = `plugin-effects/${Math.floor(i / MAX_PLUGIN_EFFECTS_PER_CHUNK) + 1}`;
		const id = `plugin-effects-${stableHash(label)}`;
		chunks.push({
			ref: { id, label, count: slice.length },
			chunk: { version: 1, id, pluginEffects: slice },
		});
	}
	return chunks;
};

const rootForFile = (
	row: CandidatesRootFile,
	roots: readonly CandidatesRoot[],
): CandidatesRoot | null => {
	const fileKey = normalizePathKey(row.filePath);
	let best: CandidatesRoot | null = null;
	let bestLen = -1;
	for (const root of roots) {
		if (root.rootKind !== rootKindForPreset(row)) continue;
		const rootKey = normalizePathKey(root.path);
		if (
			(fileKey === rootKey || fileKey.startsWith(`${rootKey}/`)) &&
			rootKey.length > bestLen
		) {
			best = root;
			bestLen = rootKey.length;
		}
	}
	return best;
};

const relativeSegments = (
	row: CandidatesRootFile,
	roots: readonly CandidatesRoot[],
): string[] => {
	const root = rootForFile(row, roots);
	const filePath = normalizePath(row.filePath);
	if (!root) return [row.type, "__unknown", row.title];
	const rootPath = normalizePath(root.path);
	const rel =
		filePath === rootPath
			? ""
			: filePath.slice(rootPath.length).replace(/^\/+/, "");
	return rel.split("/").filter(Boolean);
};

const makeChunkRef = (
	label: string,
	rows: readonly CandidatesRootFile[],
): { ref: CandidatesChunkRef; chunk: CandidatesChunk } => {
	const id = safeChunkId(label);
	return {
		ref: { id, label, count: rows.length },
		chunk: { version: 1, id, rootFiles: rows },
	};
};

const splitLargeFlatGroup = (
	label: string,
	rows: readonly CandidatesRootFile[],
	prefixLength = 1,
): Array<{ ref: CandidatesChunkRef; chunk: CandidatesChunk }> => {
	if (rows.length <= MAX_ROOT_FILES_PER_CHUNK) {
		return [makeChunkRef(label, rows)];
	}
	const groups = new Map<string, CandidatesRootFile[]>();
	for (const row of rows) {
		const key =
			normalizePath(row.title).toLowerCase().slice(0, prefixLength) || "misc";
		const bucket = groups.get(key) ?? [];
		bucket.push(row);
		groups.set(key, bucket);
	}
	if (groups.size <= 1 && prefixLength < 4) {
		return splitLargeFlatGroup(label, rows, prefixLength + 1);
	}
	const chunks: Array<{
		ref: CandidatesChunkRef;
		chunk: CandidatesChunk;
	}> = [];
	for (const [key, bucket] of [...groups.entries()].sort()) {
		if (bucket.length > MAX_ROOT_FILES_PER_CHUNK && prefixLength < 4) {
			chunks.push(
				...splitLargeFlatGroup(`${label}/${key}`, bucket, prefixLength + 1),
			);
		} else if (bucket.length > MAX_ROOT_FILES_PER_CHUNK) {
			for (let i = 0; i < bucket.length; i += MAX_ROOT_FILES_PER_CHUNK) {
				chunks.push(
					makeChunkRef(
						`${label}/${key}/${Math.floor(i / MAX_ROOT_FILES_PER_CHUNK) + 1}`,
						bucket.slice(i, i + MAX_ROOT_FILES_PER_CHUNK),
					),
				);
			}
		} else {
			chunks.push(makeChunkRef(`${label}/${key}`, bucket));
		}
	}
	return chunks;
};

const buildChunksAtDepth = (
	label: string,
	rows: readonly CandidatesRootFile[],
	roots: readonly CandidatesRoot[],
	depth: number,
): Array<{ ref: CandidatesChunkRef; chunk: CandidatesChunk }> => {
	if (rows.length <= MAX_ROOT_FILES_PER_CHUNK) {
		return [makeChunkRef(label, rows)];
	}
	const groups = new Map<string, CandidatesRootFile[]>();
	for (const row of rows) {
		const segments = relativeSegments(row, roots);
		const key = segments[depth] ?? "__files";
		const bucket = groups.get(key) ?? [];
		bucket.push(row);
		groups.set(key, bucket);
	}
	if (groups.size <= 1) {
		return splitLargeFlatGroup(label, rows);
	}
	const chunks: Array<{
		ref: CandidatesChunkRef;
		chunk: CandidatesChunk;
	}> = [];
	for (const [key, bucket] of [...groups.entries()].sort()) {
		chunks.push(
			...buildChunksAtDepth(`${label}/${key}`, bucket, roots, depth + 1),
		);
	}
	return chunks;
};

const buildCandidatesChunks = (
	rows: readonly CandidatesRootFile[],
	roots: readonly CandidatesRoot[],
): Array<{ ref: CandidatesChunkRef; chunk: CandidatesChunk }> => {
	const groups = new Map<string, CandidatesRootFile[]>();
	for (const row of rows) {
		const root = rootForFile(row, roots);
		const label = root
			? `${root.rootKind}:${normalizePath(root.path)}`
			: `${rootKindForPreset(row)}:__unknown`;
		const bucket = groups.get(label) ?? [];
		bucket.push(row);
		groups.set(label, bucket);
	}
	return [...groups.entries()]
		.sort()
		.flatMap(([label, bucket]) => buildChunksAtDepth(label, bucket, roots, 0));
};

const parseRoots = (raw: unknown): CandidatesRoot[] =>
	Array.isArray(raw)
		? raw
				.map((row) => {
					const r = row as { path?: unknown; rootKind?: unknown };
					if (typeof r.path !== "string" || !isRootKind(r.rootKind))
						return null;
					return { path: r.path, rootKind: r.rootKind };
				})
				.filter((row): row is CandidatesRoot => Boolean(row))
		: [];

const parseRootFiles = (raw: unknown): CandidatesRootFile[] =>
	Array.isArray(raw)
		? raw
				.map((row) => {
					const r = row as {
						id?: unknown;
						type?: unknown;
						title?: unknown;
						filePath?: unknown;
						displayName?: unknown;
						rootKind?: unknown;
						description?: unknown;
						descriptionImage?: unknown;
						icon?: unknown;
						data?: unknown;
					};
					const type = isPresetType(r.type)
						? r.type
						: isRootKind(r.rootKind)
							? rootKindForPreset({
									id: "",
									type:
										r.rootKind === "script"
											? "script"
											: r.rootKind === "plugin"
												? "plugin"
												: "preset",
									title: "",
									filePath: "",
								})
							: null;
					if (typeof r.filePath !== "string" || !type) {
						return null;
					}
					const filePath = r.filePath.trim();
					if (!filePath) return null;
					const title =
						typeof r.title === "string" && r.title.trim()
							? r.title.trim()
							: typeof r.displayName === "string" && r.displayName.trim()
								? r.displayName.trim()
								: filePath.split(/[\\/]/).pop() || filePath;
					const id =
						typeof r.id === "string" && r.id.trim()
							? r.id.trim()
							: `quick:${type}:${normalizePathKey(filePath)}`;
					return normalizeRecordCatalogIds({
						id,
						type,
						title,
						filePath: r.filePath,
						...(typeof r.description === "string" && r.description.trim()
							? { description: r.description.trim() }
							: {}),
						...(typeof r.descriptionImage === "string" &&
						r.descriptionImage.trim()
							? { descriptionImage: r.descriptionImage.trim() }
							: {}),
						icon: coercePersistedPresetIcon(
							type,
							r.icon as Preset["icon"] | undefined,
						),
						...(r.data && typeof r.data === "object" && !Array.isArray(r.data)
							? { data: r.data as Record<string, unknown> }
							: {}),
					});
				})
				.filter((row): row is CandidatesRootFile => Boolean(row))
		: [];

const parseDirectorySignatures = (
	raw: unknown,
): CandidatesDirectorySignature[] =>
	Array.isArray(raw)
		? raw
				.map((row) => {
					const r = row as {
						path?: unknown;
						mtimeMs?: unknown;
						size?: unknown;
					};
					if (
						typeof r.path !== "string" ||
						typeof r.mtimeMs !== "number" ||
						!Number.isFinite(r.mtimeMs) ||
						typeof r.size !== "number" ||
						!Number.isFinite(r.size)
					) {
						return null;
					}
					return { path: r.path, mtimeMs: r.mtimeMs, size: r.size };
				})
				.filter((row): row is CandidatesDirectorySignature => Boolean(row))
		: [];

const parsePluginEffects = (raw: unknown): CandidatesPluginEffect[] =>
	Array.isArray(raw)
		? raw
				.map((row) => {
					const r = row as {
						filePath?: unknown;
						matchName?: unknown;
						displayName?: unknown;
					};
					if (
						typeof r.filePath !== "string" ||
						typeof r.matchName !== "string" ||
						typeof r.displayName !== "string"
					) {
						return null;
					}
					return {
						filePath: r.filePath,
						matchName: r.matchName,
						displayName: r.displayName,
					};
				})
				.filter((row): row is CandidatesPluginEffect => Boolean(row))
		: [];

const parseManifest = (
	raw: Record<string, unknown> | null,
): CandidatesManifest | null => {
	if (raw?.version !== 1 || typeof raw.updatedAt !== "string") {
		return null;
	}
	const chunks = Array.isArray(raw.chunks)
		? raw.chunks
				.map((row) => {
					const r = row as { id?: unknown; label?: unknown; count?: unknown };
					if (
						typeof r.id !== "string" ||
						typeof r.label !== "string" ||
						typeof r.count !== "number" ||
						!Number.isFinite(r.count)
					) {
						return null;
					}
					return { id: r.id, label: r.label, count: r.count };
				})
				.filter((row): row is CandidatesChunkRef => Boolean(row))
		: [];
	const directorySignatureChunks = Array.isArray(raw.directorySignatureChunks)
		? raw.directorySignatureChunks
				.map((row) => {
					const r = row as { id?: unknown; label?: unknown; count?: unknown };
					if (
						typeof r.id !== "string" ||
						typeof r.label !== "string" ||
						typeof r.count !== "number" ||
						!Number.isFinite(r.count)
					) {
						return null;
					}
					return { id: r.id, label: r.label, count: r.count };
				})
				.filter((row): row is CandidatesChunkRef => Boolean(row))
		: [];
	const pluginEffectChunks = Array.isArray(raw.pluginEffectChunks)
		? raw.pluginEffectChunks
				.map((row) => {
					const r = row as { id?: unknown; label?: unknown; count?: unknown };
					if (
						typeof r.id !== "string" ||
						typeof r.label !== "string" ||
						typeof r.count !== "number" ||
						!Number.isFinite(r.count)
					) {
						return null;
					}
					return { id: r.id, label: r.label, count: r.count };
				})
				.filter((row): row is CandidatesChunkRef => Boolean(row))
		: [];
	return {
		version: 1,
		updatedAt: raw.updatedAt,
		roots: parseRoots(raw.roots),
		rootFiles: parseRootFiles(raw.rootFiles),
		directorySignatures: parseDirectorySignatures(raw.directorySignatures),
		pluginEffects: parsePluginEffects(raw.pluginEffects),
		chunks,
		directorySignatureChunks,
		pluginEffectChunks,
	};
};

const parseChunk = (
	raw: Record<string, unknown> | null,
): CandidatesChunk | null => {
	if (raw?.version !== 1 || typeof raw.id !== "string") {
		return null;
	}
	return {
		version: 1,
		id: raw.id,
		rootFiles: parseRootFiles(raw.rootFiles),
	};
};

const parseDirectorySignatureChunk = (
	raw: Record<string, unknown> | null,
): CandidatesDirectorySignatureChunk | null => {
	if (raw?.version !== 1 || typeof raw.id !== "string") {
		return null;
	}
	return {
		version: 1,
		id: raw.id,
		directorySignatures: parseDirectorySignatures(raw.directorySignatures),
	};
};

const parsePluginEffectChunk = (
	raw: Record<string, unknown> | null,
): CandidatesPluginEffectChunk | null => {
	if (raw?.version !== 1 || typeof raw.id !== "string") {
		return null;
	}
	return {
		version: 1,
		id: raw.id,
		pluginEffects: parsePluginEffects(raw.pluginEffects),
	};
};

export const readCandidates = async (
	win: Window,
	options?: {
		maxRootFiles?: number;
		maxPluginEffects?: number;
		includeDirectorySignatures?: boolean;
		includePluginEffects?: boolean;
	},
): Promise<CandidatesCache | null> => {
	const manifestRaw = await readJson(win, "candidates");
	const manifest = parseManifest(manifestRaw);
	if (!manifest) return null;
	const rootFiles: CandidatesRootFile[] = [...(manifest.rootFiles ?? [])];
	const maxRootFiles =
		typeof options?.maxRootFiles === "number" &&
		Number.isFinite(options.maxRootFiles)
			? Math.max(0, Math.floor(options.maxRootFiles))
			: null;
	const maxPluginEffects =
		typeof options?.maxPluginEffects === "number" &&
		Number.isFinite(options.maxPluginEffects)
			? Math.max(0, Math.floor(options.maxPluginEffects))
			: null;
	const rootChunkRefs = manifest.chunks;
	const rootChunkRaws = await Promise.all(
		rootChunkRefs.map((ref) => readJson(win, "candidatesChunk", ref.id)),
	);
	for (const chunkRaw of rootChunkRaws) {
		if (maxRootFiles !== null && rootFiles.length >= maxRootFiles) {
			break;
		}
		const chunk = parseChunk(chunkRaw);
		if (chunk) {
			if (maxRootFiles === null) {
				rootFiles.push(...chunk.rootFiles);
			} else {
				rootFiles.push(
					...chunk.rootFiles.slice(0, maxRootFiles - rootFiles.length),
				);
			}
		}
	}
	const directorySignatures: CandidatesDirectorySignature[] = [];
	if (options?.includeDirectorySignatures !== false) {
		directorySignatures.push(...(manifest.directorySignatures ?? []));
		const dirChunkRefs = manifest.directorySignatureChunks ?? [];
		const dirChunkRaws = await Promise.all(
			dirChunkRefs.map((ref) => readJson(win, "candidatesChunk", ref.id)),
		);
		for (const chunkRaw of dirChunkRaws) {
			const chunk = parseDirectorySignatureChunk(chunkRaw);
			if (chunk) {
				directorySignatures.push(...chunk.directorySignatures);
			}
		}
	}
	const pluginEffects: CandidatesPluginEffect[] = [];
	if (options?.includePluginEffects !== false) {
		pluginEffects.push(...(manifest.pluginEffects ?? []));
		const pluginChunkRefs = manifest.pluginEffectChunks ?? [];
		const pluginChunkRaws = await Promise.all(
			pluginChunkRefs.map((ref) => readJson(win, "candidatesChunk", ref.id)),
		);
		for (const chunkRaw of pluginChunkRaws) {
			if (
				maxPluginEffects !== null &&
				pluginEffects.length >= maxPluginEffects
			) {
				break;
			}
			const chunk = parsePluginEffectChunk(chunkRaw);
			if (chunk) {
				if (maxPluginEffects === null) {
					pluginEffects.push(...chunk.pluginEffects);
				} else {
					pluginEffects.push(
						...chunk.pluginEffects.slice(
							0,
							maxPluginEffects - pluginEffects.length,
						),
					);
				}
			}
		}
	}
	return {
		version: 1,
		updatedAt: manifest.updatedAt,
		roots: manifest.roots,
		rootFiles,
		directorySignatures,
		pluginEffects,
	};
};

export const writeCandidates = async (
	win: Window,
	data: CandidatesCache,
): Promise<void> => {
	const chunks = buildCandidatesChunks(data.rootFiles, data.roots);
	const directorySignatureChunks = makeDirectorySignatureChunks(
		data.directorySignatures,
	);
	const pluginEffectChunks = makePluginEffectChunks(data.pluginEffects);
	const writeJobs: Promise<void>[] = [];
	for (const { chunk } of chunks) {
		writeJobs.push(writeJson(win, "candidatesChunk", chunk, chunk.id));
	}
	for (const { chunk } of directorySignatureChunks) {
		writeJobs.push(writeJson(win, "candidatesChunk", chunk, chunk.id));
	}
	for (const { chunk } of pluginEffectChunks) {
		writeJobs.push(writeJson(win, "candidatesChunk", chunk, chunk.id));
	}
	await Promise.all(writeJobs);
	const manifest: CandidatesManifest = {
		version: 1,
		updatedAt: data.updatedAt,
		roots: data.roots,
		chunks: chunks.map(({ ref }) => ref),
		directorySignatureChunks: directorySignatureChunks.map(({ ref }) => ref),
		pluginEffectChunks: pluginEffectChunks.map(({ ref }) => ref),
	};
	await writeJson(win, "candidates", manifest);
};

export const __testCandidatesChunking = {
	buildCandidatesChunks,
	makeDirectorySignatureChunks,
	makePluginEffectChunks,
	MAX_ROOT_FILES_PER_CHUNK,
	MAX_DIRECTORY_SIGNATURES_PER_CHUNK,
	MAX_PLUGIN_EFFECTS_PER_CHUNK,
};
