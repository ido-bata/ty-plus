import {
	type JSX,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { WidgetType } from "@/function/widget";
import { useCep } from "@/management/ae/cep/contexts/Context";
import { createCepSurfaceTransport } from "@/management/ae/cep/transport";
import { createLogger } from "@/management/debug";
import { DialogShell } from "@/management/dialog";
import {
	type CepMenuPayload,
	registerCepJsonContextMenuSurface,
} from "@/management/dialog/dialogs/context-menu";
import { useDialogClose } from "@/management/dialog/useClose";
import { AddWidgetCatalogPanel } from "@/management/widget/catalog";
import { defaultFirstWidgetType } from "@/management/widget/default-first-widget-type";
import { publishShellMessage } from "@/management/workspace/messaging/publish-shell-message";
import { persistAppendWidgetFromDialog } from "@/management/workspace/placement/append-widget-from-dialog-disk";
import type { LayoutPayload } from "@/management/workspace/surface/contract";
import { SHELL_CHANNELS } from "@/management/workspace/surface/contract";
import {
	awaitOpenerWorkspacePanelIdFromCep,
	resolveOpenerWorkspacePanelId,
} from "@/management/workspace/surface/opener-panel-id";
import { Button } from "@/shared/component/controls/Button";
import { css } from "@/styled-system/css";

const DIALOG_SURFACE_ID = "dialog-widget-selector" as const;
const workspaceLog = createLogger("workspace");
const WIDGET_SELECTOR_CTX = {
	addSelected: "ty.ctx.widget-selector.add-selected",
	cancel: "ty.ctx.widget-selector.cancel",
	clearSearch: "ty.ctx.widget-selector.clear-search",
	selectPrefix: "ty.ctx.widget-selector.select:",
	addPrefix: "ty.ctx.widget-selector.add:",
} as const;

const contentClassName = css({
	display: "flex",
	minHeight: 0,
	minWidth: 0,
	flexDirection: "column",
	overflow: "hidden",
	backgroundColor: "surface.dialog",
	padding: "0",
});

const footerClassName = css({
	borderTopWidth: "1px",
	borderTopStyle: "solid",
	borderTopColor: "border.default",
	paddingInline: "var(--ty-shell-pad-inline)",
	paddingTop: "3",
	paddingBottom: "3",
});

const footerRowStyle = css({
	display: "grid",
	width: "full",
	gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
	alignItems: "center",
	gap: "2",
});

const footerHintStyle = css({
	minWidth: 0,
	fontSize: "shell-text-xs",
	lineHeight: "snug",
	color: "text.muted",
});

const footerPanelStyle = css({
	fontFamily: "mono",
	color: "text.primary",
});

const catalogClass = css({
	minHeight: 0,
	flex: "1",
	paddingInline: "var(--ty-shell-pad-inline)",
	paddingBlock: "3",
});

const catalogIntroStyle = css({
	flexShrink: 0,
	fontSize: "shell-text-sm",
	lineHeight: "snug",
	color: "text.muted",
});

const catalogIntroPanelStyle = css({
	fontFamily: "mono",
	color: "text.primary",
});

const footerErrorStyle = css({
	minWidth: 0,
	marginBottom: "2",
	fontSize: "shell-text-xs",
	lineHeight: "snug",
	color: "status.error",
});

export function AddWidgetDialog(): JSX.Element {
	const transport = useMemo(() => createCepSurfaceTransport(window), []);
	const { close } = useDialogClose({});
	const cep = useCep();
	const [targetPanelId, setTargetPanelId] = useState(() => {
		const fromCtx = cep.openerWorkspacePanelId?.trim() ?? "";
		if (/^panel-[1-5]$/.test(fromCtx)) {
			return fromCtx;
		}
		return resolveOpenerWorkspacePanelId(window);
	});

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			const resolved = await awaitOpenerWorkspacePanelIdFromCep(window);
			if (!cancelled) {
				setTargetPanelId(resolved);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const bodyRef = useRef<HTMLDivElement>(null);
	const [query, setQuery] = useState("");
	const [selectedType, setSelectedType] = useState<WidgetType | null>(
		defaultFirstWidgetType,
	);
	const [busy, setBusy] = useState(false);
	const [addFailure, setAddFailure] = useState<string | null>(null);

	const addForType = useCallback(
		async (type: WidgetType) => {
			if (busy) return;
			setBusy(true);
			setAddFailure(null);
			// One reset for every exit path. Clearing `busy` on the success path
			// only is how a failed add leaves the dialog permanently disabled
			// with no way back short of closing it.
			try {
				// Issue #159: disk persistence is the only durability for widget
				// creation. A modeless `surfaceMessage` is a refresh hint, never
				// a substitute — the old `addWidget` bus fallback silently
				// dropped the add whenever the disk write reported failure.
				const result = await persistAppendWidgetFromDialog(window, {
					targetPanelId,
					widgetType: type,
				});
				if (!result.ok) {
					setAddFailure(`Could not add the widget: ${result.message}`);
					return;
				}
				const layoutPayload: LayoutPayload = {
					kind: "reloadWorkspaceLayoutFromStorage",
					sourceSurfaceId: DIALOG_SURFACE_ID,
					panelIds: [targetPanelId],
				};
				try {
					await publishShellMessage(transport, {
						channel: SHELL_CHANNELS.layout,
						kind: "publish",
						sourceSurfaceId: DIALOG_SURFACE_ID,
						payload: layoutPayload,
					});
				} catch (error) {
					// The widget is already on disk. The layout file watcher /
					// panel reload still shows it, so a failed refresh hint is
					// not an add failure.
					workspaceLog.warn("add-dialog:layout-refresh-hint-failed", {
						context: {
							step: "publishShellMessage",
							targetPanelId,
							widgetId: result.widgetId,
							message: error instanceof Error ? error.message : String(error),
						},
					});
				}
				close();
			} finally {
				setBusy(false);
			}
		},
		[busy, close, targetPanelId, transport],
	);

	useEffect(() => {
		const buildPayload = (event: MouseEvent): CepMenuPayload | null => {
			const target = event.target instanceof Element ? event.target : null;
			if (!target?.closest(`[data-surface-id="${DIALOG_SURFACE_ID}"]`)) {
				return null;
			}
			const widgetButton = target.closest("[data-add-widget-type]");
			const hitType = widgetButton?.getAttribute("data-add-widget-type") ?? "";
			const hitCategory =
				widgetButton?.getAttribute("data-add-widget-category") ?? "";
			if (hitType) {
				const isSelected = selectedType === hitType;
				return {
					menu: [
						{
							id: `${WIDGET_SELECTOR_CTX.addPrefix}${hitType}`,
							label: "Add this widget",
							enabled: !busy,
						},
						{
							id: `${WIDGET_SELECTOR_CTX.selectPrefix}${hitType}`,
							label: "Select",
							checkable: true,
							checked: isSelected,
						},
						{ label: "---" },
						{
							id: "ty.ctx.widget-selector.category",
							label: "Category",
							menu: [
								{
									id: "ty.ctx.widget-selector.category.current",
									label: hitCategory || "Unknown",
									enabled: false,
									checkable: true,
									checked: true,
								},
							],
						},
						{ label: "---" },
						{ id: WIDGET_SELECTOR_CTX.cancel, label: "Cancel" },
					],
				};
			}
			const search = target.closest("[data-add-widget-search]");
			if (search) {
				return {
					menu: [
						{
							id: WIDGET_SELECTOR_CTX.clearSearch,
							label: "Clear search",
							enabled: query.length > 0,
						},
						{ label: "---" },
						{
							id: WIDGET_SELECTOR_CTX.addSelected,
							label: "Add selected widget",
							enabled: Boolean(selectedType) && !busy,
						},
						{ id: WIDGET_SELECTOR_CTX.cancel, label: "Cancel" },
					],
				};
			}
			return {
				menu: [
					{
						id: WIDGET_SELECTOR_CTX.addSelected,
						label: "Add selected widget",
						enabled: Boolean(selectedType) && !busy,
					},
					{
						id: WIDGET_SELECTOR_CTX.clearSearch,
						label: "Clear search",
						enabled: query.length > 0,
					},
					{ label: "---" },
					{ id: WIDGET_SELECTOR_CTX.cancel, label: "Cancel" },
				],
			};
		};
		const onMenuSelect = (menuId: string): void => {
			if (menuId === WIDGET_SELECTOR_CTX.cancel) {
				close();
				return;
			}
			if (menuId === WIDGET_SELECTOR_CTX.clearSearch) {
				setQuery("");
				return;
			}
			if (menuId === WIDGET_SELECTOR_CTX.addSelected && selectedType) {
				void addForType(selectedType);
				return;
			}
			if (menuId.startsWith(WIDGET_SELECTOR_CTX.selectPrefix)) {
				setSelectedType(
					menuId.slice(WIDGET_SELECTOR_CTX.selectPrefix.length) as WidgetType,
				);
				return;
			}
			if (menuId.startsWith(WIDGET_SELECTOR_CTX.addPrefix)) {
				void addForType(
					menuId.slice(WIDGET_SELECTOR_CTX.addPrefix.length) as WidgetType,
				);
				return;
			}
		};
		return registerCepJsonContextMenuSurface(DIALOG_SURFACE_ID, {
			buildPayload,
			onMenuSelect,
		});
	}, [addForType, busy, close, query.length, selectedType]);

	return (
		<DialogShell
			surfaceId={DIALOG_SURFACE_ID}
			title="Add widget"
			headerMeta={targetPanelId}
			contentClassName={contentClassName}
			footerClassName={footerClassName}
			footer={
				<div>
					{addFailure ? (
						<p className={footerErrorStyle} role="alert">
							{addFailure}
						</p>
					) : null}
					<div className={footerRowStyle}>
						<p className={footerHintStyle}>
							Adds to <span className={footerPanelStyle}>{targetPanelId}</span>{" "}
							at the bottom of the grid.
						</p>
						<Button
							variant="default"
							uiSize="sm"
							type="button"
							fullWidth
							onClick={() => close()}
						>
							Cancel
						</Button>
						<Button
							variant="primary"
							uiSize="sm"
							type="button"
							fullWidth
							disabled={!selectedType || busy}
							onClick={() => {
								if (selectedType) void addForType(selectedType);
							}}
						>
							{busy ? "Adding…" : "Add"}
						</Button>
					</div>
				</div>
			}
		>
			<AddWidgetCatalogPanel
				containerRef={bodyRef}
				className={catalogClass}
				intro={
					<p className={catalogIntroStyle}>
						Choose a widget type. Only kinds that are available in the catalog
						are listed. New tiles go to{" "}
						<span className={catalogIntroPanelStyle}>{targetPanelId}</span>.
					</p>
				}
				query={query}
				onQueryChange={setQuery}
				selectedType={selectedType}
				onSelectType={setSelectedType}
				onActivateType={(t: WidgetType) => void addForType(t)}
				onRequestClose={() => close()}
				keyboardEnabled
			/>
		</DialogShell>
	);
}
