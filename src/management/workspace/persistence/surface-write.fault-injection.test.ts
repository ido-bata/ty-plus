/**
 * Behavioural partial-failure tests for the persist write sequence
 * (Issue #183, acceptance criterion: "no contradiction is left behind by a
 * partial failure").
 *
 * Unlike the source-level checks in `hook-persist-fire-and-forget.test.ts`,
 * these run the real records / layout / background writers against real files
 * in a throwaway temp directory (never a user's data directory), fail exactly
 * one stage at a time, then read the bytes back. What is asserted is always
 * the residue on disk:
 *
 *   - records fail → the layout file is byte-identical to before;
 *   - layout fails → every pre-existing record id survives and the old layout
 *     still resolves against the records file;
 *   - ui settings fail → the layout that landed references only records that
 *     landed with it;
 *   - after any failure, the next persist converges instead of wedging.
 *
 * The destructive control for this suite is `upsertWidgetRecords`: revert it
 * to merging into `[]` and the corrupt-records case deletes the pre-existing
 * records instead of refusing to write.
 */

import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
	upsertWidgetRecords,
	WidgetRecordsFileError,
} from "@/management/widget/persistence/records-file";
import type { WidgetRecord } from "@/management/widget/record/types";
import {
	writeBackgroundJson,
	writeNJson,
} from "@/management/workspace/layout/panel-json-files";

const fixture = vi.hoisted(() => ({ root: "", dir: "" }));

vi.mock("@/management/storage/persistence/managed-root", async () => {
	const fs = await import("node:fs");
	const os = await import("node:os");
	const path = await import("node:path");
	if (!fixture.root) {
		fixture.dir = fs.mkdtempSync(path.join(os.tmpdir(), "ty-plus-183-"));
		fixture.root = path.join(fixture.dir, "ty-plus");
		fs.mkdirSync(fixture.root, { recursive: true });
	}
	return {
		resolveReadManagedRoot: async () => fixture.root,
		resolveWriteManagedRoot: async () => fixture.root,
	};
});

import {
	type PersistSurfaceStage,
	type SurfaceWriteDeps,
	SurfaceWriteError,
	type SurfaceWriteRequest,
	writeSurfaceState,
} from "./surface-write";

const WIN = {} as Window;
const LAYOUT_PATH = join(fixture.root, "workspaces/workspace-2.json");
const RECORDS_PATH = join(fixture.root, "widgets/widgets.json");
const BG_PATH = join(fixture.root, "workspaces/background/background-2.json");

// The ui-settings stage is driven through a recording stand-in rather than
// the real writer. `writeUiSettings` resolves `settings/ui.json` through
// `joinPath`, which strips the leading slash, so it writes relative to the
// process cwd instead of under the fixture root (pre-existing behaviour, out
// of scope for Issue #183 — and covered by `workspace-ui-settings-file.test.ts`).
// What this suite has to prove about that stage is that it is attempted, that
// a failure there leaves the layout and the records consistent with each
// other, and that the sequence does not run past it.

const PRE_EXISTING_RECORDS: WidgetRecord[] = [
	{ id: "wgt-alpha", type: "menu", param: {} },
	{ id: "wgt-beta", type: "info", param: {} },
];

const NEW_RECORD: WidgetRecord = { id: "wgt-gamma", type: "align", param: {} };

const OLD_LAYOUT_TEXT = `${JSON.stringify(
	{
		gridCells: [
			{ id: "wgt-alpha", x: 0, y: 0, width: 2, height: 2 },
			{ id: "wgt-beta", x: 4, y: 0, width: 2, height: 2 },
		],
	},
	null,
	2,
)}\n`;

const NEW_LAYOUT_TEXT = `${JSON.stringify(
	{
		gridCells: [
			{ id: "wgt-alpha", x: 0, y: 0, width: 2, height: 2 },
			{ id: "wgt-beta", x: 4, y: 0, width: 2, height: 2 },
			{ id: "wgt-gamma", x: 8, y: 0, width: 2, height: 2 },
		],
	},
	null,
	2,
)}\n`;

const CORRUPT_RECORDS_TEXT = `{"version":1,"widgets":[${JSON.stringify(
	PRE_EXISTING_RECORDS[0],
)}`;

const writeSeedFiles = (): void => {
	// The paths above are resolved while this module's imports are evaluated,
	// which is after the mocked managed-root module has been instantiated.
	expect(fixture.root, "managed-root mock did not initialize").not.toBe("");
	expect(LAYOUT_PATH.startsWith(fixture.root)).toBe(true);
	rmSync(fixture.root, { recursive: true, force: true });
	mkdirSync(fixture.root, { recursive: true });
	mkdirSync(join(fixture.root, "workspaces"), { recursive: true });
	mkdirSync(join(fixture.root, "widgets"), { recursive: true });
	writeFileSync(LAYOUT_PATH, OLD_LAYOUT_TEXT, "utf8");
	writeFileSync(
		RECORDS_PATH,
		`${JSON.stringify(
			{ version: 1, widgets: PRE_EXISTING_RECORDS },
			null,
			2,
		)}\n`,
		"utf8",
	);
};

const bytesOf = (path: string): string => readFileSync(path, "utf8");

const recordIdsOnDisk = (): string[] => {
	const parsed = JSON.parse(bytesOf(RECORDS_PATH)) as {
		widgets: { id: string }[];
	};
	return parsed.widgets.map((w) => w.id);
};

const layoutIdsOnDisk = (): string[] => {
	const parsed = JSON.parse(bytesOf(LAYOUT_PATH)) as {
		gridCells: { id: string }[];
	};
	return parsed.gridCells.map((c) => c.id);
};

const request = (
	overrides: Partial<SurfaceWriteRequest> = {},
): SurfaceWriteRequest => ({
	win: WIN,
	panelId: "panel-2",
	wsIndex: 2,
	widgetRecords: [NEW_RECORD],
	layoutJsonText: NEW_LAYOUT_TEXT,
	uiSettings: {
		version: 1,
		showGridOverlay: true,
		showPresetLabels: true,
		selectedFont: "",
	},
	persistenceRootArg: fixture.root,
	backgroundJsonText: null,
	...overrides,
});

type Attempt = {
	/** `null` when the sequence completed. */
	error: unknown;
	/** Every stage the sequence reached, in order. */
	stages: PersistSurfaceStage[];
};

/**
 * Run the production sequence with the real records / layout / background
 * writers, forcing one stage to fail when `failAt` is given, and report both
 * the outcome and how far the sequence got.
 */
const attempt = async (
	failAt: PersistSurfaceStage | null,
	overrides: Partial<SurfaceWriteRequest> = {},
): Promise<Attempt> => {
	const stages: PersistSurfaceStage[] = [];
	const guard = (stage: PersistSurfaceStage): void => {
		stages.push(stage);
		if (failAt === stage) throw new Error(`injected failure at ${stage}`);
	};
	const deps: SurfaceWriteDeps = {
		upsertWidgetRecords: async (...args) => {
			guard("write-widget-records");
			return upsertWidgetRecords(...args);
		},
		writeNJson: async (...args) => {
			guard("write-layout");
			return writeNJson(...args);
		},
		writeUiSettings: async (_win, settings) => {
			guard("write-ui-settings");
			// Deliberately not the real writer (see the note above the fixture);
			// the payload is still checked so a malformed one cannot pass here.
			expect(settings.version).toBe(1);
		},
		writeBackgroundJson: async (...args) => {
			guard("write-background");
			return writeBackgroundJson(...args);
		},
	};

	let error: unknown = null;
	try {
		await writeSurfaceState(request(overrides), deps);
	} catch (caught) {
		error = caught;
	}
	return { error, stages };
};

const expectFailure = (result: Attempt, stage: PersistSurfaceStage): Error => {
	expect(result.error, "the persist was expected to fail").toBeInstanceOf(
		SurfaceWriteError,
	);
	expect((result.error as SurfaceWriteError).stage).toBe(stage);
	return result.error as SurfaceWriteError;
};

const ALL_STAGES: PersistSurfaceStage[] = [
	"write-widget-records",
	"write-layout",
	"write-ui-settings",
];

/** The follow-up persist that must succeed after a failure. */
const converge = async (): Promise<void> => {
	const retry = await attempt(null);

	expect(retry.error).toBeNull();
	expect(retry.stages).toEqual(ALL_STAGES);
	expect(recordIdsOnDisk()).toEqual(["wgt-alpha", "wgt-beta", "wgt-gamma"]);
	expect(layoutIdsOnDisk()).toEqual(["wgt-alpha", "wgt-beta", "wgt-gamma"]);
};

afterAll(() => {
	if (fixture.dir) rmSync(fixture.dir, { recursive: true, force: true });
});
beforeEach(writeSeedFiles);

describe("records-stage failure leaves the workspace layout alone (AC a)", () => {
	it("does not touch the layout when the records write is refused", async () => {
		const layoutBefore = bytesOf(LAYOUT_PATH);
		const recordsBefore = bytesOf(RECORDS_PATH);

		const result = await attempt("write-widget-records");

		// Residue first: the layout must not have been written by a persist
		// whose very first stage was refused.
		expect(bytesOf(LAYOUT_PATH)).toBe(layoutBefore);
		expect(bytesOf(RECORDS_PATH)).toBe(recordsBefore);
		expectFailure(result, "write-widget-records");
		// Nothing ran after the refused records write — including the layout.
		expect(result.stages).toEqual(["write-widget-records"]);
	});

	it("refuses to run against a corrupt records file and deletes nothing", async () => {
		writeFileSync(RECORDS_PATH, CORRUPT_RECORDS_TEXT, "utf8");
		const corruptBefore = bytesOf(RECORDS_PATH);
		const layoutBefore = bytesOf(LAYOUT_PATH);

		const result = await attempt(null);

		// Residue first: the pre-fix behaviour merged into an empty base and
		// wrote a valid-but-truncated file over the unreadable one.
		expect(
			bytesOf(RECORDS_PATH),
			"the unreadable records file must not be rewritten by the persist",
		).toBe(corruptBefore);
		expect(bytesOf(LAYOUT_PATH)).toBe(layoutBefore);

		const error = expectFailure(result, "write-widget-records");
		expect(result.stages).toEqual(["write-widget-records"]);
		expect(error.cause).toBeInstanceOf(WidgetRecordsFileError);
		expect((error.cause as WidgetRecordsFileError).reason).toBe(
			"json-parse-failed",
		);
	});

	it("treats a missing records file as a legitimate first write", async () => {
		rmSync(RECORDS_PATH);

		const result = await attempt(null);

		expect(result.error).toBeNull();
		expect(result.stages).toEqual(ALL_STAGES);
		// Nothing to merge into: the file is created with exactly what this
		// persist owns, which is the "first write" path, not a data loss.
		expect(recordIdsOnDisk()).toEqual(["wgt-gamma"]);
		expect(layoutIdsOnDisk()).toContain("wgt-gamma");
	});

	it("treats a blank records file as a legitimate first write", async () => {
		writeFileSync(RECORDS_PATH, "   \n", "utf8");

		const result = await attempt(null);

		expect(result.error).toBeNull();
		expect(recordIdsOnDisk()).toEqual(["wgt-gamma"]);
	});
});

describe("layout-stage failure keeps records and the old layout resolvable (AC b)", () => {
	it("keeps every pre-existing record id and the previous layout", async () => {
		const layoutBefore = bytesOf(LAYOUT_PATH);

		const result = await attempt("write-layout");

		expectFailure(result, "write-layout");
		expect(result.stages).toEqual(["write-widget-records", "write-layout"]);
		// Records were written first — that is the ordering guarantee.
		expect(recordIdsOnDisk()).toEqual(["wgt-alpha", "wgt-beta", "wgt-gamma"]);
		// …and the layout did not move, so it still points at records that exist.
		expect(bytesOf(LAYOUT_PATH)).toBe(layoutBefore);
		for (const id of layoutIdsOnDisk()) {
			expect(recordIdsOnDisk()).toContain(id);
		}
	});
});

describe("ui-settings-stage failure leaves layout and records consistent (AC c)", () => {
	it("lands both records and layout, and they agree with each other", async () => {
		const result = await attempt("write-ui-settings");

		expectFailure(result, "write-ui-settings");
		expect(result.stages).toEqual(ALL_STAGES);

		const records = recordIdsOnDisk();
		expect(records).toEqual(["wgt-alpha", "wgt-beta", "wgt-gamma"]);
		for (const id of layoutIdsOnDisk()) {
			expect(records).toContain(id);
		}
	});
});

describe("a second persist after a failure converges (AC d)", () => {
	it("converges after a records-stage failure", async () => {
		const first = await attempt("write-widget-records");
		expectFailure(first, "write-widget-records");
		await converge();
	});

	it("converges after a layout-stage failure", async () => {
		const first = await attempt("write-layout");
		expectFailure(first, "write-layout");
		await converge();
	});

	it("converges after a ui-settings-stage failure", async () => {
		const first = await attempt("write-ui-settings");
		expectFailure(first, "write-ui-settings");
		await converge();
	});

	it("converges after the records file was corrupt and has been repaired", async () => {
		writeFileSync(RECORDS_PATH, CORRUPT_RECORDS_TEXT, "utf8");
		const first = await attempt(null);
		expectFailure(first, "write-widget-records");

		// An operator restores the file (or the panel re-creates it) and the
		// very next persist succeeds — the failure does not wedge the chain.
		writeFileSync(
			RECORDS_PATH,
			`${JSON.stringify(
				{ version: 1, widgets: PRE_EXISTING_RECORDS },
				null,
				2,
			)}\n`,
			"utf8",
		);
		await converge();
	});
});

describe("the non-fatal background stage", () => {
	it("warns instead of failing the persist", async () => {
		const result = await attempt("write-background", {
			backgroundJsonText: '{"color":"#000000"}\n',
		});

		expect(result.error).toBeNull();
		// The stage was reached and reported, but nothing after it fails…
		expect(result.stages).toEqual([...ALL_STAGES, "write-background"]);
		expect(recordIdsOnDisk()).toEqual(["wgt-alpha", "wgt-beta", "wgt-gamma"]);
		expect(layoutIdsOnDisk()).toContain("wgt-gamma");
		// …and the failed background write left no file behind.
		expect(existsSync(BG_PATH)).toBe(false);
	});
});
