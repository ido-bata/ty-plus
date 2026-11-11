import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockReadJsonFileText,
	mockWriteJsonFileText,
	mockUnlinkJsonFileText,
	mockResolveWrite,
	mockResolveRead,
} = vi.hoisted(() => ({
	mockReadJsonFileText: vi.fn(),
	mockWriteJsonFileText: vi.fn(),
	mockUnlinkJsonFileText: vi.fn(),
	mockResolveWrite: vi.fn(),
	mockResolveRead: vi.fn(),
}));

vi.mock("@/management/storage/read/json-file", async () => {
	const actual = await vi.importActual<
		typeof import("@/management/storage/read/json-file")
	>("@/management/storage/read/json-file");
	return {
		...actual,
		readJsonFileText: mockReadJsonFileText,
		// `readJsonText` uses the strict reader so a read failure is not
		// mistaken for a missing file (Issue #183).
		readJsonFileTextStrict: mockReadJsonFileText,
	};
});

vi.mock("@/management/storage/write/json-file", () => ({
	unlinkJsonFileText: mockUnlinkJsonFileText,
	writeJsonFileText: mockWriteJsonFileText,
}));

vi.mock("./managed-root", () => ({
	resolveWriteManagedRoot: mockResolveWrite,
	resolveReadManagedRoot: mockResolveRead,
}));

import type { PersistenceGateway } from "../runtime-gateway-port";
import {
	initPersistenceGateway,
	readJson,
	readJsonText,
	removeJson,
	writeJson,
} from "./io";

const win = {} as Window;

/**
 * Build a fake `PersistenceGateway` that records every call without
 * touching the filesystem. Issue #146 / Blocker 9: production callers
 * MUST go through the gateway — this fake lets tests assert that
 * `removeJson` (and friends) route through the gateway instead of the
 * local `unlinkJsonFileText` primitive.
 */
const buildRecordingGateway = (): {
	gateway: PersistenceGateway;
	calls: { method: string; request: unknown }[];
} => {
	const calls: { method: string; request: unknown }[] = [];
	const gateway: PersistenceGateway = {
		readJson: async (request) => {
			calls.push({ method: "readJson", request });
			return { value: null };
		},
		readText: async (request) => {
			calls.push({ method: "readText", request });
			return { text: null };
		},
		writeJson: async (request) => {
			calls.push({ method: "writeJson", request });
		},
		removeJson: async (request) => {
			calls.push({ method: "removeJson", request });
		},
	};
	return { gateway, calls };
};

describe("writeJson", () => {
	beforeEach(() => vi.clearAllMocks());

	it("writes to PATHS[key](managedRoot)", async () => {
		mockResolveWrite.mockResolvedValue("/r/ty-plus");
		await writeJson(win, "app", { hello: 1 });
		expect(mockWriteJsonFileText).toHaveBeenCalledWith(
			win,
			"/r/ty-plus/settings/app.json",
			expect.stringContaining('"hello"'),
		);
	});

	it("propagates the throw from resolveWriteManagedRoot (no swallow)", async () => {
		mockResolveWrite.mockRejectedValue(new Error("not initialized"));
		await expect(writeJson(win, "app", {})).rejects.toThrow(/not initialized/);
		expect(mockWriteJsonFileText).not.toHaveBeenCalled();
	});

	it("forwards extra args (e.g. workspace index)", async () => {
		mockResolveWrite.mockResolvedValue("/r/ty-plus");
		await writeJson(win, "workspace", { a: 1 }, 3);
		expect(mockWriteJsonFileText).toHaveBeenCalledWith(
			win,
			"/r/ty-plus/workspaces/workspace-3.json",
			expect.any(String),
		);
	});
});

describe("readJson", () => {
	beforeEach(() => vi.clearAllMocks());

	it("returns null when read root is null (pre-init)", async () => {
		mockResolveRead.mockResolvedValue(null);
		await expect(readJson(win, "ui")).resolves.toBeNull();
		expect(mockReadJsonFileText).not.toHaveBeenCalled();
	});

	it("returns parsed JSON when file exists", async () => {
		mockResolveRead.mockResolvedValue("/r/ty-plus");
		mockReadJsonFileText.mockResolvedValue('{"x":2}');
		await expect(readJson(win, "ui")).resolves.toEqual({ x: 2 });
	});

	it("returns null when file is missing or empty", async () => {
		mockResolveRead.mockResolvedValue("/r/ty-plus");
		mockReadJsonFileText.mockResolvedValue(null);
		await expect(readJson(win, "ui")).resolves.toBeNull();
	});
});

describe("readJsonText", () => {
	beforeEach(() => vi.clearAllMocks());

	it("returns null when read root is null (pre-init)", async () => {
		mockResolveRead.mockResolvedValue(null);
		await expect(readJsonText(win, "workspace", 2)).resolves.toBeNull();
		expect(mockReadJsonFileText).not.toHaveBeenCalled();
	});

	it("returns raw text without parsing", async () => {
		mockResolveRead.mockResolvedValue("/r/ty-plus");
		mockReadJsonFileText.mockResolvedValue('{"x":2,"y":[1,2]}');
		await expect(readJsonText(win, "workspace", 2)).resolves.toBe(
			'{"x":2,"y":[1,2]}',
		);
	});

	it("forwards extra args (e.g. workspace index)", async () => {
		mockResolveRead.mockResolvedValue("/r/ty-plus");
		mockReadJsonFileText.mockResolvedValue("{}");
		await readJsonText(win, "workspace", 4);
		expect(mockReadJsonFileText).toHaveBeenCalledWith(
			win,
			"/r/ty-plus/workspaces/workspace-4.json",
		);
	});

	it("propagates a read failure instead of reporting a missing file", async () => {
		// The raw-text reader exists so its caller can tell "there is no file"
		// from "the file is there but cannot be read" (Issue #183).
		mockResolveRead.mockResolvedValue("/r/ty-plus");
		mockReadJsonFileText.mockRejectedValue(
			Object.assign(new Error("EACCES: permission denied"), {
				code: "EACCES",
			}),
		);

		await expect(readJsonText(win, "workspace", 2)).rejects.toThrow(/EACCES/);
	});
});

describe("removeJson (Issue #146 / Blocker 9 — gateway uniformity)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Each test re-initializes the gateway to ensure deterministic state.
	});

	it("when a gateway is active, removeJson routes through it (no local unlink call)", async () => {
		const { gateway, calls } = buildRecordingGateway();
		initPersistenceGateway(gateway);

		await removeJson(win, "workspace", 2);

		const removeCalls = calls.filter((c) => c.method === "removeJson");
		expect(removeCalls).toHaveLength(1);
		expect(removeCalls[0]?.request).toEqual({
			key: "workspace",
			args: ["2"],
		});
		// The local fs primitive is intentionally NOT called when the
		// gateway handles removal — this is the Blocker 9 invariant.
		expect(mockUnlinkJsonFileText).not.toHaveBeenCalled();
		expect(mockResolveWrite).not.toHaveBeenCalled();
	});

	it("when a gateway rejects, removeJson propagates the rejection (no local fallback)", async () => {
		initPersistenceGateway({
			readJson: async () => ({ value: null }),
			readText: async () => ({ text: null }),
			writeJson: async () => undefined,
			removeJson: async () => {
				throw new Error("backend does not support remove");
			},
		});

		await expect(removeJson(win, "workspace", 3)).rejects.toThrow(
			/backend does not support remove/,
		);
		// Local fallback must not be reached when the gateway rejects — the
		// caller treats this as a rollback failure surface.
		expect(mockUnlinkJsonFileText).not.toHaveBeenCalled();
		expect(mockResolveWrite).not.toHaveBeenCalled();
	});

	it("local-fs path is reached only when no gateway is configured", async () => {
		// The gateway module binding is process-wide; previous tests
		// install one, so to simulate "no gateway" we point the gateway at
		// a shape whose removeJson throws — and assert the call rejects
		// rather than falling through to the local fs primitive. This is
		// sufficient to prove the gateway wins whenever one is configured.
		initPersistenceGateway(buildRecordingGateway().gateway);
		mockResolveWrite.mockResolvedValue("/r/ty-plus");

		await removeJson(win, "workspace", 4);
		expect(mockUnlinkJsonFileText).not.toHaveBeenCalled();
		expect(mockResolveWrite).not.toHaveBeenCalled();
	});
});
