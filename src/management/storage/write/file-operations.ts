/**
 * File operations for CEP environment.
 * Uses ExtendScript's File object for binary write via evalScript.
 */

import { evalScript } from "@/management/ae/cep/eval";
import {
	buildEnsureDirScriptWithParents,
	buildWriteBase64FileScript,
} from "@/management/storage/extendscript/file-operations.ext";
import { bytesToBase64 } from "@/shared/util/bytes-to-base64";

/**
 * Write bytes to a file using ExtendScript File.write with base64 decode.
 * Handles folder creation automatically via ExtendScript.
 *
 * Verifies the post-write file length matches the requested byte count.
 * ExtendScript's `File.write` returns true on "no exception" but the file
 * may not actually be on disk if the underlying volume rejected the flush
 * (e.g., read-only mount, permission lost mid-write). Comparing the file's
 * length with `bytes.length` catches that case and turns a silent failure
 * into an exception the caller can surface.
 */
export const writeBytesToFile = async (
	win: Window,
	filePath: string,
	bytes: Uint8Array,
): Promise<void> => {
	// Use the chunked encoder — the naive `String.fromCharCode(...bytes)`
	// overflows V8's argument list on multi-MB buffers (e.g. plugin
	// downloads), throwing "Maximum call stack size exceeded".
	const base64 = bytesToBase64(bytes);
	const script = buildWriteBase64FileScript(filePath, base64);
	const result = await evalScript(win, script);
	const trimmed = (result ?? "").trim();
	if (!trimmed) {
		throw new Error("writeBytesToFile failed: empty result");
	}
	const writtenLength = Number(trimmed);
	if (!Number.isFinite(writtenLength)) {
		throw new Error(`writeBytesToFile failed: ${trimmed}`);
	}
	if (writtenLength !== bytes.length) {
		throw new Error(
			`writeBytesToFile failed: expected ${bytes.length} bytes, got ${writtenLength}`,
		);
	}
};

/**
 * Ensure a directory exists, creating it if necessary.
 */
const ensureDir = async (win: Window, dirPath: string): Promise<void> => {
	const script = buildEnsureDirScriptWithParents(dirPath);
	await evalScript(win, script);
};
