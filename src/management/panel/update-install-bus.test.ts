// @vitest-environment happy-dom

/**
 * Issue #243: the settings dialog relays update.install to the panel that
 * owns the worker composition. These tests pin the responder contract:
 * only envelopes explicitly targeted at this panel's surface id execute,
 * and every executed request produces exactly one install-result reply.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UpdateInstallResultDTO } from "@/management/ipc/operation-worker/composition";
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
				return () => {
					subscribers.delete(handler);
				};
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

const { installUpdateBusResponder } = await import("./update-install-bus");

const panelWin = (surfaceId: string): Window => {
	const win = window as Window & { __TY_PLUS_PANEL_SURFACE_ID__?: string };
	win.__TY_PLUS_PANEL_SURFACE_ID__ = surfaceId;
	return win;
};

const requestEnvelope = (
	overrides: Partial<SurfaceMessageEnvelope> = {},
): SurfaceMessageEnvelope => ({
	messageId: "m1",
	channel: "com.typlus.workspace.updates",
	kind: "request",
	sourceSurfaceId: "dialog-settings",
	targetSurfaceId: "panel-1",
	payload: {
		kind: "install-request",
		requestId: "req-1",
		sourceSurfaceId: "dialog-settings",
		request: {
			release_version: "0.11.0-insider.4",
			tag: "v0.11.0-insider.4",
			asset: {
				url: "https://github.com/ido-bata/ty-plus/releases/download/v0.11.0-insider.4/ty-plus-v0.11.0-insider.4-macos.zip",
				file_name: "ty-plus-v0.11.0-insider.4-macos.zip",
				sha256: "a".repeat(64),
			},
		},
	},
	createdAt: Date.now(),
	...overrides,
});

const result = (
	over: Partial<UpdateInstallResultDTO> = {},
): UpdateInstallResultDTO => ({
	status: "installed",
	version: "0.11.0-insider.4",
	restart_required: true,
	...over,
});

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("installUpdateBusResponder", () => {
	beforeEach(() => {
		transports.length = 0;
	});

	it("executes a request targeted at this panel and replies to the requester", async () => {
		const execute = vi.fn(async () => result());
		installUpdateBusResponder(panelWin("panel-1"), execute);
		const transport = transports[0];
		transport.__emit(requestEnvelope());
		await flush();
		await flush();
		expect(execute).toHaveBeenCalledTimes(1);
		expect(execute).toHaveBeenCalledWith(
			expect.objectContaining({ release_version: "0.11.0-insider.4" }),
		);
		const replies = transport
			.__publishCalls()
			.filter((m) => m.kind === "response");
		expect(replies).toHaveLength(1);
		expect(replies[0].targetSurfaceId).toBe("dialog-settings");
		expect(replies[0].payload).toMatchObject({
			kind: "install-result",
			requestId: "req-1",
			ok: true,
			status: "installed",
			version: "0.11.0-insider.4",
		});
	});

	it("ignores requests targeted at other panels or untargeted", async () => {
		const execute = vi.fn(async () => result());
		installUpdateBusResponder(panelWin("panel-1"), execute);
		const transport = transports[0];
		transport.__emit(requestEnvelope({ targetSurfaceId: "panel-2" }));
		transport.__emit(requestEnvelope({ targetSurfaceId: undefined }));
		transport.__emit(
			requestEnvelope({ channel: "com.typlus.workspace.debug" }),
		);
		transport.__emit(requestEnvelope({ kind: "publish" }));
		await flush();
		expect(execute).not.toHaveBeenCalled();
		expect(transport.__publishCalls()).toHaveLength(0);
	});

	it("ignores malformed payloads", async () => {
		const execute = vi.fn(async () => result());
		installUpdateBusResponder(panelWin("panel-1"), execute);
		transports[0].__emit(
			requestEnvelope({ payload: { kind: "install-request" } }),
		);
		await flush();
		expect(execute).not.toHaveBeenCalled();
	});

	it("reports worker failure as ok:false with the stable error code", async () => {
		const { OperationWorkerAttemptError } = await import(
			"@/management/ipc/operation-worker/runner"
		);
		const execute = vi.fn(async () => {
			throw new OperationWorkerAttemptError("integrity_mismatch", undefined, {
				accepted: false,
				commitObserved: false,
				retryEligible: false,
			});
		});
		installUpdateBusResponder(panelWin("panel-1"), execute);
		const transport = transports[0];
		transport.__emit(requestEnvelope());
		await flush();
		await flush();
		const replies = transport
			.__publishCalls()
			.filter((m) => m.kind === "response");
		expect(replies).toHaveLength(1);
		expect(replies[0].payload).toMatchObject({
			kind: "install-result",
			ok: false,
			errorCode: "integrity_mismatch",
		});
	});
});
