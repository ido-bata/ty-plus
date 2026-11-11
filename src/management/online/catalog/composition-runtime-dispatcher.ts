import type { OperationWorkerComposition } from "@/management/ipc/operation-worker-composition";
import type { RuntimeRequestDispatcher } from "@/management/ipc/request";
import {
	CatalogSearchMethod,
	type CatalogSearchRequestDTO,
	ConnectivityCheckMethod,
	DownloadMethod,
	type DownloadRequestDTO,
} from "@/management/online/runtime-gateway";

/**
 * Adapter that bridges an unscoped `RuntimeRequestDispatcher.request(method, payload)`
 * to the `OperationWorkerComposition` surface.
 *
 * `bindOnlineRuntimeGatewayPort(dispatcher)` narrows the dispatcher to an
 * `OnlineRuntimeGatewayPort`, which `createRuntimeCloudGateway(port)`
 * consumes. This adapter is the seam between the two — it forwards the
 * three online methods (`ConnectivityCheckMethod`, `CatalogSearchMethod`,
 * `DownloadMethod`) to the matching composition method and propagates
 * every other method as an explicit `unsupported online method` error so
 * the runtime cannot silently no-op a request.
 */
export const createCompositionRuntimeDispatcher = (
	composition: OperationWorkerComposition,
): RuntimeRequestDispatcher => {
	const dispatcher = {
		async request(
			method:
				| typeof ConnectivityCheckMethod
				| typeof CatalogSearchMethod
				| typeof DownloadMethod,
			payload: unknown,
		): Promise<unknown> {
			switch (method) {
				case ConnectivityCheckMethod:
					return composition.checkConnectivity(undefined);
				case CatalogSearchMethod:
					return composition.lookupCatalog(payload as CatalogSearchRequestDTO);
				case DownloadMethod:
					return composition.downloadPreset(payload as DownloadRequestDTO);
				default:
					throw new Error(
						`unsupported online method: ${String(method.name ?? method)}`,
					);
			}
		},
	};
	return dispatcher as unknown as RuntimeRequestDispatcher;
};
