/**
 * After Effects files runtime gateway implementation.
 *
 * This module provides the concrete implementation of the gateway port
 * that dispatches scan requests to the Rust runtime.
 */

import type { RuntimeRequestDispatcher } from "../../ipc/request";
import {
	type AfterEffectsFilesRuntimeGatewayPort,
	BatchThumbnailMethod,
	type BatchThumbnailRequest,
	type BatchThumbnailResponse,
	bindAfterEffectsFilesRuntimeGatewayPort,
	GenerateThumbnailMethod,
	type GenerateThumbnailRequest,
	type GenerateThumbnailResponse,
	GetHostContextMethod,
	LookupOrGenerateThumbnailMethod,
	type LookupOrGenerateThumbnailRequest,
	type LookupOrGenerateThumbnailResponse,
	LookupThumbnailMethod,
	type LookupThumbnailRequest,
	type LookupThumbnailResponse,
	PluginEffectScanMethod,
	type PluginEffectScanRequest,
	type PluginEffectScanResult,
} from "./runtime-gateway";

/**
 * Creates a gateway implementation that dispatches to the runtime.
 */
export const createAfterEffectsFilesRuntimeGateway = (
	dispatcher: RuntimeRequestDispatcher,
): AfterEffectsFilesRuntimeGateway => {
	const port = bindAfterEffectsFilesRuntimeGatewayPort(dispatcher);
	return new AfterEffectsFilesRuntimeGatewayImpl(port);
};

/**
 * Interface for the After Effects files runtime gateway.
 */
export interface AfterEffectsFilesRuntimeGateway {
	/**
	 * Scans for plugin/effect files.
	 */
	scanPluginEffects(
		request: PluginEffectScanRequest,
	): Promise<PluginEffectScanResult>;

	/**
	 * Gets the host context from the runtime.
	 */
	getHostContext(): Promise<{
		readonly app_root: string;
		readonly support_root: string;
		readonly ae_version: string;
		readonly session_id: string;
	}>;

	/**
	 * Looks up an existing thumbnail in the runtime cache.
	 *
	 * The request payload is forwarded to Rust IPC unchanged; field names
	 * are snake_case to match the Rust wire types.
	 */
	lookupThumbnail(
		request: LookupThumbnailRequest,
	): Promise<LookupThumbnailResponse>;

	/**
	 * Generates a new thumbnail via the runtime.
	 *
	 * The request payload is forwarded to Rust IPC unchanged; field names
	 * are snake_case to match the Rust wire types.
	 */
	generateThumbnail(
		request: GenerateThumbnailRequest,
	): Promise<GenerateThumbnailResponse>;

	/**
	 * Combined lookup-or-generate: checks cache first, generates on miss.
	 *
	 * Reduces round-trips from 2 to 1 for uncached thumbnails.
	 * The request payload is forwarded to Rust IPC unchanged; field names
	 * are snake_case to match the Rust wire types.
	 */
	lookupOrGenerateThumbnail(
		request: LookupOrGenerateThumbnailRequest,
	): Promise<LookupOrGenerateThumbnailResponse>;

	/**
	 * Batch thumbnail processing: processes multiple thumbnails in a
	 * single IPC call with parallel execution on the Rust side.
	 */
	batchThumbnails(
		request: BatchThumbnailRequest,
	): Promise<BatchThumbnailResponse>;
}

/**
 * Concrete implementation of the gateway.
 */
class AfterEffectsFilesRuntimeGatewayImpl
	implements AfterEffectsFilesRuntimeGateway
{
	constructor(private readonly port: AfterEffectsFilesRuntimeGatewayPort) {}

	async scanPluginEffects(
		request: PluginEffectScanRequest,
	): Promise<PluginEffectScanResult> {
		return this.port.request(PluginEffectScanMethod, request);
	}

	async getHostContext(): Promise<{
		readonly app_root: string;
		readonly support_root: string;
		readonly ae_version: string;
		readonly session_id: string;
	}> {
		return this.port.request(GetHostContextMethod, undefined);
	}

	async lookupThumbnail(
		request: LookupThumbnailRequest,
	): Promise<LookupThumbnailResponse> {
		return this.port.request(LookupThumbnailMethod, request);
	}

	async generateThumbnail(
		request: GenerateThumbnailRequest,
	): Promise<GenerateThumbnailResponse> {
		return this.port.request(GenerateThumbnailMethod, request);
	}

	async lookupOrGenerateThumbnail(
		request: LookupOrGenerateThumbnailRequest,
	): Promise<LookupOrGenerateThumbnailResponse> {
		return this.port.request(LookupOrGenerateThumbnailMethod, request);
	}

	async batchThumbnails(
		request: BatchThumbnailRequest,
	): Promise<BatchThumbnailResponse> {
		return this.port.request(BatchThumbnailMethod, request);
	}
}
