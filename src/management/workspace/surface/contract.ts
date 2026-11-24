/**
 * Workspace UI / host surface types shared by management and widget scripts.
 * Keeps `function/widget` free of imports from `management/workspace/core/state`.
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
	/**
	 * In-app updater relay (Issue #243): the settings dialog cannot reach the
	 * operation worker — only panel surfaces boot the worker composition — so
	 * install requests are relayed panel-ward over this channel. Requests are
	 * non-idempotent and always carry an explicit `targetSurfaceId` (the
	 * opener panel); exactly one panel executes them.
	 */
	updates: "com.typlus.workspace.updates",
} as const;

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
			/**
			 * When true, `overrides` is the complete persisted override set:
			 * receivers replace their cache instead of merging, so keys the
			 * sender removed (e.g. ui.* values reset to defaults) disappear
			 * everywhere (Issue #94).
			 */
			replace?: boolean;
	  }
	| {
			/**
			 * Settings persistence outcome notice (#96). Published by whichever
			 * surface's SettingsProvider saw the write settle, so a failure that
			 * lands after the settings dialog closed is still surfaced on the
			 * persistent workspace panel instead of being hidden.
			 */
			kind: "saveNotice";
			sourceSurfaceId: string;
			at: string;
			ok: boolean;
			message?: string;
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
 * Issue #243: update.install relay payloads on `SHELL_CHANNELS.updates`.
 *
 * `install-request` is sent by a non-panel surface (settings dialog) to the
 * panel named by the envelope's `targetSurfaceId`. `install-result` is the
 * panel's reply, addressed back to the requester's `sourceSurfaceId` and
 * correlated by `requestId`.
 */
export type UpdateInstallWireRequest = Readonly<{
	release_version: string;
	tag: string;
	asset: Readonly<{
		url: string;
		file_name: string;
		sha256: string;
	}>;
}>;

export type UpdateInstallWirePayload =
	| {
			kind: "install-request";
			requestId: string;
			sourceSurfaceId: string;
			request: UpdateInstallWireRequest;
	  }
	| {
			kind: "install-result";
			requestId: string;
			sourceSurfaceId: string;
			/** Panel surface that executed the install. */
			executorSurfaceId: string;
			ok: boolean;
			/** Worker result on success (`installed`/`pending`/`manual_required`). */
			status?: "installed" | "pending" | "manual_required";
			version?: string;
			restart_required?: boolean;
			reason?: string | null;
			/** Stable worker error code on failure (e.g. `integrity_mismatch`). */
			errorCode?: string;
	  };
