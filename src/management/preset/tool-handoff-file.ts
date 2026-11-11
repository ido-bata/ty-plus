import { isPresetToolDialogSurfaceId } from "@/management/preset/registry";
import { readJson, writeJson } from "@/management/storage/persistence";

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

const handoffFileNameForExtensionId = (extensionId: string): string =>
	`${extensionId.replace(/[^a-zA-Z0-9_.-]+/g, "_")}.json`;

/** Module-level cache for the last consumed handoff payload (for dialogs that can't read the file after it's deleted). */
let lastConsumedPayload: Record<string, unknown> | null = null;

/**
 * Stores the handoff payload so dialogs can read it after the file is deleted.
 */
const cachePresetToolHandoffPayload = (
	payload: Record<string, unknown>,
): void => {
	lastConsumedPayload = payload;
};

/**
 * Returns the cached handoff payload from the last call to cachePresetToolHandoffPayload.
 */
export const getCachedPresetToolHandoffPayload = (): Record<
	string,
	unknown
> | null => lastConsumedPayload;

/**
 * Reads the full handoff payload from the preset tool handoff file.
 * Returns null if the file cannot be read or is stale/invalid.
 */
const readPresetToolHandoffPayload = async <T extends Record<string, unknown>>(
	win: Window,
	myExtensionId: string,
): Promise<T | null> => {
	if (!myExtensionId.trim()) {
		return null;
	}

	// Try persistence layer first
	const data = await readJson(win, "toolHandoff", myExtensionId);
	if (data && typeof data === "object") {
		const parsed = data as {
			writtenAt?: unknown;
			[key: string]: unknown;
		};

		// Check stale (older than 2 minutes)
		if (
			typeof parsed.writtenAt === "number" &&
			Number.isFinite(parsed.writtenAt) &&
			Date.now() - parsed.writtenAt > 120_000
		) {
			return null;
		}

		// Return the full payload excluding internal fields
		const { targetExtensionId, writtenAt, presetToolSurfaceId, ...rest } =
			parsed;
		return rest as T;
	}

	// Legacy fallback for CEP userData paths
	const paths = handoffDirAndFile(win, myExtensionId);
	if (!paths) {
		return null;
	}
	const requireFn = readCepNodeRequireFromWindow(win);
	if (!requireFn) {
		return null;
	}
	const fsMod = requireFn("fs") as {
		readFileSync?: (p: string, enc: "utf8") => string;
	};

	if (!fsMod.readFileSync) {
		return null;
	}

	try {
		const raw = fsMod.readFileSync(paths.filePath, "utf8");
		const parsed = JSON.parse(raw) as {
			writtenAt?: unknown;
			[key: string]: unknown;
		};

		// Check stale (older than 2 minutes)
		if (
			typeof parsed.writtenAt === "number" &&
			Number.isFinite(parsed.writtenAt) &&
			Date.now() - parsed.writtenAt > 120_000
		) {
			return null;
		}

		// Return the full payload excluding internal fields
		const { targetExtensionId, writtenAt, presetToolSurfaceId, ...rest } =
			parsed;
		return rest as T;
	} catch {
		return null;
	}
};

const handoffDirAndFile = (
	win: Window,
	extensionId: string,
): { dir: string; filePath: string } | null => {
	const requireFn = readCepNodeRequireFromWindow(win);
	if (!requireFn) {
		return null;
	}
	const pathMod = requireFn("path") as {
		join: (...parts: string[]) => string;
	};
	const root = getCepUserDataPath(win);
	if (!root) {
		return null;
	}
	const dir = pathMod.join(root, "ty-plus", "preset-tool-handoff");
	const filePath = pathMod.join(
		dir,
		handoffFileNameForExtensionId(extensionId),
	);
	return { dir, filePath };
};

const getCepUserDataPath = (win: Window): string | null => {
	try {
		const Ctor = (
			win as unknown as {
				CSInterface?: new () => { getSystemPath?: (key: string) => string };
			}
		).CSInterface;
		if (!Ctor) {
			return null;
		}
		const p = new Ctor().getSystemPath?.("userData");
		return typeof p === "string" && p.trim().length > 0 ? p.trim() : null;
	} catch {
		return null;
	}
};

/**
 * Panel → modeless: in AE, the APPLICATION `dispatchEvent` may not reach
 * modeless dialogs, so the panel writes a launch payload under CEP userData
 * and the modeless side reads and deletes it.
 * Beyond the preset tool's `presetToolSurfaceId`, this is also used for any
 * arbitrary JSON such as the Add Widget dialog's `openerSurfaceId`.
 */
export async function writePresetToolHandoff(
	win: Window,
	extensionId: string,
	payload: Record<string, unknown>,
): Promise<void> {
	if (!extensionId.trim()) {
		return;
	}

	// Write via persistence layer
	const body = {
		...payload,
		targetExtensionId: extensionId,
		writtenAt: Date.now(),
	};
	await writeJson(win, "toolHandoff", body, extensionId);

	// Also write to CEP userData for compatibility
	const paths = handoffDirAndFile(win, extensionId);
	if (!paths) {
		return;
	}
	const requireFn = readCepNodeRequireFromWindow(win);
	if (!requireFn) {
		return;
	}
	const fsMod = requireFn("fs") as {
		promises?: {
			mkdir: (
				p: string,
				o?: { recursive?: boolean },
			) => Promise<string | undefined>;
			writeFile: (p: string, d: string, enc: "utf8") => Promise<void>;
		};
		mkdirSync?: (p: string, o?: { recursive?: boolean }) => void;
		writeFileSync?: (p: string, d: string, enc: "utf8") => void;
	};
	const jsonBody = JSON.stringify(body);
	if (fsMod.promises?.mkdir && fsMod.promises?.writeFile) {
		await fsMod.promises.mkdir(paths.dir, { recursive: true });
		await fsMod.promises.writeFile(paths.filePath, jsonBody, "utf8");
		return;
	}
	if (fsMod.mkdirSync && fsMod.writeFileSync) {
		fsMod.mkdirSync(paths.dir, { recursive: true });
		fsMod.writeFileSync(paths.filePath, jsonBody, "utf8");
	}
}

/**
 * Consumes any handoff bound to our extension id and returns the
 * `presetToolSurfaceId` it contains.
 */
export async function tryConsumePresetToolHandoff(
	win: Window,
	myExtensionId: string,
): Promise<string | null> {
	if (!myExtensionId.trim()) {
		return null;
	}

	// Try persistence layer first
	const data = await readJson(win, "toolHandoff", myExtensionId);
	if (data && typeof data === "object") {
		const parsed = data as {
			targetExtensionId?: unknown;
			writtenAt?: unknown;
			presetToolSurfaceId?: unknown;
		};

		// Cache the full payload before deleting
		try {
			const { targetExtensionId, writtenAt, presetToolSurfaceId, ...rest } =
				parsed;
			lastConsumedPayload = rest;
		} catch {
			/* ignore parsing for cache */
		}

		const sid = parseAndValidateHandoff(parsed, myExtensionId);
		if (sid === "__stale__") {
			// Delete stale file
			await writeJson(win, "toolHandoff", null, myExtensionId);
			return null;
		}
		if (!sid) {
			return null;
		}
		// Delete consumed file
		await writeJson(win, "toolHandoff", null, myExtensionId);
		return sid;
	}

	// Legacy fallback
	const paths = handoffDirAndFile(win, myExtensionId);
	if (!paths) {
		return null;
	}
	const requireFn = readCepNodeRequireFromWindow(win);
	if (!requireFn) {
		return null;
	}
	const fsMod = requireFn("fs") as {
		promises?: {
			readFile: (p: string, enc: "utf8") => Promise<string>;
			unlink: (p: string) => Promise<void>;
		};
		readFileSync?: (p: string, enc: "utf8") => string;
		unlinkSync?: (p: string) => void;
	};

	const unlinkQuiet = async (): Promise<void> => {
		try {
			if (fsMod.promises?.unlink) {
				await fsMod.promises.unlink(paths.filePath);
			} else if (fsMod.unlinkSync) {
				fsMod.unlinkSync(paths.filePath);
			}
		} catch {
			/* ignore */
		}
	};

	try {
		let raw: string;
		if (fsMod.promises?.readFile) {
			raw = await fsMod.promises.readFile(paths.filePath, "utf8");
		} else if (fsMod.readFileSync) {
			raw = fsMod.readFileSync(paths.filePath, "utf8");
		} else {
			return null;
		}
		// Cache the full payload before deleting
		try {
			const parsed = JSON.parse(raw);
			if (parsed && typeof parsed === "object") {
				const { targetExtensionId, writtenAt, presetToolSurfaceId, ...rest } =
					parsed;
				lastConsumedPayload = rest;
			}
		} catch {
			/* ignore parsing for cache */
		}

		const parsed = JSON.parse(raw) as {
			targetExtensionId?: unknown;
			writtenAt?: unknown;
			presetToolSurfaceId?: unknown;
		};
		const sid = parseAndValidateHandoff(parsed, myExtensionId);
		if (sid === "__stale__") {
			await unlinkQuiet();
			return null;
		}
		if (!sid) {
			return null;
		}
		await unlinkQuiet();
		return sid;
	} catch {
		return null;
	}
}

function parseAndValidateHandoff(
	parsed: {
		targetExtensionId?: unknown;
		writtenAt?: unknown;
		presetToolSurfaceId?: unknown;
	},
	myExtensionId: string,
): string | null | "__stale__" {
	if (
		typeof parsed.writtenAt === "number" &&
		Number.isFinite(parsed.writtenAt) &&
		Date.now() - parsed.writtenAt > 120_000
	) {
		return "__stale__";
	}
	if (
		typeof parsed.targetExtensionId === "string" &&
		parsed.targetExtensionId.trim() !== myExtensionId.trim()
	) {
		return null;
	}
	const rawSid = parsed.presetToolSurfaceId;
	if (typeof rawSid !== "string") {
		return null;
	}
	const sid = rawSid.trim();
	if (!sid || !isPresetToolDialogSurfaceId(sid)) {
		return null;
	}
	return sid;
}

/**
 * Discards a modeless launch handoff without reading it (cleanup when
 * `getArguments()` arrives first).
 */
export async function discardModelessLaunchHandoff(
	win: Window,
	myExtensionId: string,
): Promise<void> {
	if (!myExtensionId.trim()) {
		return;
	}

	// Delete via persistence layer
	await writeJson(win, "toolHandoff", null, myExtensionId);

	// Also delete from CEP userData
	const paths = handoffDirAndFile(win, myExtensionId);
	if (!paths) {
		return;
	}
	const requireFn = readCepNodeRequireFromWindow(win);
	if (!requireFn) {
		return;
	}
	const fsMod = requireFn("fs") as {
		promises?: { unlink: (p: string) => Promise<void> };
		unlinkSync?: (p: string) => void;
	};
	try {
		if (fsMod.promises?.unlink) {
			await fsMod.promises.unlink(paths.filePath);
		} else if (fsMod.unlinkSync) {
			fsMod.unlinkSync(paths.filePath);
		}
	} catch {
		/* missing file is fine */
	}
}

const normalizeOpenerWorkspacePanelId = (raw: unknown): string | null => {
	if (typeof raw !== "string") {
		return null;
	}
	const t = raw.trim();
	if (/^panel-[1-5]$/.test(t)) {
		return t;
	}
	const m = /^panel([1-5])$/i.exec(t);
	return m ? `panel-${m[1]}` : null;
};

/**
 * For CEP surfaces (e.g. the Widget selector) where `getArguments()` does
 * not deliver `openerSurfaceId`. Reads the `openerSurfaceId` from the JSON
 * the panel wrote via {@link writePresetToolHandoff}, validates it, and on
 * success deletes the file before returning the value.
 */
export async function tryConsumeDialogOpenerHandoff(
	win: Window,
	myExtensionId: string,
): Promise<string | null> {
	if (!myExtensionId.trim()) {
		return null;
	}

	// Try persistence layer first
	const data = await readJson(win, "toolHandoff", myExtensionId);
	if (data && typeof data === "object") {
		const parsed = data as {
			targetExtensionId?: unknown;
			writtenAt?: unknown;
			openerSurfaceId?: unknown;
			targetPanelId?: unknown;
		};

		const pid = parseAndValidateOpener(parsed, myExtensionId);
		if (pid === "__stale__") {
			await writeJson(win, "toolHandoff", null, myExtensionId);
			return null;
		}
		if (!pid) {
			return null;
		}
		await writeJson(win, "toolHandoff", null, myExtensionId);
		return pid;
	}

	// Legacy fallback
	const paths = handoffDirAndFile(win, myExtensionId);
	if (!paths) {
		return null;
	}
	const requireFn = readCepNodeRequireFromWindow(win);
	if (!requireFn) {
		return null;
	}
	const fsMod = requireFn("fs") as {
		promises?: {
			readFile: (p: string, enc: "utf8") => Promise<string>;
			unlink: (p: string) => Promise<void>;
		};
		readFileSync?: (p: string, enc: "utf8") => string;
		unlinkSync?: (p: string) => void;
	};

	const unlinkQuiet = async (): Promise<void> => {
		try {
			if (fsMod.promises?.unlink) {
				await fsMod.promises.unlink(paths.filePath);
			} else if (fsMod.unlinkSync) {
				fsMod.unlinkSync(paths.filePath);
			}
		} catch {
			/* ignore */
		}
	};

	try {
		let raw: string;
		if (fsMod.promises?.readFile) {
			raw = await fsMod.promises.readFile(paths.filePath, "utf8");
		} else if (fsMod.readFileSync) {
			raw = fsMod.readFileSync(paths.filePath, "utf8");
		} else {
			return null;
		}
		const parsed = JSON.parse(raw) as {
			targetExtensionId?: unknown;
			writtenAt?: unknown;
			openerSurfaceId?: unknown;
			targetPanelId?: unknown;
		};
		const pid = parseAndValidateOpener(parsed, myExtensionId);
		if (pid === "__stale__") {
			await unlinkQuiet();
			return null;
		}
		if (!pid) {
			return null;
		}
		await unlinkQuiet();
		return pid;
	} catch {
		return null;
	}
}

function parseAndValidateOpener(
	parsed: {
		targetExtensionId?: unknown;
		writtenAt?: unknown;
		openerSurfaceId?: unknown;
		targetPanelId?: unknown;
	},
	myExtensionId: string,
): string | null | "__stale__" {
	if (
		typeof parsed.writtenAt === "number" &&
		Number.isFinite(parsed.writtenAt) &&
		Date.now() - parsed.writtenAt > 120_000
	) {
		return "__stale__";
	}
	if (
		typeof parsed.targetExtensionId === "string" &&
		parsed.targetExtensionId.trim() !== myExtensionId.trim()
	) {
		return null;
	}
	return (
		normalizeOpenerWorkspacePanelId(parsed.targetPanelId) ??
		normalizeOpenerWorkspacePanelId(parsed.openerSurfaceId)
	);
}

/**
 * For the Preset edit dialog (`dialog-preset-edit`). Reads the `presetId`
 * from the JSON the panel wrote via {@link writePresetToolHandoff}, validates
 * it, and on success deletes the file before returning the value.
 */
export async function tryConsumePresetEditHandoff(
	win: Window,
	myExtensionId: string,
): Promise<string | null> {
	if (!myExtensionId.trim()) {
		return null;
	}

	// Try persistence layer first
	const data = await readJson(win, "toolHandoff", myExtensionId);
	if (data && typeof data === "object") {
		const parsed = data as {
			targetExtensionId?: unknown;
			writtenAt?: unknown;
			presetId?: unknown;
		};

		const pid = parseAndValidatePresetEdit(parsed, myExtensionId);
		if (pid === "__stale__") {
			await writeJson(win, "toolHandoff", null, myExtensionId);
			return null;
		}
		if (!pid) {
			return null;
		}
		await writeJson(win, "toolHandoff", null, myExtensionId);
		return pid;
	}

	// Legacy fallback
	const paths = handoffDirAndFile(win, myExtensionId);
	if (!paths) {
		return null;
	}
	const requireFn = readCepNodeRequireFromWindow(win);
	if (!requireFn) {
		return null;
	}
	const fsMod = requireFn("fs") as {
		promises?: {
			readFile: (p: string, enc: "utf8") => Promise<string>;
			unlink: (p: string) => Promise<void>;
		};
		readFileSync?: (p: string, enc: "utf8") => string;
		unlinkSync?: (p: string) => void;
	};

	const unlinkQuiet = async (): Promise<void> => {
		try {
			if (fsMod.promises?.unlink) {
				await fsMod.promises.unlink(paths.filePath);
			} else if (fsMod.unlinkSync) {
				fsMod.unlinkSync(paths.filePath);
			}
		} catch {
			/* ignore */
		}
	};

	try {
		let raw: string;
		if (fsMod.promises?.readFile) {
			raw = await fsMod.promises.readFile(paths.filePath, "utf8");
		} else if (fsMod.readFileSync) {
			raw = fsMod.readFileSync(paths.filePath, "utf8");
		} else {
			return null;
		}
		const parsed = JSON.parse(raw) as {
			targetExtensionId?: unknown;
			writtenAt?: unknown;
			presetId?: unknown;
		};
		const pid = parseAndValidatePresetEdit(parsed, myExtensionId);
		if (pid === "__stale__") {
			await unlinkQuiet();
			return null;
		}
		if (!pid) {
			return null;
		}
		await unlinkQuiet();
		return pid;
	} catch {
		return null;
	}
}

function parseAndValidatePresetEdit(
	parsed: {
		targetExtensionId?: unknown;
		writtenAt?: unknown;
		presetId?: unknown;
	},
	myExtensionId: string,
): string | null | "__stale__" {
	if (
		typeof parsed.writtenAt === "number" &&
		Number.isFinite(parsed.writtenAt) &&
		Date.now() - parsed.writtenAt > 120_000
	) {
		return "__stale__";
	}
	if (
		typeof parsed.targetExtensionId === "string" &&
		parsed.targetExtensionId.trim() !== myExtensionId.trim()
	) {
		return null;
	}
	if (typeof parsed.presetId !== "string" || !parsed.presetId.trim()) {
		return null;
	}
	return parsed.presetId.trim();
}
