import { sanitizeOnlineErrorMessage } from "@/management/online/catalog/sanitize-error";
import type { CloudGateway, SyncStatus } from "@/management/online/contract";
import type { Preset } from "@/management/preset/contract";

/**
 * Cloud sync service  Enon-blocking, deferred cloud behavior.
 *
 * Design contracts (per MVP Workflow Migration / local-persistence-and-cloud-boundary slice):
 * - Local persistence is **authoritative** for core AE operations.
 * - Cloud sync is a **non-blocking** overlay  Efailures do not prevent local preset operations.
 * - Deferred cloud behaviors (search, download, notifications) are **non-precedent**  Ethey are
 *   additional value layered over local data, not requirements for offline operation.
 * - The `syncPresets()` health probe uses `healthCheck` or `searchPresets` as a lightweight
 *   connection check; it does NOT enumerate `listPresets()` (archive-compliant).
 * - Errors are captured in `SyncStatus` for observability but do not propagate as exceptions.
 */

const createIdleStatus = (
	provider: SyncStatus["provider"],
	checkedAt: string,
): SyncStatus => ({
	provider,
	state: "idle",
	label: "Cloud sync idle",
	checkedAt,
});

export const createCloudSyncService = (options: {
	gateway: CloudGateway;
	now?: () => string;
}) => {
	const now = options.now ?? (() => new Date().toISOString());
	let cachedPresets: Preset[] = [];
	let currentStatus = createIdleStatus(options.gateway.provider, now());

	return {
		getHealth() {
			return currentStatus;
		},
		getCachedPresets() {
			return [...cachedPresets];
		},
		async syncPresets() {
			const checkedAt = now();

			try {
				// Archive-compliant: do not use full `GET /presets`. Connection check via health or light search.
				if (options.gateway.healthCheck) {
					await options.gateway.healthCheck();
				} else if (options.gateway.searchPresets) {
					await options.gateway.searchPresets({ limit: 1 });
				}
				cachedPresets = [];
				currentStatus = {
					provider: options.gateway.provider,
					state: "ready",
					label: "Ty Plus OK",
					checkedAt,
				};

				return {
					status: currentStatus,
					presets: [...cachedPresets],
				};
			} catch (error) {
				currentStatus = {
					provider: options.gateway.provider,
					state: "error",
					label: "Cloud sync failed",
					checkedAt,
					errorMessage: sanitizeOnlineErrorMessage(
						error instanceof Error ? error.message : String(error),
					),
				};

				return {
					status: currentStatus,
					presets: [...cachedPresets],
				};
			}
		},
	};
};
