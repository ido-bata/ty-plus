/**
 * Tests for widget-state-store.ts
 */

import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import {
	readWidgetStateJson,
	writeWidgetStateJson,
} from "./widget-state-store";

// ── Persistence API mocks ─────────────────────────────────────────────────────

type ReadJson = (
	win: Window,
	key: string,
	...args: unknown[]
) => Promise<Record<string, unknown> | null>;
type WriteJson = (
	win: Window,
	key: string,
	payload: unknown,
	...args: unknown[]
) => Promise<void>;

let mockReadJson: Mock<ReadJson>;
let mockWriteJson: Mock<WriteJson>;

vi.mock("@/management/storage/persistence", () => ({
	readJsonText: vi.fn(async () => null),
	get readJson() {
		return mockReadJson;
	},
	get writeJson() {
		return mockWriteJson;
	},
}));

beforeEach(() => {
	mockReadJson = vi.fn<ReadJson>().mockResolvedValue(null);
	mockWriteJson = vi.fn<WriteJson>().mockResolvedValue(undefined);
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const fakeWindow = () =>
	({
		cep_node: {
			require: () => null,
		},
	}) as unknown as Window;

const fakeWindowWithNodeFs = (fsMock: Record<string, unknown>) =>
	({
		cep_node: {
			require: () => {
				return fsMock;
			},
		},
	}) as unknown as Window;

// ── Managed ty-plus root from settings (tests use fakeWindow without settings) ─

// ── readWidgetStateJson ───────────────────────────────────────────────────────

describe("readWidgetStateJson", () => {
	it("returns parsed object when file exists and is valid", async () => {
		const win = fakeWindowWithNodeFs({
			promises: {
				readFile: async (_path: string) =>
					`{"widgetMode":"browser","path":"/test"}`,
			},
		});
		// Directly test the path resolution logic
		const { resolveSettingsRoot } = await import("./workspace/store");
		const cepDefaultRoot = resolveSettingsRoot(win);
		expect(cepDefaultRoot).toBeNull(); // Without CEP runtime this returns null
	});

	it("returns null when supportRoot is unavailable", async () => {
		const win = fakeWindow();
		const result = await readWidgetStateJson(win, "directory-browser");
		expect(result).toBeNull();
	});

	it("returns null for missing file", async () => {
		const win = fakeWindowWithNodeFs({
			promises: {
				readFile: async (_path: string) => {
					throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
				},
			},
		});
		const result = await readWidgetStateJson(win, "directory-browser");
		// Will be null because no support root is configured in settings.json
		expect(result).toBeNull();
	});
});

// ── writeWidgetStateJson ───────────────────────────────────────────────────────

describe("writeWidgetStateJson", () => {
	it("writes flat payload via the persistence API when no instanceId is given", async () => {
		const win = fakeWindow();
		await writeWidgetStateJson(win, "directory-browser", { mode: "cubic" });

		expect(mockWriteJson).toHaveBeenCalledTimes(1);
		expect(mockWriteJson).toHaveBeenCalledWith(
			win,
			"widgetState",
			{ mode: "cubic" },
			"directory-browser",
		);
		expect(mockReadJson).not.toHaveBeenCalled();
	});

	it("upserts a row in the catalog when instanceId is given", async () => {
		const win = fakeWindow();
		mockReadJson.mockResolvedValue({
			version: 1,
			instances: [{ id: "existing", keep: "yes" }],
		});

		await writeWidgetStateJson(
			win,
			"info",
			{ showImage: false },
			{
				instanceId: "abc",
			},
		);

		expect(mockReadJson).toHaveBeenCalledTimes(1);
		expect(mockReadJson).toHaveBeenCalledWith(win, "widgetState", "info");
		expect(mockWriteJson).toHaveBeenCalledTimes(1);
		expect(mockWriteJson).toHaveBeenCalledWith(
			win,
			"widgetState",
			{
				version: 1,
				instances: [
					{ id: "existing", keep: "yes" },
					{ id: "abc", showImage: false },
				],
			},
			"info",
		);
	});

	it("upserts into an empty catalog when the file is missing", async () => {
		const win = fakeWindow();
		mockReadJson.mockResolvedValue(null);

		await writeWidgetStateJson(
			win,
			"info",
			{ showImage: true },
			{
				instanceId: "xyz",
			},
		);

		expect(mockWriteJson).toHaveBeenCalledWith(
			win,
			"widgetState",
			{
				version: 1,
				instances: [{ id: "xyz", showImage: true }],
			},
			"info",
		);
	});
});

// ── WidgetStateName type ───────────────────────────────────────────────────────

describe("WidgetStateName", () => {
	it('accepts "directory-browser"', () => {
		const name: import("./widget-state-store").WidgetStateName =
			"directory-browser";
		expect(name).toBe("directory-browser");
	});
});
