// @vitest-environment happy-dom

/**
 * Issue #243: requester side of the updates channel relay. The dialog
 * publishes an install-request targeted at the opener panel and resolves
 * only on the matching install-result; everything else is ignored.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
	SurfaceMessageEnvelope,
	SurfaceTransport,
} from "@/management/workspace/surface/contract";

type Subscriber = (envelope: SurfaceMessageEnvelope) => void;

interface MockTransport extends SurfaceTransport {
	__emit: (envelope: SurfaceMessageEnvelope) => void;
	__publishCalls: () => SurfaceMessageEnvelope[];
}

const transports: MockTransport[] = [];

vi.mock("@/management/dialog/modeless/surface-id", () => ({
	resolveDialogSurfaceId: () => "dialog-settings",
}));

vi.mock("@/management/ae/cep/transport", () => ({
	createCepSurfaceTransport: (): MockTransport => {
		const subscribers = new Set<Subscriber>();
		const publishCalls: SurfaceMessageEnvelope[] = [];
		const transport: MockTransport = {
			publish: vi.fn(async (message: SurfaceMessageEnvelope) => {
				publishCalls.push(message);
			}),
			subscribe: vi.fn((handler: Subscriber) => {
				subscribers.add(handler);
				return () => subscribers.delete(handler);
			}),
			__emit: (envelope: SurfaceMessageEnvelope) => {
				for (const handler of subscribers) handler(envelope);
			},
			__publishCalls: () => [...publishCalls],
		};
		transports.push(transport);
		return transport;
	},
}));

const { requestPanelUpdateInstall, UpdateInstallRelayError } = await import(
	"./install-relay"
);

const win = (): Window => {
	const w = window as Window & { __TY_PLUS_DIALOG_SURFACE_ID__?: string };
	w.__TY_PLUS_DIALOG_SURFACE_ID__ = "dialog-settings";
	return w;
};

const request = {
	release_version: "0.11.0-insider.4",
	tag: "v0.11.0-insider.4",
	asset: {
		url: "https://github.com/ido-bata/ty-plus/releases/download/v0.11.0-insider.4/ty-plus-v0.11.0-insider.4-macos.zip",
		file_name: "ty-plus-v0.11.0-insider.4-macos.zip",
		sha256: "a".repeat(64),
	},
} as const;

const lastRequestId = (): string => {
	const calls = transports[0].__publishCalls();
	const env = calls[calls.length - 1];
	return (env.payload as { requestId: string }).requestId;
};

const resultEnvelope = (
	payload: Record<string, unknown>,
	overrides: Partial<SurfaceMessageEnvelope> = {},
): SurfaceMessageEnvelope => ({
	messageId: "r1",
	channel: "com.typlus.workspace.updates",
	kind: "response",
	sourceSurfaceId: "panel-1",
	targetSurfaceId: "dialog-settings",
	payload,
	createdAt: Date.now(),
	...overrides,
});

describe("requestPanelUpdateInstall", () => {
	beforeEach(() => {
		transports.length = 0;
	});

	it("publishes an install-request targeted at the given panel", async () => {
		const promise = requestPanelUpdateInstall(request, {
			win: win(),
			targetPanelId: "panel-2",
			timeoutMs: 50,
		});
		promise.catch(() => {});
		await new Promise((r) => setTimeout(r, 10));
		const calls = transports[0].__publishCalls();
		expect(calls).toHaveLength(1);
		expect(calls[0]).toMatchObject({
			channel: "com.typlus.workspace.updates",
			kind: "request",
			sourceSurfaceId: "dialog-settings",
			targetSurfaceId: "panel-2",
		});
		expect(calls[0].payload).toMatchObject({
			kind: "install-request",
			request: { release_version: "0.11.0-insider.4" },
		});
	});

	it("falls back to resolveDialogSurfaceId when surface globals are unset", async () => {
		const bare = window as Window & {
			__TY_PLUS_DIALOG_SURFACE_ID__?: string;
			__TY_PLUS_PANEL_SURFACE_ID__?: string;
		};
		delete bare.__TY_PLUS_DIALOG_SURFACE_ID__;
		delete bare.__TY_PLUS_PANEL_SURFACE_ID__;
		const promise = requestPanelUpdateInstall(request, {
			win: window,
			targetPanelId: "panel-1",
			timeoutMs: 50,
		});
		promise.catch(() => {});
		await new Promise((r) => setTimeout(r, 10));
		const calls = transports[0].__publishCalls();
		expect(calls[0]).toMatchObject({
			sourceSurfaceId: "dialog-settings",
			targetSurfaceId: "panel-1",
		});
	});

	it("resolves on the matching install-result", async () => {
		const promise = requestPanelUpdateInstall(request, {
			win: win(),
			targetPanelId: "panel-1",
			timeoutMs: 1000,
		});
		await new Promise((r) => setTimeout(r, 10));
		const requestId = lastRequestId();
		transports[0].__emit(
			resultEnvelope({
				kind: "install-result",
				requestId,
				sourceSurfaceId: "panel-1",
				executorSurfaceId: "panel-1",
				ok: true,
				status: "installed",
				version: "0.11.0-insider.4",
				restart_required: true,
			}),
		);
		await expect(promise).resolves.toEqual({
			status: "installed",
			version: "0.11.0-insider.4",
			restart_required: true,
			reason: null,
		});
	});

	it("ignores results for other requestIds, panels, and surfaces", async () => {
		const promise = requestPanelUpdateInstall(request, {
			win: win(),
			targetPanelId: "panel-1",
			timeoutMs: 1000,
		});
		const guarded = promise.catch((e) => e);
		await new Promise((r) => setTimeout(r, 10));
		const requestId = lastRequestId();
		const t = transports[0];
		t.__emit(
			resultEnvelope(
				{
					kind: "install-result",
					requestId: "other",
					ok: true,
					status: "installed",
				},
				{ sourceSurfaceId: "panel-2" },
			),
		);
		t.__emit(
			resultEnvelope(
				{
					kind: "install-result",
					requestId,
					ok: true,
					status: "installed",
				},
				{ targetSurfaceId: "dialog-other" },
			),
		);
		t.__emit(
			resultEnvelope({
				kind: "install-result",
				requestId,
				ok: true,
				status: "installed",
			}),
		);
		await expect(promise).resolves.toMatchObject({ status: "installed" });
		void guarded;
	});

	it("rejects with the worker error code on ok:false", async () => {
		const promise = requestPanelUpdateInstall(request, {
			win: win(),
			targetPanelId: "panel-1",
			timeoutMs: 1000,
		});
		await new Promise((r) => setTimeout(r, 10));
		transports[0].__emit(
			resultEnvelope({
				kind: "install-result",
				requestId: lastRequestId(),
				ok: false,
				errorCode: "integrity_mismatch",
			}),
		);
		await expect(promise).rejects.toMatchObject({
			name: "UpdateInstallRelayError",
			code: "integrity_mismatch",
		});
	});

	it("rejects on timeout when no panel answers", async () => {
		await expect(
			requestPanelUpdateInstall(request, {
				win: win(),
				targetPanelId: "panel-9",
				timeoutMs: 30,
			}),
		).rejects.toBeInstanceOf(UpdateInstallRelayError);
	});
});
