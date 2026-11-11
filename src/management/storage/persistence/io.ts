/**
 * Unified persistence I/O. Use writeJson/readJson/removeJson everywhere;
 * never call writeJsonFileText / readJsonFileText / unlinkJsonFileText
 * directly from outside storage/.
 *
 * This implementation uses the Rust storage runtime via IPC.
 *
 * ## Backend uniformity (Issue #146 / Blocker 9)
 *
 * `removeJson`, `readJson`, and `writeJson` all route through the same
 * `persistenceGateway` when one has been initialized. The previous
 * implementation called `unlinkJsonFileText` on the local fs even when the
 * gateway was active, which silently broke rollback paths under any
 * non-local backend (sandboxed storage, virtual fs, host bridge). Production
 * code MUST go through this module — `unlinkJsonFileText` stays exported
 * from `write/json-file` only for the explicit `json-file` tests that
 * exercise the local fs path.
 */

import {
	parseJsonObject,
	readJsonFileText,
	stringifyJson,
} from "@/management/storage/read/json-file";
import {
	unlinkJsonFileText,
	writeJsonFileText,
} from "@/management/storage/write/json-file";
import type { PersistenceGateway } from "../runtime-gateway-port";
import {
	resolveReadManagedRoot,
	resolveWriteManagedRoot,
} from "./managed-root";
import { PATHS, type PersistenceKey } from "./paths";

type Tail<T extends unknown[]> = T extends [unknown, ...infer R] ? R : never;
type PathArgs<K extends PersistenceKey> = Tail<Parameters<(typeof PATHS)[K]>>;

/**
 * Persistence gateway instance.
 * Set during initialization to use Rust storage via IPC.
 */
let persistenceGateway: PersistenceGateway | null = null;

/**
 * Initialize the persistence gateway for I/O.
 * Must be called before any readJson/writeJson operations.
 */
export const initPersistenceGateway = (gateway: PersistenceGateway): void => {
	persistenceGateway = gateway;
};

export const writeJson = async <K extends PersistenceKey>(
	win: Window,
	key: K,
	payload: unknown,
	...args: PathArgs<K>
): Promise<void> => {
	if (persistenceGateway) {
		await persistenceGateway.writeJson({
			key: key as string,
			args: args.map(String),
			value: payload,
		});
		return;
	}

	const root = await resolveWriteManagedRoot(win);
	const path = (PATHS[key] as (root: string, ...a: PathArgs<K>) => string)(
		root,
		...args,
	);
	await writeJsonFileText(win, path, stringifyJson(payload));
};

export const readJson = async <K extends PersistenceKey>(
	win: Window,
	key: K,
	...args: PathArgs<K>
): Promise<Record<string, unknown> | null> => {
	if (persistenceGateway) {
		const result = await persistenceGateway.readJson({
			key: key as string,
			args: args.map(String),
		});
		if (result.value === null) return null;
		if (
			typeof result.value === "object" &&
			result.value !== null &&
			!Array.isArray(result.value)
		) {
			return result.value as Record<string, unknown>;
		}
		return null;
	}

	const root = await resolveReadManagedRoot(win);
	if (!root) return null;
	const path = (PATHS[key] as (root: string, ...a: PathArgs<K>) => string)(
		root,
		...args,
	);
	const raw = await readJsonFileText(win, path);
	return parseJsonObject(raw);
};

/**
 * Read raw text from a persistence key, bypassing JSON parsing.
 * Use this when callers need the JSON text (e.g. to feed into a parser that
 * understands the document's specific shape) rather than a generic object.
 */
export const readJsonText = async <K extends PersistenceKey>(
	win: Window,
	key: K,
	...args: PathArgs<K>
): Promise<string | null> => {
	if (persistenceGateway) {
		const result = await persistenceGateway.readText({
			key: key as string,
			args: args.map(String),
		});
		return result.text;
	}

	const root = await resolveReadManagedRoot(win);
	if (!root) return null;
	const path = (PATHS[key] as (root: string, ...a: PathArgs<K>) => string)(
		root,
		...args,
	);
	return readJsonFileText(win, path);
};

/**
 * Delete the file at a persistence key. Idempotent — a missing file is
 * treated as success. Used by rollback paths that need to restore a
 * "file didn't exist before" state without leaving behind an empty stub
 * (Issue #146 / Blocker 6).
 *
 * Issue #146 / Blocker 9: this primitive now goes through the same
 * `persistenceGateway` as `readJson` / `writeJson`. The previous
 * implementation called `unlinkJsonFileText` directly even when the
 * gateway was active, which silently broke rollback paths under any
 * non-local backend. Production code MUST call this function — the local
 * `unlinkJsonFileText` primitive remains in `write/json-file.ts` only
 * for tests that explicitly target the local-fs path.
 *
 * When no `persistenceGateway` is configured (the test environment
 * before `initPersistenceGateway` runs) the call falls back to the local
 * filesystem via `resolveWriteManagedRoot` + `unlinkJsonFileText`. This
 * matches the read/write fallback semantics; the gateway path is what
 * production uses.
 */
export const removeJson = async <K extends PersistenceKey>(
	win: Window,
	key: K,
	...args: PathArgs<K>
): Promise<void> => {
	if (persistenceGateway) {
		await persistenceGateway.removeJson({
			key: key as string,
			args: args.map(String),
		});
		return;
	}

	// Test-only local fallback (mirror writeJson/readJson). Production
	// callers go through the gateway above; this branch exists only so
	// `removeJson` still works in unit tests that exercise the local-fs
	// path before initPersistenceGateway runs.
	const root = await resolveWriteManagedRoot(win);
	if (!root) return;
	const path = (PATHS[key] as (root: string, ...a: PathArgs<K>) => string)(
		root,
		...args,
	);
	await unlinkJsonFileText(win, path);
};
