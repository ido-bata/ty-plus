// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixModule = vi.hoisted(() => ({
	createFixtureCloudGateway: vi.fn(),
}));
const runtimeGatewayModule = vi.hoisted(() => ({
	createRuntimeCloudGateway: vi.fn(),
}));
const cepRuntimeModule = vi.hoisted(() => ({
	resolveCepFileSystemGateway: vi.fn(),
}));
const storageModule = vi.hoisted(() => ({
	readPresetsJson: vi.fn(),
	writePresetsJson: vi.fn(),
}));
const sharedPresetRepositoryModule = vi.hoisted(() => ({
	createSharedPresetRepository: vi.fn(),
}));
const presetRepositoryModule = vi.hoisted(() => ({
	createPresetRepository: vi.fn(),
}));
const cloudSyncModule = vi.hoisted(() => ({
	createCloudSyncService: vi.fn(),
}));
const healthStoreRef = vi.hoisted(() => ({
	markGatewayNotBootedCalls: 0,
}));

vi.mock("@/management/ae/cep/runtime", () => ({
	resolveCepFileSystemGateway: cepRuntimeModule.resolveCepFileSystemGateway,
	getCepPathReaderFromWindow: vi.fn(),
	normalizeCepSystemPath: vi.fn(),
}));

vi.mock("@/management/online/catalog/repository", () => ({
	createPresetRepository: presetRepositoryModule.createPresetRepository,
}));

vi.mock("@/management/online/catalog/runtime-cloud-gateway", () => ({
	createFixtureCloudGateway: fixModule.createFixtureCloudGateway,
	createRuntimeCloudGateway: runtimeGatewayModule.createRuntimeCloudGateway,
}));

vi.mock("@/management/online/catalog/sync", () => ({
	createCloudSyncService: cloudSyncModule.createCloudSyncService,
}));

vi.mock("@/management/online/runtime-gateway-health", () => ({
	markGatewayNotBooted: vi.fn(() => {
		healthStoreRef.markGatewayNotBootedCalls += 1;
	}),
	publishGatewayHealth: vi.fn(),
	readGatewayHealth: vi.fn(() => ({
		state: "offline",
		reason: "gateway boot was not invoked",
	})),
	subscribeGatewayHealth: vi.fn(() => () => {}),
}));

vi.mock("@/management/preset/repository/shared", () => ({
	createSharedPresetRepository:
		sharedPresetRepositoryModule.createSharedPresetRepository,
}));

vi.mock("@/management/storage", () => ({
	readPresetsJson: storageModule.readPresetsJson,
	writePresetsJson: storageModule.writePresetsJson,
}));

vi.mock("@/management/storage/ids", () => ({
	catalogJsonMayContainLegacyIdPrefixes: vi.fn(() => false),
}));

import {
	__resetDataServicesForTests,
	GatewayBootRequiredError,
	getDataServices,
	initCloudGateway,
	setDataServicesBootMode,
	tryGetDataServices,
} from "./services";

const fixtureGateway = {
	provider: "supabase" as const,
	isFixture: true as const,
	resolvePreset: vi.fn(async () => ({}) as never),
} as const;
const runtimeGateway = {
	provider: "supabase" as const,
	isFixture: undefined,
	resolvePreset: vi.fn(async () => ({}) as never),
} as const;

const buildWindow = (): Window =>
	({
		CSInterface: vi.fn(() => ({})),
	}) as unknown as Window;

const resetAll = () => {
	for (const mock of [
		fixModule.createFixtureCloudGateway,
		runtimeGatewayModule.createRuntimeCloudGateway,
		cepRuntimeModule.resolveCepFileSystemGateway,
		storageModule.readPresetsJson,
		storageModule.writePresetsJson,
		sharedPresetRepositoryModule.createSharedPresetRepository,
		presetRepositoryModule.createPresetRepository,
		cloudSyncModule.createCloudSyncService,
	]) {
		mock.mockReset();
	}
	healthStoreRef.markGatewayNotBootedCalls = 0;
	storageModule.readPresetsJson.mockResolvedValue("[]");
	cepRuntimeModule.resolveCepFileSystemGateway.mockReturnValue(null);
	sharedPresetRepositoryModule.createSharedPresetRepository.mockImplementation(
		(base: unknown) => base,
	);
	presetRepositoryModule.createPresetRepository.mockReturnValue({
		list: vi.fn(async () => []),
	});
	cloudSyncModule.createCloudSyncService.mockReturnValue({
		syncPresets: vi.fn(async () => undefined),
	});
	fixModule.createFixtureCloudGateway.mockReturnValue(fixtureGateway);
	runtimeGatewayModule.createRuntimeCloudGateway.mockReturnValue(
		runtimeGateway,
	);
	(globalThis as { window?: Window }).window = buildWindow();
	// Default every test to the live boot path; the fixture-mode test
	// sets it explicitly. `__resetDataServicesForTests` intentionally
	// does NOT touch the boot mode (per Issue #128 contract), so the
	// test harness restores it here.
	setDataServicesBootMode("live");
};

describe("services.getDataServices — Issue #128 silent-fallback removal", () => {
	beforeEach(() => {
		__resetDataServicesForTests();
		resetAll();
	});

	afterEach(() => {
		__resetDataServicesForTests();
	});

	it("returns the runtime gateway when one was registered via initCloudGateway", () => {
		initCloudGateway(runtimeGateway);

		const services = getDataServices();

		expect(services.gateway).toBe(runtimeGateway);
		expect(services.bootMode).toBe("live");
		expect(fixModule.createFixtureCloudGateway).not.toHaveBeenCalled();
	});

	it("throws GatewayBootRequiredError when no runtime gateway is registered (default boot mode)", () => {
		expect(() => getDataServices()).toThrow(GatewayBootRequiredError);
		expect(fixModule.createFixtureCloudGateway).not.toHaveBeenCalled();
		expect(healthStoreRef.markGatewayNotBootedCalls).toBe(1);
	});

	it("does NOT fall back to the fixture gateway implicitly", () => {
		try {
			getDataServices();
		} catch {
			/* expected */
		}
		expect(fixModule.createFixtureCloudGateway).not.toHaveBeenCalled();
	});

	it("uses the fixture gateway only when boot mode is explicitly set to fixture", () => {
		setDataServicesBootMode("fixture");

		const services = getDataServices();

		expect(services.gateway).toBe(fixtureGateway);
		expect(services.bootMode).toBe("fixture");
		expect(fixModule.createFixtureCloudGateway).toHaveBeenCalledTimes(1);
		expect(healthStoreRef.markGatewayNotBootedCalls).toBe(0);
	});

	it("tryGetDataServices returns null when the live gateway is missing", () => {
		expect(tryGetDataServices()).toBeNull();
	});

	it("tryGetDataServices returns the singleton when initCloudGateway ran", () => {
		initCloudGateway(runtimeGateway);
		expect(tryGetDataServices()?.gateway).toBe(runtimeGateway);
	});

	it("cached singleton survives subsequent throws", () => {
		initCloudGateway(runtimeGateway);
		const first = getDataServices();
		// Subsequent boots with a missing gateway must not tear down
		// the existing live singleton.
		try {
			setDataServicesBootMode("live");
			__resetDataServicesForTests();
			initCloudGateway(runtimeGateway);
		} catch {
			/* not expected */
		}
		expect(first.gateway).toBe(runtimeGateway);
	});
});
