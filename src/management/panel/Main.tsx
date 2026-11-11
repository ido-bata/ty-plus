import type { ReactElement } from "react";
import { useCallback, useEffect, useState } from "react";
import { RuntimeProvider } from "@/function/widget/runtime-context";
import { StatusBar } from "@/management/panel/control/StatusBar";
import { Toolbar } from "@/management/panel/control/Toolbar";
import { LayoutRestoreBanner } from "@/management/panel/LayoutRestoreBanner";
import { SurfaceErrorBoundary } from "@/management/panel/surfaces/SurfaceErrorBoundary";
import type { Preset } from "@/management/preset/contract";
import { WorkspaceCatalogTileBody } from "@/management/preset/group/WorkspaceCatalogTileBody";
import { WorkspaceGroupLayer } from "@/management/preset/group/WorkspaceLayer";
import { AddWidgetPickerOverlay } from "@/management/widget/picker-overlay";
import { useWorkspaceRuntime } from "@/management/workspace/hook";
import {
	PanelStateProvider,
	SelectionProvider,
} from "@/management/workspace/state/PanelContext";
import { Grid } from "@/management/workspace/surface/Grid";
import type { CatalogTileBodyProps } from "@/management/workspace/surface/grid-catalog-tile-context";
import { GridCatalogTileBodyProvider } from "@/management/workspace/surface/grid-catalog-tile-context";
import { logWorkspaceGrid } from "@/management/workspace/surface/grid-log";
import { css } from "@/styled-system/css";

const panelRoot = css({
	height: "full",
	minHeight: "0",
	minWidth: "0",
	display: "flex",
	flex: "1",
	flexDirection: "column",
});

const gridStage = css({
	flex: "1",
	minHeight: "0",
	minWidth: "0",
	display: "flex",
	flexDirection: "column",
	overflow: "hidden",
	boxSizing: "border-box",
	backgroundColor: "var(--bg-app)",
});

const gridShell = css({
	position: "relative",
	flex: "1",
	minHeight: "0",
	minWidth: "0",
	overflow: "hidden",
	backgroundColor: "var(--bg-app)",
});

const toolbarSlot = css({
	height: "0",
	width: "full",
	flexShrink: 0,
	overflow: "visible",
});

export function Main(): ReactElement {
	const [mountEl, setMountEl] = useState<HTMLDivElement | null>(null);
	const [activeWidgetInstanceId, setActiveWidgetInstanceId] = useState<
		string | null
	>(null);
	const {
		state,
		ui,
		addWidgetPickerOpen,
		closeAddWidgetPicker,
		hostCaller,
		executePreset,
		retryLayoutRestore,
	} = useWorkspaceRuntime(mountEl);

	const mountAttached = mountEl !== null;
	const statePresent = state !== null;
	const panelId = state?.panelId;
	const surfaceTileCount = state?.surfaceTiles.length ?? 0;

	const renderCatalogTileBody = useCallback(
		(p: CatalogTileBodyProps) => <WorkspaceCatalogTileBody {...p} />,
		[],
	);

	const handleRunPreset = useCallback(
		(preset: Preset) => {
			void executePreset(preset);
		},
		[executePreset],
	);

	useEffect(() => {
		logWorkspaceGrid("panelMain:frame", {
			mountEl: mountAttached ? "attached" : "null",
			hasWorkspaceState: statePresent,
			panelId,
			surfaceTileCount: statePresent ? surfaceTileCount : 0,
			...(mountAttached && !statePresent
				? {
						note: "ref attached before workspace setState flush (expected one frame)",
					}
				: {}),
		});
	}, [mountAttached, panelId, statePresent, surfaceTileCount]);

	return (
		<div ref={setMountEl} data-ty-workspace-panel-root className={panelRoot}>
			{ui.layoutRestore ? (
				<SurfaceErrorBoundary surface="layout-restore-banner">
					<LayoutRestoreBanner
						notice={ui.layoutRestore}
						onRetry={retryLayoutRestore}
					/>
				</SurfaceErrorBoundary>
			) : null}
			{state ? (
				<RuntimeProvider
					value={
						hostCaller
							? {
									host: hostCaller,
									activeWidgetInstanceId,
									setActiveWidgetInstanceId,
								}
							: null
					}
				>
					<SelectionProvider
						selectedSurfaceIndices={state.selectedSurfaceIndices}
					>
						<PanelStateProvider state={state}>
							<GridCatalogTileBodyProvider render={renderCatalogTileBody}>
								<div className={gridStage}>
									<div className={gridShell}>
										<SurfaceErrorBoundary surface="workspace-grid">
											<Grid />
										</SurfaceErrorBoundary>
										<SurfaceErrorBoundary surface="workspace-group-layer">
											<WorkspaceGroupLayer
												panelRoot={mountEl}
												onRunPreset={handleRunPreset}
											/>
										</SurfaceErrorBoundary>
									</div>
								</div>
							</GridCatalogTileBodyProvider>
							{/* `fixed` toolbar must not reserve flex row height above the status bar */}
							<div className={toolbarSlot}>
								<SurfaceErrorBoundary surface="toolbar">
									<Toolbar panelId={state.panelId} />
								</SurfaceErrorBoundary>
							</div>
							{state.panelId === "panel-1" ? (
								<SurfaceErrorBoundary surface="status-bar">
									<StatusBar
										state={state}
										canUndo={ui.canUndo}
										canRedo={ui.canRedo}
										snapshots={ui.snapshots}
									/>
								</SurfaceErrorBoundary>
							) : null}
							{addWidgetPickerOpen && mountEl ? (
								<SurfaceErrorBoundary surface="add-widget-picker">
									<AddWidgetPickerOverlay
										eventRoot={mountEl}
										panelId={state.panelId}
										onClose={closeAddWidgetPicker}
									/>
								</SurfaceErrorBoundary>
							) : null}
						</PanelStateProvider>
					</SelectionProvider>
				</RuntimeProvider>
			) : null}
		</div>
	);
}
