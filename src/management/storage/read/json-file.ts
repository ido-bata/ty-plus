/**
 * Read-side JSON file primitives.
 *
 * Owns read-only file access and JSON decoding helpers. This module must not
 * import from `management/storage/write`.
 */

type JsonReadFileSystem = {
	readFile(path: string, encoding: "utf8"): Promise<string>;
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

/** Parse a raw string into a JSON object. Returns null for null/undefined/empty/invalid. */
export const parseJsonObject = (
	raw: string | null | undefined,
): Record<string, unknown> | null => {
	if (raw == null) return null;
	const trimmed = raw.trim();
	if (!trimmed) return null;
	try {
		const parsed = JSON.parse(trimmed);
		if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
			return null;
		}
		return parsed as Record<string, unknown>;
	} catch {
		return null;
	}
};

/** Stringify a value to JSON with 2-space formatting and a trailing newline. */
export const stringifyJson = (value: unknown): string =>
	`${JSON.stringify(value, null, 2)}\n`;

/** Normalize valid JSON text to the repo's pretty-printed format. */
export const normalizeJsonText = (text: string): string => {
	const trimmed = text.trim();
	if (!trimmed) return text;
	try {
		return stringifyJson(JSON.parse(trimmed));
	} catch {
		return text;
	}
};

/**
 * Resolve a read-only JSON file system from the given Window.
 * Prefers CEP Node `fs/promises` when available; falls back to `node:fs/promises`.
 */
const resolveJsonReadFileSystem = async (
	win: Window,
): Promise<JsonReadFileSystem> => {
	const requireFn = readCepNodeRequireFromWindow(win);
	if (requireFn) {
		const fsMod = requireFn("fs") as {
			promises?: JsonReadFileSystem;
			readFileSync?: (path: string, encoding: "utf8") => string;
		};
		if (fsMod.promises) {
			return fsMod.promises;
		}
		if (fsMod.readFileSync) {
			const readFileSync = fsMod.readFileSync;
			return {
				readFile: async (path, encoding) =>
					readFileSync(String(path), encoding as "utf8"),
			};
		}
		throw new Error(
			"CEP Node fs read API is not available in this host runtime.",
		);
	}
	const fsPromises = await import("node:fs/promises");
	return {
		readFile: (path, encoding) => fsPromises.readFile(path, encoding),
	};
};

/** True when the error is a missing-file error (ENOENT). */
const isFileNotFound = (error: unknown): boolean =>
	typeof error === "object" &&
	error !== null &&
	(error as { code?: unknown }).code === "ENOENT";

/**
 * Read file text content, keeping "there is no file" apart from "the file
 * is there but cannot be read".
 *
 * Returns null only for a missing file (and for a blank one, which no
 * reader can distinguish from "not created"). Any other read failure
 * propagates, so a caller that merges-and-writes can refuse to turn an
 * unreadable file into an empty one (Issue #183; the same distinction the
 * layout restore classification makes for Issue #204).
 */
export const readJsonFileTextStrict = async (
	win: Window,
	path: string,
): Promise<string | null> => {
	const fs = await resolveJsonReadFileSystem(win);
	try {
		const body = await fs.readFile(path, "utf8");
		const trimmed = body.trim();
		return trimmed.length > 0 ? trimmed : null;
	} catch (error) {
		if (isFileNotFound(error)) return null;
		throw error;
	}
};

/**
 * Read file text content. Returns null if the file is missing or unreadable.
 *
 * Deliberately lenient: a read side that only renders a default can treat
 * "unreadable" like "missing". Anything that writes back what it read MUST
 * use {@link readJsonFileTextStrict} instead — collapsing the two is how a
 * corrupt file becomes an empty one on the next write.
 */
export const readJsonFileText = async (
	win: Window,
	path: string,
): Promise<string | null> => {
	try {
		return await readJsonFileTextStrict(win, path);
	} catch {
		return null;
	}
};
