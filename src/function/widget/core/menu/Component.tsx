import type { JSX, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { CTX_MENU_IDS } from "@/management/dialog/dialogs/unified-context-menu-constants";
import type { Layout } from "@/management/workspace/layout/grid-document";
import { catalogRefsForSurfaceIds } from "@/management/workspace/placement/resolve";
import { ATTR_WIDGET_INSTANCE_ID } from "@/management/workspace/placement/types";
import type { SurfaceState } from "@/management/workspace/state";
import { DATA_OPENER_WORKSPACE_PANEL } from "@/management/workspace/surface/opener-panel-id";
import { MenuIcon } from "@/management/workspace/surface/widget-grid-icons";
import { css } from "@/styled-system/css";

type Item = { action: string; label: string };

function MenuPanelContent({
	portalRef,
	panelClass,
	box,
	instanceAttr,
	openerPid,
	close,
	hasMultiPresetSelection,
	createPresetItems,
	dialogItems,
	layoutItems,
	movePanelItems,
	selectedPresetDeleteLabel,
	t,
}: {
	portalRef: React.RefObject<HTMLDivElement | null>;
	panelClass: string;
	box: { top: number; left: number; width: number };
	instanceAttr: Record<string, string>;
	openerPid: string;
	close: () => void;
	hasMultiPresetSelection: boolean;
	createPresetItems: readonly Item[];
	dialogItems: readonly Item[];
	layoutItems: readonly Item[];
	movePanelItems: readonly Item[];
	selectedPresetDeleteLabel: string;
	t: (key: string, options?: Record<string, unknown>) => string;
}): JSX.Element {
	return (
		<div
			ref={portalRef}
			className={panelClass}
			role="menu"
			style={{
				position: "fixed",
				top: box.top,
				left: box.left,
				minWidth: box.width,
				maxWidth: "calc(100vw - var(--ty-space-3))",
			}}
			onMouseDown={(ev) => ev.stopPropagation()}
			{...instanceAttr}
		>
			<Row
				action={CTX_MENU_IDS.undo}
				openerWorkspacePanelId={openerPid}
				onActivate={close}
			>
				{t("widgets:menu.undo")}
			</Row>
			<Row
				action={CTX_MENU_IDS.redo}
				openerWorkspacePanelId={openerPid}
				onActivate={close}
			>
				{t("widgets:menu.redo")}
			</Row>
			<div
				className={css({
					marginBlock: "var(--ty-space-1)",
					height: "1px",
					backgroundColor: "border.subtle",
				})}
				role="separator"
				tabIndex={0}
				aria-label="Menu section separator"
			/>
			{hasMultiPresetSelection ? (
				<>
					<Group
						title={t("widgets:menu.selectedPresets")}
						openerWorkspacePanelId={openerPid}
						onItemActivate={close}
						open
					>
						<Row
							action={CTX_MENU_IDS.groupSelectedPresets}
							openerWorkspacePanelId={openerPid}
							onActivate={close}
						>
							{t("widgets:menu.groupSelectedItems")}
						</Row>
						{movePanelItems.length > 0 ? (
							<Group
								title={t("widgets:menu.moveToPanel")}
								openerWorkspacePanelId={openerPid}
								nested={true}
							>
								{movePanelItems.map((item) => (
									<Row
										key={item.action}
										action={item.action}
										openerWorkspacePanelId={openerPid}
										onActivate={close}
									>
										{item.label}
									</Row>
								))}
							</Group>
						) : null}
						<Row
							action={CTX_MENU_IDS.deleteSelectedPresets}
							openerWorkspacePanelId={openerPid}
							onActivate={close}
						>
							{selectedPresetDeleteLabel}
						</Row>
					</Group>
					<div
						className={css({
							marginBlock: "var(--ty-space-1)",
							height: "1px",
							backgroundColor: "border.subtle",
						})}
						role="separator"
						tabIndex={0}
						aria-label="Menu section separator"
					/>
				</>
			) : null}
			<Group
				title={t("widgets:menu.layout")}
				items={layoutItems}
				openerWorkspacePanelId={openerPid}
				onItemActivate={close}
				open
			/>
			<div
				className={css({
					marginBlock: "var(--ty-space-1)",
					height: "1px",
					backgroundColor: "border.subtle",
				})}
				role="separator"
				tabIndex={0}
				aria-label="Menu section separator"
			/>
			<Row
				action={CTX_MENU_IDS.addWidget}
				openerWorkspacePanelId={openerPid}
				onActivate={close}
			>
				{t("widgets:menu.addWidget")}
			</Row>
			<Group
				title={t("widgets:menu.createPreset")}
				items={createPresetItems}
				openerWorkspacePanelId={openerPid}
				onItemActivate={close}
			/>
			<div
				className={css({
					marginBlock: "var(--ty-space-1)",
					height: "1px",
					backgroundColor: "border.subtle",
				})}
				role="separator"
				tabIndex={0}
				aria-label="Menu section separator"
			/>
			{dialogItems.map((item) => (
				<Row
					key={item.action}
					action={item.action}
					openerWorkspacePanelId={openerPid}
					onActivate={close}
				>
					{item.label}
				</Row>
			))}
		</div>
	);
}

function panelMoveLabel(panelId: string): string {
	const m = /^panel-(\d+)$/.exec(panelId.trim());
	return m ? `ty-plus ${m[1]}` : panelId;
}

function moveToPanelItems(currentPanelId: string): Item[] {
	const current = currentPanelId.trim();
	const items: Item[] = [];
	for (let n = 1; n <= 5; n++) {
		const pid = `panel-${n}`;
		if (pid === current) continue;
		items.push({
			action: `${CTX_MENU_IDS.movePresetsToPanelPrefix}${n}`,
			label: panelMoveLabel(pid),
		});
	}
	return items;
}

const panelClass = css({
	pointerEvents: "auto",
	zIndex: 100000,
	maxHeight: "min(70vh,26rem)",
	minWidth: "var(--ty-widget-icon-size)",
	overflowY: "auto",
	whiteSpace: "nowrap",
	borderRadius: "var(--ty-space-1)",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.dialog",
	paddingBlock: "var(--ty-space-1)",
});

const itemClass = css({
	display: "flex",
	width: "full",
	minWidth: 0,
	cursor: "pointer",
	alignItems: "center",
	paddingInline: "var(--ty-space-2)",
	paddingBlock: "var(--ty-space-1)",
	textAlign: "left",
	fontFamily: "inherit",
	fontSize: "text-2xs",
	color: "text.primary",
	_hover: { backgroundColor: "interactive.hover" },
});

const sepClass = css({
	marginBlock: "var(--ty-space-1)",
	height: "1px",
	backgroundColor: "border.subtle",
});

const groupSummaryClass = css({
	cursor: "pointer",
	listStyleType: "none",
	paddingInline: "var(--ty-space-2)",
	paddingBlock: "var(--ty-space-1)",
	fontSize: "text-2xs",
	fontWeight: "semibold",
	color: "text.muted",
});

/**
 * Inner container indent applied to genuinely nested submenu bodies.
 *
 * The `paddingLeft` only fires when `Group` is rendered as a child of another
 * menu row.  Top-level groups (siblings of plain `<Row>` items) must align
 * flush-left with the rest of the menu column.  See `Group` below for the
 * conditional application.
 */
const nestedSubmenuClass = css({ paddingLeft: "var(--ty-space-2)" });

export function MenuWidget({
	state,
	layout,
}: {
	state: SurfaceState;
	layout?: Layout;
}): JSX.Element {
	const { t } = useTranslation(["widgets", "presets"]);
	const gridRefs = catalogRefsForSurfaceIds(
		state,
		state.selectedSurfaceIndices.map(String),
	);
	const mergedPresetIds = useMemo(
		() =>
			Array.from(
				new Set([
					...gridRefs,
					...state.presetSelectedIds.flatMap((s: string) => {
						const trimmed = s.trim();
						return trimmed ? [trimmed] : [];
					}),
				]),
			),
		[gridRefs, state.presetSelectedIds],
	);
	const selectedPresetCount = mergedPresetIds.length;
	const hasMultiPresetSelection = selectedPresetCount > 1;
	const selectedPresetDeleteLabel = t("menu.deleteSelectedPresets", {
		count: selectedPresetCount,
	});
	const createPresetItems: Item[] = [
		{
			action: CTX_MENU_IDS.createFilePreset,
			label: t("presets:presetTool.localPreset"),
		},
		{
			action: CTX_MENU_IDS.createFolderPreset,
			label: t("presets:presetTool.groupPreset"),
		},
		{
			action: CTX_MENU_IDS.createAnimationPreset,
			label: t("presets:presetTool.animationLabel"),
		},
		{
			action: CTX_MENU_IDS.createLayerCompPreset,
			label: t("presets:presetTool.layerCompLabel"),
		},
		{
			action: CTX_MENU_IDS.createCodePreset,
			label: t("presets:presetTool.codeLabel"),
		},
	];
	const dialogItems: Item[] = [
		{ action: CTX_MENU_IDS.openPresets, label: t("presets:search.title") },
		{
			action: CTX_MENU_IDS.openPresetLibrary,
			label: t("presets:presetTool.presetLibrary"),
		},
		{
			action: CTX_MENU_IDS.openMessages,
			label: t("presets:presetTool.messages"),
		},
		{
			action: CTX_MENU_IDS.openSettings,
			label: t("presets:presetTool.settings"),
		},
		{
			action: CTX_MENU_IDS.openDebug,
			label: t("presets:presetTool.debugConsole"),
		},
	];
	const layoutItems: Item[] = [
		{ action: CTX_MENU_IDS.saveSnapshot, label: t("widgets:menu.saveLayout") },
		{ action: CTX_MENU_IDS.reloadPresets, label: t("widgets:menu.reload") },
		{
			action: CTX_MENU_IDS.toggleLayoutLock,
			label: state.layoutLocked
				? t("widgets:menu.unlockLayout")
				: t("widgets:menu.lockLayout"),
		},
		{
			action: CTX_MENU_IDS.packTopLeft,
			label: t("widgets:menu.packToTopLeft"),
		},
		{
			action: CTX_MENU_IDS.openBackground,
			label: t("widgets:menu.background"),
		},
	];
	const movePanelItems = moveToPanelItems(
		typeof state.panelId === "string" ? state.panelId : "",
	);

	const [open, setOpen] = useState(false);
	const [box, setBox] = useState({ top: 0, left: 0, width: 160 });
	const anchorRef = useRef<HTMLButtonElement>(null);
	const portalRef = useRef<HTMLDivElement>(null);

	const updatePosition = useCallback(() => {
		const el = anchorRef.current;
		if (!el) return;
		const r = el.getBoundingClientRect();
		setBox({
			top: r.bottom + 4,
			left: r.left,
			width: Math.max(r.width, 160),
		});
	}, []);

	const close = useCallback(() => {
		setOpen(false);
	}, []);

	useLayoutEffect(() => {
		if (open) {
			updatePosition();
		}
	}, [open, updatePosition]);

	const onToggle = useCallback(
		(ev: ReactMouseEvent<HTMLButtonElement>) => {
			ev.stopPropagation();
			ev.preventDefault();
			if (open) {
				close();
			} else {
				setOpen(true);
			}
		},
		[open, close],
	);

	useLayoutEffect(() => {
		if (!open) return;
		const onDocClick = (ev: MouseEvent) => {
			const root = anchorRef.current;
			const panelEl = portalRef.current;
			if (!root || !panelEl) return;
			if (
				root.contains(ev.target as Node) ||
				panelEl.contains(ev.target as Node)
			) {
				return;
			}
			close();
		};
		document.addEventListener("mousedown", onDocClick);
		return () => document.removeEventListener("mousedown", onDocClick);
	}, [open, close]);

	const widgetInstanceId = String(layout?.id ?? "").trim();
	const instanceAttr: Record<string, string> =
		widgetInstanceId !== ""
			? { [ATTR_WIDGET_INSTANCE_ID]: widgetInstanceId }
			: {};

	const openerPid =
		typeof state.panelId === "string" &&
		/^panel-[1-5]$/.test(state.panelId.trim())
			? state.panelId.trim()
			: "";

	const portalHost =
		typeof document !== "undefined"
			? (document.querySelector("[data-ty-workspace-panel-root]") ??
				document.body)
			: null;

	const panel =
		open && portalHost
			? createPortal(
					<MenuPanelContent
						portalRef={portalRef}
						panelClass={panelClass}
						box={box}
						instanceAttr={instanceAttr}
						openerPid={openerPid}
						close={close}
						hasMultiPresetSelection={hasMultiPresetSelection}
						createPresetItems={createPresetItems}
						dialogItems={dialogItems}
						layoutItems={layoutItems}
						movePanelItems={movePanelItems}
						selectedPresetDeleteLabel={selectedPresetDeleteLabel}
						t={t}
					/>,
					portalHost,
				)
			: null;

	return (
		<button
			ref={anchorRef}
			type="button"
			className={css({
				display: "flex",
				height: "full",
				width: "full",
				minHeight: 0,
				minWidth: 0,
				cursor: "pointer",
				alignItems: "center",
				justifyContent: "center",
				borderRadius: "var(--ty-space-1)",
				borderWidth: "1px",
				borderStyle: "solid",
				borderColor: "border.default",
				backgroundColor: "surface.panel",
				color: "text.muted",
				transitionProperty: "colors",
				transitionDuration: "100",
				_hover: {
					backgroundColor: "interactive.hover",
					color: "text.primary",
				},
			})}
			data-ws-action="open-widget-menu-context"
			title={t("widgets:menu.name")}
			aria-label={t("widgets:menu.name")}
			aria-expanded={open}
			aria-haspopup="menu"
			onClick={onToggle}
			{...instanceAttr}
		>
			<MenuIcon size={14} />
			{panel}
		</button>
	);
}

function Row({
	action,
	openerWorkspacePanelId,
	onActivate,
	children,
}: {
	action: string;
	openerWorkspacePanelId?: string;
	onActivate?: () => void;
	children: ReactNode;
}): JSX.Element {
	const openerAttr =
		openerWorkspacePanelId && /^panel-[1-5]$/.test(openerWorkspacePanelId)
			? { [DATA_OPENER_WORKSPACE_PANEL]: openerWorkspacePanelId }
			: {};
	return (
		<button
			type="button"
			className={itemClass}
			role="menuitem"
			data-ws-action={action}
			onClick={onActivate}
			{...openerAttr}
		>
			{children}
		</button>
	);
}

/**
 * `Group` is a collapsible details/summary menu row.
 *
 * The `nested` prop governs the inner container's left indent:
 *
 *   - `nested={true}`  — the group is a child of another menu row (e.g.
 *     `Move to Panel` inside the `Selected presets` group).  The inner
 *     body receives `paddingLeft: var(--ty-space-2)` so it visually nests.
 *   - `nested={false}` (default) — the group is a top-level sibling of plain
 *     `<Row>` items (e.g. `Layout`, `Create preset`).  The inner body has
 *     no extra left indent so it aligns flush-left with the rest of the
 *     menu column.
 *
 * The default is non-nested (false) so existing top-level call sites that
 * never set `nested` render correctly without forcing a prop change at
 * every site.  Truly-nested call sites must set `nested={true}` explicitly.
 */
export function Group({
	title,
	items,
	children,
	open,
	nested,
	openerWorkspacePanelId,
	onItemActivate,
}: {
	title: string;
	items?: readonly Item[];
	children?: ReactNode;
	open?: boolean;
	nested?: boolean;
	openerWorkspacePanelId?: string;
	onItemActivate?: () => void;
}): JSX.Element {
	const isNested = nested === true;
	return (
		<details className={css({ minWidth: 0 })} open={open}>
			<summary className={groupSummaryClass}>{title}</summary>
			<div
				className={isNested ? nestedSubmenuClass : undefined}
				data-menu-group-nested={isNested ? "true" : "false"}
			>
				{items?.map((item) => (
					<Row
						key={item.action}
						action={item.action}
						openerWorkspacePanelId={openerWorkspacePanelId}
						onActivate={onItemActivate}
					>
						{item.label}
					</Row>
				))}
				{children}
			</div>
		</details>
	);
}
