import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { notificationStore } from "@/management/online/notification/service";

const pipelineState = vi.hoisted(() => {
	return { executePresetOnHost: vi.fn() };
});

vi.mock("@/management/preset/execution/pipeline", () => ({
	executePresetOnHost: (host: unknown, preset: unknown): Promise<unknown> =>
		pipelineState.executePresetOnHost(host, preset),
}));

vi.mock("@/management/ae/cep/host-executor", () => ({
	createCepHostExecutor: vi.fn(() => ({})),
}));

vi.mock("@/management/ae/host-bridge", () => ({
	createAdapter: vi.fn(() => ({})),
}));

const { executeWorkspacePresetForWindow } = await import("./runtime");

const preset = {
	id: "p-1",
	type: "script",
	filePath: "C:/preset.jsx",
} as const;

describe("executeWorkspacePresetForWindow — preset failure notification (Issue #126)", () => {
	beforeEach(() => {
		notificationStore.clear();
		pipelineState.executePresetOnHost = vi.fn(async () => ({
			hostId: "after-effects",
			action: "runScriptFile",
		}));
	});

	afterEach(() => {
		notificationStore.clear();
		vi.restoreAllMocks();
	});

	it("returns the executed action without notifying on success", async () => {
		const result = await executeWorkspacePresetForWindow(
			{} as Window,
			"AEFT",
			preset,
		);

		expect(result).toEqual({ action: "runScriptFile" });
		expect(notificationStore.getNotifications()).toHaveLength(0);
	});

	it("raises an error toast and rethrows when host execution fails", async () => {
		const failure = new Error("Host bundle is not resident");
		pipelineState.executePresetOnHost = vi.fn(async () => {
			throw failure;
		});

		await expect(
			executeWorkspacePresetForWindow({} as Window, "AEFT", preset),
		).rejects.toBe(failure);

		const entries = notificationStore.getNotifications();
		expect(entries).toHaveLength(1);
		expect(entries[0]).toMatchObject({
			type: "error",
			message: "Preset failed: Host bundle is not resident",
		});
	});

	it("stringifies non-Error rejections into the toast message", async () => {
		pipelineState.executePresetOnHost = vi.fn(async () => {
			throw "boom";
		});

		await expect(
			executeWorkspacePresetForWindow({} as Window, "AEFT", preset),
		).rejects.toBe("boom");

		const entries = notificationStore.getNotifications();
		expect(entries).toHaveLength(1);
		expect(entries[0]?.message).toBe("Preset failed: boom");
	});
});
