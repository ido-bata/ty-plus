/**
 * UUIDs are equal, opaque, per-unit Source of Truth.
 *
 * Every generated ID is a bare UUID v4 (or compatible fallback). Two IDs are equal
 * iff their string forms are equal. No ID carries type, name, locality, or any other
 * meaning. Any code that infers meaning from an ID string violates this contract.
 *
 * The sole generators are in `src/management/storage/ids.ts`:
 *   - `createInstanceId()`
 *   - `createLocalPresetCatalogId()`
 *   - `createPresetPlacementInstanceId()`
 *
 * Use `assertOpaqueId` to validate externally-received IDs before storage or comparison.
 */

const UUID_LIKE_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Known legacy prefixes that must NOT appear in new IDs. */
const FORBIDDEN_PREFIXES = ["local-", "pcl:", "ppi:", "wsi:"] as const;

/**
 * Assert that `id` is an opaque, meaning-free UUID.
 *
 * Throws in development ("dev-warn" mode) if the string:
 *   - is not a bare UUID shape, OR
 *   - contains a known legacy prefix (`local-`, `pcl:`, `ppi:`, `wsi:`)
 *
 * Callers use this to guard external input (parsed JSON, IPC messages, clipboard)
 * before it reaches storage or is used as a reference.
 */
export const assertOpaqueId = (id: string): void => {
	if (!id || typeof id !== "string") {
		throw new Error(
			`assertOpaqueId: expected non-empty string, got ${JSON.stringify(id)}`,
		);
	}

	const trimmed = id.trim();

	if (!UUID_LIKE_PATTERN.test(trimmed)) {
		throw new Error(`assertOpaqueId: ID does not match bare UUID shape: ${id}`);
	}

	for (const prefix of FORBIDDEN_PREFIXES) {
		if (trimmed.toLowerCase().startsWith(prefix)) {
			throw new Error(
				`assertOpaqueId: ID contains forbidden prefix "${prefix}": ${id}`,
			);
		}
	}
};
