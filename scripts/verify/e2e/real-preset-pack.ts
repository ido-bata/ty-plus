/**
 * Seeds the sandbox catalog with a real-world preset pack (Issue #633).
 *
 * The dg-* fixtures prove the run pipeline, but they are two hand-made
 * records. Real users import folder trees with nested groups and
 * same-stem thumbnail siblings — this module mirrors the onboarding
 * import contract (`presets.json` rows + `groups.json` folder groups)
 * for an extracted pack so E2E covers hierarchy, CJK/symbol paths, and
 * sibling `.gif` thumbnails.
 *
 * Pack location: `TY_PLUS_E2E_PRESET_PACK` env, else the sibling
 * `ty-plus-e2e-assets/` directory next to the repo root (works from
 * any linked worktree). Missing pack → returns null and the caller
 * warns; suites still run.
 */
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PRESET_ID_PREFIX = "mvfx-";
const GROUP_ID_PREFIX = "mvfx-grp-";
const PACK_ENV = "TY_PLUS_E2E_PRESET_PACK";

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
	"..",
	"..",
);

/** Pack dir: `TY_PLUS_E2E_PRESET_PACK` env, else sibling `ty-plus-e2e-assets/`. */
const resolvePresetPackDir = (): string =>
	process.env[PACK_ENV]?.trim() ||
	path.resolve(repoRoot, "..", "ty-plus-e2e-assets");

/** Scan the pack dir for .ffx presets + group-bearing directories. */
export const scanRealPresetPack = async (
	packRoot: string = resolvePresetPackDir(),
): Promise<PackScan> => scanPack(packRoot);

type PackScan = {
	/** .ffx absolute paths sorted by repo-relative path for determinism. */
	presetPaths: string[];
	/** Every directory (absolute) that has at least one descendant .ffx. */
	groupDirs: string[];
};

const scanPack = async (root: string): Promise<PackScan> => {
	const presetPaths: string[] = [];
	const groupDirs: string[] = [];
	const walk = async (dir: string): Promise<boolean> => {
		let entries: import("node:fs").Dirent[];
		try {
			entries = await readdir(dir, { withFileTypes: true });
		} catch {
			return false;
		}
		let hasPreset = false;
		for (const e of entries) {
			const full = path.join(dir, e.name);
			if (e.isDirectory()) {
				if (await walk(full)) hasPreset = true;
			} else if (e.name.toLowerCase().endsWith(".ffx")) {
				presetPaths.push(full);
				hasPreset = true;
			}
		}
		if (hasPreset) groupDirs.push(dir);
		return hasPreset;
	};
	await walk(root);
	presetPaths.sort((a, b) => a.localeCompare(b, "en"));
	return { presetPaths, groupDirs };
};

const slugifyGroupId = (relPath: string): string => {
	const slug = relPath
		.split(/[\\/]+/)
		.map((seg) => seg.replace(/[^\p{L}\p{N}]+/gu, ""))
		.filter(Boolean)
		.join("-")
		.toLowerCase();
	return `${GROUP_ID_PREFIX}${slug || "root"}`;
};

const readJsonFile = async <T>(file: string, fallback: T): Promise<T> => {
	try {
		return { ...fallback, ...(JSON.parse(await readFile(file, "utf8")) as T) };
	} catch {
		return fallback;
	}
};

export type RealPresetPackSeed = {
	presets: number;
	groups: number;
	packRoot: string;
};

/**
 * Merge pack records into the sandbox catalogs. Idempotent: previous
 * `mvfx-*` rows are replaced, other catalog content (dg-* fixtures,
 * user presets copied with the managed root) is preserved.
 *
 * `assetRoot` stages a copy of the pack (presets + sibling images) under
 * an executable root — the host's `assertAllowedFilePath` only accepts
 * `Folder.userData`, the extension dir, and AE Support Files, so records
 * pointing at the original pack location can never run. Group ids and
 * titles derive from pack-relative structure, which the copy preserves.
 */
export const seedRealPresetPack = async (
	sandboxRoot: string,
	assetRoot?: string,
): Promise<RealPresetPackSeed | null> => {
	const sourceRoot = resolvePresetPackDir();
	const scan = await scanRealPresetPack(sourceRoot);
	if (scan.presetPaths.length === 0) return null;

	let recordRoot = sourceRoot;
	if (assetRoot) {
		// Recreate the staging dir so `cp` lands the pack contents at
		// assetRoot itself and stale files from earlier packs cannot leak
		// into the seeded catalog.
		await rm(assetRoot, { recursive: true, force: true });
		await cp(sourceRoot, assetRoot, { recursive: true });
		recordRoot = assetRoot;
	}
	const recordScan =
		recordRoot === sourceRoot ? scan : await scanRealPresetPack(recordRoot);

	const presetIdByPath = new Map<string, string>();
	const presetRecords = recordScan.presetPaths.map((filePath, i) => {
		const id = `${PRESET_ID_PREFIX}${String(i + 1).padStart(3, "0")}`;
		presetIdByPath.set(path.resolve(filePath), id);
		const stem = path.basename(filePath).replace(/\.[^.]+$/, "");
		const rel = path.relative(recordRoot, filePath).split(path.sep).join("/");
		return {
			id,
			type: "preset",
			title: stem,
			filePath,
			description: `MV-Effects pack: ${rel}`,
		};
	});

	// Group per directory with descendant presets; members are resolved
	// by path containment, mirroring the onboarding import contract.
	const groupRecords = recordScan.groupDirs
		.map((dir) => {
			const dirKey = path.resolve(dir);
			const memberIds = recordScan.presetPaths
				.filter((p) => {
					const rel = path.relative(dirKey, path.resolve(p));
					return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
				})
				.map((p) => presetIdByPath.get(path.resolve(p)))
				.filter((id): id is string => Boolean(id));
			return {
				id: slugifyGroupId(path.relative(recordRoot, dir)),
				title: path.basename(dir),
				presetIds: [...new Set(memberIds)],
			};
		})
		.filter((g) => g.presetIds.length > 0);

	const presetsPath = path.join(sandboxRoot, "presets", "presets.json");
	const groupsPath = path.join(sandboxRoot, "groups", "groups.json");
	await mkdir(path.dirname(presetsPath), { recursive: true });
	await mkdir(path.dirname(groupsPath), { recursive: true });

	const presetCatalog = await readJsonFile<{
		version?: number;
		presets?: Record<string, unknown>[];
	}>(presetsPath, { version: 1, presets: [] });
	const keptPresets = (presetCatalog.presets ?? []).filter(
		(p) => typeof p?.id !== "string" || !p.id.startsWith(PRESET_ID_PREFIX),
	);
	await writeFile(
		presetsPath,
		`${JSON.stringify(
			{ version: 1, presets: [...keptPresets, ...presetRecords] },
			null,
			2,
		)}\n`,
	);

	const groupCatalog = await readJsonFile<{
		version?: number;
		groups?: Record<string, unknown>[];
	}>(groupsPath, { version: 1, groups: [] });
	const keptGroups = (groupCatalog.groups ?? []).filter(
		(g) => typeof g?.id !== "string" || !g.id.startsWith(GROUP_ID_PREFIX),
	);
	await writeFile(
		groupsPath,
		`${JSON.stringify(
			{ version: 1, groups: [...keptGroups, ...groupRecords] },
			null,
			2,
		)}\n`,
	);

	return {
		presets: presetRecords.length,
		groups: groupRecords.length,
		packRoot: recordRoot,
	};
};
