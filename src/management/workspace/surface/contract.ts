/**
 * Workspace UI / host surface types shared by management and widget scripts.
 * Keeps `function/widget` free of imports from `management/workspace/state`.
 */

/** Equivalent to archive project-info-widget CompInfo (AE eval JSON) */
type SurfaceInfo = {
	name: string;
	width: number;
	height: number;
	pixelAspect: number;
	duration: number;
	frameRate: number;
	dropFrame: boolean;
	bgColor: [number, number, number] | null;
	layers: number;
	selectedLayers: number;
	shutterAngle: number;
	shutterPhase: number;
	motionBlur: boolean;
	draft3d: boolean;
};

/** @deprecated Use `SurfaceInfo`  Ewill be removed in a future release. */
export type CompInfo = SurfaceInfo;

/** Align panel: align target (equivalent to archive `AlignTarget`) */
export type AlignTargetId = "selection" | "comp" | "key-object" | "time";

type SurfaceMessageKind = "request" | "response" | "publish";

export type SurfaceMessageEnvelope = {
	messageId: string;
	correlationId?: string;
	channel: string;
	kind: SurfaceMessageKind;
	sourceSurfaceId: string;
	targetSurfaceId?: string;
	dialogId?: string;
	payload: unknown;
	createdAt: number;
};

export type SurfaceTransport = {
	publish(message: SurfaceMessageEnvelope): Promise<void> | void;
	subscribe(handler: (message: SurfaceMessageEnvelope) => void): () => void;
};

// ── Shell bus (APPLICATION channel names + payloads) ─────────────────────────────────────

/**
 * APPLICATION bus channel names (CEP `surfaceMessage`).
 *
 * **Prerequisite**: Original functionality from `archive/rebuild-foundation-legacy-root` SidePanel (Presets / Messages / Settings).
 * Rebuild moves **the same responsibilities** to Modeless, **adding** cross-panel sync/notification via APPLICATION bus.
 *
 * - **presets**: Like archive `PresetsView`; cloud is **market (distribution/fetch)**. Listed together with local.
 * - **messages**: Archive `MessagesView` (`listNotifications`) is **receive-only** notification inbox. Not a user chat-send UI.
 */
export const SHELL_CHANNELS = {
	presets: "com.typlus.workspace.presets",
	messages: "com.typlus.workspace.messages",
	settings: "com.typlus.workspace.settings",
	/** Widget add request to panel (modeless -> panel) */
	layout: "com.typlus.workspace.layout",
	/** Workspace grid background layer (modeless -> panel) */
	background: "com.typlus.workspace.background",
	/**
	 * Onboarding lifecycle (primary panel → other panels).
	 * Currently carries `kind: "completed"` so auxiliary panels can drop the
	 * SetupRequired view and load the real workspace once the primary panel
	 * writes `ty-plus-init.json`.
	 */
	onboarding: "com.typlus.workspace.onboarding",
	/**
	 * Issue #129: cross-surface diagnostic log channel. The panel context
	 * publishes one envelope per log entry (`kind: "publish"`) and the
	 * Debug Console modeless context subscribes; late-open Debug Consoles
	 * send a `kind: "request"` to ask any surface to replay its current
	 * LogBus snapshot back via `kind: "response"` addressed to the
	 * requester's surfaceId.
	 *
	 * MUST live in `SHELL_CHANNELS` — the envelope validator in
	 * `management/ae/cep/transport/index.ts` rejects unknown channels
	 * silently. A literal in the interceptor would silently drop every
	 * message at the receiving side.
	 */
	debug: "com.typlus.workspace.debug",
} as const;

type ShellChannel = (typeof SHELL_CHANNELS)[keyof typeof SHELL_CHANNELS];

/** For `SurfaceMessageEnvelope.payload` (preset list / sync state. Used for market fetch result sharing) */
export type PresetsPayload =
	| {
			kind: "snapshot";
			presets: import("../../preset/contract").Preset[];
			syncStatus: import("../../../management/online/contract").SyncStatus;
			sourceSurfaceId: string;
	  }
	| {
			kind: "requestSync";
			requestId: string;
			sourceSurfaceId: string;
	  };

/**
 * Single line displayed on receiver side (notification / system delivery).
 * Data equivalent to archive notification list is assumed to be fetched from backend later and placed here.
 * Dialog itself does **not send** (receive only).
 */
type MessagesPayload = {
	kind: "line";
	text: string;
	sourceSurfaceId: string;
	at: string;
};

/** Settings summary (for backend connection status display. Excludes secrets) */
export type SettingsPayload =
	| {
			kind: "summary";
			sourceSurfaceId: string;
			supabaseUrlPresent: boolean;
			apiBase?: string;
			mediaBaseUrl?: string;
	  }
	| {
			/** Live settings edit sync to other panels/dialogs */
			kind: "themeLive";
			sourceSurfaceId: string;
			at: string;
			overrides: Partial<Record<string, string>>;
	  };

/** Widget add to workspace grid (from dialog etc. to panel) */
export type LayoutPayload =
	| {
			kind: "addWidget";
			widgetType: string;
			sourceSurfaceId: string;
			/** When set, only this workspace panel (`panel-1` …) applies the add. */
			targetPanelId?: string;
	  }
	| {
			/** Preset placement changed (move/assign between panels) */
			kind: "presetPlacement";
			sourcePanelId: string;
			targetPanelId: string;
			presetIds: string[];
			/**
			 * Optional geometry per `presetIds[i]`. `null`/`undefined` ↁEauto-pack for that slot.
			 * Used when moving tiles so the target panel can preserve positions.
			 */
			explicitPlacements?: ReadonlyArray<{
				x: number;
				y: number;
				width: number;
				height: number;
			} | null> | null;
			/** Defaults to `{ axis: -1 }` (6ÁE0 column bands) when omitted. */
			auto?: import("../placement/contract").AutoPackOptions | null;
			defaultTile?: { width: number; height: number };
	  }
	| {
			/** Widget instance tiles moved onto another panel grid */
			kind: "widgetPlacement";
			sourcePanelId: string;
			targetPanelId: string;
			tiles: ReadonlyArray<{
				id: string;
				x: number;
				y: number;
				width: number;
				height: number;
			}>;
			widgetTypes: Readonly<Record<string, string>>;
			/** Same packing strategy as `presetPlacement` / onboarding (`axis: -1` default). */
			auto?: import("../placement/contract").AutoPackOptions | null;
			defaultTile?: { width: number; height: number };
	  }
	| {
			/**
			 * `workspace-N.json` / settings were updated from another panel process.
			 * Receivers that match `panelIds` should reload layout from storage instead of
			 * applying `presetPlacement` / `widgetPlacement` merges (avoids double-merge
			 * races when the destination panel is already open).
			 */
			kind: "reloadWorkspaceLayoutFromStorage";
			sourceSurfaceId: string;
			panelIds: readonly string[];
			layoutReadSupportRoot?: string;
	  };

/** Reflect from background panel to grid (persistence on panel side) */
export type BackgroundPayload = {
	kind: "setBackground";
	background: import("../background/contract").Background | null;
	sourceSurfaceId: string;
	/** Target panel ID (`readCepOpenParams().openerSurfaceId`) */
	targetPanelId: string;
};

/**
 * Onboarding lifecycle payload broadcast on `SHELL_CHANNELS.onboarding`.
 * - `completed`: primary panel finished writing `ty-plus-init.json` and the
 *   initial workspace storage; auxiliary panels should re-check the locator
 *   and drop any "Setup required" placeholder.
 */
export type OnboardingPayload = {
	kind: "completed";
	sourceSurfaceId: string;
	/** Support root that onboarding just persisted (matches the locator file). */
	layoutReadSupportRoot?: string;
	/** ISO timestamp at which completion was published. */
	at: string;
};

/**
 * Issue #129: cross-surface diagnostic log replay (request/response).
 *
 * Carried on `SHELL_CHANNELS.debug`. Live log entries flow as
 * `kind: "publish"` envelopes (see `LogWirePayload` below). When a
 * Debug Console opens *after* boot, it must ask surfaces for a snapshot
 * of their LogBus ring buffer to see entries that already happened —
 * the CEP event bus does not retain history.
 *
 * Request shape (`kind: "request"`, `targetSurfaceId` optional — omit
 * to broadcast to all surfaces; the panel processes only requests
 * addressed to it OR broadcast requests):
 */
type DebugLogReplayRequest = {
	kind: "replay-request";
	/** Identifier the requester puts in `correlationId` so it can pair the response. */
	requestId: string;
	/** ISO timestamp of the requester's session start; respondents may filter older entries out. */
	since?: string;
	/** Optional upper bound on entries the requester is willing to receive. */
	maxEntries?: number;
};

/**
 * Response to a `DebugLogReplayRequest`. Sent via
 * `kind: "response"` with `targetSurfaceId` set to the requester's
 * surfaceId and `correlationId` echoed from the request.
 *
 * `entries` is the requester's view of the respondent's LogBus
 * snapshot, already converted to wire-payload form (JSON-safe). The
 * respondent is responsible for any sanitization; the size cap and
 * field caps are enforced at conversion time.
 */
type DebugLogReplayResponse = {
	kind: "replay-response";
	requestId: string;
	/** Surface that produced this snapshot. */
	sourceSurfaceId: string;
	entries: ReadonlyArray<{
		readonly v: 1;
		readonly id: string;
		readonly level: string;
		readonly text: string;
		readonly timestamp: string;
		readonly source?: string;
	}>;
	/** ISO timestamp the snapshot was taken; the requester dedupes against live events by `id`. */
	takenAt: string;
};

/**
 * Live log entry broadcast on `SHELL_CHANNELS.debug` (`kind: "publish"`).
 * Same shape as the legacy `WirePayload` (debug-console contract); the
 * canonical type lives in `management/debug/console/types.ts` but is
 * duplicated here so the surface contract is self-describing.
 */
type DebugLogWirePayload = {
	readonly v: 1;
	readonly id: string;
	readonly level: string;
	readonly text: string;
	readonly timestamp: string;
	readonly source?: string;
};

/** Union of all payloads carried on `SHELL_CHANNELS.debug`. */
type DebugChannelPayload =
	| DebugLogWirePayload
	| DebugLogReplayRequest
	| DebugLogReplayResponse;
