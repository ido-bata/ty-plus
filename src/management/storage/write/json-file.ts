/**
 * Write-side JSON file primitives.
 *
 * Owns file mutation and parent directory creation. Read-only callers must use
 * `management/storage/read/json-file` instead.
 */

import { normalizeJsonText } from "@/management/storage/read/json-file";

type JsonWriteFileSystem = {
	writeFile(path: string, data: string, encoding: "utf8"): Promise<void>;
	mkdir(
		path: string,
		options: { recursive: true },
	): Promise<string | undefined>;
	unlink(path: string): Promise<void>;
};

type CepNodeRequire = (id: string) => unknown;

const readCepNodeRequireFromWindow = (win: Window): CepNodeRequire | null => {
	const maybe = win as Window & {
		cep_node?: { require?: CepNodeRequire };
	};
	if (typeof maybe.cep_node?.require === "function") {
		return maybe.cep_node.require;
	}
	return null;
};

/**
 * Resolve a write-capable JSON file system from the given Window.
 * Prefers CEP Node `fs/promises` when available; falls back to `node:fs/promises`.
 */
const resolveJsonWriteFileSystem = async (
	win: Window,
): Promise<JsonWriteFileSystem> => {
	const requireFn = readCepNodeRequireFromWindow(win);
	if (requireFn) {
		const fsMod = requireFn("fs") as {
			promises?: JsonWriteFileSystem;
			writeFileSync?: (path: string, data: string, encoding: "utf8") => void;
			mkdirSync?: (path: string, options: { recursive: true }) => void;
		};
		if (fsMod.promises) {
			return fsMod.promises;
		}
		if (fsMod.writeFileSync && fsMod.mkdirSync) {
			const writeFileSync = fsMod.writeFileSync;
			const mkdirSync = fsMod.mkdirSync;
			return {
				writeFile: async (path, data, encoding) =>
					writeFileSync(String(path), String(data), encoding as "utf8"),
				mkdir: async (path, options) => {
					mkdirSync(String(path), options as { recursive: true });
					return undefined;
				},
				unlink: async (path) => {
					// CEP Node `fs/promises` exposes `unlink`; if unavailable in
					// this host, fall through to a synchronous `unlinkSync`.
					const u = (fsMod as { unlinkSync?: (p: string) => void }).unlinkSync;
					if (u) {
						u(String(path));
						return;
					}
					throw new Error(
						"CEP Node fs unlink API is not available in this host runtime.",
					);
				},
			};
		}
		throw new Error(
			"CEP Node fs write API is not available in this host runtime.",
		);
	}
	const fsPromises = await import("node:fs/promises");
	return {
		writeFile: (path, data, encoding) =>
			fsPromises.writeFile(path, data, encoding),
		mkdir: (path, options) => fsPromises.mkdir(path, options),
		unlink: (path) => fsPromises.unlink(path),
	};
};

/**
 * Write text to a file, creating parent directories as needed.
 * Silently no-ops if path cannot be resolved (e.g., null support root).
 */
export const writeJsonFileText = async (
	win: Window,
	path: string,
	text: string,
): Promise<void> => {
	const fs = await resolveJsonWriteFileSystem(win);
	const normalizedText = normalizeJsonText(text);
	const normalizedPath = path.replace(/\\/g, "/");
	const dir = normalizedPath.split("/").slice(0, -1).join("/");
	if (dir) {
		await fs.mkdir(dir, { recursive: true });
	}
	await fs.writeFile(path, normalizedText, "utf8");
};

/**
 * Delete a file from disk. Idempotent — missing files (ENOENT) are treated
 * as success so callers can use this for "restore-to-not-exists" rollback
 * paths without first probing for the file's presence. Other errors
 * (EACCES, EBUSY, etc.) propagate to the caller.
 *
 * Use this when the rollback target is "file did not exist before" — see
 * Issue #146 / Blocker 6. Going through `writeNJson(..., "")` would either
 * `JSON.parse("")`-crash (Bug 6) or leave an empty stub file behind, both
 * of which break the read-back verify on the next attempt.
 */
export const unlinkJsonFileText = async (
	win: Window,
	path: string,
): Promise<void> => {
	const fs = await resolveJsonWriteFileSystem(win);
	try {
		await fs.unlink(path);
	} catch (error) {
		const code = (error as { code?: unknown } | null)?.code;
		if (code === "ENOENT") {
			return;
		}
		throw error;
	}
};
