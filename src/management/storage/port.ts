/**
 * Storage port interface.
 *
 * This module defines the TypeScript storage port that closes around
 * operation units, preventing arbitrary read/write path access.
 */

// ── Core types ──────────────────────────────────────────────────────────────

/** Storage operation result. */
type StorageResult<T = void> = {
	readonly success: boolean;
	readonly data?: T;
	readonly error?: StorageError;
};

/** Storage error. */
type StorageError = {
	readonly code: StorageErrorCode;
	readonly message: string;
	readonly details?: unknown;
};

/** Storage error codes. */
type StorageErrorCode =
	| "NOT_FOUND"
	| "ALREADY_EXISTS"
	| "CORRUPTED"
	| "PERMISSION_DENIED"
	| "QUOTA_EXCEEDED"
	| "REVISION_MISMATCH"
	| "UNKNOWN";

// ── JSON operations ─────────────────────────────────────────────────────────

/** JSON read operation. */
interface JsonReadPort {
	/**
	 * Reads a JSON file and parses it.
	 */
	readJson<T>(key: string): Promise<StorageResult<T>>;
}

/** JSON write operation. */
interface JsonWritePort {
	/**
	 * Writes a JSON value to a file.
	 * Supports expected revision for optimistic concurrency.
	 */
	writeJson<T>(
		key: string,
		value: T,
		options?: { readonly expectedRevision?: string },
	): Promise<StorageResult<{ readonly revision: string }>>;
}

/** JSON delete operation. */
interface JsonDeletePort {
	/**
	 * Deletes a JSON file.
	 */
	deleteJson(key: string): Promise<StorageResult<void>>;
}

// ── Binary operations ───────────────────────────────────────────────────────

/** Binary read operation. */
interface BinaryReadPort {
	/**
	 * Reads a binary file.
	 */
	readBytes(key: string): Promise<StorageResult<Uint8Array>>;
}

/** Binary write operation. */
interface BinaryWritePort {
	/**
	 * Writes binary data to a file.
	 */
	writeBytes(key: string, data: Uint8Array): Promise<StorageResult<void>>;
}

// ── Directory operations ────────────────────────────────────────────────────

/** Directory read operation. */
interface DirectoryReadPort {
	/**
	 * Lists files in a directory.
	 */
	listDir(key: string): Promise<StorageResult<readonly string[]>>;
}

/** Directory write operation. */
interface DirectoryWritePort {
	/**
	 * Ensures a directory exists.
	 */
	ensureDir(key: string): Promise<StorageResult<void>>;

	/**
	 * Deletes a directory and its contents.
	 */
	deleteDir(key: string): Promise<StorageResult<void>>;
}

// ── Combined ports ──────────────────────────────────────────────────────────

/** Read-only storage port. */
type ReadOnlyStoragePort = JsonReadPort & BinaryReadPort & DirectoryReadPort;

/** Write-only storage port. */
type WriteOnlyStoragePort = JsonWritePort &
	JsonDeletePort &
	BinaryWritePort &
	DirectoryWritePort;

/** Full storage port. */
export type StoragePort = ReadOnlyStoragePort & WriteOnlyStoragePort;

// ── Scoped storage port ─────────────────────────────────────────────────────

/** Creates a scoped storage port that prefixes all keys. */
export const createScopedStoragePort = (
	parent: StoragePort,
	scope: string,
): StoragePort => ({
	readJson: (key) => parent.readJson(`${scope}/${key}`),
	writeJson: (key, value, options) =>
		parent.writeJson(`${scope}/${key}`, value, options),
	deleteJson: (key) => parent.deleteJson(`${scope}/${key}`),
	readBytes: (key) => parent.readBytes(`${scope}/${key}`),
	writeBytes: (key, data) => parent.writeBytes(`${scope}/${key}`, data),
	listDir: (key) => parent.listDir(`${scope}/${key}`),
	ensureDir: (key) => parent.ensureDir(`${scope}/${key}`),
	deleteDir: (key) => parent.deleteDir(`${scope}/${key}`),
});
