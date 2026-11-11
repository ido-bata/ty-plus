/**
 * Storage runtime gateway.
 *
 * This module provides the TypeScript gateway for storage operations,
 * mapping domain types to wire DTOs.
 */

import type { RuntimeRequestDispatcher } from "../ipc";
import type { StorageRuntimeMethod } from "./runtime-gateway";

// ── Types ──────────────────────────────────────────────────────────────────

/** Storage read request. */
export interface StorageReadRequest {
	readonly key: string;
}

/** Storage read response. */
export interface StorageReadResponse {
	readonly content: string;
	readonly revision?: string;
}

/** Storage write request. */
export interface StorageWriteRequest {
	readonly key: string;
	readonly content: string;
	readonly expectedRevision?: string;
}

/** Storage write response. */
export interface StorageWriteResponse {
	readonly revision: string;
}

/** Storage delete request. */
export interface StorageDeleteRequest {
	readonly key: string;
}

/** Storage list request. */
export interface StorageListRequest {
	readonly key: string;
}

/** Storage list response. */
export interface StorageListResponse {
	readonly entries: readonly string[];
}

/** Storage ensure directory request. */
export interface StorageEnsureDirRequest {
	readonly key: string;
}

// ── Persistence I/O Types ───────────────────────────────────────────────────

/** Persistence read JSON request. */
interface PersistenceReadJsonRequest {
	readonly key: string;
	readonly args: readonly string[];
}

/** Persistence read JSON response. */
interface PersistenceReadJsonResponse {
	readonly value: unknown | null;
}

/** Persistence read text request. */
interface PersistenceReadTextRequest {
	readonly key: string;
	readonly args: readonly string[];
}

/** Persistence read text response. */
interface PersistenceReadTextResponse {
	readonly text: string | null;
}

/** Persistence write JSON request. */
interface PersistenceWriteJsonRequest {
	readonly key: string;
	readonly args: readonly string[];
	readonly value: unknown;
}

/** Persistence remove (delete) JSON request. */
interface PersistenceRemoveJsonRequest {
	readonly key: string;
	readonly args: readonly string[];
}

// ── Methods ────────────────────────────────────────────────────────────────

/** Method for reading a text file. */
export const StorageReadMethod: StorageRuntimeMethod<
	StorageReadRequest,
	StorageReadResponse
> = {
	name: "storage_read",
};

/** Method for writing a text file. */
export const StorageWriteMethod: StorageRuntimeMethod<
	StorageWriteRequest,
	StorageWriteResponse
> = {
	name: "storage_write",
};

/** Method for deleting a file. */
export const StorageDeleteMethod: StorageRuntimeMethod<
	StorageDeleteRequest,
	void
> = {
	name: "storage_delete",
};

/** Method for listing a directory. */
export const StorageListMethod: StorageRuntimeMethod<
	StorageListRequest,
	StorageListResponse
> = {
	name: "storage_list",
};

/** Method for ensuring a directory exists. */
export const StorageEnsureDirMethod: StorageRuntimeMethod<
	StorageEnsureDirRequest,
	void
> = {
	name: "storage_ensure_dir",
};

/** Method for reading JSON via persistence layer. */
const PersistenceReadJsonMethod: StorageRuntimeMethod<
	PersistenceReadJsonRequest,
	PersistenceReadJsonResponse
> = {
	name: "storage.persistence.read-json",
};

/** Method for reading text via persistence layer. */
const PersistenceReadTextMethod: StorageRuntimeMethod<
	PersistenceReadTextRequest,
	PersistenceReadTextResponse
> = {
	name: "storage.persistence.read-text",
};

/** Method for writing JSON via persistence layer. */
const PersistenceWriteJsonMethod: StorageRuntimeMethod<
	PersistenceWriteJsonRequest,
	void
> = {
	name: "storage.persistence.write-json",
};

/**
 * Method for removing (deleting) a JSON file via the persistence layer.
 *
 * Issue #146 / Blocker 9: rollback paths now go through the same gateway
 * as read/write, so a sandboxed storage backend (virtual fs, host bridge,
 * etc.) used in production also handles the "restore to not-exists"
 * rollback state. A backend that does not support removal must reject —
 * the caller's existing catch surfaces it as a rollback failure.
 */
const PersistenceRemoveJsonMethod: StorageRuntimeMethod<
	PersistenceRemoveJsonRequest,
	void
> = {
	name: "storage.persistence.remove-json",
};

// ── Gateway ────────────────────────────────────────────────────────────────

/** Storage gateway interface. */
export interface StorageGateway {
	/**
	 * Reads a text file.
	 */
	read(key: string): Promise<StorageReadResponse>;

	/**
	 * Writes a text file.
	 */
	write(
		key: string,
		content: string,
		options?: { readonly expectedRevision?: string },
	): Promise<StorageWriteResponse>;

	/**
	 * Deletes a file.
	 */
	delete(key: string): Promise<void>;

	/**
	 * Lists a directory.
	 */
	list(key: string): Promise<readonly string[]>;

	/**
	 * Ensures a directory exists.
	 */
	ensureDir(key: string): Promise<void>;
}

/** Persistence gateway interface. */
export interface PersistenceGateway {
	/**
	 * Reads JSON via persistence layer.
	 */
	readJson(
		request: PersistenceReadJsonRequest,
	): Promise<PersistenceReadJsonResponse>;

	/**
	 * Reads text via persistence layer.
	 */
	readText(
		request: PersistenceReadTextRequest,
	): Promise<PersistenceReadTextResponse>;

	/**
	 * Writes JSON via persistence layer.
	 */
	writeJson(request: PersistenceWriteJsonRequest): Promise<void>;

	/**
	 * Removes (deletes) a JSON file via the persistence layer.
	 *
	 * Issue #146 / Blocker 9: this is the canonical way to roll back a
	 * "file did not exist before" pre-image state. Idempotent at the
	 * Rust side (ENOENT is treated as success). A backend that does
	 * not support remove must REJECT so the caller can surface a
	 * rollback failure.
	 */
	removeJson(request: PersistenceRemoveJsonRequest): Promise<void>;
}

/**
 * Creates a storage gateway from a dispatcher.
 */
export const createStorageGateway = (
	dispatcher: RuntimeRequestDispatcher,
): StorageGateway => ({
	read: async (key) =>
		dispatcher.request(StorageReadMethod, {
			key,
		}) as Promise<StorageReadResponse>,
	write: async (key, content, options) =>
		dispatcher.request(StorageWriteMethod, {
			key,
			content,
			expectedRevision: options?.expectedRevision,
		}) as Promise<StorageWriteResponse>,
	delete: async (key) => dispatcher.request(StorageDeleteMethod, { key }),
	list: async (key) => {
		const response = (await dispatcher.request(StorageListMethod, {
			key,
		})) as StorageListResponse;
		return response.entries;
	},
	ensureDir: async (key) => dispatcher.request(StorageEnsureDirMethod, { key }),
});

/**
 * Creates a persistence gateway from a dispatcher.
 */
const createPersistenceGateway = (
	dispatcher: RuntimeRequestDispatcher,
): PersistenceGateway => ({
	readJson: async (request) =>
		dispatcher.request(
			PersistenceReadJsonMethod,
			request,
		) as Promise<PersistenceReadJsonResponse>,
	readText: async (request) =>
		dispatcher.request(
			PersistenceReadTextMethod,
			request,
		) as Promise<PersistenceReadTextResponse>,
	writeJson: async (request) =>
		dispatcher.request(PersistenceWriteJsonMethod, request),
	removeJson: async (request) =>
		dispatcher.request(PersistenceRemoveJsonMethod, request),
});
