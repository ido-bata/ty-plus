/**
 * Mirror of the host-side `safeName` used to build an authored asset's
 * file name (`src/management/ae/jsx/host-bundle.ext.ts`).
 *
 * The authoring dialogs preview the target path and probe for an
 * already-existing file before the save. If the preview sanitized the
 * name differently from the host, the shown path would name a file that
 * is never written and the "file already exists" probe would look for the
 * wrong entry — the same class of divergence Issue #160 removed from the
 * persisted `filePath`.
 *
 * Returns `""` when nothing survives sanitization; callers keep their own
 * display fallback while the host substitutes `preset_<timestamp>`.
 */
export const hostSafeFileName = (name: string): string =>
	name
		.trim()
		.replace(/[^a-zA-Z0-9_-]/g, "_")
		.slice(0, 48);
