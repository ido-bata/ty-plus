import { resolveCepFileSystemGateway } from "@/management/ae/cep/runtime";
import { createPresetRepository } from "@/management/online/catalog/repository";
import { createFixtureCloudGateway } from "@/management/online/catalog/runtime-cloud-gateway";
import { createCloudSyncService } from "@/management/online/catalog/sync";
import type { CloudGateway } from "@/management/online/contract";
import { markGatewayNotBooted } from "@/management/online/runtime-gateway-health";
import {
	parsePresetCatalogJsonText,
	serializePresetCatalogJsonText,
} from "@/management/preset/catalog-json-text";
import type { Preset } from "@/management/preset/contract";
import { createSharedPresetRepository } from "@/management/preset/repository/shared";
import { readPresetsJson, writePresetsJson } from "@/management/storage";
import { catalogJsonMayContainLegacyIdPrefixes } from "@/management/storage/ids";

/** Local alias for the shape used by resolveSystemPaths (matches shared/contract HostFileSystemPaths). */
type SystemPaths = {
	hostId: string;
	operatingSystem: string;
	userSupportRoot: string;
	hostSupportRoot?: string;
	presetRoot?: string;
	scriptRoot?: string;
	pluginRoot?: string;
	cepUserExtensionsRoot?: string;
	cepCommonExtensionsRoot?: string;
};

/**
 * Mode the data-services singleton was created in.
 *
 * - `"live"`     the cloud gateway is the runtime-backed one (`initCloudGateway`
 *                was called during `tryBuildCloudGateway`). This is the only
 *                mode release builds run in.
 * - `"fixture"`  developer-only debug path. The cloud gateway is the network-
 *                free fixture so the panel can render without a Rust runtime.
 *
 * Issue #128: there is no implicit fixture fallback. A live-mode caller that
 * reaches `getDataServices` without `initCloudGateway` having run will throw
 * `GatewayBootRequiredError`; the UI is expected to surface the failure
 * instead of silently rendering as if the runtime were connected.
 */
export type DataServicesBootMode = "live" | "fixture";

export type DataServices = {
	gateway: CloudGateway;
	cloudSync: ReturnType<typeof createCloudSyncService>;
	presetRepository: ReturnType<typeof createPresetRepository>;
	resolveSystemPaths: () => SystemPaths | null;
	readonly bootMode: DataServicesBootMode;
};

/**
 * Thrown when `getDataServices()` is called while boot mode is `"live"` but
 * no runtime-backed gateway was registered. This is the explicit failure
 * path that replaces the legacy silent fixture fallback.
 */
export class GatewayBootRequiredError extends Error {
	override readonly name = "GatewayBootRequiredError";
	constructor(message = "Cloud gateway was not booted (Issue #128)") {
		super(message);
	}
}

let singleton: DataServices | null = null;
let singletonUsesSharedPresetRepository = false;
let bootMode: DataServicesBootMode = "live";

/**
 * Cloud gateway instance.
 * Set during initialization to use the Rust runtime (`online.*` IPC methods).
 * Until a runtime port is connected the product no longer falls back to the
 * fixture gateway silently — `getDataServices` throws.
 */
let cloudGateway: CloudGateway | null = null;

/** Initialize the cloud gateway used by data services. */
export const initCloudGateway = (gateway: CloudGateway): void => {
	cloudGateway = gateway;
};

/**
 * Flip the boot mode for the data-services singleton. The mode is
 * independent of the singleton instance and the cloudGateway module-level
 * variable: tests use this to exercise the developer-only fixture path.
 */
export const setDataServicesBootMode = (mode: DataServicesBootMode): void => {
	bootMode = mode;
};

/**
 * Non-throwing variant of `getDataServices`. Returns `null` when the live
 * boot path would have thrown (`cloudGateway === null` and `bootMode === "live"`).
 * UI surfaces that must never throw during render should use this.
 */
export const tryGetDataServices = (): DataServices | null => {
	if (singleton) return singleton;
	if (cloudGateway === null && bootMode === "live") {
		return null;
	}
	return getDataServices();
};

/**
 * Test-only reset hook. Clears the cached singleton and the cloudGateway
 * module-level variable so each test starts from a known state. Does NOT
 * clear `bootMode` — tests are expected to set it explicitly with
 * `setDataServicesBootMode`.
 */
export const __resetDataServicesForTests = (): void => {
	singleton = null;
	singletonUsesSharedPresetRepository = false;
	cloudGateway = null;
};

const shouldUseSharedPresetRepository = (): boolean => {
	if (typeof window === "undefined") {
		return false;
	}
	const w = window as Window & {
		__adobe_cep__?: unknown;
		CSInterface?: unknown;
	};
	return (
		typeof w.CSInterface === "function" ||
		typeof w.__adobe_cep__ !== "undefined"
	);
};

const wrapFilePresetRepository = (
	base: ReturnType<typeof createPresetRepository>,
): ReturnType<typeof createPresetRepository> =>
	createSharedPresetRepository(base, {
		async read() {
			const raw = await readPresetsJson(window);
			const rows = parsePresetCatalogJsonText(raw);
			if (
				rows.length > 0 &&
				typeof raw === "string" &&
				catalogJsonMayContainLegacyIdPrefixes(raw)
			) {
				await writePresetsJson(window, serializePresetCatalogJsonText(rows));
			}
			return rows;
		},
		async write(presets: Preset[]) {
			await writePresetsJson(window, serializePresetCatalogJsonText(presets));
		},
	});

/**
 * Cloud/preset layer shared between panel and modeless dialogs.
 *
 * Boot semantics (Issue #128):
 * - When the runtime-backed gateway was registered via `initCloudGateway`,
 *   the singleton is created with that gateway and `bootMode === "live"`.
 * - When `bootMode === "fixture"`, the developer-only fixture gateway is
 *   used. This is opt-in; tests call `setDataServicesBootMode("fixture")`
 *   explicitly.
 * - When `bootMode === "live"` and no runtime gateway was registered,
 *   this throws `GatewayBootRequiredError` after marking the health
 *   store as offline. The panel boot path is expected to catch and
 *   surface this via the gateway health UI.
 */
export const getDataServices = (): DataServices => {
	if (singleton) {
		if (
			!singletonUsesSharedPresetRepository &&
			shouldUseSharedPresetRepository()
		) {
			const basePresetRepository = createPresetRepository({
				cloud: singleton.gateway,
			});
			singleton = {
				...singleton,
				presetRepository: wrapFilePresetRepository(basePresetRepository),
			};
			singletonUsesSharedPresetRepository = true;
		}
		return singleton;
	}

	let gateway: CloudGateway;
	let effectiveBootMode: DataServicesBootMode;
	if (cloudGateway !== null) {
		gateway = cloudGateway;
		effectiveBootMode = "live";
	} else if (bootMode === "fixture") {
		gateway = createFixtureCloudGateway();
		effectiveBootMode = "fixture";
	} else {
		// Live mode but no runtime gateway has been registered. Mark the
		// health store as offline (no classified reason — this is a
		// "never booted" state, not a "boot attempted and failed" state)
		// and throw so the caller can surface the failure.
		markGatewayNotBooted();
		throw new GatewayBootRequiredError();
	}

	const useCepFilePresetStore = shouldUseSharedPresetRepository();
	const presetRepository = createPresetRepository({
		cloud: gateway,
	});
	singletonUsesSharedPresetRepository = shouldUseSharedPresetRepository();
	const sharedPresetRepository = singletonUsesSharedPresetRepository
		? wrapFilePresetRepository(presetRepository)
		: presetRepository;

	const cloudSync = createCloudSyncService({ gateway });

	const cachedSystemPaths = (() => {
		let cache: SystemPaths | null | undefined;
		return (): SystemPaths | null => {
			if (cache === undefined) {
				const gateway = resolveCepFileSystemGateway("AEFT");
				cache = (gateway?.systemPaths as SystemPaths) ?? null;
			}
			return cache;
		};
	})();

	singleton = {
		gateway,
		presetRepository: sharedPresetRepository,
		cloudSync,
		resolveSystemPaths: cachedSystemPaths,
		bootMode: effectiveBootMode,
	};
	return singleton;
};
