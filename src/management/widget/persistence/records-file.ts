/**
 * Widget records file (`widgets/widgets.json`) — parse/serialize only here;
 * bytes via the unified persistence API (`writeJson` / `readJson`).
 *
 * `readWidgetRecords` returns parsed `WidgetRecord[]` (filtering invalid types)
 * and is read-only: it may degrade to `[]` because nothing writes back what it
 * read.
 *
 * `upsertWidgetRecords` and `ensureWidgetRecordsFile` read-merge-write, so they
 * go through the strict classification below instead: a file that exists but
 * cannot be parsed must throw, never become the empty base of a write-back
 * (Issue #183 — the same "empty success" class as Issues #182/#204).
 */

import {
	readJson,
	readJsonText,
	writeJson,
} from "@/management/storage/persistence";
import type { WidgetRecord } from "@/management/widget/record/types";
import { parseRecordsJsonValue } from "@/management/widget/record/types";

/** Why `widgets/widgets.json` could not be turned into records. */
export type WidgetRecordsFileFailureReason =
	| "read-error"
	| "json-parse-failed"
	| "unrecognized-shape";

/**
 * `widgets/widgets.json` exists but cannot be used as a records document.
 *
 * Throwing (instead of returning `[]`) is the whole point: every caller that
 * catches this and writes back would replace a corrupt file with a valid,
 * empty one and permanently delete the records it failed to read.
 */
export class WidgetRecordsFileError extends Error {
	readonly reason: WidgetRecordsFileFailureReason;

	constructor(reason: WidgetRecordsFileFailureReason, message: string) {
		super(message);
		this.name = "WidgetRecordsFileError";
		this.reason = reason;
	}
}

const errorMessage = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

type WidgetRecordsFileRead =
	| { status: "missing" }
	| { status: "loaded"; records: WidgetRecord[] };

/**
 * Classify the raw records file before anything merges into it.
 *
 * - no file / blank file → `missing` (a legitimate first write)
 * - parseable records document → `loaded`
 * - anything else → throws {@link WidgetRecordsFileError}
 */
const readWidgetRecordsFileStrict = async (
	win: Window,
): Promise<WidgetRecordsFileRead> => {
	let raw: string | null;
	try {
		raw = await readJsonText(win, "widgetRecords");
	} catch (error) {
		throw new WidgetRecordsFileError(
			"read-error",
			`widgets/widgets.json could not be read: ${errorMessage(error)}`,
		);
	}
	if (raw == null || !raw.trim()) return { status: "missing" };

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		throw new WidgetRecordsFileError(
			"json-parse-failed",
			`widgets/widgets.json is not valid JSON: ${errorMessage(error)}`,
		);
	}
	if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new WidgetRecordsFileError(
			"unrecognized-shape",
			`widgets/widgets.json is not a records object (got ${Array.isArray(parsed) ? "array" : typeof parsed})`,
		);
	}
	const document = parsed as Record<string, unknown>;
	// The canonical file always carries a `widgets` array (see
	// `writeWidgetRecords`). A `version` without one means the document was
	// truncated by something that still produced parseable JSON — merging
	// into that as if it were empty is exactly the deletion we are avoiding.
	if ("version" in document && !Array.isArray(document.widgets)) {
		throw new WidgetRecordsFileError(
			"unrecognized-shape",
			"widgets/widgets.json has no widgets array",
		);
	}
	return { status: "loaded", records: parseRecordsJsonValue(document) };
};

export const readWidgetRecords = async (
	win: Window,
): Promise<WidgetRecord[]> => {
	const json = await readJson(win, "widgetRecords");
	if (json === null) return [];
	return parseRecordsJsonValue(json);
};

export const writeWidgetRecords = async (
	win: Window,
	records: readonly WidgetRecord[],
): Promise<void> => {
	await writeJson(win, "widgetRecords", {
		version: 1,
		widgets: [...records],
	});
};

export const ensureWidgetRecordsFile = async (win: Window): Promise<void> => {
	// Strict even though this only *creates*: the previous `readJson(...) ===
	// null` check could not tell a missing file from an unreadable one, so a
	// corrupt `widgets/widgets.json` was silently replaced by an empty one at
	// boot.
	const existing = await readWidgetRecordsFileStrict(win);
	if (existing.status === "loaded") return;
	await writeJson(win, "widgetRecords", { version: 1, widgets: [] });
};

export const upsertWidgetRecords = async (
	win: Window,
	records: readonly WidgetRecord[],
): Promise<void> => {
	const existing = await readWidgetRecordsFileStrict(win);
	const base = existing.status === "loaded" ? existing.records : [];
	const upserted = new Map(base.map((r) => [r.id, r]));
	for (const record of records) {
		upserted.set(record.id, record);
	}
	await writeWidgetRecords(win, Array.from(upserted.values()));
};
