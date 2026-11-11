// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LayoutPayload } from "@/management/workspace/surface/contract";

type PublishedEnvelope = Parameters<
	typeof import("@/management/workspace/messaging/publish-shell-message").publishShellMessage
>[1];
type PresetPlacementPayload = Extract<
	LayoutPayload,
	{ kind: "presetPlacement" }
>;

const { publishMock, listPresetsMock } = vi.hoisted(() => ({
	publishMock: vi.fn<(envelope: PublishedEnvelope) => Promise<void>>(
		async () => undefined,
	),
	listPresetsMock: vi.fn<() => Promise<unknown[]>>(async () => []),
}));

/** Captured warn() calls from createLogger('workspace'). */
const debugMocks = vi.hoisted(() => ({
	warnCalls: [] as Array<{
		message: string;
		context?: Record<string, unknown>;
	}>,
	infoCalls: [] as Array<{
		message: string;
		context?: Record<string, unknown>;
	}>,
}));

vi.mock("@/management/ae/cep/transport", () => ({
	createCepSurfaceTransport: () => ({ publish: publishMock }),
}));

vi.mock("@/management/preset/use-cases", () => ({
	listPresets: listPresetsMock,
}));

vi.mock("@/management/preset/group-catalog", () => ({
	parseGroupFromText: () => [],
}));

vi.mock("@/management/workspace/messaging/publish-shell-message", () => ({
	publishShellMessage: async (
		_transport: unknown,
		envelope: PublishedEnvelope,
	) => {
		await publishMock(envelope);
	},
}));

vi.mock(
	"@/management/workspace/placement/append-preset-from-dialog-disk",
	() => ({
		tryPersistAppendPresetFromDialog: async () => false,
	}),
);

vi.mock(
	"@/management/workspace/placement/remove-preset-from-dialog-disk",
	() => ({
		tryPersistRemovePresetFromDialog: async () => true,
	}),
);

vi.mock("@/management/workspace/surface/opener-panel-id", () => ({
	resolveOpenerWorkspacePanelId: () => "panel-1",
}));

vi.mock("@/management/debug", () => ({
	createLogger: (_source: string) => ({
		info: (
			message: string,
			options?: { context?: Record<string, unknown> },
		) => {
			debugMocks.infoCalls.push({ message, context: options?.context });
		},
		warn: (
			message: string,
			options?: { context?: Record<string, unknown> },
		) => {
			debugMocks.warnCalls.push({ message, context: options?.context });
		},
		error: (
			message: string,
			options?: { context?: Record<string, unknown> },
		) => {
			debugMocks.warnCalls.push({ message, context: options?.context });
		},
		debug: () => {},
		log: () => {},
	}),
}));

import { notifyPanelsAfterPresetSave } from "@/management/workspace/placement/notify-panels-after-preset-save";

const flushMicrotask = (): Promise<void> =>
	new Promise((resolve) => queueMicrotask(resolve));

const isPresetPlacementPayload = (
	payload: unknown,
): payload is PresetPlacementPayload =>
	typeof payload === "object" &&
	payload !== null &&
	"kind" in payload &&
	payload.kind === "presetPlacement";

const findLayoutCall = ():
	| (PublishedEnvelope & {
			payload: PresetPlacementPayload;
	  })
	| null => {
	const call = publishMock.mock.calls.find(
		([envelope]) =>
			envelope.channel === "com.typlus.workspace.layout" &&
			isPresetPlacementPayload(envelope.payload),
	);
	const envelope = call?.[0];
	if (!envelope || !isPresetPlacementPayload(envelope.payload)) return null;
	return { ...envelope, payload: envelope.payload };
};

const findPresetsSnapshotCall = (): PublishedEnvelope | null => {
	const call = publishMock.mock.calls.find(
		([envelope]) =>
			envelope.channel === "com.typlus.workspace.presets" &&
			typeof envelope.payload === "object" &&
			envelope.payload !== null &&
			"kind" in envelope.payload &&
			(envelope.payload as { kind: string }).kind === "snapshot",
	);
	return call?.[0] ?? null;
};

beforeEach(() => {
	publishMock.mockClear();
	listPresetsMock.mockClear();
	listPresetsMock.mockReset();
	listPresetsMock.mockResolvedValue([]);
	debugMocks.warnCalls.length = 0;
	debugMocks.infoCalls.length = 0;
});

afterEach(() => {
	vi.clearAllMocks();
});

describe("notifyPanelsAfterPresetSave", () => {
	it("threads dropPlacement into explicitPlacements of the presetPlacement payload", async () => {
		await notifyPanelsAfterPresetSave(window, {
			sourceSurfaceId: "panel-1",
			catalogRefIds: ["preset-1"],
			dropPlacement: { x: 3, y: 4 },
		});
		await flushMicrotask();

		const env = findLayoutCall();
		expect(env).not.toBeNull();
		expect(env?.channel).toBe("com.typlus.workspace.layout");
		expect(env?.kind).toBe("publish");
		expect(env?.payload.kind).toBe("presetPlacement");
		expect(env?.payload.explicitPlacements).toEqual([
			{ x: 3, y: 4, width: 1, height: 1 },
		]);
		expect(env?.payload.auto).toBeUndefined();
	});

	it("falls back to auto-pack when no dropPlacement is provided", async () => {
		await notifyPanelsAfterPresetSave(window, {
			sourceSurfaceId: "panel-1",
			catalogRefIds: ["preset-2"],
		});
		await flushMicrotask();

		const env = findLayoutCall();
		expect(env).not.toBeNull();
		expect(env?.payload.kind).toBe("presetPlacement");
		expect(env?.payload.auto).toEqual({ axis: -1 });
		expect(env?.payload.explicitPlacements).toBeUndefined();
	});

	it("ignores non-finite drop coordinates", async () => {
		await notifyPanelsAfterPresetSave(window, {
			sourceSurfaceId: "panel-1",
			catalogRefIds: ["preset-3"],
			dropPlacement: {
				x: Number.NaN,
				y: 2,
			},
		});
		await flushMicrotask();

		const env = findLayoutCall();
		expect(env?.payload.auto).toEqual({ axis: -1 });
		expect(env?.payload.explicitPlacements).toBeUndefined();
	});
});

describe("notifyPanelsAfterPresetSave (Issue #146 / Defect B cloud-failure handling)", () => {
	it("Test B-1 — listPresets rejects (cloud unavailable) → caller does NOT throw; layout message still published; warn logged", async () => {
		listPresetsMock.mockReset();
		listPresetsMock.mockRejectedValue(new Error("Gateway offline"));

		await expect(
			notifyPanelsAfterPresetSave(window, {
				sourceSurfaceId: "panel-1",
				catalogRefIds: ["preset-cloud-down"],
			}),
		).resolves.toBeUndefined();

		// The local layout message MUST still be published — the disk-write
		// notification is independent of the cloud refresh.
		const layoutEnv = findLayoutCall();
		expect(layoutEnv).not.toBeNull();
		expect(layoutEnv?.payload.kind).toBe("presetPlacement");

		// The cloud snapshot MUST NOT be published when listPresets threw —
		// broadcasting a partial snapshot (with stale data) is misleading and
		// the warn-log already records the degradation.
		const presetsEnv = findPresetsSnapshotCall();
		expect(presetsEnv).toBeNull();

		// A warn log must record the cloud-refresh failure.
		const warn = debugMocks.warnCalls.find(
			(c) =>
				c.message ===
				"notifyPanelsAfterPresetSave:cloud-snapshot-refresh-failed",
		);
		expect(warn).toBeDefined();
		expect(warn?.context?.step).toBe("listPresets");
		expect(warn?.context?.sourceSurfaceId).toBe("panel-1");
		expect(warn?.context?.catalogRefIds).toEqual(["preset-cloud-down"]);
		expect(warn?.context?.message).toBe("Gateway offline");
	});

	it("Test B-2 — listPresets resolves → cloud snapshot published normally; no warn", async () => {
		listPresetsMock.mockReset();
		listPresetsMock.mockResolvedValue([
			{
				id: "preset-A",
				kind: "user",
				title: "A",
				createdAt: "2026-01-01T00:00:00Z",
				updatedAt: "2026-01-01T00:00:00Z",
			},
		]);

		await expect(
			notifyPanelsAfterPresetSave(window, {
				sourceSurfaceId: "panel-1",
				catalogRefIds: ["preset-A"],
			}),
		).resolves.toBeUndefined();

		const presetsEnv = findPresetsSnapshotCall();
		expect(presetsEnv).not.toBeNull();
		expect(presetsEnv?.payload).toMatchObject({
			kind: "snapshot",
			sourceSurfaceId: "panel-1",
		});

		const warn = debugMocks.warnCalls.find(
			(c) =>
				c.message ===
				"notifyPanelsAfterPresetSave:cloud-snapshot-refresh-failed",
		);
		expect(warn).toBeUndefined();
	});

	it("Test B-3 — listPresets throws non-Error (string) → caller does NOT throw; warn still logged with String(error)", async () => {
		listPresetsMock.mockReset();
		listPresetsMock.mockRejectedValue("non-error reject");

		await expect(
			notifyPanelsAfterPresetSave(window, {
				sourceSurfaceId: "panel-1",
				catalogRefIds: ["preset-bare-reject"],
			}),
		).resolves.toBeUndefined();

		const warn = debugMocks.warnCalls.find(
			(c) =>
				c.message ===
				"notifyPanelsAfterPresetSave:cloud-snapshot-refresh-failed",
		);
		expect(warn).toBeDefined();
		expect(warn?.context?.message).toBe("non-error reject");
	});
});
