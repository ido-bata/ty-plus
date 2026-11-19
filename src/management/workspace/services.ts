import { resolveCepFileSystemGateway } from "@/management/ae/cep/runtime";
import type {
	UpdateInstallRequestDTO,
	UpdateInstallResultDTO,
} from "@/management/ipc/operation-worker/composition";

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
 * In-app update installer surface (Issue #135). Registered by the
 * operation-worker boot path with the live `OperationWorkerComposition`;
 * `null` until boot succeeds, which the settings UI renders as "manual
 * install only".
 */
export type UpdateInstaller = Readonly<{
	readonly installUpdate: (
		request: UpdateInstallRequestDTO,
	) => Promise<UpdateInstallResultDTO>;
}>;

let updateInstaller: UpdateInstaller | null = null;

export const initUpdateInstaller = (installer: UpdateInstaller): void => {
	updateInstaller = installer;
};

/** Non-throwing accessor; `null` means the worker composition is not live. */
export const getUpdateInstaller = (): UpdateInstaller | null => updateInstaller;

/** Test-only reset hook. */
export const __resetDataServicesForTests = (): void => {
	updateInstaller = null;
};

let cachedSystemPaths: SystemPaths | null | undefined;

/**
 * CEP host filesystem paths, resolved lazily and cached. Returns `null`
 * outside a CEP host so callers can degrade gracefully.
 */
export const resolveSystemPaths = (): SystemPaths | null => {
	if (cachedSystemPaths === undefined) {
		const fsGateway = resolveCepFileSystemGateway("AEFT");
		cachedSystemPaths = (fsGateway?.systemPaths as SystemPaths) ?? null;
	}
	return cachedSystemPaths;
};
