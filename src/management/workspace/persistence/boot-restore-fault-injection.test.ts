/**
 * Fault-injection regression for the boot-path data loss (Issue #204).
 *
 * The issue's demanded scenario: load a **corrupt** workspace fixture, then
 * perform widget add / move / delete, and assert the pre-existing file is not
 * destroyed. On top of that this suite pins the other acceptance criteria —
 * persistence never became ready after the failed read, the Debug Console got
 * a classified reason, and the panel has a notice to show instead of a
 * silently empty grid — plus the positive paths (no file, legitimately empty
 * file) so the fix cannot over-correct into "never save again".
 *
 * The fixture is a throwaway temp directory; nothing here reads or writes a
 * real user tree. Every piece under test is production code:
 *
 * - `readJsonFileTextStrict` — the storage read that reports a missing file
 *   as absent but refuses to call an unreadable one absent (the widening the
 *   issue asks for; the CEP fallback previously collapsed both into `null`).
 * - `planLayoutRestoreFromText` / `planLayoutRestoreFromReadError` — the
 *   four-way classification.
 * - `adoptLayoutRestore` — the one place a restore becomes the write-gate
 *   decision, the Debug Console entry, and the UI notice.
 * - `createWorkspaceWriteGate().isReady()` — the value `persistSurfaceState`
 *   reads as its first statement.
 * - `writeJsonFileText` — the same primitive `writeNJson` ends up in.
 *
 * Not exercised here: managed-root resolution and the CEP IPC boundary, which
 * are orthogonal to the defect and covered by
 * `src/management/storage/persistence/io.test.ts`. The hook wiring itself
 * (that `persistSurfaceState` really does read the gate before it writes, and
 * that `reloadLayoutFromStorage` really does feed `adoptLayoutRestore`) is
 * asserted at source level in `hook-restore-wiring.test.ts`.
 */

import fs from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _resetBusForTests, getEntries } from "@/management/debug/logger";
import {
	readJsonFileText,
	readJsonFileTextStrict,
} from "@/management/storage/read/json-file";
import { writeJsonFileText } from "@/management/storage/write/json-file";
import type { LayoutRestorePlan } from "@/management/workspace/layout/restore-plan";
import {
	planLayoutRestoreFromReadError,
	planLayoutRestoreFromText,
} from "@/management/workspace/layout/restore-plan";
import {
	adoptLayoutRestore,
	createWorkspaceWriteGate,
	type LayoutRestoreAdoption,
	type WorkspaceWriteGate,
} from "@/management/workspace/persistence/write-gate";

const nodeRequire = createRequire(import.meta.url);

/** CEP-shaped window: the read/write primitives resolve `fs` through it. */
const makeWindow = (): Window =>
	({
		cep_node: { require: (id: string) => nodeRequire(id) },
	}) as unknown as Window;

const win = makeWindow();
const DETAIL = { panelId: "panel-1", wsIndex: 1 };

/**
 * A panel that had two widgets, whose file got truncated mid-write. A valid
 * prefix with no closing brackets — the `json-parse-failed` half of 破損.
 */
const CORRUPT_BYTES = `{
	"gridCells": [
		{"id": "widget-a", "x": 0, "y": 0, "width": 2, "height": 2},
		{"id": "widget-b", "x": 2, "y": 0, "width": 2, "height": 2}
`;

/** Valid JSON that is not a layout at all — the `unrecognized-shape` half. */
const NON_LAYOUT_BYTES = '{"version": 3, "panels": []}\n';
const EMPTY_BYTES = '{"gridCells": []}\n';

type Cell = {
	id: string;
	x: number;
	y: number;
	width: number;
	height: number;
};

const cell = (id: string, x: number, y: number): Cell => ({
	id,
	x,
	y,
	width: 2,
	height: 2,
});

const layoutOf = (cells: Cell[]): string =>
	`${JSON.stringify({ gridCells: cells }, null, 2)}\n`;

const LOADED_BYTES = layoutOf([cell("widget-a", 0, 0), cell("widget-b", 2, 0)]);
const ADD_BYTES = layoutOf([
	cell("widget-a", 0, 0),
	cell("widget-b", 2, 0),
	cell("widget-c", 4, 0),
]);
const MOVE_BYTES = layoutOf([cell("widget-a", 0, 2), cell("widget-b", 2, 2)]);
const DELETE_BYTES = layoutOf([cell("widget-a", 0, 0)]);

let fixtureDir: string;
let workspacePath: string;

beforeEach(async () => {
	fixtureDir = await fs.mkdtemp(path.join(os.tmpdir(), "ty-plus-issue-204-"));
	workspacePath = path.join(fixtureDir, "workspaces", "workspace-1.json");
	_resetBusForTests();
});

afterEach(async () => {
	await fs.rm(fixtureDir, { recursive: true, force: true });
	_resetBusForTests();
});

const writeFixture = async (bytes: string): Promise<void> => {
	await fs.mkdir(path.dirname(workspacePath), { recursive: true });
	await fs.writeFile(workspacePath, bytes, "utf8");
};

const readFixture = async (): Promise<string> =>
	fs.readFile(workspacePath, "utf8");

type BootRestoreResult = {
	gate: WorkspaceWriteGate;
	enabled: boolean;
	notice: LayoutRestoreAdoption["notice"];
};

/**
 * The decision the hook makes at boot (and on every retry): read → classify →
 * adopt. A read that rejects travels through `planLayoutRestoreFromReadError`,
 * which is what the hook's outer `catch` does.
 */
const bootRestore = async (): Promise<BootRestoreResult> => {
	const gate = createWorkspaceWriteGate();
	let plan: LayoutRestorePlan;
	try {
		plan = planLayoutRestoreFromText(
			await readJsonFileTextStrict(win, workspacePath),
		);
	} catch (error) {
		plan = planLayoutRestoreFromReadError(error);
	}
	const adoption = adoptLayoutRestore(gate, plan, DETAIL);
	return { gate, enabled: adoption.enabled, notice: adoption.notice };
};

const defaultWrite = (bytes: string): Promise<void> =>
	writeJsonFileText(win, workspacePath, bytes);

/**
 * What `persistSurfaceState` does for a user edit: read the gate first, and
 * only then let the write reach the file. Returns whether the write primitive
 * was reached, so a test can tell "the gate refused" from "the write happened
 * to be a no-op".
 *
 * `hook-restore-wiring.test.ts` pins that `persistSurfaceState` opens with
 * exactly this predicate and that every `await write*` sits after it, so the
 * decision exercised here is the hook's own, not a re-description of it.
 */
const persistEdit = async (
	gate: WorkspaceWriteGate,
	nextBytes: string,
	write: (bytes: string) => Promise<void> = defaultWrite,
): Promise<boolean> => {
	if (!gate.isReady()) {
		return false;
	}
	await write(nextBytes);
	return true;
};

const CORRUPT_CASES: Array<[string, string, string]> = [
	["truncated JSON", CORRUPT_BYTES, "json-parse-failed"],
	["foreign JSON shape", NON_LAYOUT_BYTES, "unrecognized-shape"],
];

describe("boot restore over a corrupt workspace fixture (Issue #204)", () => {
	it.each(CORRUPT_CASES)(
		"classifies %s as corrupt, keeps persistence off, and leaves the Debug Console a reason",
		async (_label, bytes, reason) => {
			await writeFixture(bytes);

			const { enabled, notice } = await bootRestore();

			// (2) persistence must NOT be ready after the failed read.
			expect(enabled).toBe(false);
			// (1) never converted into an empty array — there is no document.
			expect(notice).not.toBeNull();
			expect(notice?.status).toBe("corrupt");
			expect(notice?.reason).toBe(reason);
			// (5) classified Debug Console entry.
			const entries = getEntries();
			expect(entries).toHaveLength(1);
			expect(entries[0]?.level).toBe("error");
			expect(entries[0]?.action).toBe(
				"reloadLayoutFromStorage:restore-blocked",
			);
			expect(entries[0]?.context?.reason).toBe(reason);
			expect(entries[0]?.context?.status).toBe("corrupt");
			// (6) the UI has something to show.
			expect(notice?.message.length).toBeGreaterThan(0);
			expect(notice?.wsIndex).toBe(1);
		},
	);

	it("refuses widget add / move / delete after the failed read and keeps the bytes identical", async () => {
		await writeFixture(CORRUPT_BYTES);
		const before = await readFixture();
		expect(before).toBe(CORRUPT_BYTES);

		const { gate, enabled, notice } = await bootRestore();
		expect(enabled).toBe(false);
		expect(gate.isReady()).toBe(false);
		expect(notice).not.toBeNull();

		// Widget add, then move, then delete — each one must be refused
		// before the write primitive is even reached.
		const write = vi.fn(defaultWrite);
		expect(await persistEdit(gate, ADD_BYTES, write)).toBe(false);
		expect(write).not.toHaveBeenCalled();
		expect(await readFixture()).toBe(before);

		expect(await persistEdit(gate, MOVE_BYTES, write)).toBe(false);
		expect(write).not.toHaveBeenCalled();
		expect(await readFixture()).toBe(before);

		expect(await persistEdit(gate, DELETE_BYTES, write)).toBe(false);
		expect(write).not.toHaveBeenCalled();
		expect(await readFixture()).toBe(before);

		// Still no readiness, still exactly the bytes the fixture started with.
		expect(gate.isReady()).toBe(false);
		expect(await readFixture()).toBe(before);
	});

	it("a retry that reads the file back clears the block and lets edits through", async () => {
		await writeFixture(CORRUPT_BYTES);
		const blocked = await bootRestore();
		expect(blocked.enabled).toBe(false);

		// The user repairs the file on disk…
		await writeFixture(LOADED_BYTES);
		const restored = await bootRestore();
		expect(restored.enabled).toBe(true);
		expect(restored.notice).toBeNull();
		expect(restored.gate.isReady()).toBe(true);

		expect(await persistEdit(restored.gate, ADD_BYTES)).toBe(true);
		expect(JSON.parse(await readFixture())).toEqual(JSON.parse(ADD_BYTES));
	});
});

describe("boot restore when the workspace file cannot be read at all", () => {
	beforeEach(async () => {
		// EISDIR: the path exists but reading it fails. A portable read
		// failure that needs no chmod (which a privileged runner would bypass).
		await fs.mkdir(workspacePath, { recursive: true });
	});

	it("rejects instead of reporting the path as absent, and leaves the legacy helper's behaviour documented", async () => {
		await expect(readJsonFileTextStrict(win, workspacePath)).rejects.toThrow();
		// The historical helper still collapses the failure — that is why the
		// strict one had to exist for any caller that writes back what it read.
		await expect(readJsonFileText(win, workspacePath)).resolves.toBeNull();
	});

	it("classifies the failure as read-failure and holds every edit", async () => {
		const { gate, enabled, notice } = await bootRestore();
		expect(enabled).toBe(false);
		expect(gate.isReady()).toBe(false);
		expect(notice?.status).toBe("read-failure");
		expect(notice?.reason).toBe("read-error");

		const entries = getEntries();
		expect(entries).toHaveLength(1);
		expect(entries[0]?.context?.reason).toBe("read-error");

		const write = vi.fn(async (_bytes: string): Promise<void> => {});
		expect(await persistEdit(gate, ADD_BYTES)).toBe(false);
		expect(write).not.toHaveBeenCalled();

		// The path is still a directory — nothing replaced or removed it.
		const stats = await fs.stat(workspacePath);
		expect(stats.isDirectory()).toBe(true);
	});
});

describe("boot restore over healthy fixtures (the positive paths)", () => {
	it("no file yet → persistence opens and the first write creates the file", async () => {
		await expect(fs.access(workspacePath)).rejects.toThrow();

		const { enabled, notice, gate } = await bootRestore();
		expect(enabled).toBe(true);
		expect(notice).toBeNull();
		expect(gate.isReady()).toBe(true);
		expect(getEntries()).toHaveLength(0);

		expect(await persistEdit(gate, ADD_BYTES)).toBe(true);
		expect(JSON.parse(await readFixture())).toEqual(JSON.parse(ADD_BYTES));
	});

	it("legitimately empty file → persistence opens and the edit replaces the empty grid", async () => {
		await writeFixture(EMPTY_BYTES);

		const { enabled, notice, gate } = await bootRestore();
		expect(enabled).toBe(true);
		expect(notice).toBeNull();
		expect(gate.isReady()).toBe(true);
		expect(getEntries()).toHaveLength(0);

		expect(await persistEdit(gate, ADD_BYTES)).toBe(true);
		expect(JSON.parse(await readFixture())).toEqual(JSON.parse(ADD_BYTES));
	});

	it("normal file with tiles → persistence opens and the edit replaces the layout", async () => {
		await writeFixture(LOADED_BYTES);

		const { enabled, notice, gate } = await bootRestore();
		expect(enabled).toBe(true);
		expect(notice).toBeNull();

		expect(await persistEdit(gate, DELETE_BYTES)).toBe(true);
		expect(JSON.parse(await readFixture())).toEqual(JSON.parse(DELETE_BYTES));
	});
});
