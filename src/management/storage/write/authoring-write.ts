/**
 * Common authoring-asset writer — Issue #160.
 *
 * One writer for every text-based authored preset asset (Layer / Comp /
 * Code / Easing) so no per-preset fallback logic can drift:
 *
 * ```text
 * path validation
 * → normal native write
 * → permission failure only: privileged write
 * → read-back verification
 * → typed result
 * ```
 *
 * Rules this module enforces:
 *
 * - The normal write always runs first. A target under AE Support Files
 *   is NOT a reason to show UAC up front; the elevated path is reached
 *   only after `EACCES` / `EPERM` / `EROFS` (or their Windows message
 *   equivalents).
 * - Non-permission failures (malformed path, disk error, unknown) never
 *   escalate. They come back as a typed failure with the original cause.
 * - A dismissed UAC consent dialog is its own typed failure. Nothing
 *   downstream may treat it as success.
 * - Success is only reported after `exists === true` and the read-back
 *   content matches the expected bytes. Verification never rewrites, so
 *   a retry cannot produce a duplicate or a second write.
 *
 * Path authorization happens before this module is reached — in
 * ExtendScript via `authorizeSaveDir`, which shares one root model with
 * read and execute. `rootClass` here is diagnostics only; it never gates
 * the write and never implies escalation.
 */
import type { PresetSaveRootClass } from "@/management/ae/host/contract";
import { createLogger } from "@/management/debug/logger";
import {
	createFolderWithElevation,
	isElevationAvailable,
	writeFileWithElevation,
} from "@/management/storage/write/elevation-service";

/** Which mechanism actually landed (or attempted to land) the bytes. */
export type AuthoringWriterKind =
	| "native"
	| "elevated-native"
	| "host-native-dialog"
	/** No writer ran — path authority or host preparation rejected first. */
	| "none";

export type AuthoringWriteErrorCode =
	| "malformed-path"
	| "fs-unavailable"
	| "write-failed"
	| "permission-denied"
	| "elevation-unavailable"
	| "elevation-cancelled"
	| "elevation-failed"
	| "verification-failed";

/**
 * Outcome of the escalation decision. `not-requested` means no permission
 * failure occurred, so `elevationRequested` stays false; `unavailable`
 * means a privileged write was needed but this host has no elevation
 * mechanism — also without a request.
 */
export type AuthoringElevationResult =
	| "not-requested"
	| "requested-granted"
	| "requested-consent-denied"
	| "unavailable"
	| "requested-failed";

export type AuthoringFirstAttempt =
	| "not-attempted"
	| "success"
	| "permission-denied"
	| "failed";

export type AuthoringVerification =
	| "not-attempted"
	| "passed"
	| "missing"
	| "content-mismatch";

type AuthoringWriteBase = {
	readonly path: string;
	readonly rootClass: PresetSaveRootClass;
	readonly writer: AuthoringWriterKind;
	readonly firstAttempt: AuthoringFirstAttempt;
	readonly elevationRequested: boolean;
	readonly elevationResult: AuthoringElevationResult;
	readonly verification: AuthoringVerification;
};

export type AuthoringWriteFailure = AuthoringWriteBase & {
	readonly ok: false;
	readonly code: AuthoringWriteErrorCode;
	readonly message: string;
};

export type AuthoringWriteSuccess = Omit<
	AuthoringWriteFailure,
	"ok" | "code" | "verification"
> & {
	readonly ok: true;
	readonly code: null;
	readonly verification: "passed";
};

export type AuthoringWriteResult =
	| AuthoringWriteSuccess
	| AuthoringWriteFailure;

export type AuthoredTextAssetInput = {
	readonly win: Window;
	readonly targetPath: string;
	readonly content: string;
	readonly rootClass: PresetSaveRootClass;
	/** `layer` | `comp` | `code` | `easing` — diagnostics discriminator. */
	readonly presetKind: string;
	readonly presetId?: string | null;
};

export type AuthoredDirectoryInput = {
	readonly win: Window;
	readonly targetDir: string;
	readonly rootClass: PresetSaveRootClass;
	/** `animation` — the only authoring flow that needs a directory alone. */
	readonly presetKind: string;
	readonly presetId?: string | null;
};

type AuthoringFs = {
	mkdirSync(path: string, options: { recursive: true }): void;
	writeFileSync(path: string, data: string, encoding: "utf8"): void;
	existsSync(path: string): boolean;
	readFileSync(path: string, encoding: "utf8"): string;
};

type CepNodeRequire = (id: string) => unknown;

const authoringLog = createLogger("preset-execution");

/** Windows/macOS permission failures that a UAC / admin prompt can clear. */
const PERMISSION_ERROR_CODES = new Set(["EACCES", "EPERM", "EROFS"]);

const PERMISSION_MESSAGE_MARKERS = [
	"eacces",
	"eperm",
	"erofs",
	"operation not permitted",
	"permission denied",
	"access is denied",
	"read-only file system",
];

const errorMessage = (error: unknown): string => {
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
};

const isPermissionError = (error: unknown): boolean => {
	const code = (error as { code?: unknown } | null)?.code;
	if (typeof code === "string" && PERMISSION_ERROR_CODES.has(code)) {
		return true;
	}
	const message = errorMessage(error).toLowerCase();
	return PERMISSION_MESSAGE_MARKERS.some((marker) => message.includes(marker));
};

/**
 * Absolute-path check that accepts Windows drive, UNC, and POSIX forms and
 * rejects relative / drive-relative input. A rejected path must never
 * reach elevation: escalation cannot repair a malformed target.
 */
const isAbsoluteFsPath = (value: string): boolean =>
	/^[a-zA-Z]:[\\/]/.test(value) || /^[/\\]{1,2}[^/\\]/.test(value);

/** Parent directory of a file path, preserving `C:/` style drive roots. */
export const dirnameOf = (filePath: string): string => {
	const normalized = String(filePath).replace(/\\/g, "/");
	const separator = normalized.lastIndexOf("/");
	if (separator < 0) {
		return "";
	}
	if (separator === 0) {
		return "/";
	}
	const directory = normalized.slice(0, separator);
	return /^[a-zA-Z]:$/.test(directory) ? `${directory}/` : directory;
};

const resolveAuthoringFs = (win: Window): AuthoringFs | null => {
	const requireFn = (
		win as Window & { cep_node?: { require?: CepNodeRequire } }
	).cep_node?.require;
	if (typeof requireFn !== "function") {
		return null;
	}
	try {
		const fsModule = requireFn("fs") as Partial<AuthoringFs>;
		if (
			typeof fsModule.mkdirSync !== "function" ||
			typeof fsModule.writeFileSync !== "function" ||
			typeof fsModule.existsSync !== "function" ||
			typeof fsModule.readFileSync !== "function"
		) {
			return null;
		}
		return fsModule as AuthoringFs;
	} catch {
		return null;
	}
};

/**
 * Compare the read-back bytes with what was asked for.
 *
 * A leading UTF-8 byte-order mark is encoding metadata rather than
 * content, and `readFileSync(path, "utf8")` does not strip it — a writer
 * that emits one (historically `[System.Text.Encoding]::UTF8`) would
 * otherwise be reported as a mismatch on bytes that are actually
 * correct. Both sides are normalized so the comparison is about content.
 */
const verifyReadBack = (
	fs: AuthoringFs,
	path: string,
	content: string,
): AuthoringVerification => {
	try {
		if (!fs.existsSync(path)) {
			return "missing";
		}
		return stripLeadingBom(fs.readFileSync(path, "utf8")) ===
			stripLeadingBom(content)
			? "passed"
			: "content-mismatch";
	} catch {
		// A read-back that throws means we cannot prove the bytes landed,
		// which is a verification failure — never a success.
		return "missing";
	}
};

const stripLeadingBom = (value: string): string =>
	value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;

const logAuthoringWrite = (
	result: AuthoringWriteResult,
	event: string,
	details: Readonly<Record<string, unknown>>,
): void => {
	const context: Readonly<Record<string, unknown>> = {
		event,
		presetKind: details.presetKind ?? null,
		presetId: details.presetId ?? null,
		rootClass: result.rootClass,
		path: result.path,
		writer: result.writer,
		firstAttempt: result.firstAttempt,
		elevationRequested: result.elevationRequested,
		elevationResult: result.elevationResult,
		verification: result.verification,
		finalErrorCode: result.code,
	};
	try {
		if (result.ok) {
			authoringLog.info(`[ty-plus:preset-authoring] ${event}`, { context });
		} else {
			authoringLog.error(`[ty-plus:preset-authoring] ${event}`, { context });
		}
	} catch {
		// Diagnostics are observational and must never break a save.
	}
};

const failure = (
	input: AuthoringWriteBase & {
		code: AuthoringWriteErrorCode;
		message: string;
	},
): AuthoringWriteFailure => ({
	...input,
	ok: false,
});

const success = (input: AuthoringWriteBase): AuthoringWriteSuccess => ({
	...input,
	ok: true,
	code: null,
	message: "",
	verification: "passed",
});

const classifyElevationFailure = (
	stderr: string,
	exitCode: number,
): "permission-denied" | "elevation-failed" => {
	const text = `${stderr} ${exitCode}`.toLowerCase();
	return PERMISSION_MESSAGE_MARKERS.some((marker) => text.includes(marker))
		? "permission-denied"
		: "elevation-failed";
};

const describeElevationFailure = (stderr: string, exitCode: number): string => {
	const exitNote = exitCode >= 0 ? ` (exit code ${exitCode})` : "";
	const detail = stderr.trim();
	return detail
		? `Elevated write reported an error${exitNote}: ${detail}`
		: `Elevated write reported an error${exitNote}`;
};

/**
 * Write one authored text asset.
 *
 * Never throws: every outcome is a typed result so the authoring flow can
 * keep a failed elevation from reaching the catalog persist step.
 */
export const writeAuthoredTextAsset = async (
	input: AuthoredTextAssetInput,
): Promise<AuthoringWriteResult> => {
	const base = {
		path: input.targetPath,
		rootClass: input.rootClass,
		writer: "native" as const,
		firstAttempt: "not-attempted" as const,
		elevationRequested: false,
		elevationResult: "not-requested" as const,
		verification: "not-attempted" as const,
	};

	if (!isAbsoluteFsPath(String(input.targetPath ?? ""))) {
		const result = failure({
			...base,
			code: "malformed-path",
			message: `Preset asset path is not an absolute path: ${input.targetPath}`,
		});
		logAuthoringWrite(result, "preset.asset.write", input);
		return result;
	}

	const fs = resolveAuthoringFs(input.win);
	if (!fs) {
		const result = failure({
			...base,
			code: "fs-unavailable",
			message:
				"Preset asset write is unavailable: the CEP Node filesystem is not accessible in this window.",
		});
		logAuthoringWrite(result, "preset.asset.write", input);
		return result;
	}

	// 1. Normal native write. Exactly one attempt — a retry here would be
	//    the duplicate write the transactional contract forbids.
	try {
		fs.mkdirSync(dirnameOf(input.targetPath), { recursive: true });
		fs.writeFileSync(input.targetPath, input.content, "utf8");
	} catch (error) {
		if (!isPermissionError(error)) {
			const result = failure({
				...base,
				code: "write-failed",
				message: `Preset asset write failed: ${errorMessage(error)}`,
				firstAttempt: "failed",
			});
			logAuthoringWrite(result, "preset.asset.write", input);
			return result;
		}
		return escalateWrite(input, base, errorMessage(error));
	}

	const verification = verifyReadBack(fs, input.targetPath, input.content);
	if (verification !== "passed") {
		const result = failure({
			...base,
			code: "verification-failed",
			message:
				verification === "missing"
					? `Preset asset is missing after write: ${input.targetPath}`
					: `Preset asset content did not match after write: ${input.targetPath}`,
			firstAttempt: "success",
			verification,
		});
		logAuthoringWrite(result, "preset.asset.write", input);
		return result;
	}

	const result = success({ ...base, firstAttempt: "success" });
	logAuthoringWrite(result, "preset.asset.write", input);
	return result;
};

/**
 * Permission-failure branch: request elevation exactly once, then verify.
 */
const escalateWrite = (
	input: AuthoredTextAssetInput,
	base: {
		path: string;
		rootClass: PresetSaveRootClass;
		writer: AuthoringWriterKind;
		firstAttempt: AuthoringFirstAttempt;
		elevationRequested: boolean;
		elevationResult: AuthoringElevationResult;
		verification: AuthoringVerification;
	},
	permissionMessage: string,
): Promise<AuthoringWriteResult> => {
	if (!isElevationAvailable(input.win)) {
		const result = failure({
			...base,
			code: "elevation-unavailable",
			message: `Preset asset write was denied by permissions and no elevation mechanism is available on this host: ${input.targetPath} (${permissionMessage})`,
			firstAttempt: "permission-denied",
			elevationRequested: false,
			elevationResult: "unavailable",
		});
		logAuthoringWrite(result, "preset.asset.write", input);
		return Promise.resolve(result);
	}

	const elevated = writeFileWithElevation(
		input.win,
		input.targetPath,
		input.content,
	);
	// From here on the elevated adapter is the writer of record, so every
	// outcome reports it even when the consent was refused.
	const elevatedBase = { ...base, writer: "elevated-native" as const };
	if (elevated.elevatedConsentDenied) {
		const result = failure({
			...elevatedBase,
			code: "elevation-cancelled",
			message: `Administrator permission was declined for ${input.targetPath}. The preset asset was not saved.`,
			firstAttempt: "permission-denied",
			elevationRequested: true,
			elevationResult: "requested-consent-denied",
		});
		logAuthoringWrite(result, "preset.asset.write", input);
		return Promise.resolve(result);
	}
	if (!elevated.ok) {
		const code = classifyElevationFailure(elevated.stderr, elevated.exitCode);
		const result = failure({
			...elevatedBase,
			code,
			message:
				code === "permission-denied"
					? `Preset asset write was denied by permissions: ${input.targetPath}`
					: `${describeElevationFailure(elevated.stderr, elevated.exitCode)} (${input.targetPath})`,
			firstAttempt: "permission-denied",
			elevationRequested: true,
			elevationResult: "requested-failed",
		});
		logAuthoringWrite(result, "preset.asset.write", input);
		return Promise.resolve(result);
	}

	const fs = resolveAuthoringFs(input.win);
	const verification = fs
		? verifyReadBack(fs, input.targetPath, input.content)
		: "missing";
	if (verification !== "passed") {
		const result = failure({
			...elevatedBase,
			code: "verification-failed",
			message:
				verification === "missing"
					? `Preset asset is missing after the elevated write: ${input.targetPath}`
					: `Preset asset content did not match after the elevated write: ${input.targetPath}`,
			firstAttempt: "permission-denied",
			elevationRequested: true,
			elevationResult: "requested-granted",
			verification,
		});
		logAuthoringWrite(result, "preset.asset.write", input);
		return Promise.resolve(result);
	}

	const result = success({
		...elevatedBase,
		firstAttempt: "permission-denied",
		elevationRequested: true,
		elevationResult: "requested-granted",
	});
	logAuthoringWrite(result, "preset.asset.write", input);
	return Promise.resolve(result);
};

/**
 * Create an authorized authoring directory.
 *
 * Used by the Animation Preset (`.ffx`) flow, where After Effects' native
 * Save Animation Preset dialog owns the actual file write: ty-plus only
 * has to guarantee the target folder exists before that dialog opens.
 */
export const ensureAuthoredDirectory = async (
	input: AuthoredDirectoryInput,
): Promise<AuthoringWriteResult> => {
	const base = {
		path: input.targetDir,
		rootClass: input.rootClass,
		writer: "native" as const,
		firstAttempt: "not-attempted" as const,
		elevationRequested: false,
		elevationResult: "not-requested" as const,
		verification: "not-attempted" as const,
	};

	if (!isAbsoluteFsPath(String(input.targetDir ?? ""))) {
		const result = failure({
			...base,
			code: "malformed-path",
			message: `Preset asset directory is not an absolute path: ${input.targetDir}`,
		});
		logAuthoringWrite(result, "preset.asset.directory", input);
		return result;
	}

	const fs = resolveAuthoringFs(input.win);
	if (!fs) {
		const result = failure({
			...base,
			code: "fs-unavailable",
			message:
				"Preset asset directory creation is unavailable: the CEP Node filesystem is not accessible in this window.",
		});
		logAuthoringWrite(result, "preset.asset.directory", input);
		return result;
	}

	try {
		fs.mkdirSync(input.targetDir, { recursive: true });
	} catch (error) {
		if (!isPermissionError(error)) {
			const result = failure({
				...base,
				code: "write-failed",
				message: `Preset asset directory could not be created: ${errorMessage(error)}`,
				firstAttempt: "failed",
			});
			logAuthoringWrite(result, "preset.asset.directory", input);
			return result;
		}
		if (!isElevationAvailable(input.win)) {
			const result = failure({
				...base,
				code: "elevation-unavailable",
				message: `Preset asset directory creation was denied by permissions and no elevation mechanism is available on this host: ${input.targetDir}`,
				firstAttempt: "permission-denied",
				elevationResult: "unavailable",
			});
			logAuthoringWrite(result, "preset.asset.directory", input);
			return result;
		}
		const elevated = createFolderWithElevation(input.win, input.targetDir);
		const elevatedExists = fs.existsSync(input.targetDir);
		if (elevated.elevatedConsentDenied) {
			const result = failure({
				...base,
				code: "elevation-cancelled",
				message: `Administrator permission was declined for ${input.targetDir}. The preset asset directory was not created.`,
				writer: "elevated-native",
				firstAttempt: "permission-denied",
				elevationRequested: true,
				elevationResult: "requested-consent-denied",
				verification: "missing",
			});
			logAuthoringWrite(result, "preset.asset.directory", input);
			return result;
		}
		if (!elevated.ok || !elevatedExists) {
			const code = elevated.ok
				? "verification-failed"
				: classifyElevationFailure(elevated.stderr, elevated.exitCode);
			const result = failure({
				...base,
				code,
				message: elevated.ok
					? `Preset asset directory is missing after the elevated creation: ${input.targetDir}`
					: code === "permission-denied"
						? `Preset asset directory creation was denied by permissions: ${input.targetDir}`
						: `${describeElevationFailure(elevated.stderr, elevated.exitCode)} (${input.targetDir})`,
				writer: "elevated-native",
				firstAttempt: "permission-denied",
				elevationRequested: true,
				elevationResult: "requested-failed",
				verification: elevatedExists ? "passed" : "missing",
			});
			logAuthoringWrite(result, "preset.asset.directory", input);
			return result;
		}
		const result = success({
			...base,
			writer: "elevated-native",
			firstAttempt: "permission-denied",
			elevationRequested: true,
			elevationResult: "requested-granted",
		});
		logAuthoringWrite(result, "preset.asset.directory", input);
		return result;
	}

	if (!fs.existsSync(input.targetDir)) {
		const result = failure({
			...base,
			code: "verification-failed",
			message: `Preset asset directory is missing after creation: ${input.targetDir}`,
			firstAttempt: "success",
			verification: "missing",
		});
		logAuthoringWrite(result, "preset.asset.directory", input);
		return result;
	}

	const result = success({ ...base, firstAttempt: "success" });
	logAuthoringWrite(result, "preset.asset.directory", input);
	return result;
};
