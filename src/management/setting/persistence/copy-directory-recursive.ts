import { resolveSettingsNodeFsPromises } from "@/management/setting/persistence/node-fs";
import { assertSafeDirectoryCopy } from "@/management/setting/persistence/path-copy-safety";
import {
	removePathWithElevation,
	requestFolderWriteElevation,
} from "@/management/storage/write/elevation-service";

const normalizeFsPath = (value: string): string =>
	value.trim().replace(/\\/g, "/").replace(/\/+$/, "");

const joinFsPath = (...parts: string[]): string => {
	const normalized: string[] = [];
	for (const part of parts) {
		const v = normalizeFsPath(part);
		if (v.length > 0) normalized.push(v);
	}
	return normalized.join("/");
};

export const pathExistsOnDisk = async (
	win: Window,
	dirPath: string,
): Promise<boolean> => {
	const trimmed = dirPath.trim();
	if (!trimmed) {
		return false;
	}
	const fs = await resolveSettingsNodeFsPromises(win);
	if (!fs.access) {
		return true;
	}
	try {
		await fs.access(trimmed);
		return true;
	} catch {
		return false;
	}
};

const rejectSymlinkEntry = (info: {
	isDirectory(): boolean;
	isSymbolicLink(): boolean;
	name?: string;
}): void => {
	if (info.isSymbolicLink()) {
		throw new Error(
			`Refusing to copy symlink/reparse point: ${info.name ?? "entry"}`,
		);
	}
};

const copyDirectoryManual = async (
	win: Window,
	sourceDir: string,
	destDir: string,
): Promise<void> => {
	const fs = await resolveSettingsNodeFsPromises(win);
	if (!fs.readdir || !fs.lstat) {
		throw new Error("Recursive copy requires readdir/lstat on this host.");
	}
	await fs.mkdir(destDir, { recursive: true });
	const entries = await fs.readdir(sourceDir);
	for (const entry of entries) {
		const fromPath = joinFsPath(sourceDir, entry);
		const toPath = joinFsPath(destDir, entry);
		const info = await fs.lstat(fromPath);
		rejectSymlinkEntry(info);
		if (info.isDirectory()) {
			await copyDirectoryManual(win, fromPath, toPath);
			continue;
		}
		const requireFn = (
			win as Window & { cep_node?: { require?: (id: string) => unknown } }
		).cep_node?.require;
		if (requireFn) {
			const fsMod = requireFn("fs") as {
				readFileSync?: (path: string) => Buffer;
				writeFileSync?: (path: string, data: Buffer) => void;
				mkdirSync?: (path: string, options: { recursive: true }) => void;
			};
			if (fsMod.readFileSync && fsMod.writeFileSync) {
				const body = fsMod.readFileSync(fromPath);
				const parent = toPath.split("/").slice(0, -1).join("/");
				if (parent) {
					fsMod.mkdirSync?.(parent, { recursive: true });
				}
				fsMod.writeFileSync(toPath, body);
				continue;
			}
		}
		const nodeFs = await import("node:fs/promises");
		const body = await nodeFs.readFile(fromPath);
		const parent = toPath.split("/").slice(0, -1).join("/");
		if (parent) {
			await nodeFs.mkdir(parent, { recursive: true });
		}
		await nodeFs.writeFile(toPath, body);
	}
};

/**
 * Copies a directory tree. Uses `fs.cp` when available, otherwise walks manually.
 *
 * Symbolic links, junctions, and other reparse points are explicitly rejected
 * during manual walks so that a malicious source cannot direct the copy outside
 * the configured source root. `fs.cp` does not follow this same contract across
 * hosts, so callers preferring the simple path should not rely on it alone.
 */
export const copyDirectoryRecursive = async (
	win: Window,
	sourceDir: string,
	destDir: string,
): Promise<void> => {
	const source = sourceDir.trim();
	const dest = destDir.trim();
	if (!source || !dest) {
		return;
	}
	if (!(await pathExistsOnDisk(win, source))) {
		return;
	}
	assertSafeDirectoryCopy(source, dest);
	const fs = await resolveSettingsNodeFsPromises(win);
	await fs.mkdir(dest, { recursive: true });
	if (fs.cp) {
		await fs.cp(source, dest, { recursive: true, force: true });
		return;
	}
	await copyDirectoryManual(win, source, dest);
};

/**
 * Removes a directory tree when supported by the host fs API.
 */
const removeDirectoryRecursive = async (
	win: Window,
	dirPath: string,
): Promise<void> => {
	const target = dirPath.trim();
	if (!target || !(await pathExistsOnDisk(win, target))) {
		return;
	}
	const fs = await resolveSettingsNodeFsPromises(win);
	if (fs.rm) {
		await fs.rm(target, { recursive: true, force: true });
		return;
	}
	if (!fs.readdir || !fs.stat) {
		throw new Error(
			"Recursive delete requires rm or readdir/stat on this host.",
		);
	}
	const entries = await fs.readdir(target);
	for (const entry of entries) {
		const child = joinFsPath(target, entry);
		const info = await fs.stat(child);
		if (info.isDirectory()) {
			await removeDirectoryRecursive(win, child);
			continue;
		}
		const nodeFs = await import("node:fs/promises");
		await nodeFs.unlink(child);
	}
	const nodeFs = await import("node:fs/promises");
	await nodeFs.rmdir(target);
};

/**
 * Deletes a directory tree; requests UAC / admin elevation when the host denies access.
 */
export const removeDirectoryRecursiveWithElevation = async (
	win: Window,
	dirPath: string,
): Promise<void> => {
	const target = dirPath.trim();
	if (!target || !(await pathExistsOnDisk(win, target))) {
		return;
	}
	try {
		await removeDirectoryRecursive(win, target);
		return;
	} catch (firstError) {
		const parent = target.replace(/\\/g, "/").split("/").slice(0, -1).join("/");
		if (parent) {
			requestFolderWriteElevation(win, parent);
		}
		try {
			await removeDirectoryRecursive(win, target);
			return;
		} catch {
			if (removePathWithElevation(win, target)) {
				return;
			}
		}
		throw firstError instanceof Error
			? firstError
			: new Error("Failed to delete folder after elevation was requested.");
	}
};
