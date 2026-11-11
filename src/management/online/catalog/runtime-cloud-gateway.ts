import type {
	CloudGateway,
	NotificationSummary,
	PresetDownloadRequest,
	PresetDownloadResult,
	PresetSearchParams,
	TyPlusHealthResponse,
} from "@/management/online/contract";
import {
	CatalogSearchMethod,
	type CatalogSearchRequestDTO,
	ConnectivityCheckMethod,
	DownloadMethod,
	type DownloadRequestDTO,
	mapCatalogSearchResult,
	mapConnectivityStatus,
	type OnlineRuntimeGatewayPort,
	type PresetRecordDTO,
} from "@/management/online/runtime-gateway";
import type { Preset } from "@/management/preset/contract";

/**
 * NET-010 cloud gateway: the catalog transport, connectivity check, and
 * preset install all go through the Rust runtime over IPC. There is no
 * `fetch` anywhere in this module — a network-capable gateway is only ever
 * constructed from a runtime port. The fixture gateway exists so the product
 * stays functional with no runtime (the documented no-network fallback).
 */

export const FALLBACK_RECORDS: Preset[] = [];

const FIXTURE_USER_MANUAL_URL =
	"https://www.notion.so/ty-plus-User-Manual-fixture";

const FALLBACK_NOTIFICATIONS: NotificationSummary[] = [
	{
		notificationId: "msg-1",
		name: "Welcome to ty-plus",
		summary:
			"Thanks for installing ty-plus! This is a placeholder notification shown when the runtime is not connected (offline fixture).",
		category: "info",
		publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
	},
	{
		notificationId: "msg-2",
		name: "Update available",
		summary:
			"A new version may include improved grid performance and bug fixes.",
		category: "update",
		publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
	},
	{
		notificationId: "msg-3",
		name: "Maintenance notice",
		summary: "Server maintenance may be scheduled; check status page.",
		category: "warn",
		publishedAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
	},
];

const getFixturePublicLink = (key: string) => {
	if (key === "user-manual") {
		return {
			key,
			url: FIXTURE_USER_MANUAL_URL,
			label: "User Manual",
		};
	}
	throw new Error(`Unknown public link: ${key}`);
};

const toCatalogSearchRequest = (
	params: PresetSearchParams,
): CatalogSearchRequestDTO => ({
	...(params.q !== undefined && params.q !== "" ? { q: params.q } : {}),
	...(params.category ? { category: params.category } : {}),
	...(params.tag ? { tag: params.tag } : {}),
	...(params.platform ? { platform: params.platform } : {}),
	...(params.limit !== undefined ? { limit: params.limit } : {}),
	...(params.offset !== undefined ? { offset: params.offset } : {}),
});

const toPresetRecordDto = (
	request: PresetDownloadRequest,
): PresetRecordDTO => ({
	id: request.record.id,
	type: request.record.type,
	title: request.record.title,
	file_path: request.record.filePath,
	...(request.record.description !== undefined
		? { description: request.record.description }
		: {}),
	...(request.record.category !== undefined
		? { category: request.record.category }
		: {}),
	source_catalog_id: request.record.sourceCatalogId,
});

const toDownloadRequest = (
	request: PresetDownloadRequest,
): DownloadRequestDTO => ({
	preset_id: request.presetId,
	destination: request.destination,
	record: toPresetRecordDto(request),
});

/**
 * Network-free cloud gateway used when no runtime port has been initialized.
 * Search returns an empty catalog, notifications / public links return the
 * fixture payloads, and preset install is unavailable (there is no transport).
 */
export const createFixtureCloudGateway = (): CloudGateway => ({
	provider: "supabase",
	isFixture: true,
	getMediaBaseUrl() {
		return undefined;
	},
	async healthCheck(): Promise<TyPlusHealthResponse> {
		return { ok: true };
	},
	async searchPresets() {
		return { items: [] };
	},
	async listNotifications() {
		return [...FALLBACK_NOTIFICATIONS];
	},
	async getNotificationBlocks() {
		return [];
	},
	async getPublicLink(key) {
		return getFixturePublicLink(key);
	},
	async resolvePreset(presetId) {
		throw new Error(`Unknown preset: ${presetId}`);
	},
});

/**
 * Runtime-backed cloud gateway. Catalog search, connectivity health, and
 * preset install are dispatched to the Rust runtime; notifications and public
 * links stay fixture/local so their surfaces work without a network.
 */
export const createRuntimeCloudGateway = (
	port: OnlineRuntimeGatewayPort,
): CloudGateway => ({
	provider: "supabase",
	getMediaBaseUrl() {
		return undefined;
	},
	async healthCheck(): Promise<TyPlusHealthResponse> {
		const status = mapConnectivityStatus(
			await port.request(ConnectivityCheckMethod, undefined),
		);
		return { ok: status.state === "online" };
	},
	async searchPresets(params) {
		return mapCatalogSearchResult(
			await port.request(CatalogSearchMethod, toCatalogSearchRequest(params)),
		);
	},
	async downloadPreset(request): Promise<PresetDownloadResult> {
		const response = await port.request(
			DownloadMethod,
			toDownloadRequest(request),
		);
		return {
			bytesWritten: response.bytes_written,
			sha256: response.sha256,
			finalUrl: response.final_url,
			destination: response.destination,
		};
	},
	async listNotifications() {
		return [...FALLBACK_NOTIFICATIONS];
	},
	async getNotificationBlocks() {
		return [];
	},
	async getPublicLink(key) {
		return getFixturePublicLink(key);
	},
	async resolvePreset(presetId) {
		throw new Error(
			`Runtime gateway cannot resolve preset details: ${presetId}`,
		);
	},
});
