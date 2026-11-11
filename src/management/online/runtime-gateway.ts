import type { PresetSearchItem } from "@/management/online/contract";

import {
	type RuntimeMethod,
	type RuntimeRequestDispatcher,
	type RuntimeRequestPort,
	scopeRuntimeRequests,
} from "../ipc/request";

declare const onlineRuntimeScopeToken: unique symbol;

/** Opaque scope used by generated online methods and their handwritten mapper. */
export type OnlineRuntimeScope = {
	readonly [onlineRuntimeScopeToken]: never;
};

export type OnlineRuntimeMethod<Request, Response> = RuntimeMethod<
	OnlineRuntimeScope,
	Request,
	Response
>;

/**
 * Runtime request port available to the online gateway implementation.
 *
 * Online operations and DTO mapping belong in this file once the generated
 * wire contract exists. This boundary never exposes a generic fetch primitive.
 */
export type OnlineRuntimeGatewayPort = RuntimeRequestPort<OnlineRuntimeScope>;

export const bindOnlineRuntimeGatewayPort = (
	dispatcher: RuntimeRequestDispatcher,
): OnlineRuntimeGatewayPort =>
	scopeRuntimeRequests<OnlineRuntimeScope>(dispatcher);

// --- Connectivity ---

/** Explicit online/offline state as projected to the UI. */
export type ConnectivityState = "unknown" | "online" | "offline" | "checking";

/** Connectivity status payload. */
export interface ConnectivityStatus {
	/** Current state. */
	readonly state: ConnectivityState;
	/** Human-readable label. */
	readonly label: string;
	/** ISO 8601 timestamp of the last check. */
	readonly checkedAt: string;
	/** Error message when offline. */
	readonly errorMessage?: string;
}

/** Wire DTO for connectivity status (mirrors Rust `ConnectivityStatusDto`). */
export interface ConnectivityStatusDTO {
	readonly state: ConnectivityState;
	readonly label: string;
	readonly checked_at: string;
	readonly error_message?: string;
}

/** Method for checking product connectivity and reporting explicit offline state. */
export const ConnectivityCheckMethod: OnlineRuntimeMethod<
	void,
	ConnectivityStatusDTO
> = {
	name: "online.connectivity.check",
};

/** Map the wire connectivity DTO to the domain shape used by the UI. */
export const mapConnectivityStatus = (
	status: ConnectivityStatusDTO,
): ConnectivityStatus => ({
	state: status.state,
	label: status.label,
	checkedAt: status.checked_at,
	...(status.error_message !== undefined
		? { errorMessage: status.error_message }
		: {}),
});

// --- Catalog search ---

/** Wire DTO for a catalog search query (mirrors Rust `CatalogSearchRequest`). */
export interface CatalogSearchRequestDTO {
	readonly q?: string;
	readonly category?: string;
	readonly tag?: string;
	readonly platform?: string;
	readonly limit?: number;
	readonly offset?: number;
}

/** Wire DTO for a single catalog search row (mirrors Rust `CatalogSearchItem`). */
export interface CatalogSearchItemDTO {
	readonly preset_id: string;
	readonly name: string;
	readonly description?: string;
	readonly category?: string;
	readonly tag?: string[];
	readonly platform?: string;
	readonly version?: string;
	readonly notion_page_url?: string;
	readonly thumbnail_url?: string;
}

/** Wire DTO for a catalog search response (mirrors Rust `CatalogSearchResult`). */
export interface CatalogSearchResultDTO {
	readonly items: CatalogSearchItemDTO[];
}

/** Method for searching the preset catalog via the Rust HTTP client. */
export const CatalogSearchMethod: OnlineRuntimeMethod<
	CatalogSearchRequestDTO,
	CatalogSearchResultDTO
> = {
	name: "online.catalog.search",
};

/**
 * Map a wire DTO row to the existing domain model (`PresetSearchItem`).
 *
 * The wire shape uses snake_case keys owned by the Rust client; the domain
 * model uses camelCase and lives in `online/contract.ts`. Wire DTOs must
 * never reach the UI — this boundary is the only conversion point.
 */
export const mapCatalogSearchItem = (
	item: CatalogSearchItemDTO,
): PresetSearchItem => ({
	presetId: item.preset_id,
	name: item.name,
	...(item.description !== undefined ? { description: item.description } : {}),
	...(item.category !== undefined ? { category: item.category } : {}),
	...(item.tag !== undefined && item.tag.length > 0 ? { tag: item.tag } : {}),
	...(item.platform !== undefined ? { platform: item.platform } : {}),
	...(item.version !== undefined ? { version: item.version } : {}),
	...(item.notion_page_url !== undefined
		? { notionPageUrl: item.notion_page_url }
		: {}),
	...(item.thumbnail_url !== undefined
		? { thumbnailUrl: item.thumbnail_url }
		: {}),
});

/** Map a wire catalog search result to the domain shape used by the UI. */
export const mapCatalogSearchResult = (
	result: CatalogSearchResultDTO,
): { items: PresetSearchItem[] } => ({
	items: result.items.map(mapCatalogSearchItem),
});

// --- Download ---

/** Wire DTO for a preset record committed after the asset is on disk (mirrors Rust `PresetRecord`). */
export interface PresetRecordDTO {
	readonly id: string;
	readonly type: string;
	readonly title: string;
	readonly file_path: string;
	readonly description?: string;
	readonly category?: string;
	readonly source_catalog_id: string;
}

/** Wire DTO for `online.download` request (mirrors Rust `DownloadRequest`). */
export interface DownloadRequestDTO {
	readonly preset_id: string;
	readonly destination: string;
	readonly record: PresetRecordDTO;
}

/** Wire DTO for `online.download` response (mirrors Rust `DownloadResponse`). */
export interface DownloadResponseDTO {
	readonly bytes_written: number;
	readonly sha256: string;
	readonly final_url: string;
	readonly destination: string;
}

/**
 * Method for installing a catalog preset entirely inside the Rust runtime:
 * the signed URL is resolved, the body is downloaded and verified into a
 * same-directory transaction, and the record is committed locally. The
 * caller supplies only the cloud preset id, destination path, and record.
 */
export const DownloadMethod: OnlineRuntimeMethod<
	DownloadRequestDTO,
	DownloadResponseDTO
> = {
	name: "online.download",
};

// --- Offline policy ---

/** Online operations subject to the offline policy (mirrors Rust `OnlineOperation`). */
export type OnlineOperation =
	| "connectivity-check"
	| "catalog-search"
	| "download"
	| "search-cache";

/** What an operation may do under the current connectivity state (mirrors Rust `OfflineDecision`). */
export type OfflineDecision = "proceed" | "cache-only" | "fail-offline";

/**
 * Apply the offline policy to a single operation (mirrors Rust
 * `offline::decide`). While offline only download is blocked; the
 * connectivity check and search cache stay local, and catalog search
 * degrades to the persistent cache.
 */
export const decideOfflinePolicy = (
	state: ConnectivityState,
	operation: OnlineOperation,
): OfflineDecision => {
	if (state !== "offline") {
		return "proceed";
	}
	switch (operation) {
		case "download":
			return "fail-offline";
		case "catalog-search":
			return "cache-only";
		default:
			return "proceed";
	}
};
