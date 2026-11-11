import {
	type RuntimeMethod,
	type RuntimeRequestDispatcher,
	type RuntimeRequestPort,
	scopeRuntimeRequests,
} from "../../ipc/request";

declare const afterEffectsFilesRuntimeScopeToken: unique symbol;

/** Opaque scope for generated methods that own AE-related OS filesystem work. */
export type AfterEffectsFilesRuntimeScope = {
	readonly [afterEffectsFilesRuntimeScopeToken]: never;
};

export type AfterEffectsFilesRuntimeMethod<Request, Response> = RuntimeMethod<
	AfterEffectsFilesRuntimeScope,
	Request,
	Response
>;

/**
 * Runtime request port for the AE-related filesystem gateway implementation.
 *
 * This is intentionally separate from the ExtendScript HostClient and does not
 * offer arbitrary filesystem primitives.
 */
export type AfterEffectsFilesRuntimeGatewayPort =
	RuntimeRequestPort<AfterEffectsFilesRuntimeScope>;

export const bindAfterEffectsFilesRuntimeGatewayPort = (
	dispatcher: RuntimeRequestDispatcher,
): AfterEffectsFilesRuntimeGatewayPort =>
	scopeRuntimeRequests<AfterEffectsFilesRuntimeScope>(dispatcher);

// --- Plugin/Effect Scan Types ---

/** Request for plugin/effect scan. */
export interface PluginEffectScanRequest {
	/** Root directories to scan for plugins/effects. */
	readonly roots: readonly string[];
}

/** A single row from the plugin/effect scan result. */
export interface PluginEffectScanRow {
	/** Path to the plugin/effect file. */
	readonly file_path: string;
	/** AE match name (e.g., "ADBE Gaussian Blur 2"). */
	readonly match_name: string;
	/** Display name for the effect. */
	readonly display_name: string;
}

/** Result of a plugin/effect scan. */
export interface PluginEffectScanResult {
	/** Rows of discovered plugin/effect match names. */
	readonly rows: readonly PluginEffectScanRow[];
	/** Warnings for unreadable paths. */
	readonly warnings: readonly string[];
}

/** Progress event for scan operations. */
export interface ScanProgressEvent {
	/** Sequence number. */
	readonly sequence: number;
	/** Current stage. */
	readonly stage: "preparing" | "discovering" | "finished";
	/** Completed units. */
	readonly completed_units?: number;
	/** Total units. */
	readonly total_units?: number;
	/** User-safe detail message. */
	readonly user_safe_detail?: string;
}

// --- Gateway Methods ---

/** Method for scanning plugin/effect files. */
export const PluginEffectScanMethod: AfterEffectsFilesRuntimeMethod<
	PluginEffectScanRequest,
	PluginEffectScanResult
> = {
	name: "plugin_effect_scan",
};

/** Method for getting host context. */
export const GetHostContextMethod: AfterEffectsFilesRuntimeMethod<
	void,
	{
		readonly app_root: string;
		readonly support_root: string;
		readonly ae_version: string;
		readonly session_id: string;
	}
> = {
	name: "get_host_context",
};

// --- Thumbnail Types ---

/** Request for looking up an existing thumbnail in the cache. */
export interface LookupThumbnailRequest {
	readonly source_path: string;
	readonly mtime_ms: number;
	readonly size_bytes: number;
	readonly file_type: string;
}

/** Response carrying the cached thumbnail path, if any. */
export interface LookupThumbnailResponse {
	readonly cache_path?: string | null;
	readonly animated_source_path?: string | null;
}

/** Request for generating a new thumbnail. */
export interface GenerateThumbnailRequest {
	readonly source_path: string;
	readonly mtime_ms: number;
	readonly size_bytes: number;
	readonly file_type: string;
}

/** Response carrying the generated thumbnail path. */
export interface GenerateThumbnailResponse {
	readonly cache_path: string;
	readonly animated_source_path?: string | null;
}

/** Method for looking up a cached thumbnail. */
export const LookupThumbnailMethod: AfterEffectsFilesRuntimeMethod<
	LookupThumbnailRequest,
	LookupThumbnailResponse
> = {
	name: "lookup_thumbnail",
};

/** Method for generating a thumbnail. */
export const GenerateThumbnailMethod: AfterEffectsFilesRuntimeMethod<
	GenerateThumbnailRequest,
	GenerateThumbnailResponse
> = {
	name: "generate_thumbnail",
};

/** Request for combined lookup-or-generate thumbnail operation. */
export interface LookupOrGenerateThumbnailRequest {
	readonly source_path: string;
	readonly mtime_ms: number;
	readonly size_bytes: number;
	readonly file_type: string;
}

/** Response carrying the thumbnail path after lookup or generation. */
export interface LookupOrGenerateThumbnailResponse {
	readonly cache_path: string;
	readonly animated_source_path?: string | null;
}

/** Method for combined lookup-or-generate thumbnail operation. */
export const LookupOrGenerateThumbnailMethod: AfterEffectsFilesRuntimeMethod<
	LookupOrGenerateThumbnailRequest,
	LookupOrGenerateThumbnailResponse
> = {
	name: "host.thumbnail.lookup-or-generate",
};

/** Request for batch thumbnail processing. */
export interface BatchThumbnailRequest {
	readonly requests: readonly LookupOrGenerateThumbnailRequest[];
}

/** A single result within a batch thumbnail response. */
export interface BatchThumbnailResult {
	readonly cache_path?: string | null;
	readonly animated_source_path?: string | null;
	readonly error?: string | null;
}

/** Response carrying batch thumbnail results. */
export interface BatchThumbnailResponse {
	readonly results: readonly BatchThumbnailResult[];
}

/** Method for batch thumbnail processing. */
export const BatchThumbnailMethod: AfterEffectsFilesRuntimeMethod<
	BatchThumbnailRequest,
	BatchThumbnailResponse
> = {
	name: "host.thumbnail.batch",
};
