/**
 * useWorkspaceRuntime hook
 * Thin composition of F1-F8 modules + essential state wiring.
 * Responsibility logic stays inline only where extraction would require
 * refactoring consumer contracts (persistence orchestration, bus subscriptions,
 * control panel drag, workspace event wiring).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { WidgetType } from "@/function/widget";
import { isWidgetType } from "@/function/widget/contract";
import { useCep } from "@/management/ae/cep/contexts/Context";
import { tyPlusExtensionId } from "@/management/ae/cep/extension-id";
import { createCepHostExecutor } from "@/management/ae/cep/host-executor";
import { detectCepHostCode } from "@/management/ae/cep/runtime";
import {
	createCepSurfaceTransport,
	openCepDialogSurface,
} from "@/management/ae/cep/transport";
import { importFile } from "@/management/ae/file-import";
import { readGroupJson } from "@/management/catalog/json-files";
import {
	clearLogs,
	createLogger,
	enableCepBroadcast,
	enableInterceptor,
	initializeLogRetention,
} from "@/management/debug";
import { DebugConsole } from "@/management/debug/console/ui";
import type { ToolDialogKind } from "@/management/dialog/ids";
import {
	attachUnifiedWorkspaceContextMenu,
	CEP_CONTEXT_HEADER_ID_PREFIX,
	type ContextHit,
	CTX_MENU_IDS,
	updateAlignTargetCache,
} from "@/management/dialog/unified-context-menu";
import { i18n } from "@/management/i18n/index";
import { notificationStore } from "@/management/online/notification/service";
import {
	CP_POSITION_LAYOUT_CLASS_NAMES,
	type CpOrientation,
	type CpPersistedState,
	type CpPosition,
	cpPositionToClasses,
	initCpStateCache,
	readCpState,
	writeCpState,
} from "@/management/panel/control/state";
import { loadPanelChromeControlPanel } from "@/management/panel/persistence/chrome-store";
import { isPresetAssetMissing } from "@/management/preset/asset-health";
import type { Preset } from "@/management/preset/contract";
import { askHostDeleteConfirm } from "@/management/preset/delete-confirm";
import type { PresetDialogRequest } from "@/management/preset/dialog-request";
import {
	dispatchGroupWorkspaceRequest,
	GROUP_WORKSPACE_EVENT,
	type GroupWorkspaceRequest,
} from "@/management/preset/group/events";
import {
	releaseDropPlacementFromState,
	releaseGroupPreset,
} from "@/management/preset/group/group-release";
import {
	parseGroupFromText,
	removeGroupEntry,
	removePresetFromGroupEntry,
	upsertGroupEntry,
} from "@/management/preset/group-catalog";
import { writePresetToolHandoff } from "@/management/preset/tool-handoff-file";
import { PRESET_TOOL_OPEN_BUS_CHANNEL } from "@/management/preset/tool-open-channel";
import {
	duplicatePreset,
	getPreset,
	listPresets,
	removeLocalPreset,
} from "@/management/preset/use-cases";
import {
	PRESET_HOVER_EVENT,
	type WorkspacePresetHoverDetail,
} from "@/management/preset/workspace/GridCatalogTile";
import { ensureUiSettingsFile } from "@/management/setting/persistence/workspace-ui-settings-file";
import { reconcileSettingsThemeOverrides } from "@/management/setting/theme-reconcile";
import {
	clearLayoutNJson,
	clearWorkspacePanelStateFromSettingsJson,
	indexFromPanelId,
	mergeGroupPresetLayoutIntoSettingsJson,
	readBackgroundJson,
	readNJson,
	readPanelPresetIdsFromSettingsJson,
	readSettings,
	readUiSettings,
	readWidgetRecords,
	saveControlPanelState,
	writeNJson,
	writeSettings,
} from "@/management/storage";
import { startCandidatesPreload } from "@/management/storage/candidates-cache/runtime";
import {
	canUseCepNodeFileBrowser,
	createCepNodeFileBrowserService,
} from "@/management/storage/file-browser-service";
import {
	PersistenceLockTimeoutError,
	PersistenceLockUnavailableError,
	resolvePersistenceLockRoot,
	withPersistenceLock,
} from "@/management/storage/lock/persistence-lock";
import { openWidgetAddDialogSurface } from "@/management/widget/open-add-dialog";
import { registry } from "@/management/widget/registry";
import { dispatchWorkspaceWsActionClick } from "@/management/workspace/events/dispatch-ws-action-click";
import { setupInteractionEvents } from "@/management/workspace/events/handler";
import { gridSettingsFromSettingsJson } from "@/management/workspace/grid-settings";
import {
	resolveDuplicateHit,
	runDuplicatePreset,
} from "@/management/workspace/hook-duplicate-preset";
import {
	openPresetEditSurface as openPresetEditSurfaceImpl,
	openPresetToolSurface as openPresetToolSurfaceImpl,
	setupExternalPresetDialogListener,
} from "@/management/workspace/hooks/preset";
import { packTopLeft } from "@/management/workspace/layout/engine";
import {
	type PersistedLayoutDocument,
	parseLayoutDocumentJsonText,
} from "@/management/workspace/layout/grid-document";
import { resolveWorkspacePersistenceManagedRoot } from "@/management/workspace/layout/persistence-root";
import {
	isLayoutRestoreBlocked,
	type LayoutRestoreNotice,
	type LayoutRestorePlan,
	planLayoutRestoreFromReadError,
	planLayoutRestoreFromText,
} from "@/management/workspace/layout/restore-plan";
import { startWorkspaceLayoutJsonExternalChangeWatch } from "@/management/workspace/layout/sync-watch";
import { publishShellMessage } from "@/management/workspace/messaging/publish-shell-message";
import { subscribeWorkspaceGridLive } from "@/management/workspace/messaging/subscribe-grid-live";
import { subscribeSettingsSaveNotices } from "@/management/workspace/messaging/subscribe-settings-save-notice";
import { subscribeThemeLive } from "@/management/workspace/messaging/subscribe-theme-live";
import { logWorkspace } from "@/management/workspace/onboarding/flow-log";
import {
	type LayoutReloadPayload,
	setLayoutReloadHandler,
} from "@/management/workspace/onboarding/layout-reload-bridge";
import { mergeOwnerLayoutWithDisk } from "@/management/workspace/persistence/external-layout-merge";
import {
	type PersistSurfaceStage,
	SurfaceWriteError,
	writeSurfaceState,
} from "@/management/workspace/persistence/surface-write";
import {
	adoptLayoutRestore,
	createWorkspaceWriteGate,
} from "@/management/workspace/persistence/write-gate";
import { applyInterPanelMove } from "@/management/workspace/placement/inter-panel-move";
import { notifyPanelsAfterPresetSave } from "@/management/workspace/placement/notify-panels-after-preset-save";
import { mergePresetPlacementIntoState as mergePresetPlacementBusPayloadIntoState } from "@/management/workspace/placement/preset-bus";
import {
	catalogRefsForSurfaceIds,
	tileIdResolvesAsWidget,
} from "@/management/workspace/placement/resolve";
import { mergeWidgetPlacementIntoState } from "@/management/workspace/placement/widget-bus";
import { CommitReconcile } from "@/management/workspace/reconcile-stub";
import { executeWorkspacePresetForWindow } from "@/management/workspace/runtime";
import type { SurfaceState } from "@/management/workspace/state";
import {
	createInitialSurfaceState,
	type stripObsoleteLayouts,
	withPresetInfoSnapshot,
} from "@/management/workspace/state";
import { normalizeState } from "@/management/workspace/state/normalize";
import {
	type BackgroundPayload,
	type LayoutPayload,
	type PresetsPayload,
	SHELL_CHANNELS,
} from "@/management/workspace/surface/contract";
import { logWorkspaceGrid } from "@/management/workspace/surface/grid-log";
import {
	clipSelection,
	layoutsFromSurface,
	serialize,
	type Tile,
	tilesFromDocument,
	widgetResolutionFromCatalogContext,
} from "@/management/workspace/surface/tiles";
import {
	createHistoryManager,
	type Snapshot,
} from "@/management/workspace/undo/history";
import { initLayoutUndoCache } from "@/management/workspace/undo/layout-undo-cache";
import { cx } from "@/shared/util/cx";
import { isIMEComposing } from "@/shared/util/keyboard";
import { css } from "@/styled-system/css";
import {
	openDialogProbe,
	requestOpenBackgroundPanel,
	requestOpenWorkspaceShellTool,
} from "./hooks/dialogs";
import { openDebugConsole, openUrlInDefaultBrowser } from "./hooks/helpers";
import {
	ensurePrimaryPanelWidgets,
	remapSurfaceSelectionByPreservedTileIds,
	type WorkspaceUi,
} from "./hooks/state";
import { applyWidgets as applyWidgetsFromModule } from "./hooks/widget-mgmt";

/**
 * PandaCSS recipes for the floating Control Panel context menu. Production
 * bundles are Panda-only; the previous Tailwind utility literals produced
 * zero CSS at runtime and the menu rendered unstyled.
 */
const cpMenuWrap = css({
	position: "fixed",
	zIndex: 200,
	minWidth: "45",
	maxHeight: "105",
	overflowY: "auto",
	paddingBlock: "1",
	paddingInline: "0",
	listStyle: "none",
	margin: "0",
	backgroundColor: "var(--bg-surface)",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "var(--border-default)",
	borderRadius: "shell-sm",
	boxShadow: "control-panel",
});

const cpMenuSeparator = css({
	height: "var(--ty-shell-border-width)",
	marginBlock: "1",
	marginInline: "2",
	padding: "0",
	borderStyle: "none",
	backgroundColor: "var(--border-default)",
	pointerEvents: "none",
});

const cpMenuHeading = css({
	paddingInline: "3",
	paddingBlock: "1",
	fontSize: "var(--ty-shell-text-size-sm)",
	fontWeight: "bold",
	textTransform: "uppercase",
	letterSpacing: "0.05em",
	color: "var(--text-muted)",
	pointerEvents: "none",
});

const cpMenuButton = css({
	display: "block",
	width: "100%",
	paddingInline: "3",
	paddingBlock: "1.5",
	borderStyle: "none",
	backgroundColor: "transparent",
	fontSize: "var(--ty-shell-text-size-sm)",
	color: "var(--text-main)",
	textAlign: "left",
	cursor: "pointer",
	font: "inherit",
	_hover: {
		backgroundColor: "rgba(var(--text-r),var(--text-g),var(--text-b),0.08)",
	},
});

const persistenceRootAsOptional = (root: string | null): string | undefined =>
	root ?? undefined;

const buildMergedTiles = (
	hasPersistedGeometryRows: boolean,
	migrated: Tile[],
	baseState: SurfaceState,
	recordById: Map<string, { id: string }>,
): Tile[] =>
	hasPersistedGeometryRows
		? migrated
		: [
				...baseState.surfaceTiles.filter(
					(t) => t && tileIdResolvesAsWidget(baseState, t.id),
				),
				...migrated.filter((t) => !recordById.has(t.id)),
			];

const presetExecutionLog = createLogger("preset-execution");
const workspaceLog = createLogger("workspace");

// `PersistSurfaceStage` (which write `persistSurfaceState` was in flight when
// it failed) now lives next to the sequence it describes — see
// `persistence/surface-write.ts`.

const logPresetError = (presetId: string, error: unknown) => {
	presetExecutionLog.error("[ty-plus:preset-execute] failure", {
		context: {
			presetId,
			message: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined,
		},
	});
};

// Issue #130: workspace tile execute dispatch. The single canonical
// pipeline (`executeWorkspacePresetForWindow`) is shared by the
// workspace tile, Directory Browser, Catalog Browser, Edit Dialog, and
// (after the Quick Bar wiring) the Quick Actions palette. Tag the
// workspace tile dispatcher explicitly so the trace log lines stay
// attributable to the surface that initiated the run.
const WORKSPACE_TILE_ENTRY_POINT: import("@/management/preset/execution/lifecycle-trace").PresetExecuteEntryPoint =
	"workspace-tile";

export function useWorkspaceRuntime(root: Element | null): {
	state: SurfaceState | null;
	ui: WorkspaceUi;
	addWidgetPickerOpen: boolean;
	closeAddWidgetPicker: () => void;
	executeWorkspacePreset: (presetId: string) => Promise<void>;
	executePreset: (preset: Preset) => Promise<void>;
	hostCaller: ReturnType<typeof createCepHostExecutor> | null;
	retryLayoutRestore: () => void;
} {
	const [state, setState] = useState<SurfaceState | null>(null);
	const [ui, setUi] = useState<Omit<WorkspaceUi, "layoutRestore">>({
		canUndo: false,
		canRedo: false,
		snapshots: [],
	});
	// Kept out of `ui` so the many `setUi({ canUndo, canRedo, snapshots })`
	// calls below cannot clear a restore failure that is still unresolved.
	const [layoutRestore, setLayoutRestore] =
		useState<LayoutRestoreNotice | null>(null);
	// `reloadLayoutFromStorage` lives inside the mount-once effect; this ref
	// lets the restore banner re-run it without tearing the panel down.
	const reloadLayoutRef = useRef<(() => void) | null>(null);
	const [addWidgetPickerOpen, setAddWidgetPickerOpen] = useState(false);
	const stateRef = useRef<SurfaceState | null>(null);
	// Mirror of `ui.snapshots` so the mount-once `useEffect` below can read
	// the current value when building the context menu (the original `ui`
	// closure never re-runs and stays at its initial empty value).
	const snapshotsRef = useRef<Snapshot[]>([]);
	useEffect(() => {
		snapshotsRef.current = ui.snapshots;
	}, [ui.snapshots]);
	const { panelSurfaceId } = useCep();

	const commit = (next: SurfaceState): void => {
		const prev = stateRef.current;
		const reconciled = prev === null ? next : CommitReconcile(prev, next);
		stateRef.current = reconciled;
		setState(reconciled);
	};
	const getState = (): SurfaceState => {
		if (!stateRef.current) {
			throw new Error("Workspace state not initialized");
		}
		return stateRef.current;
	};

	const executePreset = useCallback(async (preset: Preset): Promise<void> => {
		presetExecutionLog.info("[ty-plus:preset-execute] record-request", {
			context: {
				presetId: preset.id,
				type: preset.type,
				filePath: preset.filePath,
				entryPoint: WORKSPACE_TILE_ENTRY_POINT,
			},
		});
		try {
			const record = await executeWorkspacePresetForWindow(
				window,
				detectCepHostCode(),
				preset,
			);
			presetExecutionLog.info("[ty-plus:preset-execute] record-success", {
				context: {
					presetId: preset.id,
					action: record.action,
					entryPoint: WORKSPACE_TILE_ENTRY_POINT,
				},
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			const stack = error instanceof Error ? error.stack : undefined;
			presetExecutionLog.error(
				`[ty-plus:preset-execute] record-failure-message presetId=${preset.id} type=${preset.type} filePath=${preset.filePath} message=${message}`,
				{
					context: {
						presetId: preset.id,
						message,
						entryPoint: WORKSPACE_TILE_ENTRY_POINT,
					},
				},
			);
			if (stack) {
				presetExecutionLog.error(
					`[ty-plus:preset-execute] record-failure-stack presetId=${preset.id}`,
					{
						context: {
							presetId: preset.id,
							stack,
							entryPoint: WORKSPACE_TILE_ENTRY_POINT,
						},
					},
				);
			}
			presetExecutionLog.error("[ty-plus:preset-execute] record-failure", {
				context: {
					presetId: preset.id,
					type: preset.type,
					filePath: preset.filePath,
					message,
					stack,
					entryPoint: WORKSPACE_TILE_ENTRY_POINT,
				},
			});
			throw error;
		}
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: stable helpers captured via refs
	const executeWorkspacePreset = useCallback(
		async (presetId: string): Promise<void> => {
			presetExecutionLog.info("[ty-plus:preset-execute] request", {
				context: { presetId },
			});
			const preset = await getPreset(presetId);
			if (!preset) {
				const error = new Error(`Preset not found: ${presetId}`);
				logPresetError(presetId, error);
				throw error;
			}
			try {
				await executePreset(preset);
				presetExecutionLog.info("[ty-plus:preset-execute] success", {
					context: { presetId },
				});
			} catch (error) {
				logPresetError(presetId, error);
				throw error;
			}
		},
		[],
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: This runtime effect intentionally captures stable helpers via refs and mounts once per root.
	useEffect(() => {
		if (!root) {
			logWorkspaceGrid("runtime:skip-init", {
				reason:
					"root is null (PanelMain outer ref not attached); workspace state stays null until ref attaches",
			});
			return;
		}

		enableInterceptor();

		const isCep =
			typeof (window as unknown as { __adobe_cep__?: unknown })
				.__adobe_cep__ !== "undefined" ||
			typeof (window as unknown as { CSInterface?: unknown }).CSInterface !==
				"undefined";
		if (isCep) {
			document.documentElement.classList.add("ty-plus-cep-shell");
			enableCepBroadcast(window);
			if (process.env.NODE_ENV !== "production") {
				void initializeLogRetention(window).catch(() => {});
			}
		}

		const isLive =
			typeof (window as unknown as { __TY_PLUS_LIVE_SERVER_ORIGIN__?: unknown })
				.__TY_PLUS_LIVE_SERVER_ORIGIN__ === "string" &&
			(
				window as unknown as { __TY_PLUS_LIVE_SERVER_ORIGIN__?: string }
			).__TY_PLUS_LIVE_SERVER_ORIGIN__?.startsWith("http");

		const hostCode = detectCepHostCode();
		const hostName = "After Effects";
		const gridOverride =
			(window as unknown as { __TY_PLUS_WORKSPACE_GRID__?: unknown })
				.__TY_PLUS_WORKSPACE_GRID__ ?? {};
		const panelId = panelSurfaceId;

		const cepSurfaceTransport = createCepSurfaceTransport(window);
		const unsubscribeThemeLive = subscribeThemeLive(
			cepSurfaceTransport,
			panelId,
		);
		// Settings write failures broadcast `saveNotice` so a failure landing
		// after the settings dialog closed still surfaces on the primary
		// panel (Issue #96).
		const unsubscribeSaveNotices = subscribeSettingsSaveNotices(
			cepSurfaceTransport,
			panelId,
		);
		// Settings → グリッド edits broadcast grid metrics as themeLive
		// tokens; keep state.grid in step so tile geometry follows the
		// setting on every panel (Issue #95). `liveGridRevision` lets the
		// async boot restore detect a live commit that landed while its
		// reads were in flight and skip overwriting it with the older
		// on-disk snapshot.
		let liveGridRevision = 0;
		const unsubscribeGridLive = subscribeWorkspaceGridLive(
			cepSurfaceTransport,
			panelId,
			(grid) => {
				liveGridRevision += 1;
				const cur = getState();
				if (
					cur.grid.cellSize === grid.cellSize &&
					cur.grid.gap === grid.gap &&
					cur.grid.radius === grid.radius
				) {
					return;
				}
				commit({ ...cur, grid });
			},
		);

		let nextState: SurfaceState = createInitialSurfaceState({
			grid: gridOverride as Record<string, unknown>,
			panelId,
			hostCode,
			hostName,
			mode: isLive ? "live" : "static",
		});
		nextState = ensurePrimaryPanelWidgets(nextState);
		commit(nextState);
		logWorkspaceGrid("runtime:initial-surface", {
			panelId: nextState.panelId,
			surfaceTileCount: nextState.surfaceTiles.length,
			hostCode: nextState.hostCode,
		});

		// Load control panel chrome from `panels/panel-N.json` (and legacy fallbacks for panel-1)
		void loadPanelChromeControlPanel(window, panelId)
			.then((cpState) => {
				if (cpState) {
					initCpStateCache(cpState, panelId);
					window.dispatchEvent(
						new CustomEvent("ty-plus-cp-state-change", {
							detail: { state: cpState, panelId },
						}),
					);
				}
			})
			.catch(() => {
				/* ignore - control panel will use defaults */
			});

		const hostExecutorForAlign =
			hostCode === "AEFT"
				? createCepHostExecutor(window, "after-effects")
				: null;
		const fileBrowserService = canUseCepNodeFileBrowser(window)
			? createCepNodeFileBrowserService({ win: window })
			: null;

		// ── File import (extracted to host-exec.ts) ────────────────────────────────

		// ── History (F1) ────────────────────────────────────────────────────────
		// Bug 6: clear the session-scoped layout-undo cache at AE startup so
		// any state from a prior AE session is dropped. Within a single
		// session the cache survives panel reloads (F5 / close-reopen).
		void initLayoutUndoCache(window, panelId);

		const history = createHistoryManager(panelId, window);
		// Snapshot list refresh shared by every mutation path. A rejected
		// `listSnapshots` (unreadable snapshots.json, lock/IO failure) must
		// not die as an unhandled rejection with the UI silently stuck on a
		// stale list — log it so the debug console shows the cause (Issue
		// #223: UC-B05/UC-J03 snapshot rows never rendered).
		const refreshSnapshotUi = (): void => {
			void history
				.listSnapshots()
				.then((snaps) => {
					setUi({
						canUndo: history.canUndo(),
						canRedo: history.canRedo(),
						snapshots: snaps,
					});
				})
				.catch((error: unknown) => {
					workspaceLog.error("snapshot list refresh failed", {
						action: "workspace:snapshots-refresh",
						context: {
							message: error instanceof Error ? error.message : String(error),
						},
					});
				});
		};
		const logSnapshotOpError =
			(op: string) =>
			(error: unknown): void => {
				workspaceLog.error(`snapshot ${op} failed`, {
					action: `workspace:snapshot-${op}`,
					context: {
						message: error instanceof Error ? error.message : String(error),
					},
				});
			};
		void history.init().then(() => {
			history.push(
				layoutsFromSurface(
					getState().surfaceTiles,
					widgetResolutionFromCatalogContext(getState()),
				),
			);
			refreshSnapshotUi();
		});

		// ── Persistence (F2) ────────────────────────────────────────────────────
		let lastSavedSurfaceState = "";
		// ADR-0006 §4: tile ids this panel actually has on disk — seeded from
		// the layout document at restore and advanced by `onLayoutCommitted`
		// after every successful `workspace-N.json` write. It is what lets the
		// in-lock merge tell "the user deleted this tile" (absent from state,
		// still on disk → dropped) apart from "an external writer removed it"
		// (was persisted, now absent on disk → removed from state too) and
		// "an external writer added it" (on disk, unknown to both → adopted).
		let lastPersistedTileIds = new Set<string>();
		// Writes stay closed until a layout restore classifies the on-disk
		// `workspace-N.json` as readable. A failed read must never become an
		// empty layout that the first user edit then persists (Issue #204).
		const writeGate = createWorkspaceWriteGate();
		let workspacePersistChain = Promise.resolve();
		let lastPersistenceManagedRoot: string | null = null;
		let suppressLocalWorkspaceJsonWriteUntil = 0;
		let layoutSyncWatchDisposer: (() => void) | null = null;
		let lastLayoutSyncWatchKey = "";

		const serializePersistedSurfaceStateForChangeDetection = (
			cur: SurfaceState,
		): string =>
			JSON.stringify({
				panelId: cur.panelId,
				grid: cur.grid,
				surfaceTiles: cur.surfaceTiles,
				selectedSurfaceIndices: [...cur.selectedSurfaceIndices],
				layoutLocked: cur.layoutLocked,
				presetFocusId: cur.presetFocusId,
				presetSelectedIds: [...cur.presetSelectedIds],
				presetHoverId: cur.presetHoverId,
				panelPresetIds: [...cur.panelPresetIds],
				showGridOverlay: cur.showGridOverlay,
				showPresetLabels: cur.showPresetLabels,
				bg: cur.bg,
			});

		/**
		 * ADR-0006 §4: the read→merge→write body shared by both persist
		 * variants. MUST be invoked inside `withPersistenceLock` — every disk
		 * read that feeds the write happens inside the hold, so no sibling
		 * CEP process can interleave between our layout read and our writes.
		 *
		 * Instead of blindly serializing state, the on-disk `gridCells` are
		 * merged against `lastPersistedTileIds` and the live state
		 * (`mergeOwnerLayoutWithDisk`): external additions are adopted into
		 * both the write and the in-memory state, external removals drop the
		 * tile from state as well, and the owner's own tiles stay
		 * authoritative. A corrupt/unreadable layout file fails the persist
		 * rather than being overwritten with an empty grid.
		 */
		const persistLatestSurfaceStateLocked = async (
			persistenceRootArg: string | undefined,
			backgroundFatal: boolean,
		): Promise<void> => {
			const wsIndex = indexFromPanelId(getState().panelId);
			const rawDisk = await readNJson(window, wsIndex);
			let diskCells: PersistedLayoutDocument["gridCells"] = [];
			if (rawDisk != null && rawDisk.trim() !== "") {
				try {
					diskCells = parseLayoutDocumentJsonText(rawDisk).gridCells;
				} catch (error) {
					throw new SurfaceWriteError("read-layout", error);
				}
			}
			const latest = getState();
			const merge = mergeOwnerLayoutWithDisk({
				diskCells,
				lastPersistedIds: lastPersistedTileIds,
				stateTiles: latest.surfaceTiles,
			});

			// Adopted widget tiles need a type before the next reload resolves
			// them from `widgets.json`. The records read is best-effort: an
			// unreadable records file must not fail a persist whose layout
			// write is still safe (records are untouched by the merge).
			const adoptedIds = new Set(merge.adoptedTiles.map((t) => t.id));
			const adoptedWidgetTypes: Record<string, WidgetType> = {};
			if (adoptedIds.size > 0) {
				try {
					for (const record of await readWidgetRecords(window)) {
						const id = String(record.id ?? "").trim();
						if (adoptedIds.has(id) && isWidgetType(String(record.type))) {
							adoptedWidgetTypes[id] = record.type as WidgetType;
						}
					}
				} catch {
					// best-effort classification only
				}
			}

			const mergedResolutionState: SurfaceState = {
				...latest,
				surfaceTiles: merge.tilesToWrite,
				widgetInstanceTypes: {
					...latest.widgetInstanceTypes,
					...adoptedWidgetTypes,
				},
			};
			const widgetLayouts = layoutsFromSurface(
				merge.tilesToWrite,
				widgetResolutionFromCatalogContext(mergedResolutionState),
			);

			await writeSurfaceState({
				win: window,
				panelId: latest.panelId,
				wsIndex,
				widgetRecords: widgetLayouts.map((w) => ({
					id: w.id,
					type: w.widgetType as WidgetType,
					param: {} as Record<string, unknown>,
				})),
				layoutJsonText: serialize(merge.tilesToWrite),
				uiSettings: {
					version: 1 as const,
					showGridOverlay: latest.showGridOverlay,
					showPresetLabels: latest.showPresetLabels,
					selectedFont: "",
				},
				persistenceRootArg,
				backgroundJsonText:
					latest.bg != null ? `${JSON.stringify(latest.bg, null, 2)}\n` : null,
				backgroundFatal,
				onLayoutCommitted: () => {
					// The layout file is durable NOW — advance the baseline
					// before the remaining stages so a later failure cannot
					// make a compensating persist misclassify these ids as
					// external removals (ADR-0006 §4).
					lastPersistedTileIds = new Set(merge.nextLastPersistedIds);
					if (
						merge.adoptedTiles.length === 0 &&
						merge.removedTileIds.length === 0
					) {
						return;
					}
					const cur2 = getState();
					const removedSet = new Set(merge.removedTileIds);
					const prevTiles = cur2.surfaceTiles;
					const prevIds = new Set(prevTiles.map((t) => t.id));
					const nextTiles = [
						...prevTiles.filter((t) => !removedSet.has(t.id)),
						...merge.adoptedTiles.filter((t) => !prevIds.has(t.id)),
					];
					commit({
						...cur2,
						surfaceTiles: nextTiles,
						selectedSurfaceIndices: remapSurfaceSelectionByPreservedTileIds(
							prevTiles,
							nextTiles,
							cur2.selectedSurfaceIndices,
						),
						widgetInstanceTypes: {
							...cur2.widgetInstanceTypes,
							...adoptedWidgetTypes,
						},
					});
				},
			});
		};

		/**
		 * Persist the current surface after a user edit.
		 *
		 * The gate is the FIRST statement, before change-detection and before
		 * the baseline update: a layout restore that could not read
		 * `workspace-N.json` must leave both untouched, or the next edit would
		 * either be skipped as "already saved" or write the panel's current
		 * (unrestored) view over the file (Issue #182 / #204). The write
		 * sequence below is deliberately left in place — source-level contracts
		 * such as `hook-persist-fire-and-forget.test.ts` (Issue #183) read this
		 * function's braces, and the guard above is what makes every write in
		 * them unreachable while the gate is closed.
		 */
		const persistSurfaceState = (): void => {
			if (!writeGate.isReady()) {
				return;
			}
			const cur = getState();
			const nextSerialized =
				serializePersistedSurfaceStateForChangeDetection(cur);
			if (nextSerialized === lastSavedSurfaceState) {
				return;
			}
			lastSavedSurfaceState = nextSerialized;
			try {
				workspacePersistChain = workspacePersistChain
					.catch(() => {})
					.then(async () => {
						// Re-validate the captured persistence root before every
						// write. A sibling extension could overwrite the locator
						// file after the first capture; refuse to write into a
						// root that no longer matches the locator.
						const revalidatedRoot =
							await resolveWorkspacePersistenceManagedRoot(window);
						if (
							revalidatedRoot !== null &&
							lastPersistenceManagedRoot !== null &&
							revalidatedRoot.toLowerCase() !==
								lastPersistenceManagedRoot.toLowerCase()
						) {
							logWorkspace("runtime:stale-persist-root-refusing-write", {
								previousRoot: lastPersistenceManagedRoot,
								revalidatedRoot,
							});
							return;
						}
						const persistenceRootArg = lastPersistenceManagedRoot ?? undefined;
						// ADR-0006: the lock keys on the root `writeJson` actually
						// resolves — it can differ from the workspace persistence
						// root, so it MUST be resolved separately.
						const lockRoot = await resolvePersistenceLockRoot(window);
						if (!lockRoot) {
							if (lastSavedSurfaceState === nextSerialized) {
								lastSavedSurfaceState = "";
							}
							logWorkspace("runtime:persist-lock-root-unavailable", {
								panelId: cur.panelId,
							});
							return;
						}
						try {
							suppressLocalWorkspaceJsonWriteUntil = Date.now() + 900;
							await withPersistenceLock(window, lockRoot, () =>
								persistLatestSurfaceStateLocked(persistenceRootArg, false),
							);
						} catch (error) {
							// A failure must be retried, not remembered as saved, and it
							// must reach the Debug Console — the previous bare `catch`
							// satisfied neither.
							if (lastSavedSurfaceState === nextSerialized) {
								lastSavedSurfaceState = "";
							}
							const stage: PersistSurfaceStage =
								error instanceof SurfaceWriteError
									? error.stage
									: error instanceof PersistenceLockTimeoutError ||
											error instanceof PersistenceLockUnavailableError
										? "acquire-lock"
										: "write-widget-records";
							workspaceLog.error("surface state was not persisted", {
								action: "persistSurfaceState:failed",
								context: {
									panelId: cur.panelId,
									stage,
									message:
										error instanceof Error ? error.message : String(error),
								},
							});
						}
					});
			} catch (error) {
				workspaceLog.error("surface persist chain could not be scheduled", {
					action: "persistSurfaceState:schedule-failed",
					context: {
						message: error instanceof Error ? error.message : String(error),
					},
				});
			}
		};

		/**
		 * Awaitable variant of `persistSurfaceState`. Returns a Promise that
		 * resolves once the persisted workspace JSON files are flushed to
		 * disk, or REJECTS when the write cannot actually commit (the
		 * persistence root is missing or stale, the workspace persistence
		 * module is not ready, etc.). Used by the cross-panel-move
		 * atomicity chain (Issue #146 / Blocker 7) so a failure during
		 * step (4) can roll back the target layout AND the source
		 * settings.json. Issue #146 / Blocker 8: this function now
		 * REJECTS when a no-write decision is made (stale root, persistence
		 * disabled, no managed root available), instead of silently
		 * resolving — the round-3 chain treated silent-resolve as "move
		 * committed", which silently dropped source tiles when step (4)
		 * never actually wrote.
		 *
		 * The state snapshot is captured at call time so callers can
		 * mutate `getState()` (e.g. via `commit(nextState)`) immediately
		 * before awaiting and have the changes picked up by the writes.
		 * The internal `workspacePersistChain` is kept silent (existing
		 * fire-and-forget semantics for unrelated callers); this returns
		 * a separate Promise that observers can await and react to.
		 */
		const persistSurfaceStateAwaitable = async (): Promise<void> => {
			if (!writeGate.isReady()) {
				throw new Error(
					"persistSurfaceStateAwaitable: workspace persistence is not ready (persistence disabled)",
				);
			}
			const cur = getState();
			const nextSerialized =
				serializePersistedSurfaceStateForChangeDetection(cur);
			if (nextSerialized === lastSavedSurfaceState) {
				return;
			}
			lastSavedSurfaceState = nextSerialized;
			const persistenceRootArg = lastPersistenceManagedRoot ?? undefined;
			if (!persistenceRootArg) {
				lastSavedSurfaceState = "";
				throw new Error(
					"persistSurfaceStateAwaitable: no managed persistence root available for source layout persistence",
				);
			}
			suppressLocalWorkspaceJsonWriteUntil = Date.now() + 900;
			const revalidatedRoot =
				await resolveWorkspacePersistenceManagedRoot(window);
			if (
				revalidatedRoot !== null &&
				revalidatedRoot.toLowerCase() !== persistenceRootArg.toLowerCase()
			) {
				lastSavedSurfaceState = "";
				logWorkspace("runtime:stale-persist-root-refusing-write", {
					previousRoot: persistenceRootArg,
					revalidatedRoot,
				});
				throw new Error(
					`persistSurfaceStateAwaitable: persistence root has changed since last commit (previous=${persistenceRootArg}, current=${revalidatedRoot ?? "null"}); refusing to write under a stale root`,
				);
			}
			// ADR-0006: same locked read→merge→write as the fire-and-forget
			// variant. When called from `applyInterPanelMove` this JOINS the
			// move's outer lock hold via AsyncLocalStorage instead of
			// deadlocking on it.
			const lockRoot = await resolvePersistenceLockRoot(window);
			if (!lockRoot) {
				lastSavedSurfaceState = "";
				throw new Error(
					"persistSurfaceStateAwaitable: no managed persistence root available for the persistence lock",
				);
			}
			try {
				await withPersistenceLock(window, lockRoot, () =>
					persistLatestSurfaceStateLocked(persistenceRootArg, true),
				);
			} catch (error) {
				// Never leave the baseline claiming a write that did not
				// commit — the next persist must retry, and the move chain
				// needs the rejection to evaluate its rollback.
				lastSavedSurfaceState = "";
				throw error;
			}
			lastSavedSurfaceState = serializePersistedSurfaceStateForChangeDetection(
				getState(),
			);
			// Round-5 / Needs-fix 2: surface the persistence root and
			// the source-persist outcome on the success diagnostic line
			// so the parent (applyInterPanelMove) and Debug Console can
			// confirm which writer path ran without reading the input
			// shape.
			logWorkspace("runtime:persist-surface-state-awaitable:ok", {
				persistenceRoot: persistenceRootArg,
				persistenceRootKind: persistenceRootArg
					.toLowerCase()
					.includes("local-test")
					? "local-test"
					: "managed",
				panelId: getState().panelId,
			});
		};

		// ── Bus subscriptions ─────────────────────────────────────────────────
		const unsubscribePresets = cepSurfaceTransport.subscribe((msg) => {
			if (msg.channel !== SHELL_CHANNELS.presets) return;
			if (msg.kind !== "publish") return;
			const p = msg.payload;
			if (!p || typeof p !== "object") return;
			const snap = p as PresetsPayload;
			if (snap.kind !== "snapshot" || !Array.isArray(snap.presets)) return;
			void readGroupJson(window)
				.then((groupRaw) => {
					const groupCatalogEntries = parseGroupFromText(groupRaw);
					commit(
						withPresetInfoSnapshot({
							...getState(),
							presets: snap.presets as Preset[],
							groupCatalogEntries,
						}),
					);
				})
				.catch(() => {
					commit(
						withPresetInfoSnapshot({
							...getState(),
							presets: snap.presets as Preset[],
						}),
					);
				});
		});

		const appendWidgetFromBusPayload = (widgetTypeRaw: string): void => {
			const cfg = registry.getConfig(widgetTypeRaw as WidgetType);
			if (!cfg?.available) {
				return;
			}
			const cur = getState();
			const id = registry.createId(widgetTypeRaw as WidgetType);
			const { cols, rows } = cfg.defaultSize;
			const widgets = layoutsFromSurface(
				cur.surfaceTiles,
				widgetResolutionFromCatalogContext(cur),
			);
			let maxY = 0;
			for (const w of widgets) {
				const b = w.y + w.height;
				if (b > maxY) maxY = b;
			}
			const nextTile = {
				id,
				x: 0,
				y: maxY,
				width: cols,
				height: rows,
			};
			const nextTiles = [...cur.surfaceTiles, nextTile];
			const nextWidgets = layoutsFromSurface(
				nextTiles,
				widgetResolutionFromCatalogContext({
					...cur,
					widgetInstanceTypes: {
						...cur.widgetInstanceTypes,
						[id]: widgetTypeRaw as WidgetType,
					},
				}),
			);
			history.push(nextWidgets);
			commit({
				...cur,
				surfaceTiles: nextTiles,
				widgetInstanceTypes: {
					...cur.widgetInstanceTypes,
					[id]: widgetTypeRaw as WidgetType,
				},
				statusMessage: `Added ${i18n.t(cfg.name.replace(/^widgets\./, ""), { defaultValue: cfg.name })}`,
			});
			persistSurfaceState();
			refreshSnapshotUi();
		};

		const openWidgetAddUi = (openerPanelKey: string): void => {
			if (isCep) {
				openWidgetAddDialogSurface(window, openerPanelKey);
			} else {
				setAddWidgetPickerOpen(true);
			}
		};

		const onAppendWidgetFromOverlay = (ev: Event): void => {
			if (!(ev instanceof CustomEvent)) return;
			const detail = ev.detail as {
				widgetType?: unknown;
				targetPanelId?: unknown;
			};
			const w = detail.widgetType;
			if (typeof w !== "string" || !w.trim()) return;
			const tgt = detail.targetPanelId;
			if (
				typeof tgt === "string" &&
				tgt.trim() &&
				indexFromPanelId(tgt.trim()) !== indexFromPanelId(getState().panelId)
			) {
				return;
			}
			appendWidgetFromBusPayload(w.trim());
			setAddWidgetPickerOpen(false);
		};
		root.addEventListener(
			"ty-plus-append-widget",
			onAppendWidgetFromOverlay as EventListener,
		);

		const unsubscribeBackground = cepSurfaceTransport.subscribe((msg) => {
			if (msg.channel !== SHELL_CHANNELS.background) return;
			if (msg.kind !== "publish") return;
			const raw = msg.payload;
			if (!raw || typeof raw !== "object") return;
			const pl = raw as BackgroundPayload;
			if (pl.kind !== "setBackground") return;
			workspaceLog.info("[WorkspaceBackground] bus:received", {
				context: {
					panelId,
					targetPanelId: pl.targetPanelId,
					sourceSurfaceId: pl.sourceSurfaceId,
					background: pl.background,
				},
			});
			if (indexFromPanelId(pl.targetPanelId) !== indexFromPanelId(panelId)) {
				workspaceLog.info("[WorkspaceBackground] bus:ignored-target", {
					context: {
						panelId,
						targetPanelId: pl.targetPanelId,
					},
				});
				return;
			}
			const cur = getState();
			commit({
				...cur,
				bg: pl.background,
			});
			workspaceLog.info("[WorkspaceBackground] bus:applied", {
				context: {
					panelId,
					background: pl.background,
				},
			});
			persistSurfaceState();
		});

		void listPresets()
			.then((presets) => {
				const cur = getState();
				commit(
					withPresetInfoSnapshot({
						...cur,
						presets: presets,
					}),
				);
			})
			.catch((error) => {
				workspaceLog.warn("[Workspace] initial preset list load failed", {
					context: {
						panelId,
						error: error instanceof Error ? error.message : String(error),
					},
				});
			});

		// ── Layout reload ─────────────────────────────────────────────────────
		// issue 139: the strict local catalog parser rejects on a corrupt
		// `presets/presets.json`. That must not classify the whole layout
		// restore as a read failure — the layout file itself may be fine,
		// and closing the write gate would refuse every later persist.
		// Log the catalog failure and continue the restore with an empty
		// preset list; genuine layout-file read failures still classify
		// through `planLayoutRestoreFromReadError` below.
		const readPresetsForLayoutRestore = async (): Promise<Preset[]> => {
			try {
				return await listPresets();
			} catch (error) {
				workspaceLog.warn(
					"[Workspace] preset catalog read failed during layout restore",
					{
						context: {
							panelId: getState().panelId,
							error: error instanceof Error ? error.message : String(error),
						},
					},
				);
				return [];
			}
		};

		const reloadLayoutFromStorage = async (
			enablePersistenceAfterReload?: boolean,
			layoutReadSupportRoot?: string,
		): Promise<void> => {
			let wsIndex: 1 | 2 | 3 | 4 | 5 = 1;
			// Anything that escapes the body below leaves the restore
			// unfinished, which is a read failure — never an empty panel.
			let plan: LayoutRestorePlan = planLayoutRestoreFromReadError(
				new Error("layout restore did not run"),
			);
			// Hoisted so the `settings/ui.json` ensure below still runs when the
			// restore itself throws: a failed read must not also skip the one
			// boot-time writer that file has (Issue #216).
			let uiSettingsSupportRoot: string | undefined;
			try {
				wsIndex = indexFromPanelId(getState().panelId);
				const allowImplicitAllPresetsWhenLayoutEmpty =
					getState().panelId === "panel-1";

				// Snapshot the live-grid revision before the async reads: a
				// themeLive grid commit landing mid-restore is newer than the
				// settingsJson snapshot and must not be overwritten by it.
				const liveGridRevisionAtRead = liveGridRevision;

				const persistenceManagedRoot =
					await resolveWorkspacePersistenceManagedRoot(
						window,
						layoutReadSupportRoot,
					);
				lastPersistenceManagedRoot = persistenceManagedRoot;
				const persistenceRootArg = persistenceRootAsOptional(
					persistenceManagedRoot,
				);
				uiSettingsSupportRoot = persistenceRootArg;

				const [
					rawLayout,
					widgetRecords,
					uiSettings,
					settingsJson,
					presets,
					groupCatalogText,
				] = await Promise.all([
					readNJson(window, wsIndex),
					readWidgetRecords(window),
					readUiSettings(window, persistenceRootArg),
					readSettings(window),
					readPresetsForLayoutRestore(),
					readGroupJson(window),
				]);
				const panelPresetIdsFromSettings = readPanelPresetIdsFromSettingsJson(
					settingsJson,
					getState().panelId,
				);

				const groupCatalogEntries = parseGroupFromText(groupCatalogText);

				const widgetRecordLite = widgetRecords.map((r) => ({
					id: r.id,
					type: r.type as WidgetType,
				}));

				const catalogClassifyCtx = {
					widgetInstanceTypes: Object.fromEntries(
						widgetRecords.map((r) => [r.id, r.type as WidgetType]),
					),
					groupCatalogEntries,
					presets: presets,
				};

				// Issue #204: this classification is the only thing that decides
				// whether the panel may keep going. A body that is present but
				// not a layout, or a read that never produced a body, stops the
				// restore here instead of becoming `migratedTiles = []`.
				plan = planLayoutRestoreFromText(rawLayout);

				if (isLayoutRestoreBlocked(plan)) {
					// No commit, no baseline, no persistence: the surface keeps
					// whatever it showed before this reload and the on-disk
					// layout is left byte-for-byte alone.
				} else {
					const migratedTiles: Tile[] =
						plan.status === "not-created"
							? []
							: tilesFromDocument({
									layout: plan.document,
									widgetRecords: widgetRecordLite,
									presets,
									panelPresetIds: panelPresetIdsFromSettings,
									implicitlyFillAllPresetsWhenLayoutEmpty:
										allowImplicitAllPresetsWhenLayoutEmpty,
								});

					const baseState = getState();
					const widgetRecordById = new Map(widgetRecords.map((r) => [r.id, r]));
					const hasPersistedWidgetGeometryRows = migratedTiles.some((t) =>
						widgetRecordById.has(t.id),
					);

					const mergedTiles = buildMergedTiles(
						hasPersistedWidgetGeometryRows,
						migratedTiles,
						baseState,
						widgetRecordById,
					);

					let loadedState: SurfaceState = {
						...baseState,
						surfaceTiles: mergedTiles,
						widgetInstanceTypes: catalogClassifyCtx.widgetInstanceTypes,
						groupCatalogEntries,
						presets,
						selectedSurfaceIndices: clipSelection(
							baseState.selectedSurfaceIndices,
							mergedTiles.length,
						),
					};

					if (panelPresetIdsFromSettings.length > 0) {
						loadedState = {
							...loadedState,
							panelPresetIds: panelPresetIdsFromSettings,
						};
					}

					loadedState = {
						...loadedState,
						showGridOverlay: uiSettings.showGridOverlay,
						showPresetLabels: uiSettings.showPresetLabels,
					};

					// settings.workspace.grid is the user-facing grid setting;
					// it is authoritative over any stale per-panel persisted
					// grid so the Settings dialog actually changes tile
					// geometry (Issue #95).
					const settingsGrid = gridSettingsFromSettingsJson(settingsJson);
					if (settingsGrid && liveGridRevision === liveGridRevisionAtRead) {
						loadedState = { ...loadedState, grid: settingsGrid };
					}

					loadedState = CommitReconcile(loadedState, loadedState);

					const cur = getState();
					commit(
						ensurePrimaryPanelWidgets(
							normalizeState({ ...cur, ...loadedState }),
						),
					);

					// Re-project app.json ui.*/workspace.grid into theme.css on
					// boot (Issue #112). Gated to panel-1: theme.css is shared
					// across surfaces and the write queue is per-window, so a
					// single surface must own the reconcile. Idempotent — a
					// converged store writes nothing and broadcasts nothing.
					if (panelSurfaceId === "panel-1") {
						void reconcileSettingsThemeOverrides(window, panelSurfaceId).catch(
							(error) => {
								console.warn("[settings-theme] boot reconcile failed", error);
							},
						);
					}

					// Load background from file
					void readBackgroundJson(window, wsIndex).then((bgJson) => {
						if (bgJson == null) return;
						let bg: unknown;
						try {
							bg = JSON.parse(bgJson);
						} catch (e) {
							console.warn("[WorkspaceBackground] file:parse-failed", {
								panelId: getState().panelId,
								error: e,
							});
							return;
						}
						const cur2 = getState();
						commit({
							...cur2,
							bg: bg as typeof cur2.bg,
						});
					});
				}
			} catch (error) {
				// The old version of this catch was bare and its comment claimed
				// "Error logged by inner catch blocks" while nothing was logged
				// anywhere. The failure is now classified and recorded below.
				plan = planLayoutRestoreFromReadError(error);
			}

			// Issue #216: `settings/ui.json` had no boot-time writer.
			// `ensureStorageInitialized` — the only caller of
			// `ensureUiSettingsFile` — lost its production caller when
			// onboarding was split into per-domain initializers, and the CEP
			// Add-Widget happy path reloads from disk instead of persisting,
			// so `writeUiSettings` never runs in a read-only session.
			// Materialize the defaults on every restore, after the reads so a
			// failure here cannot abort them; a null root logs its own skip.
			// The ensure only writes when the file is missing, so it does not
			// bypass the write gate below.
			try {
				await ensureUiSettingsFile(window, uiSettingsSupportRoot);
			} catch (error) {
				logWorkspace("runtime:ui-settings-ensure-failed", {
					wsIndex,
					message: error instanceof Error ? error.message : String(error),
				});
			}

			const restoreDetail = { panelId: getState().panelId, wsIndex };
			const adoption = adoptLayoutRestore(writeGate, plan, restoreDetail);
			setLayoutRestore(adoption.notice);

			// A blocked plan leaves the gate closed, so neither the baseline
			// nor any later edit can reach disk until a retry reads the file
			// back successfully.
			if (adoption.enabled) {
				lastSavedSurfaceState =
					serializePersistedSurfaceStateForChangeDetection(getState());
				// ADR-0006 §4: seed the persisted-id baseline from the disk
				// document the restore just classified. Cells that could not
				// be resolved into state tiles stay "ours" — the first merge
				// drops them exactly like the old bare `serialize(state)`
				// did, while anything a sibling writer adds afterwards is
				// unknown to both sets and gets adopted.
				lastPersistedTileIds = new Set(
					(isLayoutRestoreBlocked(plan) ? [] : plan.document.gridCells).flatMap(
						(cell) => {
							const id = String(cell.id ?? "").trim();
							return id.length > 0 ? [id] : [];
						},
					),
				);
				if (enablePersistenceAfterReload) {
					logWorkspace("runtime:layout-enable-post-onboarding-persistence", {
						wsIndex,
					});
				}
			}
			// The watch stays up either way: replacing or repairing the file
			// on disk re-enters this function and re-opens the gate.
			restartWorkspaceLayoutDiskSyncWatch();
			startCandidatesPreload(window);
		};

		let layoutReloadChain = Promise.resolve();
		const enqueueLayoutReload = (
			enablePersistenceAfterReload?: boolean,
			layoutReadSupportRoot?: string,
		): void => {
			layoutReloadChain = layoutReloadChain
				.then(() =>
					reloadLayoutFromStorage(
						enablePersistenceAfterReload,
						layoutReadSupportRoot,
					),
				)
				.catch(() => {});
		};
		reloadLayoutRef.current = () => {
			enqueueLayoutReload(false, lastPersistenceManagedRoot ?? undefined);
		};

		const restartWorkspaceLayoutDiskSyncWatch = (): void => {
			const root = lastPersistenceManagedRoot?.trim();
			if (!root) {
				layoutSyncWatchDisposer?.();
				layoutSyncWatchDisposer = null;
				lastLayoutSyncWatchKey = "";
				return;
			}
			const idx = indexFromPanelId(getState().panelId);
			const key = `${root.toLowerCase()}|${idx}`;
			if (key === lastLayoutSyncWatchKey && layoutSyncWatchDisposer != null) {
				return;
			}
			layoutSyncWatchDisposer?.();
			layoutSyncWatchDisposer = null;
			const disposer = startWorkspaceLayoutJsonExternalChangeWatch(window, {
				getManagedTyPlusRoot: () => lastPersistenceManagedRoot,
				workspaceIndex: idx,
				isLocalWriteSuppressed: () =>
					Date.now() < suppressLocalWorkspaceJsonWriteUntil,
				onExternalChange: () => {
					logWorkspace("runtime:layout-sync.disk-change", {
						panelId: getState().panelId,
						wsIndex: idx,
					});
					console.info("[WorkspaceBackground] disk-change", {
						panelId: getState().panelId,
						wsIndex: idx,
						root: lastPersistenceManagedRoot,
					});
					const run = (): void => {
						enqueueLayoutReload(false, lastPersistenceManagedRoot ?? undefined);
					};
					if (typeof globalThis.setTimeout === "function") {
						globalThis.setTimeout(run, 0);
					} else {
						run();
					}
				},
				onWatchFailed: () => {
					logWorkspace("runtime:layout-sync.watch-unavailable", {
						panelId: getState().panelId,
						wsIndex: idx,
					});
				},
			});
			if (disposer) {
				lastLayoutSyncWatchKey = key;
				layoutSyncWatchDisposer = disposer;
			} else {
				lastLayoutSyncWatchKey = "";
			}
		};

		const unsubscribeLayout = cepSurfaceTransport.subscribe((msg) => {
			if (msg.channel !== SHELL_CHANNELS.layout) return;
			if (msg.kind !== "publish") return;
			const raw = msg.payload;
			if (!raw || typeof raw !== "object") return;
			const pl = raw as LayoutPayload;
			if (pl.kind === "addWidget" && typeof pl.widgetType === "string") {
				const targetRaw =
					typeof pl.targetPanelId === "string" ? pl.targetPanelId.trim() : "";
				if (
					targetRaw &&
					indexFromPanelId(targetRaw) !== indexFromPanelId(getState().panelId)
				) {
					return;
				}
				appendWidgetFromBusPayload(pl.widgetType);
				return;
			}
			if (pl.kind === "reloadWorkspaceLayoutFromStorage") {
				const ids = Array.isArray(pl.panelIds)
					? pl.panelIds.filter(
							(x): x is string => typeof x === "string" && x.trim().length > 0,
						)
					: [];
				const localIdx = indexFromPanelId(getState().panelId);
				const hits = ids.some((tid) => indexFromPanelId(tid) === localIdx);
				if (!hits) return;
				logWorkspace("runtime:layout-reload-from-cross-panel-bus", {
					panelId: getState().panelId,
					localWorkspaceIndex: localIdx,
					sourceSurfaceId:
						typeof pl.sourceSurfaceId === "string" ? pl.sourceSurfaceId : null,
				});
				const sentRoot =
					typeof pl.layoutReadSupportRoot === "string" &&
					pl.layoutReadSupportRoot.trim().length > 0
						? pl.layoutReadSupportRoot.trim()
						: null;
				// Bus-driven roots must point at the same managed tree the local
				// panel already trusts. A sibling CEP extension could send an
				// arbitrary path here; we ignore any root that does not match the
				// currently captured persistence root.
				const root =
					sentRoot === null
						? (lastPersistenceManagedRoot ?? undefined)
						: lastPersistenceManagedRoot &&
								sentRoot.toLowerCase() ===
									lastPersistenceManagedRoot.toLowerCase()
							? sentRoot
							: (lastPersistenceManagedRoot ?? undefined);
				const run = (): void => {
					enqueueLayoutReload(false, root);
					void refreshPresets();
				};
				if (typeof globalThis.setTimeout === "function") {
					globalThis.setTimeout(run, 0);
				} else {
					run();
				}
				return;
			}
			if (pl.kind === "presetPlacement") {
				if (
					Array.isArray(pl.presetIds) &&
					indexFromPanelId(pl.targetPanelId) ===
						indexFromPanelId(getState().panelId)
				) {
					const cur = getState();
					const patch = mergePresetPlacementBusPayloadIntoState(cur, pl);
					commit({
						...cur,
						...patch,
					});
					persistSurfaceState();
					void refreshPresets();
				}
				return;
			}
			if (pl.kind === "widgetPlacement") {
				if (
					Array.isArray(pl.tiles) &&
					indexFromPanelId(pl.targetPanelId) ===
						indexFromPanelId(getState().panelId)
				) {
					const cur = getState();
					const patch = mergeWidgetPlacementIntoState(cur, pl);
					commit({
						...cur,
						...patch,
					});
					persistSurfaceState();
				}
			}
		});

		setLayoutReloadHandler((payload?: LayoutReloadPayload) => {
			logWorkspace("runtime:layout-reload-bridge", {
				panelId: getState().panelId,
				layoutReadSupportRoot: payload?.layoutReadSupportRoot ?? null,
			});
			enqueueLayoutReload(true, payload?.layoutReadSupportRoot);
		});

		enqueueLayoutReload(false);

		// ── Dialog helpers (F8) ─────────────────────────────────────────────────
		// openDialogProbe extracted to hooks/dialogs.ts

		// ── Debug console (browser mode only) ─────────────────────────────────
		const debugConsole = isCep ? null : new DebugConsole();

		// ── ApplyWidgets (using F8 widget-mgmt module) ─────────────────────────
		let lastWidgetsSnapshot = JSON.stringify(
			layoutsFromSurface(
				getState().surfaceTiles,
				widgetResolutionFromCatalogContext(getState()),
			),
		);

		const applyWidgets = (
			widgets: Parameters<typeof stripObsoleteLayouts>[0] | null,
			pushToStack = false,
		): void => {
			if (!widgets) return;
			const cur = getState();
			const result = applyWidgetsFromModule(widgets, cur);
			if (!result) return;
			if (pushToStack) {
				history.push(widgets);
			}
			commit({ ...cur, ...result });
			persistSurfaceState();
			refreshSnapshotUi();
		};

		// ── Dialog helpers (extracted to hooks/dialogs.ts) ────────────────────────

		// ── Control panel (inline — too tied to DOM events to extract) ─────────
		const commitCpState = (next: CpPersistedState): void => {
			writeCpState(next, panelId);
			window.dispatchEvent(
				new CustomEvent("ty-plus-cp-state-change", {
					detail: { state: next, panelId },
				}),
			);
			const el = root.querySelector("[data-cp]");
			if (el) {
				el.classList.toggle("collapsed", next.collapsed);
			}
			saveControlPanelState(window, next, panelId).catch(() => {});
			commit({ ...getState() });
		};

		type CpMenuElement = Element &
			ElementCSSInlineStyle & { hidden: boolean | string };
		let cpMenuEl: CpMenuElement | null = null;
		let cpDragSession = false;
		let cpDragStart: { x: number; y: number } | null = null;
		let cpDragMoved = false;

		const snapCpFromPointer = (
			clientX: number,
			clientY: number,
			prev: CpPersistedState,
		): CpPersistedState => {
			const viewportWidth = window.innerWidth;
			const viewportHeight = window.innerHeight;
			const thirdWidth = viewportWidth / 3;
			const thirdHeight = viewportHeight / 3;
			let position: CpPosition = "bottom-right";
			let orientation: CpOrientation = "horizontal";

			if (clientY < thirdHeight) {
				if (clientX < thirdWidth) {
					position = "top-left";
				} else if (clientX > viewportWidth - thirdWidth) {
					position = "top-right";
				} else {
					position = "top-center";
				}
			} else if (clientY > viewportHeight - thirdHeight) {
				if (clientX < thirdWidth) {
					position = "bottom-left";
				} else if (clientX > viewportWidth - thirdWidth) {
					position = "bottom-right";
				} else {
					position = "bottom-center";
				}
			} else if (clientX < thirdWidth) {
				position = clientY < viewportHeight / 2 ? "left-top" : "left-bottom";
				orientation = "vertical";
			} else if (clientX > viewportWidth - thirdWidth) {
				position = clientY < viewportHeight / 2 ? "right-top" : "right-bottom";
				orientation = "vertical";
			} else {
				position = clientX < viewportWidth / 2 ? "left-center" : "right-center";
				orientation = "vertical";
			}

			return { ...prev, position, orientation };
		};

		const hideCpMenu = (): void => {
			if (cpMenuEl) {
				cpMenuEl.hidden = true;
			}
		};

		const applyCpLiveLayout = (next: CpPersistedState): void => {
			const el = root.querySelector("[data-cp]");
			if (!el) return;
			const allPosClasses = [...CP_POSITION_LAYOUT_CLASS_NAMES];
			for (const c of allPosClasses) el.classList.remove(c);
			const posClasses = cpPositionToClasses(
				next.position,
				next.orientation,
				panelId,
			);
			for (const c of posClasses.split(/\s+/).filter(Boolean))
				el.classList.add(c);
			// Orientation/collapsed are reflected on `data-orientation` /
			// `data-collapsed` so the existing Panda recipe selector can match
			// without imperative classList churn. The Toolbar React render
			// already maintains these attributes via cx() on initial mount.
			el.setAttribute(
				"data-orientation",
				next.orientation === "vertical" ? "vertical" : "horizontal",
			);
			el.toggleAttribute("data-collapsed", next.collapsed);
		};

		const ensureCpMenu = (): CpMenuElement => {
			if (cpMenuEl) {
				return cpMenuEl;
			}
			const wrap = document.createElement("div");
			wrap.className = cx(cpMenuWrap);
			wrap.setAttribute("role", "menu");
			wrap.hidden = true;

			const addSep = (): void => {
				const s = document.createElement("div");
				s.className = cx(cpMenuSeparator);
				wrap.appendChild(s);
			};
			const addHeading = (t: string): void => {
				const h = document.createElement("div");
				h.className = cx(cpMenuHeading);
				h.textContent = t;
				wrap.appendChild(h);
			};
			const addBtn = (label: string, fn: () => void): void => {
				const b = document.createElement("button");
				b.type = "button";
				b.className = cx(cpMenuButton);
				b.textContent = label;
				b.addEventListener("click", (e) => {
					e.stopPropagation();
					fn();
					hideCpMenu();
				});
				wrap.appendChild(b);
			};

			addBtn("Collapse/Expand", () => {
				const st = readCpState(panelId);
				commitCpState({ ...st, collapsed: !st.collapsed });
			});
			addSep();
			addHeading("Position");
			const posDefs: { p: CpPosition; o: CpOrientation; label: string }[] = [
				{ p: "top-left", o: "horizontal", label: "Top Left" },
				{ p: "top-center", o: "horizontal", label: "Top Center" },
				{ p: "top-right", o: "horizontal", label: "Top Right" },
				{ p: "bottom-left", o: "horizontal", label: "Bottom Left" },
				{ p: "bottom-center", o: "horizontal", label: "Bottom Center" },
				{ p: "bottom-right", o: "horizontal", label: "Bottom Right" },
				{ p: "left-center", o: "vertical", label: "Left Center" },
				{ p: "right-center", o: "vertical", label: "Right Center" },
			];
			for (const { p, o, label } of posDefs) {
				addBtn(label, () => {
					const st = readCpState(panelId);
					commitCpState({ ...st, position: p, orientation: o });
				});
			}
			addSep();
			addHeading("Orientation");
			addBtn("Horizontal", () => {
				const st = readCpState(panelId);
				commitCpState({ ...st, orientation: "horizontal" });
			});
			addBtn("Vertical", () => {
				const st = readCpState(panelId);
				commitCpState({ ...st, orientation: "vertical" });
			});
			addSep();
			addBtn("Reset to Defaults", () => {
				commitCpState({
					position: "bottom-right",
					orientation: "horizontal",
					collapsed: false,
				});
			});

			document.body.appendChild(wrap);
			cpMenuEl = wrap;
			return wrap;
		};

		const _showCpMenu = (x: number, y: number): void => {
			const m = ensureCpMenu();
			m.hidden = false;
			const pad = 8;
			const mw = m.clientWidth || 200;
			const mh = m.clientHeight || 300;
			let left = x;
			let top = y;
			if (left + mw + pad > window.innerWidth) {
				left = window.innerWidth - mw - pad;
			}
			if (top + mh + pad > window.innerHeight) {
				top = window.innerHeight - mh - pad;
			}
			m.style.left = `${Math.max(pad, left)}px`;
			m.style.top = `${Math.max(pad, top)}px`;
		};

		const onCpMiddleDown = (ev: MouseEvent): void => {
			if (ev.button !== 1) {
				return;
			}
			const t = ev.target instanceof Element ? ev.target : null;
			const cp = t?.closest("[data-cp]");
			if (!cp) {
				return;
			}
			ev.preventDefault();
			cpDragSession = true;
			cpDragMoved = false;
			cpDragStart = { x: ev.clientX, y: ev.clientY };
			cp.classList.add("control-panel-dragging");
		};

		const onDocMouseMove = (ev: MouseEvent): void => {
			if (!cpDragSession || !cpDragStart) {
				return;
			}
			const dx = Math.abs(ev.clientX - cpDragStart.x);
			const dy = Math.abs(ev.clientY - cpDragStart.y);
			if (Math.sqrt(dx * dx + dy * dy) < 30) {
				return;
			}
			cpDragMoved = true;
			const st = readCpState(panelId);
			const next = snapCpFromPointer(ev.clientX, ev.clientY, st);
			applyCpLiveLayout({ ...next, collapsed: st.collapsed });
		};

		const onDocMouseUp = (ev: MouseEvent): void => {
			if (!cpDragSession) {
				return;
			}
			cpDragSession = false;
			cpDragStart = null;
			root
				.querySelector("[data-cp]")
				?.classList.remove("control-panel-dragging");
			if (cpDragMoved) {
				const st = readCpState(panelId);
				const next = snapCpFromPointer(ev.clientX, ev.clientY, st);
				commitCpState({
					...st,
					position: next.position,
					orientation: next.orientation,
				});
			}
			cpDragMoved = false;
		};

		const onDocMouseDownCloseMenu = (ev: MouseEvent): void => {
			if (!cpMenuEl || cpMenuEl.hidden) {
				return;
			}
			if (cpMenuEl.contains(ev.target as Node)) {
				return;
			}
			hideCpMenu();
		};

		// ── Project info refresh (extracted to hooks/cp-state.ts) ────────────────

		// ── Preset refresh (F3) ───────────────────────────────────────────────
		const refreshPresets = (): Promise<void> => {
			if (!isCep) {
				void listPresets()
					.then((presets) => {
						const cur = getState();
						commit(
							withPresetInfoSnapshot({
								...cur,
								presets: presets,
							}),
						);
					})
					.catch((error) => {
						workspaceLog.warn("[Workspace] preset list refresh failed", {
							context: {
								panelId,
								error: error instanceof Error ? error.message : String(error),
							},
						});
					});
				return Promise.resolve();
			}
			// Issue #88: R0 has no cloud backend, so preset refresh is a
			// local catalog read only — there is no sync status to emit.
			// issue 139: the row source is the local catalog — file-backed and
			// independent of any gateway boot (offline-core contract).
			// Every caller uses `void refreshPresets()`, so a rejection here
			// would surface as an unhandled rejection; log and resolve instead.
			return (async () => {
				try {
					const presets = await listPresets();
					const cur = getState();
					commit(
						withPresetInfoSnapshot({
							...cur,
							presets: presets,
						}),
					);
					const presetPayload: PresetsPayload = {
						kind: "snapshot",
						presets,
						sourceSurfaceId: panelId,
					};
					await publishShellMessage(cepSurfaceTransport, {
						channel: SHELL_CHANNELS.presets,
						kind: "publish",
						sourceSurfaceId: panelId,
						payload: presetPayload,
					});
				} catch (error) {
					workspaceLog.warn("[Workspace] preset list refresh failed", {
						context: {
							panelId,
							error: error instanceof Error ? error.message : String(error),
						},
					});
				}
			})();
		};

		// ── Preset tool dialogs (F8) ───────────────────────────────────────────
		const openPresetToolSurface = (
			surfaceId: string,
			params?: Record<string, unknown>,
		): void => {
			if (!isCep) return;
			void openPresetToolSurfaceImpl({
				win: window,
				panelId,
				surfaceId,
				params,
				cepSurfaceTransport,
				presetToolOpenBusChannel: PRESET_TOOL_OPEN_BUS_CHANNEL,
			});
		};

		const openPresetEditSurface = async (presetId: string): Promise<void> => {
			if (!isCep || !presetId.trim()) return;
			await openPresetEditSurfaceImpl(window, panelId, presetId);
		};

		const parsePresetDialogRequest = (
			raw: unknown,
		): PresetDialogRequest | null => {
			const source =
				typeof raw === "string"
					? (() => {
							try {
								return JSON.parse(raw) as unknown;
							} catch {
								return null;
							}
						})()
					: raw;
			if (!source || typeof source !== "object") return null;
			const o = source as Record<string, unknown>;
			if (o.action === "open-create" && typeof o.surfaceId === "string") {
				const params =
					o.params && typeof o.params === "object"
						? (o.params as Record<string, unknown>)
						: undefined;
				return { action: "open-create", surfaceId: o.surfaceId, params };
			}
			if (o.action === "open-edit" && typeof o.presetId === "string") {
				return { action: "open-edit", presetId: o.presetId };
			}
			return null;
		};

		const onExternalPresetDialogRequest = (event: unknown): void => {
			const data = (event as { data?: unknown }).data;
			const request = parsePresetDialogRequest(data);
			if (!request) return;
			if (request.action === "open-create") {
				openPresetToolSurface(request.surfaceId, request.params);
				return;
			}
			void openPresetEditSurface(request.presetId);
		};

		let removeExternalPresetDialogListener: (() => void) | null = null;
		const setupExternalDialog = async () => {
			const listener = setupExternalPresetDialogListener(
				onExternalPresetDialogRequest,
			);
			if (listener) {
				removeExternalPresetDialogListener = listener.remove;
			}
		};
		try {
			setupExternalDialog();
		} catch {
			removeExternalPresetDialogListener = null;
		}

		// ── Control panel menu actions ─────────────────────────────────────────
		const applyControlPanelMenuAction = (id: string): void => {
			const st = readCpState(panelId);
			switch (id) {
				case CTX_MENU_IDS.cpToggleCollapse:
					commitCpState({ ...st, collapsed: !st.collapsed });
					return;
				case CTX_MENU_IDS.cpOrientHorizontal:
					commitCpState({ ...st, orientation: "horizontal" });
					return;
				case CTX_MENU_IDS.cpOrientVertical:
					commitCpState({ ...st, orientation: "vertical" });
					return;
				case CTX_MENU_IDS.cpResetDefault:
					commitCpState({
						position: "bottom-right",
						orientation: "horizontal",
						collapsed: false,
					});
					return;
				case CTX_MENU_IDS.cpLayoutTopLeft:
					commitCpState({ ...st, position: "top-left" });
					return;
				case CTX_MENU_IDS.cpLayoutTopCenter:
					commitCpState({ ...st, position: "top-center" });
					return;
				case CTX_MENU_IDS.cpLayoutTopRight:
					commitCpState({ ...st, position: "top-right" });
					return;
				case CTX_MENU_IDS.cpLayoutBottomLeft:
					commitCpState({ ...st, position: "bottom-left" });
					return;
				case CTX_MENU_IDS.cpLayoutBottomCenter:
					commitCpState({ ...st, position: "bottom-center" });
					return;
				case CTX_MENU_IDS.cpLayoutBottomRight:
					commitCpState({ ...st, position: "bottom-right" });
					return;
				case CTX_MENU_IDS.cpLayoutLeftCenter:
					commitCpState({ ...st, position: "left-center" });
					return;
				case CTX_MENU_IDS.cpLayoutRightCenter:
					commitCpState({ ...st, position: "right-center" });
					return;
				case CTX_MENU_IDS.addWidget:
					openWidgetAddUi(panelId);
					return;
			}
		};

		// ── Unified context menu (F5) ──────────────────────────────────────────
		const handleUnifiedCtxSelect = (
			id: string | null,
			hit: ContextHit,
		): void => {
			if (id == null) return;
			if (id.startsWith(CEP_CONTEXT_HEADER_ID_PREFIX)) return;

			// Easing per-curve-category label color choice (e.g.
			// `ty.ctx.easing.label-value.linear.3`). Routed here before the
			// switch because the IDs are too numerous to enumerate as
			// individual cases.
			if (id.startsWith(CTX_MENU_IDS.easingLabelCategoryValuePrefix)) {
				const tail = id.substring(
					CTX_MENU_IDS.easingLabelCategoryValuePrefix.length,
				);
				const dot = tail.indexOf(".");
				if (dot >= 0) {
					const categoryKey = tail.substring(0, dot);
					const value = tail.substring(dot + 1);
					window.dispatchEvent(
						new CustomEvent("ty-plus:easing-context-command", {
							detail: {
								action: "setLabelColor",
								value: `${categoryKey}.${value}`,
							},
						}),
					);
				}
				return;
			}

			// Easing flat main-apply label color choice
			// (e.g. `ty.ctx.easing.main-label-color-value.3` or
			//  `ty.ctx.easing.main-label-color-value.none`). Lets the user
			// pick a single AE label color to apply on the next easing
			// apply, overriding the per-category auto-resolution.
			if (id.startsWith(CTX_MENU_IDS.easingMainLabelColorValuePrefix)) {
				const tail = id.substring(
					CTX_MENU_IDS.easingMainLabelColorValuePrefix.length,
				);
				window.dispatchEvent(
					new CustomEvent("ty-plus:easing-context-command", {
						detail: { action: "setMainLabelColor", value: tail },
					}),
				);
				return;
			}

			if (hit.zone === "directory-browser") {
				// Bridge to the directory-browser widget: the widget listens for
				// `browser-*` CustomEvents on the panel root (Component.tsx).
				// Synthesizing `data-ws-action` button clicks does NOT work here —
				// `onActionClick` would re-route them as control-panel actions.
				const dispatchBrowserEvent = (
					name: string,
					detail?: Record<string, string>,
				): void => {
					root.dispatchEvent(new CustomEvent(name, { detail }));
				};
				if (id === CTX_MENU_IDS.dirBrowserRefresh) {
					dispatchBrowserEvent("browser-refresh");
					return;
				}
				if (id === CTX_MENU_IDS.dirBrowserGoUp) {
					dispatchBrowserEvent("browser-go-up");
					return;
				}
				if (id === CTX_MENU_IDS.dirBrowserBrowseDrives) {
					dispatchBrowserEvent("browser-browse-drives");
					return;
				}
				if (id === CTX_MENU_IDS.dirBrowserToggleFilters) {
					dispatchBrowserEvent("browser-toggle-directory-filters");
					return;
				}
				if (id === CTX_MENU_IDS.dirBrowserClearSearch) {
					dispatchBrowserEvent("browser-clear-search");
					return;
				}
				if (id === CTX_MENU_IDS.dirBrowserDefaultDir) {
					dispatchBrowserEvent("browser-default-dir");
					return;
				}
				const openPref = CTX_MENU_IDS.dirBrowserOpenDirPrefix;
				if (id.startsWith(openPref)) {
					const filePath = decodeURIComponent(id.slice(openPref.length));
					dispatchBrowserEvent("browser-open-dir", {
						"data-file-path": filePath,
					});
					return;
				}
				const selPref = CTX_MENU_IDS.dirBrowserSelectPrefix;
				if (id.startsWith(selPref)) {
					const filePath = decodeURIComponent(id.slice(selPref.length));
					dispatchBrowserEvent("browser-select", {
						"data-file-path": filePath,
					});
					return;
				}
				const impPref = CTX_MENU_IDS.dirBrowserImportPrefix;
				if (id.startsWith(impPref)) {
					const filePath = decodeURIComponent(id.slice(impPref.length));
					dispatchBrowserEvent("browser-import", {
						"data-file-path": filePath,
					});
					return;
				}
				const audioPref = CTX_MENU_IDS.dirBrowserAudioPreviewPrefix;
				if (id.startsWith(audioPref)) {
					const filePath = decodeURIComponent(id.slice(audioPref.length));
					dispatchBrowserEvent("browser-audio-preview", {
						"data-file-path": filePath,
					});
					return;
				}
				// Preset catalog rows reuse the preset-row menu ids
				// (runPreset / editPreset / duplicatePreset / deletePreset /
				// movePresetsToPanelPrefix); they fall through to the shared
				// switch below which resolves `hit.presetId` for this zone.
			}

			if (hit.zone === "control-panel") {
				// Only delegate to applyControlPanelMenuAction for CP-specific actions
				// (collapse, position, orientation, reset, addWidget).
				// Preset creation and other actions fall through to the main switch.
				applyControlPanelMenuAction(id);
				// Fall through — preset creation IDs are not handled by
				// applyControlPanelMenuAction, so let the main switch handle them.
				if (
					id === CTX_MENU_IDS.cpToggleCollapse ||
					id === CTX_MENU_IDS.cpOrientHorizontal ||
					id === CTX_MENU_IDS.cpOrientVertical ||
					id === CTX_MENU_IDS.cpResetDefault ||
					id === CTX_MENU_IDS.cpLayoutTopLeft ||
					id === CTX_MENU_IDS.cpLayoutTopCenter ||
					id === CTX_MENU_IDS.cpLayoutTopRight ||
					id === CTX_MENU_IDS.cpLayoutBottomLeft ||
					id === CTX_MENU_IDS.cpLayoutBottomCenter ||
					id === CTX_MENU_IDS.cpLayoutBottomRight ||
					id === CTX_MENU_IDS.cpLayoutLeftCenter ||
					id === CTX_MENU_IDS.cpLayoutRightCenter ||
					id === CTX_MENU_IDS.addWidget
				) {
					return;
				}
			}

			const cur = getState();
			// Run a catalog preset from a context-menu pick. Mirrors the
			// `data-ws-action="run-preset"` path: missing assets are blocked
			// up-front (Issue #130), failures surface as notifications.
			const runCtxPreset = (presetId: string): void => {
				if (isPresetAssetMissing(presetId)) {
					notificationStore.add(
						"Preset asset is missing on disk — run is disabled.",
						"warning",
						{ duration: 8000 },
					);
					return;
				}
				void executeWorkspacePreset(presetId).catch((error) => {
					notificationStore.add(
						`Preset failed: ${
							error instanceof Error ? error.message : String(error)
						}`,
						"error",
					);
				});
			};
			const placementIndexFromHit = (): number | null => {
				const raw =
					hit.zone === "workspace-placement"
						? hit.id
						: hit.zone === "directory-browser"
							? (hit.placementId ?? "")
							: "";
				const n = Number.parseInt(raw.trim(), 10);
				return Number.isFinite(n) && n >= 0 ? n : null;
			};

			switch (id) {
				case CTX_MENU_IDS.undo:
					applyWidgets(history.undo());
					return;
				case CTX_MENU_IDS.redo:
					applyWidgets(history.redo());
					return;
				case CTX_MENU_IDS.saveSnapshot:
					void history
						.saveSnapshot(
							layoutsFromSurface(
								cur.surfaceTiles,
								widgetResolutionFromCatalogContext(cur),
							),
						)
						.then(() => {
							refreshSnapshotUi();
						})
						.catch(logSnapshotOpError("save"));
					return;
				case CTX_MENU_IDS.restoreSnapshotPrefix: {
					const snapId = id.substring(
						CTX_MENU_IDS.restoreSnapshotPrefix.length,
					);
					if (!snapId) return;
					void history
						.restoreSnapshot(snapId)
						.then((allPanels) => {
							if (!allPanels) return;
							const currentPanelId = cur.panelId;
							const currentPanelLayout = allPanels[currentPanelId];
							if (currentPanelLayout) {
								const result = applyWidgetsFromModule(currentPanelLayout, cur);
								if (result) {
									commit({ ...cur, ...result });
								}
							}
							void (async () => {
								await Promise.all(
									Object.entries(allPanels).map(([panelId, layouts]) => {
										const idx = indexFromPanelId(panelId);
										const tiles = layouts.map((w) => ({
											id: w.id,
											x: w.x,
											y: w.y,
											width: w.width,
											height: w.height,
										}));
										return writeNJson(window, idx, serialize(tiles));
									}),
								);
								persistSurfaceState();
							})().catch(logSnapshotOpError("restore-write"));
						})
						.catch(logSnapshotOpError("restore"));
					return;
				}
				case CTX_MENU_IDS.openPresets:
					requestOpenWorkspaceShellTool(
						"presets",
						undefined,
						panelId,
						isCep,
						window,
					);
					return;
				case CTX_MENU_IDS.openMessages:
					requestOpenWorkspaceShellTool(
						"messages",
						undefined,
						panelId,
						isCep,
						window,
					);
					return;
				case CTX_MENU_IDS.openSettings:
					requestOpenWorkspaceShellTool(
						"settings",
						undefined,
						panelId,
						isCep,
						window,
					);
					return;
				case CTX_MENU_IDS.openBackground:
					requestOpenBackgroundPanel(
						panelId,
						isCep,
						window,
						lastPersistenceManagedRoot,
					);
					return;
				case CTX_MENU_IDS.openDebug:
					if (isCep) openDebugConsole(window);
					else debugConsole?.toggle();
					return;
				case CTX_MENU_IDS.addWidget:
					openWidgetAddUi(cur.panelId);
					return;
				case CTX_MENU_IDS.toggleLayoutLock:
					commit({ ...cur, layoutLocked: !cur.layoutLocked });
					return;
				case CTX_MENU_IDS.toggleWorkspaceGridOverlay:
					commit({ ...cur, showGridOverlay: !cur.showGridOverlay });
					persistSurfaceState();
					return;
				case CTX_MENU_IDS.toggleWorkspacePresetLabels:
					commit({ ...cur, showPresetLabels: !cur.showPresetLabels });
					persistSurfaceState();
					return;
				case CTX_MENU_IDS.openDocs: {
					openUrlInDefaultBrowser("https://github.com/");
					return;
				}
				case CTX_MENU_IDS.reloadPresets:
					enqueueLayoutReload(false, lastPersistenceManagedRoot ?? undefined);
					void refreshPresets();
					return;
				case CTX_MENU_IDS.probeOpenDebug:
					void openDialogProbe(
						{
							title: "Dialog Probe",
							message: "Panel -> Dialog bridge check",
						},
						isCep,
						panelId,
						window,
					);
					return;
				case CTX_MENU_IDS.resetWorkspace: {
					void (async () => {
						const wsIndex = indexFromPanelId(cur.panelId);
						const lockRoot = await resolvePersistenceLockRoot(window);
						if (!lockRoot) return;
						// ADR-0006: layout clear + settings rewrite are one
						// transaction inside the managed-root lock.
						await withPersistenceLock(window, lockRoot, async () => {
							const currentSettingsJson = await readSettings(window);
							await clearLayoutNJson(window, wsIndex);
							await writeSettings(
								window,
								clearWorkspacePanelStateFromSettingsJson(
									currentSettingsJson,
									cur.panelId,
								),
							);
						});
						lastPersistedTileIds = new Set();
						const next = createInitialSurfaceState({
							grid: {},
							panelId: cur.panelId,
							hostCode,
							hostName: "After Effects",
							mode: isCep ? "static" : "live",
						});
						const withPanel = ensurePrimaryPanelWidgets({
							...next,
							panelPresetIds: [],
							presets: cur.presets,
						});
						commit({ ...withPanel });
						persistSurfaceState();
						lastSavedSurfaceState = "";
					})();
					return;
				}
				case CTX_MENU_IDS.packTopLeft: {
					type PackedItem = {
						id: string;
						x: number;
						y: number;
						width: number;
						height: number;
					};
					const allItems: PackedItem[] = [];
					cur.surfaceTiles.forEach((t, index) => {
						allItems.push({
							id: String(index),
							x: t.x,
							y: t.y,
							width: t.width,
							height: t.height,
						});
					});

					if (allItems.length === 0) return;

					const packed = packTopLeft(allItems, cur.grid);
					const nextTiles = cur.surfaceTiles.map((t, i) => {
						const p = packed.find((item) => item.id === String(i));
						if (!p) return t;
						return {
							...t,
							x: p.x,
							y: p.y,
							width: p.width,
							height: p.height,
						};
					});

					commit({
						...cur,
						surfaceTiles: nextTiles,
					});
					persistSurfaceState();
					return;
				}
				case CTX_MENU_IDS.createFilePreset:
					openPresetToolSurface("dialog-preset-add");
					return;
				case CTX_MENU_IDS.createFolderPreset:
					openPresetToolSurface("dialog-preset-add-folder");
					return;
				case CTX_MENU_IDS.createAnimationPreset:
					openPresetToolSurface("dialog-animation-preset");
					return;
				case CTX_MENU_IDS.createLayerCompPreset:
					openPresetToolSurface("dialog-layer-comp-preset");
					return;
				case CTX_MENU_IDS.createCodePreset:
					openPresetToolSurface("dialog-code-preset");
					return;
				case CTX_MENU_IDS.createEasingPreset:
					openPresetToolSurface("dialog-preset-create", {
						presetTemplate: "easing",
					});
					return;
				case CTX_MENU_IDS.createFootagePreset:
					openPresetToolSurface("dialog-footage-preset");
					return;
				case CTX_MENU_IDS.createImportPreset:
					openPresetToolSurface("dialog-import-preset");
					return;
				case CTX_MENU_IDS.fontViewerTileSquare:
				case CTX_MENU_IDS.fontViewerTileWide:
				case CTX_MENU_IDS.fontViewerToggleResolved: {
					const placementIdx = placementIndexFromHit();
					const widgetId =
						placementIdx !== null
							? cur.surfaceTiles[placementIdx]?.id?.trim()
							: "";
					window.dispatchEvent(
						new CustomEvent("ty-plus:font-viewer-context-menu", {
							detail: { id, widgetId },
						}),
					);
					return;
				}
				case CTX_MENU_IDS.easingPresetLinear:
					window.dispatchEvent(
						new CustomEvent("ty-plus:easing-context-command", {
							detail: { action: "preset", value: "linear" },
						}),
					);
					return;
				case CTX_MENU_IDS.easingPresetEaseOut:
					window.dispatchEvent(
						new CustomEvent("ty-plus:easing-context-command", {
							detail: { action: "preset", value: "easeOut" },
						}),
					);
					return;
				case CTX_MENU_IDS.easingPresetEaseIn:
					window.dispatchEvent(
						new CustomEvent("ty-plus:easing-context-command", {
							detail: { action: "preset", value: "easeIn" },
						}),
					);
					return;
				case CTX_MENU_IDS.easingPresetEaseInOut:
					window.dispatchEvent(
						new CustomEvent("ty-plus:easing-context-command", {
							detail: { action: "preset", value: "easeInOut" },
						}),
					);
					return;
				case CTX_MENU_IDS.easingCopyFromSelection:
					dispatchWorkspaceWsActionClick(root, "easing-copy-from-selection");
					return;
				case CTX_MENU_IDS.easingReverseCurve:
					dispatchWorkspaceWsActionClick(root, "easing-reverse-curve");
					return;
				case CTX_MENU_IDS.easingApplyCurrent:
					dispatchWorkspaceWsActionClick(root, "easing-apply-current");
					return;
				case CTX_MENU_IDS.easingBackgroundDot:
					window.dispatchEvent(
						new CustomEvent("ty-plus:easing-context-command", {
							detail: { action: "background", value: "dot" },
						}),
					);
					return;
				case CTX_MENU_IDS.easingBackgroundGrid:
					window.dispatchEvent(
						new CustomEvent("ty-plus:easing-context-command", {
							detail: { action: "background", value: "grid" },
						}),
					);
					return;
				case CTX_MENU_IDS.easingApplyModeSingle:
					window.dispatchEvent(
						new CustomEvent("ty-plus:easing-context-command", {
							detail: { action: "applyMode", value: "single" },
						}),
					);
					return;
				case CTX_MENU_IDS.easingApplyModePair:
					window.dispatchEvent(
						new CustomEvent("ty-plus:easing-context-command", {
							detail: { action: "applyMode", value: "pair" },
						}),
					);
					return;
				case CTX_MENU_IDS.easingAutoApplyOn:
					window.dispatchEvent(
						new CustomEvent("ty-plus:easing-context-command", {
							detail: { action: "autoApply", value: "on" },
						}),
					);
					return;
				case CTX_MENU_IDS.easingAutoApplyOff:
					window.dispatchEvent(
						new CustomEvent("ty-plus:easing-context-command", {
							detail: { action: "autoApply", value: "off" },
						}),
					);
					return;
				case CTX_MENU_IDS.easingCopyEase:
					window.dispatchEvent(
						new CustomEvent("ty-plus:easing-context-command", {
							detail: { action: "copyEase" },
						}),
					);
					return;
				case CTX_MENU_IDS.easingCopyValues:
					window.dispatchEvent(
						new CustomEvent("ty-plus:easing-context-command", {
							detail: { action: "copyValues" },
						}),
					);
					return;
				case CTX_MENU_IDS.easingPaste: {
					const modifiers = (
						window as unknown as {
							__lastCtxMods?: { altKey: boolean; shiftKey: boolean };
						}
					).__lastCtxMods ?? { altKey: false, shiftKey: false };
					window.dispatchEvent(
						new CustomEvent("ty-plus:easing-context-command", {
							detail: {
								action: "paste",
								pasteEase: !modifiers.shiftKey,
								pasteValues: !modifiers.altKey,
							},
						}),
					);
					return;
				}
				case CTX_MENU_IDS.easingLabelNone:
					window.dispatchEvent(
						new CustomEvent("ty-plus:easing-context-command", {
							detail: { action: "setLabelColor", value: "linear.none" },
						}),
					);
					return;
				case CTX_MENU_IDS.anchorPointResetCenter:
				case CTX_MENU_IDS.anchorPointApplyAllLayers:
				case CTX_MENU_IDS.anchorPointApplyActiveComp: {
					window.dispatchEvent(
						new CustomEvent("ty-plus:anchor-point-context-menu", {
							detail: { id },
						}),
					);
					return;
				}
				case CTX_MENU_IDS.deleteWorkspaceWidget: {
					const placementIdx = placementIndexFromHit();
					if (placementIdx === null) return;
					const tileAt = cur.surfaceTiles[placementIdx];
					if (!tileAt || !tileIdResolvesAsWidget(cur, tileAt.id)) return;
					const wid = tileAt.id.trim();
					if (!wid || !isCep) return;
					const prevTiles = cur.surfaceTiles;
					const nextSurfaceTiles = prevTiles.filter(
						(_, i) => i !== placementIdx,
					);
					const nextWidgetTypes = { ...cur.widgetInstanceTypes };
					delete nextWidgetTypes[wid];
					const remainingLayouts = layoutsFromSurface(
						nextSurfaceTiles,
						widgetResolutionFromCatalogContext({
							...cur,
							widgetInstanceTypes: nextWidgetTypes,
						}),
					);
					history.push(remainingLayouts);
					commit({
						...cur,
						surfaceTiles: nextSurfaceTiles,
						widgetInstanceTypes: nextWidgetTypes,
						selectedSurfaceIndices: remapSurfaceSelectionByPreservedTileIds(
							prevTiles,
							nextSurfaceTiles,
							cur.selectedSurfaceIndices,
						),
					});
					persistSurfaceState();
					refreshSnapshotUi();
					return;
				}
				case CTX_MENU_IDS.deletePreset: {
					const catalogId = (() => {
						if (hit.zone === "preset-row") {
							return hit.presetId?.trim() ?? "";
						}
						if (hit.zone === "workspace-placement") {
							const i = Number.parseInt(hit.id?.trim() ?? "", 10);
							const t = cur.surfaceTiles[i];
							return t?.id?.trim() ?? "";
						}
						// Directory-browser preset catalog rows carry `data-preset-id`;
						// deleting must target the preset, not the widget tile.
						if (
							hit.zone === "directory-browser" &&
							hit.entryKind === "preset"
						) {
							return hit.presetId?.trim() ?? "";
						}
						return "";
					})();
					if (!catalogId || !isCep) return;
					const isGroupTile = cur.groupCatalogEntries.some(
						(g) => g.id.trim() === catalogId,
					);

					// Get preset title for confirmation dialog
					const presetTitle = isGroupTile
						? (cur.groupCatalogEntries.find((g) => g.id.trim() === catalogId)
								?.title ?? "")
						: (cur.presets.find((p) => p.id === catalogId)?.title ?? "");

					void (async () => {
						try {
							const confirmed = await askHostDeleteConfirm(
								window,
								presetTitle,
								isGroupTile,
							);
							if (!confirmed) return;

							try {
								if (isGroupTile) {
									await removeGroupEntry(window, catalogId);
								} else {
									await removeLocalPreset(catalogId);
								}
							} catch (error) {
								console.warn("[ty-plus] delete preset/group failed", error);
								return;
							}

							// Use unified delete path: updates layout + broadcasts to all panels
							await notifyPanelsAfterPresetSave(window, {
								sourceSurfaceId: cur.panelId,
								catalogRefIds: [catalogId],
								isDeletion: true,
							});
						} catch (error) {
							console.warn("[ty-plus] preset delete flow failed", error);
						}
					})();
					return;
				}
				case CTX_MENU_IDS.removePresetFromOpenedGroup: {
					if (hit.zone !== "preset-row" || !isCep) return;
					const presetId = hit.presetId?.trim() ?? "";
					if (!presetId) return;
					const groupId =
						cur.openedGroupPresetId?.trim() ||
						cur.groupCatalogEntries
							.find((g) => g.presetIds.some((id) => id.trim() === presetId))
							?.id.trim() ||
						"";
					if (!groupId) return;

					void (async () => {
						try {
							await removePresetFromGroupEntry(window, groupId, presetId);
							const groupCatalogText = await readGroupJson(window);
							commit({
								...getState(),
								groupCatalogEntries: parseGroupFromText(groupCatalogText),
							});
							await notifyPanelsAfterPresetSave(window, {
								sourceSurfaceId: cur.panelId,
								catalogRefIds: [presetId],
							});
						} catch (error) {
							console.warn("[ty-plus] remove preset from group failed", error);
						}
					})();
					return;
				}
				case CTX_MENU_IDS.releaseGroupPreset: {
					// Right-click "Release Group" → dissolve the group and
					// re-place its members on the grid (Issue #86).
					const groupId = (() => {
						if (hit.zone === "preset-row") {
							return hit.presetId?.trim() ?? "";
						}
						if (hit.zone === "workspace-placement") {
							const i = Number.parseInt(hit.id?.trim() ?? "", 10);
							const t = cur.surfaceTiles[i];
							return t?.id?.trim() ?? "";
						}
						return "";
					})();
					if (!groupId || !isCep) return;
					void (async () => {
						try {
							const dropPlacement = releaseDropPlacementFromState(
								getState(),
								groupId,
							);
							await releaseGroupPreset(
								{ window, panelId: cur.panelId },
								{
									state: getState(),
									groupId,
									dropPlacement,
								},
							);
							// Mirror the disk write in the local panel state so the
							// group row disappears without a round-trip to disk.
							const groupCatalogText = await readGroupJson(window);
							const prevTiles = getState().surfaceTiles;
							const nextTiles = prevTiles.filter(
								(t) => t.id?.trim() !== groupId,
							);
							commit({
								...getState(),
								groupCatalogEntries: parseGroupFromText(groupCatalogText),
								surfaceTiles: nextTiles,
								selectedSurfaceIndices: remapSurfaceSelectionByPreservedTileIds(
									prevTiles,
									nextTiles,
									getState().selectedSurfaceIndices,
								),
								openedGroupPresetId:
									getState().openedGroupPresetId?.trim() === groupId
										? null
										: getState().openedGroupPresetId,
							});
							persistSurfaceState();
							dispatchGroupWorkspaceRequest({
								type: "release",
								groupId,
							});
						} catch (error) {
							console.warn("[ty-plus] release group failed", error);
						}
					})();
					return;
				}
				case CTX_MENU_IDS.editPreset: {
					const catalogId = (() => {
						if (hit.zone === "preset-row") {
							return hit.presetId?.trim() ?? "";
						}
						if (hit.zone === "workspace-placement") {
							const i = Number.parseInt(hit.id?.trim() ?? "", 10);
							const t = cur.surfaceTiles[i];
							const tileId = t?.id?.trim() ?? "";
							// Check if it's a known preset id
							if (tileId && cur.presets.some((p) => p.id === tileId)) {
								return tileId;
							}
							// For widget tiles (e.g. info widget), derive from selection/hover
							if (!tileId) return "";
							const wt = cur.widgetInstanceTypes[tileId];
							if (wt === "info") {
								// Info widget: use selected grid items, then presetSelectedIds, then hover
								const fromGrid = catalogRefsForSurfaceIds(
									cur,
									cur.selectedSurfaceIndices.map(String),
								);
								if (fromGrid.length > 0) return fromGrid[0];
								if (cur.presetSelectedIds.length > 0) {
									return cur.presetSelectedIds[0];
								}
								if (cur.presetHoverId) return cur.presetHoverId;
							}
							return "";
						}
						// Directory-browser preset catalog rows: edit the preset
						// itself (`hit.presetId`), not the widget tile.
						if (
							hit.zone === "directory-browser" &&
							hit.entryKind === "preset"
						) {
							return hit.presetId?.trim() ?? "";
						}
						return "";
					})();
					if (!catalogId || !isCep) return;
					void (async () => {
						const presetEditExtensionId =
							tyPlusExtensionId("dialog-preset-edit");
						const payload = { presetId: catalogId };
						try {
							await writePresetToolHandoff(
								window,
								presetEditExtensionId,
								payload,
							);
						} catch {
							/* Skip in environments without cep fs */
						}
						openCepDialogSurface(window, {
							extensionId: presetEditExtensionId,
							params: payload,
						});
					})();
					return;
				}
				case CTX_MENU_IDS.duplicatePreset: {
					const resolved = resolveDuplicateHit(hit, cur);
					if (!resolved || !isCep) return;
					const { source, dropPlacement } = resolved;
					const newId = crypto.randomUUID();
					void (async () => {
						try {
							await runDuplicatePreset({
								window,
								panelId: cur.panelId,
								source,
								newId,
								dropPlacement,
								currentPresetSelectedIds: cur.presetSelectedIds,
								duplicatePresetFn: duplicatePreset,
								notifyPanelsAfterPresetSaveFn: notifyPanelsAfterPresetSave,
								// Selection commit only touches `presetSelectedIds`;
								// spread `cur` to preserve every other field.
								commit: (next) =>
									commit({ ...cur, presetSelectedIds: next.presetSelectedIds }),
								persistSurfaceState,
							});
						} catch (error) {
							console.warn("[ty-plus] duplicate preset failed", error);
						}
					})();
					return;
				}
				case CTX_MENU_IDS.runPreset: {
					if (hit.zone === "workspace-placement") {
						const i = Number.parseInt(hit.id?.trim() ?? "", 10);
						const t = cur.surfaceTiles[i];
						const tileId = t?.id?.trim() ?? "";
						const isGroup = cur.groupCatalogEntries.some(
							(g) => g.id.trim() === tileId,
						);
						if (isGroup && tileId) {
							dispatchGroupWorkspaceRequest({
								type: "toggle-open",
								groupId: tileId,
							});
							return;
						}
						// Preset tiles run the preset; widget tiles have no Run.
						if (tileId && cur.presets.some((p) => p.id === tileId)) {
							runCtxPreset(tileId);
						}
						return;
					}
					// preset-row and directory-browser preset catalog rows both
					// carry the catalog preset id — Run executes that preset.
					const presetId =
						hit.zone === "preset-row" ||
						(hit.zone === "directory-browser" && hit.entryKind === "preset")
							? (hit.presetId?.trim() ?? "")
							: "";
					if (!presetId) return;
					runCtxPreset(presetId);
					return;
				}
				case CTX_MENU_IDS.groupSelectedPresets: {
					const gridPresetRefIds: string[] = [];
					for (const i of cur.selectedSurfaceIndices) {
						const t = cur.surfaceTiles[i];
						if (t && !tileIdResolvesAsWidget(cur, t.id)) {
							const id = t.id?.trim();
							if (id) gridPresetRefIds.push(id);
						}
					}
					const seen = new Set<string>();
					const selectedPresetIds: string[] = [];
					for (const id of [...gridPresetRefIds, ...cur.presetSelectedIds]) {
						const trimmed = id.trim();
						if (trimmed.length > 0 && !seen.has(trimmed)) {
							seen.add(trimmed);
							selectedPresetIds.push(trimmed);
						}
					}
					const nonFolderIds = Array.from(new Set(selectedPresetIds)).filter(
						(id) => {
							const preset = cur.presets.find((p) => p.id === id);
							const isGroup = cur.groupCatalogEntries.some(
								(group) => group.id === id,
							);
							return preset && !isGroup;
						},
					);
					if (nonFolderIds.length < 2) return;
					const nonFolderIdSet = new Set(nonFolderIds);
					void (async () => {
						const selectedPresets = cur.presets.filter((p) =>
							nonFolderIdSet.has(p.id),
						);
						if (selectedPresets.length < 2) return;
						const groupName = "Group";
						const groupId = `folder-${Date.now()}`;
						await upsertGroupEntry(window, {
							id: groupId,
							presetIds: nonFolderIds,
							title: groupName,
						});
						const removeIdx = new Set<number>();
						for (const i of cur.selectedSurfaceIndices) {
							const t = cur.surfaceTiles[i];
							if (
								t &&
								!tileIdResolvesAsWidget(cur, t.id) &&
								nonFolderIdSet.has(t.id)
							) {
								removeIdx.add(i);
							}
						}
						for (const rid of cur.presetSelectedIds) {
							const r = rid.trim();
							if (!nonFolderIdSet.has(r)) continue;
							cur.surfaceTiles.forEach((t, j) => {
								if (!tileIdResolvesAsWidget(cur, t.id) && t.id === r) {
									removeIdx.add(j);
								}
							});
						}
						const childLayouts = [...removeIdx]
							.sort((a, b) => a - b)
							.map((i) => cur.surfaceTiles[i])
							.filter((t): t is NonNullable<typeof t> => Boolean(t))
							.map((t) => ({
								x: t.x,
								y: t.y,
								width: t.width,
								height: t.height,
							}));
						const minX =
							childLayouts.length > 0
								? Math.min(...childLayouts.map((l) => l.x))
								: 0;
						const minY =
							childLayouts.length > 0
								? Math.min(...childLayouts.map((l) => l.y))
								: 0;
						const maxRight =
							childLayouts.length > 0
								? Math.max(...childLayouts.map((l) => l.x + l.width))
								: minX + 1;
						const maxBottom =
							childLayouts.length > 0
								? Math.max(...childLayouts.map((l) => l.y + l.height))
								: minY + 1;
						const groupLayout = {
							x: minX,
							y: minY,
							width: maxRight - minX,
							height: maxBottom - minY,
						};
						// ADR-0006: settings read→merge→write inside the lock.
						const lockRoot = await resolvePersistenceLockRoot(window);
						if (!lockRoot) return;
						const nextPanelPresetIds = await withPersistenceLock(
							window,
							lockRoot,
							async () => {
								const settingsJson = await readSettings(window);
								const existingPanelPresetIds =
									readPanelPresetIdsFromSettingsJson(settingsJson, cur.panelId);
								const basePanelPresetIds =
									existingPanelPresetIds.length > 0
										? [...existingPanelPresetIds]
										: [];
								const nextPanelPresetIds = Array.from(
									new Set([
										...basePanelPresetIds.filter(
											(id) => !nonFolderIdSet.has(id),
										),
										groupId,
									]),
								);
								const merged = mergeGroupPresetLayoutIntoSettingsJson(
									settingsJson,
									{
										panelId: cur.panelId,
										presetIds: nextPanelPresetIds,
										groupId,
										groupLayout,
									},
								);
								await writeSettings(window, merged);
								return nextPanelPresetIds;
							},
						);
						const filteredTiles = cur.surfaceTiles.filter(
							(_, i) => !removeIdx.has(i),
						);
						const groupTile = {
							id: groupId,
							...groupLayout,
						};
						const nextTiles = [...filteredTiles, groupTile];
						const newGroupIndex = nextTiles.length - 1;
						commit({
							...cur,
							surfaceTiles: nextTiles,
							groupCatalogEntries: [
								...cur.groupCatalogEntries,
								{
									id: groupId,
									presetIds: nonFolderIds,
									title: groupName,
								},
							],
							panelPresetIds: nextPanelPresetIds,
							selectedSurfaceIndices: clipSelection(
								[newGroupIndex],
								nextTiles.length,
							),
							presetSelectedIds: [groupId],
							presetFocusId: groupId,
							openedGroupPresetId: groupId,
						});
						persistSurfaceState();
						void refreshPresets();
					})().catch((error) => {
						console.warn("[ty-plus] group selected presets failed", error);
					});
					return;
				}
				// ── Align widget ───────────────────────────────────────────────
				case CTX_MENU_IDS.alignTargetSelection: {
					updateAlignTargetCache("selection");
					window.dispatchEvent(
						new CustomEvent("ty-plus:align-target-changed", {
							detail: { target: "selection" },
						}),
					);
					return;
				}
				case CTX_MENU_IDS.alignTargetComp: {
					updateAlignTargetCache("comp");
					window.dispatchEvent(
						new CustomEvent("ty-plus:align-target-changed", {
							detail: { target: "comp" },
						}),
					);
					return;
				}
				case CTX_MENU_IDS.alignTargetKeyObject: {
					updateAlignTargetCache("key-object");
					window.dispatchEvent(
						new CustomEvent("ty-plus:align-target-changed", {
							detail: { target: "key-object" },
						}),
					);
					return;
				}
				case CTX_MENU_IDS.alignTargetTime: {
					updateAlignTargetCache("time");
					window.dispatchEvent(
						new CustomEvent("ty-plus:align-target-changed", {
							detail: { target: "time" },
						}),
					);
					return;
				}
				default: {
					if (
						typeof id === "string" &&
						id.startsWith(CTX_MENU_IDS.anchorPointPrefix)
					) {
						const pos = id.slice(CTX_MENU_IDS.anchorPointPrefix.length);
						window.dispatchEvent(
							new CustomEvent("ty-plus:anchor-point-context-menu", {
								detail: { id: `anchor-point:${pos}` },
							}),
						);
						return;
					}
					if (id.startsWith(CTX_MENU_IDS.alignActionPrefix)) {
						const action = id.slice(CTX_MENU_IDS.alignActionPrefix.length);
						window.dispatchEvent(
							new CustomEvent("ty-plus:align-context-command", {
								detail: { action },
							}),
						);
						return;
					}
					if (id.startsWith(CTX_MENU_IDS.movePresetsToPanelPrefix)) {
						const suffix = id.slice(
							CTX_MENU_IDS.movePresetsToPanelPrefix.length,
						);
						const n = Number(suffix);
						if (!Number.isFinite(n) || n < 1 || n > 5) return;
						const targetPanelId = `panel-${n}`;
						if (targetPanelId === cur.panelId) return;
						const clickedMoveToken: string | null = (() => {
							if (hit.zone === "preset-row") {
								return (hit.presetId ?? "").trim() || null;
							}
							if (hit.zone === "workspace-placement") {
								const idx = Number.parseInt(hit.id?.trim() ?? "", 10);
								const t = cur.surfaceTiles[idx];
								return t?.id?.trim() || null;
							}
							if (hit.zone === "directory-browser") {
								// Preset catalog rows move the PRESET to the target
								// panel's catalog placement (same semantics as
								// zone:"preset-row"). Body/chrome hits have no
								// entryKind and fall through to the widget tile.
								if (
									hit.entryKind === "preset" &&
									typeof hit.presetId === "string"
								) {
									const pid = hit.presetId.trim();
									if (pid) return pid;
								}
								const idx =
									typeof hit.placementId === "string"
										? Number.parseInt(hit.placementId.trim(), 10)
										: Number.NaN;
								const t =
									Number.isFinite(idx) && idx >= 0
										? cur.surfaceTiles[idx]
										: undefined;
								return t?.id?.trim() || null;
							}
							return null;
						})();
						if (!clickedMoveToken) return;
						const clickedIsWidget = tileIdResolvesAsWidget(
							cur,
							clickedMoveToken,
						);
						const selectedSameKind: string[] = [];
						if (clickedIsWidget) {
							for (const i of cur.selectedSurfaceIndices) {
								const t = cur.surfaceTiles[i];
								if (t && tileIdResolvesAsWidget(cur, t.id)) {
									selectedSameKind.push(t.id);
								}
							}
						} else {
							for (const i of cur.selectedSurfaceIndices) {
								const t = cur.surfaceTiles[i];
								if (t && !tileIdResolvesAsWidget(cur, t.id)) {
									selectedSameKind.push(t.id);
								}
							}
							for (const rid of cur.presetSelectedIds) {
								const r = rid.trim();
								if (r) selectedSameKind.push(r);
							}
						}
						const uniqueSelected = Array.from(new Set(selectedSameKind));
						const idsToMove = new Set<string>(
							uniqueSelected.includes(clickedMoveToken) &&
								uniqueSelected.length > 0
								? uniqueSelected
								: [clickedMoveToken],
						);
						const catalogIdsToMove = [...idsToMove].filter(
							(id) => !tileIdResolvesAsWidget(cur, id),
						);
						const widgetIdsToMove = [...idsToMove].filter((id) =>
							tileIdResolvesAsWidget(cur, id),
						);
						if (catalogIdsToMove.length === 0 && widgetIdsToMove.length === 0) {
							return;
						}
						void (async () => {
							const sourceFallbackPresetIds =
								cur.panelPresetIds.length === 0
									? cur.presets.map((p) => p.id)
									: [];
							const widgetTypesForCrossPanel: Record<string, string> = {};
							const widgetTilesForCrossPanel: Array<{
								id: string;
								width: number;
								height: number;
							}> = [];
							for (const wid of widgetIdsToMove) {
								const idx = cur.surfaceTiles.findIndex(
									(t) => t.id === wid && tileIdResolvesAsWidget(cur, t.id),
								);
								const t = idx >= 0 ? cur.surfaceTiles[idx] : undefined;
								if (!t) continue;
								const wt = cur.widgetInstanceTypes[wid];
								if (wt) widgetTypesForCrossPanel[wid] = wt;
								widgetTilesForCrossPanel.push({
									id: t.id,
									width: t.width,
									height: t.height,
								});
							}
							// Issue #146 / Defect A: source-state mutation MUST be
							// gated on a successful cross-panel write. If the target
							// write, the read-back verify, the source settings.json
							// write, OR the source workspace-N.json persistence fails,
							// the source panel keeps its preset — no silent data
							// loss.
							//
							// The atomicity chain is implemented inside
							// `applyInterPanelMove` and now spans BOTH the target and
							// the source panel files. The source layout persistence
							// (was previously fire-and-forget) is awaited as the
							// fourth step. The caller provides `persistSourceLayout`
							// to mutate the in-memory source state to the post-move
							// view AND flush `workspace-<source>.json` to disk; on
							// failure applyInterPanelMove rolls back the target,
							// the source `settings.json`, and (if needed) the source
							// layout via the inverse `restoreSourceLayout` callback
							// here.
							const curBefore = getState();
							const movedCatalog = new Set(catalogIdsToMove);
							const movedWidget = new Set(widgetIdsToMove);
							const computeMovedSurface = (
								source: SurfaceState,
							): SurfaceState => {
								const prevTiles = source.surfaceTiles;
								const nextSurfaceTiles = prevTiles.filter((t) => {
									if (movedCatalog.has(t.id)) return false;
									if (movedWidget.has(t.id)) return false;
									return true;
								});
								const nextWidgetInstanceTypes = {
									...source.widgetInstanceTypes,
								};
								for (const wid of movedWidget) {
									delete nextWidgetInstanceTypes[wid];
								}
								const nextSurfaceSel = remapSurfaceSelectionByPreservedTileIds(
									prevTiles,
									nextSurfaceTiles,
									source.selectedSurfaceIndices,
								);
								const movedAll = new Set([
									...catalogIdsToMove,
									...widgetIdsToMove,
								]);
								const nextPresetListSelected = (
									source.presetSelectedIds ?? []
								).filter((pid) => !movedAll.has(pid));
								const nextFocus =
									source.presetFocusId && !movedAll.has(source.presetFocusId)
										? source.presetFocusId
										: null;
								return {
									...source,
									surfaceTiles: nextSurfaceTiles,
									widgetInstanceTypes: nextWidgetInstanceTypes,
									selectedSurfaceIndices: nextSurfaceSel,
									presetSelectedIds: nextPresetListSelected,
									presetFocusId: nextFocus,
									panelPresetIds:
										source.panelPresetIds.length > 0
											? source.panelPresetIds.filter(
													(id) => !movedCatalog.has(id),
												)
											: (() => {
													const ids: string[] = [];
													for (const p of source.presets) {
														if (!movedCatalog.has(p.id)) ids.push(p.id);
													}
													return ids;
												})(),
								};
							};
							const nextSourceState = computeMovedSurface(curBefore);
							let inMemoryMutationCommitted = false;
							let moveCommitted = false;
							try {
								await applyInterPanelMove({
									win: window,
									persistenceRoot: persistenceRootAsOptional(
										lastPersistenceManagedRoot,
									),
									sourcePanelId: cur.panelId,
									targetPanelId,
									catalogIdsToMove,
									sourceFallbackPresetIds,
									widgetTilesForCrossPanel,
									widgetTypesForCrossPanel,
									presets: cur.presets,
									groupCatalogEntries: cur.groupCatalogEntries,
									widgetInstanceTypesOverlay: cur.widgetInstanceTypes,
									persistSourceLayout: async () => {
										// Mutate the source panel's in-memory state
										// to the post-move view THEN await the source
										// workspace-N.json flush. Atomicity gate for
										// step (4) — if either sub-step rejects,
										// applyInterPanelMove rolls back the disk
										// state and the caller rolls back the
										// in-memory state below.
										commit(nextSourceState);
										inMemoryMutationCommitted = true;
										await persistSurfaceStateAwaitable();
									},
									restoreSourceLayout: async () => {
										// Inverse of `persistSourceLayout`. Reverts
										// the source in-memory state to the pre-move
										// view AND re-flushes the source
										// workspace-N.json so the disk state matches
										// the pre-move in-memory state.
										commit(curBefore);
										inMemoryMutationCommitted = false;
										await persistSurfaceStateAwaitable();
									},
								});
								moveCommitted = true;
							} catch (error) {
								// applyInterPanelMove rolls back disk state on its
								// own. The in-memory state was mutated inside
								// `persistSourceLayout` BEFORE the throw — revert
								// it here so the source panel matches the
								// (rolled-back) disk state.
								if (inMemoryMutationCommitted) {
									try {
										commit(curBefore);
										inMemoryMutationCommitted = false;
									} catch (revertError) {
										console.warn(
											"[ty-plus] cross-panel move rollback: in-memory revert failed",
											revertError,
										);
									}
								}
								console.warn(
									"[ty-plus] cross-panel workspace move failed; source unchanged",
									error,
								);
							}
							if (!moveCommitted) {
								// Source state MUST remain unchanged on failure
								// (Issue #146). The UI surfaces the failure via the
								// `console.warn` above and the Debug Console
								// entry emitted from inside applyInterPanelMove.
								return;
							}
							void refreshPresets();
						})();
						return;
					}
					return;
				}
			}
		};

		// ── Attach context menu (F5) ───────────────────────────────────────────
		const unifiedCtxMenu = attachUnifiedWorkspaceContextMenu({
			root,
			getState,
			getCaps: () => ({
				canUndo: history.canUndo(),
				canRedo: history.canRedo(),
			}),
			hostCode,
			isCep,
			beforeOpenMenu: () => {
				hideCpMenu();
			},
			onSelect: handleUnifiedCtxSelect,
			getSavedSnapshots: () => snapshotsRef.current,
		});
		const detachUnifiedCtx = unifiedCtxMenu.detach;

		// ── Workspace events (F6) ──────────────────────────────────────────────
		const detachWorkspaceEvents = setupInteractionEvents(
			root,
			getState,
			(next) => {
				const prev = getState();
				const prevW = layoutsFromSurface(
					prev.surfaceTiles,
					widgetResolutionFromCatalogContext(prev),
				);
				const nextW = layoutsFromSurface(
					next.surfaceTiles,
					widgetResolutionFromCatalogContext(next),
				);
				let nextWidgetsSnapshot: string | null = null;
				if (JSON.stringify(nextW) !== JSON.stringify(prevW)) {
					nextWidgetsSnapshot = JSON.stringify(nextW);
				}
				const widgetsChanged =
					nextWidgetsSnapshot != null &&
					nextWidgetsSnapshot !== lastWidgetsSnapshot;
				commit(next);
				persistSurfaceState();
				if (widgetsChanged) {
					history.push(nextW);
					if (nextWidgetsSnapshot != null) {
						lastWidgetsSnapshot = nextWidgetsSnapshot;
					}
				}
				refreshSnapshotUi();
			},
			() => {
				commit({ ...getState() });
				persistSurfaceState();
				refreshSnapshotUi();
			},
			{
				hostCode,
				fileBrowser: fileBrowserService,
				importWorkspaceFile: (filePath) =>
					importFile(
						filePath,
						hostCode,
						hostExecutorForAlign as
							| ((
									method: string,
									args: unknown[],
							  ) => Promise<{ value?: unknown }>)
							| null,
					),
				executePreset,
				presentContextMenuAt: unifiedCtxMenu.presentContextMenuAt,
				// Direction A (Issue #86): drop preset tiles onto a group tile.
				onPresetDropToGroup: ({ groupPresetId, presetIds }): boolean => {
					const gid = groupPresetId.trim();
					if (!gid || !isCep) return false;
					const incoming = presetIds
						.map((id) => id.trim())
						.filter((id): id is string => id.length > 0);
					if (incoming.length === 0) return false;

					void (async () => {
						try {
							const curAtStart = getState();
							const target = curAtStart.groupCatalogEntries.find(
								(g) => g.id.trim() === gid,
							);
							if (!target) return;
							const merged = Array.from(
								new Set([
									...target.presetIds.map((id) => id.trim()),
									...incoming,
								]),
							);
							await upsertGroupEntry(window, {
								...target,
								presetIds: merged,
							});
							const groupCatalogText = await readGroupJson(window);
							const removedIds = new Set(incoming);
							const prevTiles = getState().surfaceTiles;
							const nextTiles = prevTiles.filter(
								(t) => !removedIds.has(t.id?.trim() ?? ""),
							);
							const nextSelected = remapSurfaceSelectionByPreservedTileIds(
								prevTiles,
								nextTiles,
								getState().selectedSurfaceIndices,
							);
							const nextPresetSel = getState().presetSelectedIds.filter(
								(id) => !removedIds.has(id),
							);
							const focusId = getState().presetFocusId;
							commit({
								...getState(),
								groupCatalogEntries: parseGroupFromText(groupCatalogText),
								surfaceTiles: nextTiles,
								selectedSurfaceIndices: nextSelected,
								presetSelectedIds: nextPresetSel,
								presetFocusId:
									focusId && !removedIds.has(focusId) ? focusId : null,
							});
							persistSurfaceState();
							void notifyPanelsAfterPresetSave(window, {
								sourceSurfaceId: curAtStart.panelId,
								catalogRefIds: incoming,
								isDeletion: true,
							});
						} catch (error) {
							console.warn("[ty-plus] add to group failed", error);
						}
					})();
					return true;
				},
				// Direction C (Issue #86): drag a group tile to workspace
				// background → dissolve the group, re-place its members.
				onGroupDrop: ({ groupId }): boolean => {
					const gid = groupId.trim();
					if (!gid || !isCep) return false;
					void (async () => {
						try {
							const dropPlacement = releaseDropPlacementFromState(
								getState(),
								gid,
							);
							await releaseGroupPreset(
								{ window, panelId },
								{ state: getState(), groupId: gid, dropPlacement },
							);
							const groupCatalogText = await readGroupJson(window);
							const prevTiles = getState().surfaceTiles;
							const nextTiles = prevTiles.filter((t) => t.id?.trim() !== gid);
							commit({
								...getState(),
								groupCatalogEntries: parseGroupFromText(groupCatalogText),
								surfaceTiles: nextTiles,
								selectedSurfaceIndices: remapSurfaceSelectionByPreservedTileIds(
									prevTiles,
									nextTiles,
									getState().selectedSurfaceIndices,
								),
								openedGroupPresetId:
									getState().openedGroupPresetId?.trim() === gid
										? null
										: getState().openedGroupPresetId,
							});
							persistSurfaceState();
							dispatchGroupWorkspaceRequest({ type: "release", groupId: gid });
						} catch (error) {
							console.warn("[ty-plus] onGroupDrop failed", error);
						}
					})();
					return true;
				},
			},
		);

		// ── Group/preset hover events ──────────────────────────────────────────
		const onGroupWorkspaceRequest = (ev: Event): void => {
			const detail = (ev as CustomEvent<GroupWorkspaceRequest>).detail;
			if (!detail) return;
			const gid = detail.groupId.trim();
			if (!gid) return;
			if (detail.type === "toggle-open") {
				const cur = getState();
				commit({
					...cur,
					openedGroupPresetId:
						cur.openedGroupPresetId?.trim() === gid ? null : gid,
				});
				return;
			}
			if (detail.type === "release") {
				// A peer panel released a group: refresh our catalog snapshot
				// and drop the row from any local layout (Issue #86).
				void (async () => {
					try {
						const groupCatalogText = await readGroupJson(window);
						const prevTiles = getState().surfaceTiles;
						const nextTiles = prevTiles.filter((t) => t.id?.trim() !== gid);
						commit({
							...getState(),
							groupCatalogEntries: parseGroupFromText(groupCatalogText),
							surfaceTiles: nextTiles,
							selectedSurfaceIndices: remapSurfaceSelectionByPreservedTileIds(
								prevTiles,
								nextTiles,
								getState().selectedSurfaceIndices,
							),
							openedGroupPresetId:
								getState().openedGroupPresetId?.trim() === gid
									? null
									: getState().openedGroupPresetId,
						});
						persistSurfaceState();
					} catch (error) {
						console.warn("[ty-plus] group release refresh failed", error);
					}
				})();
				return;
			}
		};
		window.addEventListener(GROUP_WORKSPACE_EVENT, onGroupWorkspaceRequest);

		const onWorkspacePresetHover = (ev: Event): void => {
			const detail = (ev as CustomEvent<WorkspacePresetHoverDetail>).detail;
			const nextHoverId =
				typeof detail?.presetId === "string" && detail.presetId.trim()
					? detail.presetId.trim()
					: null;
			const cur = getState();
			if (cur.presetHoverId === nextHoverId) return;
			commit(
				withPresetInfoSnapshot({
					...cur,
					presetHoverId: nextHoverId,
				}),
			);
		};
		window.addEventListener(PRESET_HOVER_EVENT, onWorkspacePresetHover);

		// ── Keyboard shortcuts (F7) ────────────────────────────────────────────
		const onKeyDown = (ev: KeyboardEvent): void => {
			if (isIMEComposing(ev)) return;
			if (ev.key === "Escape") {
				const active = document.activeElement;
				const isTextInput =
					active instanceof Element &&
					(active.tagName === "INPUT" ||
						active.tagName === "TEXTAREA" ||
						active.tagName === "SELECT" ||
						active.getAttribute("contenteditable") === "true");
				if (!isTextInput) {
					ev.preventDefault();
					const cur = getState();
					commit({
						...cur,
						selectedSurfaceIndices: [],
						presetSelectedIds: [],
						presetFocusId: null,
					});
					persistSurfaceState();
				}
				return;
			}
			if (ev.key === "`" && (ev.ctrlKey || ev.metaKey)) {
				ev.preventDefault();
				if (isCep) {
					openDebugConsole(window);
				} else {
					debugConsole?.toggle();
				}
				return;
			}
			if (!ev.ctrlKey && !ev.metaKey) return;
			if (ev.key === "z" && !ev.shiftKey) {
				ev.preventDefault();
				applyWidgets(history.undo());
			} else if (ev.key === "y" || (ev.key === "z" && ev.shiftKey)) {
				ev.preventDefault();
				applyWidgets(history.redo());
			}
			if (ev.key === "k") {
				ev.preventDefault();
				void clearLogs(window).catch(() => {});
			}
		};
		document.addEventListener("keydown", onKeyDown);

		const onActionClick = (ev: MouseEvent) => {
			const btn = (ev.target as HTMLElement).closest("[data-ws-action]");
			if (!btn) return;
			const action = btn.getAttribute("data-ws-action");
			if (!action) return;

			if (action === "undo") {
				ev.preventDefault();
				applyWidgets(history.undo());
			} else if (action === "redo") {
				ev.preventDefault();
				applyWidgets(history.redo());
			} else if (action === "save-snapshot") {
				ev.preventDefault();
				const cur = getState();
				void history
					.saveSnapshot(
						layoutsFromSurface(
							cur.surfaceTiles,
							widgetResolutionFromCatalogContext(cur),
						),
					)
					.then(() => {
						refreshSnapshotUi();
					})
					.catch(logSnapshotOpError("save"));
			} else if (action === "restore-snapshot") {
				ev.preventDefault();
				const id = btn.getAttribute("data-snap-id");
				if (id) {
					void history
						.restoreSnapshot(id)
						.then((allPanels) => {
							if (!allPanels) return;
							const cur = getState();
							const currentPanelId = cur.panelId;
							const currentPanelLayout = allPanels[currentPanelId];
							if (currentPanelLayout) {
								const result = applyWidgetsFromModule(currentPanelLayout, cur);
								if (result) {
									commit({ ...cur, ...result });
								}
							}
							// Write all panel layouts to disk
							const _persistenceRootArg =
								lastPersistenceManagedRoot ?? undefined;
							void (async () => {
								await Promise.all(
									Object.entries(allPanels).map(([panelId, layouts]) => {
										const idx = indexFromPanelId(panelId);
										const tiles = layouts.map((w) => ({
											id: w.id,
											x: w.x,
											y: w.y,
											width: w.width,
											height: w.height,
										}));
										return writeNJson(window, idx, serialize(tiles));
									}),
								);
								persistSurfaceState();
							})().catch(logSnapshotOpError("restore-write"));
						})
						.catch(logSnapshotOpError("restore"));
				}
			} else if (action === "delete-snapshot") {
				ev.preventDefault();
				const id = btn.getAttribute("data-snap-id");
				if (id) {
					void history
						.deleteSnapshot(id)
						.then(() => {
							refreshSnapshotUi();
						})
						.catch(logSnapshotOpError("delete"));
				}
			} else if (action === "open-dialog") {
				ev.preventDefault();
				const kind = btn.getAttribute("data-dialog-kind") as ToolDialogKind;
				if (kind) {
					requestOpenWorkspaceShellTool(
						kind,
						undefined,
						panelId,
						isCep,
						window,
					);
				}
			} else if (action === "open-preset-tool-dialog") {
				ev.preventDefault();
				const surfaceId = btn.getAttribute("data-preset-tool-surface");
				const params = btn.getAttribute("data-dialog-params");
				if (surfaceId) {
					openPresetToolSurface(
						surfaceId,
						params ? JSON.parse(params) : undefined,
					);
				}
			} else if (action === "easing-preset") {
				ev.preventDefault();
				const preset = btn.getAttribute("data-easing-preset");
				if (preset) {
					window.dispatchEvent(
						new CustomEvent("ty-plus:easing-context-command", {
							detail: { action: "preset", value: preset },
						}),
					);
				}
			} else if (action === "easing-copy-from-selection") {
				ev.preventDefault();
				window.dispatchEvent(
					new CustomEvent("ty-plus:easing-context-command", {
						detail: { action: "copy" },
					}),
				);
			} else if (action === "easing-reverse-curve") {
				ev.preventDefault();
				window.dispatchEvent(
					new CustomEvent("ty-plus:easing-context-command", {
						detail: { action: "reverse" },
					}),
				);
			} else if (action === "easing-apply-current") {
				ev.preventDefault();
				window.dispatchEvent(
					new CustomEvent("ty-plus:easing-context-command", {
						detail: { action: "apply" },
					}),
				);
			} else if (action === "run-preset") {
				ev.preventDefault();
				const id = btn.getAttribute("data-preset-id");
				if (!id) return;
				// Issue #130: if the boot-time asset scan flagged this preset
				// as `missing`, the underlying file is gone and the button
				// itself is `disabled`; the click should not reach here in
				// the normal flow, but the dispatch site is a safety net for
				// keyboard / programmatic invocations. `unverifiable` is NOT
				// blocked: the file may still exist, we just couldn't reach
				// the host to confirm.
				if (isPresetAssetMissing(id)) {
					setState({
						...getState(),
						statusMessage: "Preset asset is missing on disk — run is disabled.",
					});
					notificationStore.add(
						"Preset asset is missing on disk — run is disabled.",
						"warning",
						{ duration: 8000 },
					);
					return;
				}
				void getPreset(id).then((presetRecord) => {
					if (!presetRecord) return;
					void executePreset(presetRecord).catch((error) => {
						setState({
							...getState(),
							statusMessage: `Preset failed: ${
								error instanceof Error ? error.message : String(error)
							}`,
						});
					});
				});
			} else if (action === "toggle-console") {
				ev.preventDefault();
				if (isCep) openDebugConsole(window);
				else debugConsole?.toggle();
			} else {
				// Delegate all other `data-ws-action` values (ControlPanel buttons, etc.)
				// through handleUnifiedCtxSelect so they follow the same routing as the
				// context menu path (context menu → handleUnifiedCtxSelect →
				// applyControlPanelMenuAction / openPresetToolSurface, etc.)
				ev.preventDefault();
				handleUnifiedCtxSelect(action, { zone: "control-panel" });
			}
		};

		// The snapshots popover is portaled to `document.body` by
		// AnchoredPopover, so its restore/delete buttons live outside `root`.
		// Listen at document level but only admit clicks inside `root` or the
		// popover — portaled dialogs and widget surfaces keep their own
		// `data-ws-action` routing (Issue #223: snapshot restore was a no-op).
		const onDocumentActionClick = (ev: MouseEvent) => {
			const btn = (ev.target as HTMLElement).closest("[data-ws-action]");
			if (
				!btn ||
				!(root.contains(btn) || btn.closest("#statusbar-snapshots"))
			) {
				return;
			}
			onActionClick(ev);
		};

		// ── Document event listeners ───────────────────────────────────────────
		root.addEventListener("mousedown", onCpMiddleDown as EventListener, true);
		document.addEventListener("click", onDocumentActionClick as EventListener);
		document.addEventListener("mousemove", onDocMouseMove);
		document.addEventListener("mouseup", onDocMouseUp);
		document.addEventListener("mousedown", onDocMouseDownCloseMenu);

		// ── Cleanup ────────────────────────────────────────────────────────────
		const unload = (): void => {
			setLayoutReloadHandler(null);
			layoutSyncWatchDisposer?.();
			layoutSyncWatchDisposer = null;
			lastLayoutSyncWatchKey = "";
			unsubscribeThemeLive();
			unsubscribeSaveNotices();
			unsubscribeGridLive();
			unsubscribePresets();
			unsubscribeLayout();
			unsubscribeBackground();
			detachUnifiedCtx();
			detachWorkspaceEvents();
			window.removeEventListener(PRESET_HOVER_EVENT, onWorkspacePresetHover);
			window.removeEventListener(
				GROUP_WORKSPACE_EVENT,
				onGroupWorkspaceRequest,
			);
			debugConsole?.destroy();
			document.removeEventListener("keydown", onKeyDown);
			root.removeEventListener(
				"ty-plus-append-widget",
				onAppendWidgetFromOverlay as EventListener,
			);
			root.removeEventListener(
				"mousedown",
				onCpMiddleDown as EventListener,
				true,
			);
			document.removeEventListener("mousemove", onDocMouseMove);
			document.removeEventListener("mouseup", onDocMouseUp);
			document.removeEventListener("mousedown", onDocMouseDownCloseMenu);
			document.removeEventListener(
				"click",
				onDocumentActionClick as EventListener,
			);
			removeExternalPresetDialogListener?.();
			cpMenuEl?.remove();
			cpMenuEl = null;
		};

		window.addEventListener("unload", unload);
		return () => {
			window.removeEventListener("unload", unload);
			unload();
		};
	}, [root, panelSurfaceId]);

	const hostCode = detectCepHostCode();
	const hostCaller =
		hostCode === "AEFT" ? createCepHostExecutor(window, "after-effects") : null;
	return {
		state,
		ui: { ...ui, layoutRestore },
		addWidgetPickerOpen,
		closeAddWidgetPicker: () => setAddWidgetPickerOpen(false),
		executeWorkspacePreset,
		executePreset,
		hostCaller,
		// Restore path for a blocked layout (Issue #204): re-run the same
		// read the panel did at boot. A file that now parses opens the write
		// gate and clears the banner; one that still does not keeps both.
		retryLayoutRestore: () => reloadLayoutRef.current?.(),
	};
}
