// Cloud gateway contract and related types

import type { Preset, PresetType } from "@/management/preset/contract";

/** Archive `listNotifications` / Ty Plus Edge notification list row.
 *  `severity` / `url` are carried by the R0 static notification feed
 *  (docs/architecture/feeds.md); the backend path leaves them undefined. */
export type NotificationSummary = {
	notificationId: string;
	name: string;
	summary?: string;
	category?: string;
	publishedAt?: string;
	severity?: "info" | "warning" | "critical";
	url?: string;
};

/** `GET /preset/search`  Earchive `presets-api-port` equivalent query */
export type PresetSearchParams = {
	q?: string;
	category?: string;
	tag?: string;
	platform?: string;
	limit?: number;
	offset?: number;
};

/** Market search row (assumed Notion-synchronized metadata) */
export type PresetSearchItem = {
	presetId: string;
	name: string;
	description?: string;
	category?: string;
	tag?: string[];
	platform?: string;
	version?: string;
	notionPageUrl?: string;
	thumbnailUrl?: string;
};

/** `GET /preset/:id/download` */
type PresetDownload = {
	url: string;
	sha256: string;
	expiresIn?: number;
};

/**
 * NET-010: install a catalog preset entirely inside the Rust runtime. The
 * signed URL is resolved, the body is downloaded and verified, and the record
 * is committed — all inside `online.download`. The caller supplies only the
 * cloud preset id, the resolved destination path, and the record to commit.
 */
export type PresetDownloadRequest = {
	presetId: string;
	destination: string;
	record: {
		id: string;
		type: PresetType;
		title: string;
		filePath: string;
		description?: string;
		category?: string;
		sourceCatalogId: string;
	};
};

/** Result of a runtime-backed preset install (`online.download` response). */
export type PresetDownloadResult = {
	bytesWritten: number;
	sha256: string;
	finalUrl: string;
	destination: string;
};

/** `POST /preset/:id/upload-url` */
type PresetUpload = {
	url: string;
	path?: string;
	method?: "PUT";
	token?: string;
	expiresIn?: number;
};

export type TyPlusHealthResponse = {
	ok: boolean;
};

/** `POST /reports`  Ebody extensible per project */
type ReportCreateRequest = Record<string, unknown>;

type ReportCreateResponse = {
	reportId: string;
	notion: "ok" | "failed";
};

/** `GET /public-links/:key` — resolves a documentation URL by stable key. */
export type PublicLink = {
	key: string;
	url: string;
	label?: string;
	updatedAt?: string;
};

type SyncState = "idle" | "syncing" | "ready" | "error";

export type SyncStatus = {
	provider: "supabase";
	state: SyncState;
	label: string;
	checkedAt: string;
	errorMessage?: string;
};

// CloudPresetMutation is similar to Preset but kept separate for cloud-specific operations
type CloudPresetMutation = {
	id: string;
	type: "preset" | "script" | "plugin" | "footage";
	title: string;
	filePath: string;
	description?: string;
	descriptionImage?: string;
	icon?: Preset | string;
	data?: Record<string, unknown>;
};

export interface CloudGateway {
	provider: "supabase";
	/**
	 * True only on the offline fixture gateway (the no-runtime fallback).
	 * The runtime-backed gateway leaves this unset. UI surfaces use this to
	 * render placeholder content with a visible "fixture" badge so users
	 * can distinguish mock data from real online content.
	 */
	readonly isFixture?: true;
	getMediaBaseUrl?(): string | undefined;
	/** `GET /health` */
	healthCheck?(): Promise<TyPlusHealthResponse>;
	/**
	 * Optional (legacy compat). Archive Ty Plus contract does **not depend on `GET /presets`**.
	 * Market search uses `searchPresets`; single item uses `resolvePreset`.
	 */
	listPresets?(): Promise<Preset[]>;
	resolvePreset(presetId: string): Promise<Preset>;
	publishPreset?(preset: CloudPresetMutation): Promise<Preset>;
	updatePreset?(preset: CloudPresetMutation): Promise<Preset>;
	deletePreset?(presetId: string): Promise<void>;
	/** `GET /preset/search` Earchive `{ items }` */
	searchPresets?(
		params: PresetSearchParams,
	): Promise<{ items: PresetSearchItem[] }>;
	/** Signed download URL (Storage etc.) */
	getPresetDownloadUrl?(
		presetId: string,
		options?: { redirect?: boolean },
	): Promise<PresetDownload>;
	/**
	 * NET-010: install a preset via the Rust runtime. The signed URL
	 * resolution, download, integrity check, and local install all happen
	 * inside the runtime; the TS side never fetches the preset body.
	 */
	downloadPreset?(
		request: PresetDownloadRequest,
	): Promise<PresetDownloadResult>;
	/** Signed upload URL (Storage etc.) */
	getPresetUploadUrl?(
		presetId: string,
		options?: { filename?: string; contentType?: string },
	): Promise<PresetUpload>;
	/** `GET …/notifications` Earchive `notifications-api-port` equivalent `{ items }` expected */
	listNotifications?(): Promise<NotificationSummary[]>;
	getNotificationBlocks?(notificationId: string): Promise<unknown[]>;
	/** `POST /reports` */
	submitReport?(body: ReportCreateRequest): Promise<ReportCreateResponse>;
	/** `GET /public-links/:key` */
	getPublicLink?(key: string): Promise<PublicLink>;
}
