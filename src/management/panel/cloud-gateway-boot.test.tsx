// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as loggerModule from "@/management/debug/logger";

// ── Hoisted refs / module mocks ──────────────────────────────────────────────

const trustModeRef = vi.hoisted(() => ({ value: "development-unsigned" }));

const pathReaderRef = vi.hoisted(
	() =>
		({
			getSystemPath: vi.fn(() => "C:/extensions/ty-plus"),
		}) as { getSystemPath: ReturnType<typeof vi.fn> },
);

const platformRef = vi.hoisted(() => ({
	value: "win32" as string | undefined,
}));

const cepRuntimeModule = vi.hoisted(() => ({
	createCepOperationWorkerRuntime: vi.fn(),
}));
const contextProviderModule = vi.hoisted(() => ({
	createOperationWorkerContextProvider: vi.fn(),
}));
const compositionModule = vi.hoisted(() => ({
	createOperationWorkerComposition: vi.fn(),
}));
const dispatcherFactoryModule = vi.hoisted(() => ({
	factory: vi.fn(),
}));
const portSpy = vi.hoisted(() => vi.fn());
const cloudGatewayModule = vi.hoisted(() => ({
	createRuntimeCloudGateway: vi.fn(),
}));
const servicesModule = vi.hoisted(() => ({
	initCloudGateway: vi.fn(),
}));
const healthStoreModule = vi.hoisted(() => ({
	publish: vi.fn(),
}));

vi.mock("@/management/ae/cep/runtime", () => ({
	getCepPathReaderFromWindow: vi.fn(() => pathReaderRef),
	normalizeCepSystemPath: vi.fn((value: string) => value),
}));

vi.mock("@/management/ipc/operation-worker-binary", () => ({
	get compiledOperationWorkerTrustMode() {
		return trustModeRef.value;
	},
}));

vi.mock("@/management/ipc/operation-worker-cep-runtime", () => ({
	readCepNodePlatform: vi.fn(() => platformRef.value),
	createCepOperationWorkerRuntime:
		cepRuntimeModule.createCepOperationWorkerRuntime,
}));

vi.mock("@/management/ipc/operation-worker-context", () => ({
	createOperationWorkerContextProvider:
		contextProviderModule.createOperationWorkerContextProvider,
}));

vi.mock("@/management/ipc/operation-worker-composition", () => ({
	createOperationWorkerComposition:
		compositionModule.createOperationWorkerComposition,
}));

vi.mock("@/management/online/catalog/composition-runtime-dispatcher", () => ({
	createCompositionRuntimeDispatcher: dispatcherFactoryModule.factory,
}));

vi.mock("@/management/online/runtime-gateway", async () => {
	const actual = await vi.importActual<
		typeof import("@/management/online/runtime-gateway")
	>("@/management/online/runtime-gateway");
	return {
		...actual,
		bindOnlineRuntimeGatewayPort: (dispatcher: unknown) => {
			portSpy(dispatcher);
			return dispatcher;
		},
	};
});

vi.mock("@/management/online/catalog/runtime-cloud-gateway", () => ({
	createRuntimeCloudGateway: cloudGatewayModule.createRuntimeCloudGateway,
}));

vi.mock("@/management/workspace/services", () => ({
	initCloudGateway: servicesModule.initCloudGateway,
}));

vi.mock("@/management/online/runtime-gateway-health", () => ({
	publishGatewayHealth: healthStoreModule.publish,
	readGatewayHealth: vi.fn(() => ({
		state: "offline",
		reason: "gateway boot was not invoked",
	})),
	subscribeGatewayHealth: vi.fn(() => () => {}),
	markGatewayNotBooted: vi.fn(),
	setHostOnlineStatePublisher: vi.fn(),
}));

import { initCloudGateway } from "@/management/workspace/services";

import {
	type GatewayBootFailureReason,
	isDegradedGatewayBootResult,
	isLiveGatewayBootResult,
	labelOfGatewayBootFailureReason,
	tryBuildCloudGateway,
} from "./cloud-gateway-boot";

declare const __APP_VERSION__: string;
(globalThis as Record<string, unknown>).__APP_VERSION__ = "0.10.0";

// ── Window fixture ───────────────────────────────────────────────────────────

const buildWindow = (): Window =>
	({
		cep_node: {
			process: { platform: "win32" },
			require: vi.fn(),
			buffer: { Buffer: { from: vi.fn() } },
		},
	}) as unknown as Window;

// ── Reset helper ─────────────────────────────────────────────────────────────

const resetMocks = () => {
	for (const mock of [
		cepRuntimeModule.createCepOperationWorkerRuntime,
		contextProviderModule.createOperationWorkerContextProvider,
		compositionModule.createOperationWorkerComposition,
		dispatcherFactoryModule.factory,
		portSpy,
		cloudGatewayModule.createRuntimeCloudGateway,
		servicesModule.initCloudGateway,
		healthStoreModule.publish,
	]) {
		mock.mockReset();
	}
	trustModeRef.value = "development-unsigned";
	platformRef.value = "win32";
	pathReaderRef.getSystemPath.mockReturnValue("C:/extensions/ty-plus");

	cepRuntimeModule.createCepOperationWorkerRuntime.mockReturnValue({
		runtime: "sentinel",
	});
	contextProviderModule.createOperationWorkerContextProvider.mockReturnValue(
		vi.fn(),
	);
	compositionModule.createOperationWorkerComposition.mockReturnValue({
		composition: "sentinel",
		checkConnectivity: vi.fn(async () => ({
			state: "unknown",
			label: "sentinel",
			checked_at: new Date().toISOString(),
		})),
		lookupCatalog: vi.fn(async () => ({ items: [] })),
	});
	dispatcherFactoryModule.factory.mockReturnValue({
		request: vi.fn(async () => undefined),
	});
	cloudGatewayModule.createRuntimeCloudGateway.mockReturnValue({
		provider: "supabase",
	});
	servicesModule.initCloudGateway.mockReturnValue(undefined);
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe("tryBuildCloudGateway", () => {
	beforeEach(resetMocks);
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("returns kind:live and registers the runtime-backed gateway on the happy path", () => {
		const win = buildWindow();
		const result = tryBuildCloudGateway(win);

		expect(isLiveGatewayBootResult(result)).toBe(true);
		expect(result).toEqual({ kind: "live" });
		expect(
			cepRuntimeModule.createCepOperationWorkerRuntime,
		).toHaveBeenCalledWith(win);
		expect(
			compositionModule.createOperationWorkerComposition,
		).toHaveBeenCalledTimes(1);
		expect(
			compositionModule.createOperationWorkerComposition,
		).toHaveBeenCalledWith(
			expect.objectContaining({
				platform: "windows",
				lifecycleObserver: expect.any(Function),
			}),
		);
		expect(dispatcherFactoryModule.factory).toHaveBeenCalledTimes(1);
		expect(portSpy).toHaveBeenCalledTimes(1);
		expect(cloudGatewayModule.createRuntimeCloudGateway).toHaveBeenCalledTimes(
			1,
		);
		expect(initCloudGateway).toHaveBeenCalledWith({
			provider: "supabase",
		});
		expect(healthStoreModule.publish).toHaveBeenCalledWith({
			state: "live",
		});
	});

	it("suppresses boot-time probes when probesEnabled is not set (release default)", async () => {
		const win = buildWindow();
		const result = tryBuildCloudGateway(win);
		expect(isLiveGatewayBootResult(result)).toBe(true);
		const composition = compositionModule.createOperationWorkerComposition.mock
			.results[0]?.value as {
			checkConnectivity: ReturnType<typeof vi.fn>;
			lookupCatalog: ReturnType<typeof vi.fn>;
		};
		await Promise.resolve();
		await Promise.resolve();
		// Issue #131 hardening: release default never fires probes.
		expect(composition.checkConnectivity).not.toHaveBeenCalled();
		expect(composition.lookupCatalog).not.toHaveBeenCalled();
	});

	it("fires a connectivity probe and a catalog probe when probesEnabled is true", async () => {
		const win = buildWindow();
		const result = tryBuildCloudGateway(win, { probesEnabled: true });
		expect(isLiveGatewayBootResult(result)).toBe(true);
		const composition = compositionModule.createOperationWorkerComposition.mock
			.results[0]?.value as {
			checkConnectivity: ReturnType<typeof vi.fn>;
			lookupCatalog: ReturnType<typeof vi.fn>;
		};
		// probes are fire-and-forget; flush microtasks before asserting
		await Promise.resolve();
		await Promise.resolve();
		expect(composition.checkConnectivity).toHaveBeenCalledWith(
			undefined,
			expect.objectContaining({
				run: expect.objectContaining({
					onLifecycle: expect.any(Function),
				}),
			}),
		);
		expect(composition.lookupCatalog).toHaveBeenCalledWith(
			{},
			expect.objectContaining({
				run: expect.objectContaining({
					onLifecycle: expect.any(Function),
				}),
			}),
		);
	});

	it("suppresses boot-time probes when probesEnabled is false", async () => {
		const win = buildWindow();
		const result = tryBuildCloudGateway(win, { probesEnabled: false });
		expect(isLiveGatewayBootResult(result)).toBe(true);
		const composition = compositionModule.createOperationWorkerComposition.mock
			.results[0]?.value as {
			checkConnectivity: ReturnType<typeof vi.fn>;
			lookupCatalog: ReturnType<typeof vi.fn>;
		};
		await Promise.resolve();
		await Promise.resolve();
		expect(composition.checkConnectivity).not.toHaveBeenCalled();
		expect(composition.lookupCatalog).not.toHaveBeenCalled();
	});

	it.each<{
		readonly reason: GatewayBootFailureReason;
		readonly setup: () => void;
	}>([
		{
			reason: "unsupported-trust-mode",
			setup: () => {
				trustModeRef.value = "production-unsigned";
			},
		},
		{
			reason: "unsupported-platform",
			setup: () => {
				platformRef.value = "linux";
			},
		},
		{
			reason: "missing-extension-root",
			setup: () => {
				pathReaderRef.getSystemPath.mockReturnValueOnce("");
			},
		},
		{
			reason: "worker-runtime-failed",
			setup: () => {
				cepRuntimeModule.createCepOperationWorkerRuntime.mockImplementationOnce(
					() => {
						throw new Error("runtime boom");
					},
				);
			},
		},
		{
			reason: "worker-composition-failed",
			setup: () => {
				compositionModule.createOperationWorkerComposition.mockImplementationOnce(
					() => {
						throw new Error("composition boom");
					},
				);
			},
		},
	])(
		"returns kind:degraded with reason $reason when that branch fails",
		({ reason, setup }) => {
			setup();
			const result = tryBuildCloudGateway(buildWindow());

			expect(isDegradedGatewayBootResult(result)).toBe(true);
			if (result.kind !== "degraded") {
				throw new Error("expected degraded result");
			}
			expect(result.failure.reason).toBe(reason);
			expect(typeof result.failure.message).toBe("string");
			expect(result.failure.message.length).toBeGreaterThan(0);
			expect(labelOfGatewayBootFailureReason(result.failure.reason)).toMatch(
				/[A-Z]/,
			);
		},
	);

	it("emits the online.failure event with the classified reason on degraded results", () => {
		trustModeRef.value = "production-unsigned";
		const warnSpy = vi
			.spyOn(console, "warn")
			.mockImplementation(() => undefined);

		const result = tryBuildCloudGateway(buildWindow());

		expect(result.kind).toBe("degraded");
		expect(warnSpy).toHaveBeenCalled();
		const call = warnSpy.mock.calls.find(
			(args) =>
				typeof args[0] === "string" &&
				args[0].includes('event: "online.failure"'),
		);
		expect(call).toBeDefined();
		const payload = call?.[1] as
			| { reason: string; label: string; message: string }
			| undefined;
		expect(payload?.reason).toBe("unsupported-trust-mode");
		expect(payload?.label).toBe(
			labelOfGatewayBootFailureReason("unsupported-trust-mode"),
		);
	});

	it("publishes a degraded state to the runtime-gateway-health store after a degraded result", () => {
		platformRef.value = "linux";

		const result = tryBuildCloudGateway(buildWindow());

		expect(result.kind).toBe("degraded");
		expect(healthStoreModule.publish).toHaveBeenCalledWith(
			expect.objectContaining({
				state: "degraded",
				failure: expect.objectContaining({
					reason: "unsupported-platform",
					message: expect.any(String),
				}),
			}),
		);
	});

	it("publishes a live state to the runtime-gateway-health store after a successful boot", () => {
		tryBuildCloudGateway(buildWindow());

		expect(healthStoreModule.publish).toHaveBeenCalledWith({
			state: "live",
		});
	});

	it("returns degraded without registering a gateway when the extension root is missing", () => {
		pathReaderRef.getSystemPath.mockReturnValueOnce("");

		const result = tryBuildCloudGateway(buildWindow());

		expect(result.kind).toBe("degraded");
		if (result.kind !== "degraded") {
			throw new Error("expected degraded result");
		}
		expect(result.failure.reason).toBe("missing-extension-root");
		expect(
			compositionModule.createOperationWorkerComposition,
		).not.toHaveBeenCalled();
		expect(initCloudGateway).not.toHaveBeenCalled();
	});

	it("returns degraded and does not register a gateway when the trust mode is unsupported", () => {
		trustModeRef.value = "production-unsigned";

		const result = tryBuildCloudGateway(buildWindow());

		expect(result.kind).toBe("degraded");
		if (result.kind !== "degraded") {
			throw new Error("expected degraded result");
		}
		expect(result.failure.reason).toBe("unsupported-trust-mode");
		expect(
			compositionModule.createOperationWorkerComposition,
		).not.toHaveBeenCalled();
		expect(initCloudGateway).not.toHaveBeenCalled();
	});

	it("returns degraded and does not register a gateway when composition construction throws", () => {
		const captured: loggerModule.LogEntry[] = [];
		const unsubscribe = loggerModule.subscribeLog((entries) => {
			captured.push(...entries);
		});
		loggerModule.clearEntries();
		compositionModule.createOperationWorkerComposition.mockImplementationOnce(
			() => {
				throw new Error("boom");
			},
		);

		const result = tryBuildCloudGateway(buildWindow());

		expect(result.kind).toBe("degraded");
		if (result.kind !== "degraded") {
			throw new Error("expected degraded result");
		}
		expect(result.failure.reason).toBe("worker-composition-failed");
		const warnEntries = captured.filter((e) => e.level === "warn");
		expect(
			warnEntries.some(
				(e) =>
					e.source === "online-runtime" &&
					/cloud gateway (init failed|unavailable)/.test(e.message),
			),
		).toBe(true);
		expect(initCloudGateway).not.toHaveBeenCalled();
		unsubscribe();
	});

	it("returns degraded without registering a gateway when runtime construction throws", () => {
		cepRuntimeModule.createCepOperationWorkerRuntime.mockImplementationOnce(
			() => {
				throw new Error("runtime boom");
			},
		);

		const result = tryBuildCloudGateway(buildWindow());

		expect(result.kind).toBe("degraded");
		if (result.kind !== "degraded") {
			throw new Error("expected degraded result");
		}
		expect(result.failure.reason).toBe("worker-runtime-failed");
		expect(initCloudGateway).not.toHaveBeenCalled();
	});

	it("maps darwin CEP platform to macos composition platform", () => {
		platformRef.value = "darwin";

		const result = tryBuildCloudGateway(buildWindow());

		expect(result.kind).toBe("live");
		expect(
			compositionModule.createOperationWorkerComposition,
		).toHaveBeenCalledWith(expect.objectContaining({ platform: "macos" }));
	});

	it("returns degraded when the host platform is unsupported (linux)", () => {
		platformRef.value = "linux";

		const result = tryBuildCloudGateway(buildWindow());

		expect(result.kind).toBe("degraded");
		if (result.kind !== "degraded") {
			throw new Error("expected degraded result");
		}
		expect(result.failure.reason).toBe("unsupported-platform");
		expect(
			compositionModule.createOperationWorkerComposition,
		).not.toHaveBeenCalled();
		expect(initCloudGateway).not.toHaveBeenCalled();
	});

	it("regression: tryBuildCloudGateway never collapses to a boolean", () => {
		// Regression guard for Issue #128: a previous version returned
		// `boolean` so the panel could not tell live boot from failure.
		// The return type is a discriminated union; the guards below
		// must each return true for at least one branch.
		const happyResult = tryBuildCloudGateway(buildWindow());
		const isUnion =
			typeof happyResult === "object" &&
			happyResult !== null &&
			"kind" in happyResult;
		expect(isUnion).toBe(true);

		platformRef.value = "linux";
		const degradedResult = tryBuildCloudGateway(buildWindow());
		expect(typeof degradedResult).toBe("object");
		expect("kind" in degradedResult).toBe(true);
		expect((degradedResult as { kind: unknown }).kind).not.toBe(true);
		expect((degradedResult as { kind: unknown }).kind).not.toBe(false);
	});

	it("exposes a human-readable label for every classified reason", () => {
		const reasons: GatewayBootFailureReason[] = [
			"unsupported-trust-mode",
			"unsupported-platform",
			"missing-extension-root",
			"worker-runtime-failed",
			"worker-composition-failed",
		];
		for (const reason of reasons) {
			const label = labelOfGatewayBootFailureReason(reason);
			expect(typeof label).toBe("string");
			expect(label.length).toBeGreaterThan(0);
		}
	});
});
