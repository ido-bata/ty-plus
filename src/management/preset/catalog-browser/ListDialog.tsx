import {
	ArrowLeft,
	ChevronDown,
	ChevronRight,
	Folder,
	LoaderCircle,
	Pencil,
	Play,
	RefreshCw,
	Search,
	Trash2,
} from "lucide-react";
import {
	type CSSProperties,
	type JSX,
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useReducer,
	useRef,
	useState,
} from "react";
import { detectCepHostCode } from "@/management/ae/cep/runtime";
import { readGroupJson } from "@/management/catalog/json-files";
import { DialogShell } from "@/management/dialog";
import type { CepMenuPayload } from "@/management/dialog/dialogs/context-menu";
import { registerCepJsonContextMenuSurface } from "@/management/dialog/dialogs/context-menu";
import type { ShellProps } from "@/management/dialog/dialogs/shell/Layout";
import { useDialogClose } from "@/management/dialog/useClose";
import { useGatewayHealth } from "@/management/online/runtime-gateway-health";
import { resolvePresetToolSurfaceIdForPreset } from "@/management/preset/authoring/request";
import {
	ICON_CELL_BASE_REM,
	ICON_GRID_CLASS,
	ICON_GRID_SCALE_LS_KEY,
	ICON_TILE_ASPECT_LS_KEY,
	type IconTileAspect,
	iconTileMediaClass,
	LIST_ROW_GRID,
} from "@/management/preset/catalog-browser/layout";
import { CatalogBrowserShell } from "@/management/preset/catalog-browser/shell";
import { CatalogBrowserViewModeToggle } from "@/management/preset/catalog-browser/view-mode-toggle";
import { buildPlacementHints } from "@/management/preset/catalog-browser/workspace-placement-hints";
import type { Preset } from "@/management/preset/contract";
import { traceExecute } from "@/management/preset/execution/lifecycle-trace";
import type { GroupEntry } from "@/management/preset/group-catalog";
import { parseGroupFromText } from "@/management/preset/group-catalog";
import { tryParsePresetIconValue } from "@/management/preset/icon-data";
import { getPresetToolDialogEntry } from "@/management/preset/registry";
import {
	getPreset,
	listPresets,
	removeLocalPreset,
} from "@/management/preset/use-cases";
import { PresetGlyphById } from "@/management/preset/workspace/glyph";
import { stripKnownIdPrefixes } from "@/management/storage/ids";
import { readSettings } from "@/management/storage/workspace/store";
import { openPresetEditSurface } from "@/management/workspace/hooks/preset";
import { executeWorkspacePresetForWindow } from "@/management/workspace/runtime";
import { Icon, IconButton } from "@/shared/component";
import { SearchField } from "@/shared/component/fields/SearchField";
import { useCatalogViewMode } from "@/shared/util/catalog-view-mode";
import { cx } from "@/shared/util/cx";
import { useIconGridScale } from "@/shared/util/icon-grid-scale";
import { isIMEComposing } from "@/shared/util/keyboard";
import { useTileAspect } from "@/shared/util/tile-aspect";
import { css } from "@/styled-system/css";

const folderGlyphClass = css({
	display: "flex",
	height: "7",
	width: "7",
	flexShrink: "0",
	alignItems: "center",
	justifyContent: "center",
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.widget",
	color: "text.muted",
});

const folderIconClass = css({
	height: "3.5",
	width: "3.5",
});

const searchFieldClass = css({
	height: "8",
	minHeight: "8",
	flex: "1",
	paddingBlock: "0",
});

const tinyAct = css({
	display: "inline-flex",
	height: "5",
	width: "5",
	flexShrink: "0",
	alignItems: "center",
	justifyContent: "center",
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.widget/50",
	color: "text.muted",
	_hover: {
		backgroundColor: "interactive.hover",
		color: "text.primary",
	},
});

const actionsRowClass = css({
	display: "flex",
	flexShrink: "0",
	alignItems: "center",
	gap: "0.5",
});

const loadingRowClass = css({
	display: "inline-flex",
	minWidth: "0",
	alignItems: "center",
	gap: "1",
	overflow: "hidden",
	textOverflow: "ellipsis",
	whiteSpace: "nowrap",
});

const loadingIconClass = css({
	height: "3",
	width: "3",
	flexShrink: "0",
	animation: "spin",
});

const loadingLabelClass = css({
	overflow: "hidden",
	textOverflow: "ellipsis",
	whiteSpace: "nowrap",
});

const errorLabelClass = css({
	overflow: "hidden",
	textOverflow: "ellipsis",
	whiteSpace: "nowrap",
	color: "red.400",
});

const streamingRowClass = css({
	display: "inline-flex",
	minWidth: "0",
	maxWidth: "full",
	alignItems: "center",
	gap: "1.5",
	overflow: "hidden",
	textOverflow: "ellipsis",
	whiteSpace: "nowrap",
});

const progressTrackClass = css({
	display: "inline-block",
	height: "1",
	width: "10",
	flexShrink: "0",
	overflow: "hidden",
	borderRadius: "full",
	backgroundColor: "border.default",
});

const progressBarClass = css({
	display: "block",
	height: "full",
	borderRadius: "full",
	backgroundColor: "interactive.focus",
	transitionProperty: "width",
	transitionDuration: "200",
});

const countClass = css({
	flexShrink: "0",
	fontVariantNumeric: "tabular-nums",
});

const presetRowClass = css({
	backgroundColor: "surface.dialog",
	paddingInline: "2",
	paddingBlock: "1.5",
	_hover: {
		backgroundColor: "interactive.hover",
	},
});

const presetRowSpacerClass = css({
	minHeight: "px",
});

const presetRowCenterClass = css({
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
});

const presetRowTitleClass = css({
	overflow: "hidden",
	textOverflow: "ellipsis",
	whiteSpace: "nowrap",
	fontSize: "shell-text-sm",
	fontWeight: "medium",
	color: "text.primary",
});

const presetRowMetaClass = css({
	display: "flex",
	minWidth: "0",
	gap: "2",
	fontSize: "xs",
	color: "text.muted",
	whiteSpace: "nowrap",
});

const presetRowSourceClass = css({
	minWidth: "0",
	flex: "1",
	overflow: "hidden",
	textOverflow: "ellipsis",
	whiteSpace: "nowrap",
});

const presetRowWorkspaceClass = css({
	flexShrink: "0",
	maxWidth: "50%",
	overflow: "hidden",
	textOverflow: "ellipsis",
	whiteSpace: "nowrap",
});

const presetRowTitleMinWidthClass = css({
	minWidth: "0",
});

const groupRowClass = css({
	backgroundColor: "surface.dialog",
});

const groupRowTopClass = css({
	paddingInline: "2",
	paddingBlock: "1.5",
	_hover: {
		backgroundColor: "interactive.hover",
	},
});

const groupToggleButtonClass = css({
	display: "inline-flex",
	borderRadius: "shell-sm",
	padding: "0.5",
	color: "text.muted",
	_hover: {
		backgroundColor: "surface.widget",
		color: "text.primary",
	},
});

const groupToggleIconClass = css({
	transitionProperty: "transform",
});

const groupRowCenterClass = css({
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
});

const groupTitleButtonClass = css({
	minWidth: "0",
	borderWidth: "0",
	backgroundColor: "transparent",
	padding: "0",
	textAlign: "left",
	font: "inherit",
	boxShadow: "none",
	outline: "none",
	color: "text.muted",
	_hover: {
		color: "text.primary",
	},
	_focusVisible: {
		boxShadow: "0 0 0 2px var(--colors-interactive-focus)",
	},
});

const groupTitleClass = css({
	overflow: "hidden",
	textOverflow: "ellipsis",
	whiteSpace: "nowrap",
	fontSize: "shell-text-sm",
	fontWeight: "medium",
	color: "text.primary",
});

const groupSubtitleClass = css({
	overflow: "hidden",
	textOverflow: "ellipsis",
	whiteSpace: "nowrap",
	fontSize: "xs",
	color: "text.muted",
});

const groupSubtitleDividerClass = css({
	marginInline: "1.5",
	color: "border.default",
});

const groupMembersListClass = css({
	borderTopWidth: "1px",
	borderTopStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.widget/15",
});

const treeListClass = css({
	display: "flex",
	flexDirection: "column",
	overflow: "hidden",
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	"& > li + li": {
		borderTopWidth: "1px",
		borderTopStyle: "solid",
		borderColor: "border.default",
	},
});

const iconNavigateUpButtonClass = css({
	display: "flex",
	width: "full",
	minWidth: "0",
	flexDirection: "column",
	alignItems: "stretch",
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "dashed",
	borderColor: "border.default",
	backgroundColor: "surface.dialog",
	padding: "1",
	textAlign: "left",
	outline: "none",
	_hover: {
		backgroundColor: "interactive.hover",
	},
	_focusVisible: {
		boxShadow: "0 0 0 2px var(--colors-interactive-focus)",
	},
});

const iconNavigateUpMediaClass = css({
	overflow: "hidden",
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.widget/70",
});

const iconNavigateUpInnerClass = css({
	display: "flex",
	height: "full",
	width: "full",
	alignItems: "center",
	justifyContent: "center",
	color: "text.muted",
});

const iconNavigateUpTitleClass = css({
	marginTop: "0.5",
	minWidth: "0",
	paddingInline: "0.5",
});

const iconNavigateUpTitleTextClass = css({
	overflow: "hidden",
	textOverflow: "ellipsis",
	whiteSpace: "nowrap",
	textAlign: "left",
	fontSize: "shell-text-sm",
	fontWeight: "medium",
	lineHeight: "tight",
	color: "text.primary",
});

// The PandaCSS `_groupHover` recipe compiles to `.group:is(:hover, [data-hover]) .<child>`.
// The Tailwind-era `IconCatalogGroupCard` outer `<div>` carried the literal `group` class;
// the PandaCSS migration dropped it, which left Edit/Delete actions permanently hidden
// (`opacity: 0` + `pointer-events: none`). Re-add the marker so the descendant rules fire.
const iconGroupCardClass = cx(
	"group",
	css({
		display: "flex",
		width: "full",
		minWidth: "0",
		flexDirection: "column",
		alignItems: "stretch",
		borderRadius: "shell-sm",
		borderWidth: "1px",
		borderStyle: "solid",
		borderColor: "border.default",
		backgroundColor: "surface.dialog",
		padding: "1",
		outline: "none",
		_hover: {
			backgroundColor: "interactive.hover",
		},
	}),
);

const iconGroupMediaWrapperClass = css({
	position: "relative",
	width: "full",
});

const iconGroupButtonClass = css({
	overflow: "hidden",
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.widget",
	outline: "none",
});

const iconGroupButtonInnerClass = css({
	display: "flex",
	height: "full",
	width: "full",
	alignItems: "center",
	justifyContent: "center",
	transform: "scale(1.1)",
});

const iconGroupBadgeClass = css({
	pointerEvents: "none",
	position: "absolute",
	top: "0.5",
	right: "0.5",
	zIndex: "1",
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.dialog/95",
	paddingInline: "1",
	paddingBlock: "px",
	fontSize: "2xs",
	lineHeight: "1",
	fontWeight: "medium",
	fontVariantNumeric: "tabular-nums",
	color: "text.muted",
	boxShadow: "sm",
});

const iconGroupTitleWrapperClass = css({
	position: "relative",
	marginTop: "0.5",
	paddingInline: "0.5",
});

const iconGroupTitleClass = css({
	overflow: "hidden",
	textOverflow: "ellipsis",
	whiteSpace: "nowrap",
	textAlign: "left",
	fontSize: "shell-text-sm",
	fontWeight: "medium",
	lineHeight: "tight",
	color: "text.primary",
});

const iconGroupActionsClass = css({
	pointerEvents: "none",
	position: "absolute",
	insetX: "0",
	top: "0",
	display: "flex",
	justifyContent: "flex-end",
	gap: "0.5",
	opacity: "0",
	transitionProperty: "opacity",
	_groupHover: {
		pointerEvents: "auto",
		opacity: "1",
	},
});

// Same `group` marker requirement as `iconGroupCardClass` — the Tailwind-era
// `IconPresetCard` outer `<div>` carried `className="group …"`, and the PandaCSS
// migration dropped it, leaving Edit/Delete unreachable on hover.
const iconPresetCardClass = cx(
	"group",
	css({
		display: "flex",
		width: "full",
		minWidth: "0",
		flexDirection: "column",
		alignItems: "stretch",
		borderRadius: "shell-sm",
		borderWidth: "1px",
		borderStyle: "solid",
		borderColor: "border.default",
		backgroundColor: "surface.dialog",
		padding: "1",
		outline: "none",
		_hover: {
			backgroundColor: "interactive.hover",
		},
	}),
);

const iconPresetButtonClass = css({
	overflow: "hidden",
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.widget",
});

const iconPresetButtonInnerClass = css({
	display: "flex",
	height: "full",
	width: "full",
	alignItems: "center",
	justifyContent: "center",
	padding: "0.5",
});

const iconPresetTitleWrapperClass = css({
	position: "relative",
	marginTop: "0.5",
	paddingInline: "0.5",
});

const iconPresetTitleClass = css({
	overflow: "hidden",
	textOverflow: "ellipsis",
	whiteSpace: "nowrap",
	textAlign: "left",
	fontSize: "shell-text-sm",
	fontWeight: "medium",
	lineHeight: "tight",
	color: "text.primary",
});

const headerRowClass = css({
	display: "flex",
	minHeight: "8",
	minWidth: "0",
	alignItems: "stretch",
	gap: "2",
});

const searchFieldWrapperClass = css({
	display: "flex",
	minHeight: "0",
	minWidth: "0",
	flex: "1",
	alignItems: "stretch",
});

const toolbarClass = css({
	display: "flex",
	height: "8",
	flexShrink: "0",
	alignItems: "stretch",
	gap: "1",
	alignSelf: "stretch",
});

const reloadButtonClass = css({
	height: "full",
	minHeight: "0",
	width: "8",
	flexShrink: "0",
	alignSelf: "stretch",
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.widget/50",
	padding: "0",
	color: "text.muted",
	_hover: {
		color: "text.primary",
	},
});

const emptyStateClass = css({
	paddingBlock: "8",
	textAlign: "center",
	fontSize: "shell-text-sm",
	color: "text.muted",
});

/**
 * Cloud status note. Deliberately a sibling of the catalog body, never a
 * substitute for it: the local catalog renders its own rows (or its own empty
 * state, or its own load error) regardless of what this says.
 */
const cloudNoticeClass = css({
	display: "flex",
	minWidth: "0",
	flexShrink: "0",
	alignItems: "baseline",
	gap: "1.5",
	borderBottomWidth: "1px",
	borderBottomStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.widget/40",
	paddingBlock: "1",
	paddingInline: "2",
	fontSize: "xs",
	color: "text.muted",
});

/**
 * Load-failure body. Must never read like the empty state — "the catalog could
 * not be read" and "the catalog has no rows" are different facts.
 */
const errorStateClass = css({
	display: "flex",
	flexDirection: "column",
	alignItems: "center",
	gap: "2",
	paddingBlock: "8",
	paddingInline: "4",
	textAlign: "center",
});

const errorTitleClass = css({
	fontSize: "shell-text-sm",
	fontWeight: "medium",
	color: "red.400",
});

const errorDetailClass = css({
	maxWidth: "70ch",
	fontSize: "xs",
	color: "text.muted",
	overflowWrap: "anywhere",
});

const errorRetryClass = css({
	height: "6",
	paddingInline: "3",
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.widget",
	fontSize: "xs",
	color: "text.primary",
	_hover: {
		backgroundColor: "interactive.hover",
	},
});

const iconViewPortClass = css({
	minWidth: "0",
});

const contentClass = css({
	display: "flex",
	minHeight: "0",
	minWidth: "0",
	flexDirection: "column",
	overflow: "hidden",
	backgroundColor: "surface.dialog",
	padding: "0",
});

const PRESETS_DIALOG_SURFACE_ID = "dialog-presets" as const;

const CTX = {
	run: "ty.ctx.preset-list.run:",
	edit: "ty.ctx.preset-list.edit:",
	del: "ty.ctx.preset-list.delete:",
	copy: "ty.ctx.preset-list.copy:",
	groupEdit: "ty.ctx.preset-list.group-edit:",
	groupDel: "ty.ctx.preset-list.group-delete:",
	headerClose: "ty.ctx.preset-list.header.close",
	bodyReload: "ty.ctx.preset-list.body.reload",
	searchClear: "ty.ctx.preset-list.search.clear",
	searchPaste: "ty.ctx.preset-list.search.paste",
	toolbarToggle: "ty.ctx.preset-list.toolbar.toggle",
	iconTileSquare: "ty.ctx.preset-list.icon-tile.square",
	iconTileWide: "ty.ctx.preset-list.icon-tile.wide",
} as const;

const CHUNK = 18;

function basenamePath(p: string): string {
	const t = p.replace(/\\/g, "/").replace(/\/+$/, "");
	const i = t.lastIndexOf("/");
	return i >= 0 ? t.slice(i + 1) : t || "—";
}

function matchesPresetQuery(preset: Preset, q: string): boolean {
	const t = q.trim().toLowerCase();
	if (!t) {
		return true;
	}
	return (
		preset.id.toLowerCase().includes(t) ||
		(preset.title ?? "").toLowerCase().includes(t) ||
		preset.type.toLowerCase().includes(t) ||
		preset.filePath.toLowerCase().includes(t)
	);
}

function presetWorkspaceSummary(
	preset: Preset,
	presetLoc: ReadonlyMap<string, readonly string[]>,
	groupLoc: ReadonlyMap<string, readonly string[]>,
	presetToGroupId: ReadonlyMap<string, string>,
	groupsById: ReadonlyMap<string, GroupEntry>,
): string {
	const own =
		presetLoc.get(preset.id) ??
		presetLoc.get(stripKnownIdPrefixes(String(preset.id ?? "").trim()));
	if (own?.length) {
		return `Workspace: ${own.join(", ")}`;
	}
	const gid =
		presetToGroupId.get(preset.id) ??
		presetToGroupId.get(stripKnownIdPrefixes(String(preset.id ?? "").trim()));
	if (gid) {
		const gTags =
			groupLoc.get(gid) ??
			groupLoc.get(stripKnownIdPrefixes(String(gid).trim()));
		if (gTags?.length) {
			const g = groupsById.get(gid);
			const label = g?.title?.trim() || gid;
			return `Workspace: ${gTags.join(", ")} (group "${label}")`;
		}
	}
	return "Workspace: not placed";
}

function groupWorkspaceSummary(
	group: GroupEntry,
	groupLoc: ReadonlyMap<string, readonly string[]>,
): string {
	const tags =
		groupLoc.get(group.id) ??
		groupLoc.get(stripKnownIdPrefixes(String(group.id ?? "").trim()));
	if (tags?.length) {
		return `Workspace: ${tags.join(", ")}`;
	}
	return "Workspace: not placed";
}

function sourceLine(preset: Preset): string {
	return `${preset.type} · ${basenamePath(preset.filePath)}`;
}

function GroupHeaderGlyph(props: { group: GroupEntry }): JSX.Element {
	const { group } = props;
	const parsed = group.icon ? tryParsePresetIconValue(group.icon) : null;
	if (parsed) {
		const fake: Preset = {
			id: group.id,
			type: "preset",
			title: group.title ?? group.id,
			filePath: "",
			icon: parsed,
		};
		return (
			<PresetGlyphById
				presetId={group.id}
				preset={fake}
				surface="framed"
				boxClass="h-7 w-7"
			/>
		);
	}
	return (
		<span className={folderGlyphClass}>
			<Folder className={folderIconClass} aria-hidden />
		</span>
	);
}

function PresetRowActions(props: {
	presetId: string;
	onRun: (id: string) => void;
	onEdit: (id: string) => void;
	onDelete: (id: string) => void;
}): JSX.Element {
	const { presetId, onRun, onEdit, onDelete } = props;
	return (
		<div className={actionsRowClass}>
			<button
				type="button"
				className={tinyAct}
				aria-label="Run preset"
				title="Run"
				onClick={() => onRun(presetId)}
			>
				<Icon icon={Play} size={11} />
			</button>
			<button
				type="button"
				className={tinyAct}
				aria-label="Edit preset"
				title="Edit"
				onClick={() => void onEdit(presetId)}
			>
				<Icon icon={Pencil} size={11} />
			</button>
			<button
				type="button"
				className={tinyAct}
				aria-label="Delete preset"
				title="Delete"
				onClick={() => void onDelete(presetId)}
			>
				<Icon icon={Trash2} size={11} />
			</button>
		</div>
	);
}

function GroupRowActions(props: {
	groupId: string;
	onEdit: (id: string) => void;
	onDelete: (id: string) => void;
}): JSX.Element {
	const { groupId, onEdit, onDelete } = props;
	return (
		<div className={actionsRowClass}>
			<button
				type="button"
				className={tinyAct}
				aria-label="Edit group"
				title="Edit group"
				onClick={() => onEdit(groupId)}
			>
				<Icon icon={Pencil} size={11} />
			</button>
			<button
				type="button"
				className={tinyAct}
				aria-label="Delete group"
				title="Delete group"
				onClick={() => onDelete(groupId)}
			>
				<Icon icon={Trash2} size={11} />
			</button>
		</div>
	);
}

// ── Extracted sub-components ──────────────────────────────────────────────────

function SearchStatusBar(props: {
	loadPhase: LoadPhase;
	loadError: string | null;
	streamTotal: number;
	presetsLength: number;
	visibleCount: number;
	filter: string;
}): ReactNode {
	const {
		loadPhase,
		loadError,
		streamTotal,
		presetsLength,
		visibleCount,
		filter,
	} = props;
	// "idle" means the first read has not finished yet — showing a count there
	// would claim "0 items" about a catalog we have not read.
	if (loadPhase === "idle" || loadPhase === "reading") {
		return (
			<span className={loadingRowClass}>
				<LoaderCircle className={loadingIconClass} aria-hidden />
				<span className={loadingLabelClass}>Loading</span>
			</span>
		);
	}
	if (loadPhase === "error") {
		return (
			<span className={errorLabelClass} title={loadError ?? undefined}>
				{loadError ?? "Error"}
			</span>
		);
	}
	return (
		<span className={streamingRowClass}>
			{loadPhase === "streaming" && streamTotal > 0 ? (
				<>
					<span className={progressTrackClass} aria-hidden>
						<span
							className={progressBarClass}
							style={{
								width: `${Math.min(
									100,
									Math.round((presetsLength / Math.max(streamTotal, 1)) * 100),
								)}%`,
							}}
						/>
					</span>
					<span className={countClass}>
						{presetsLength}/{streamTotal}
					</span>
				</>
			) : null}
			<span className={countClass}>
				{visibleCount} items{filter.trim() ? " · filtered" : ""}
			</span>
		</span>
	);
}

function PresetListTreeItem(props: {
	preset: Preset;
	summarizeWorkspace: (p: Preset) => string;
	onRun: (id: string) => void;
	onEdit: (id: string) => void;
	onDelete: (id: string) => void;
}): JSX.Element {
	const { preset, summarizeWorkspace, onRun, onEdit, onDelete } = props;
	return (
		<li
			data-preset-id={preset.id}
			className={cx(LIST_ROW_GRID, presetRowClass)}
		>
			<div aria-hidden className={presetRowSpacerClass} />
			<div className={presetRowCenterClass}>
				<PresetGlyphById
					presetId={preset.id}
					preset={preset}
					surface="framed"
					boxClass="h-7 w-7 p-0.5"
				/>
			</div>
			<div className={presetRowTitleMinWidthClass}>
				<div className={presetRowTitleClass}>
					{preset.title || basenamePath(preset.filePath)}
				</div>
				<div className={presetRowMetaClass}>
					<span className={presetRowSourceClass}>{sourceLine(preset)}</span>
					<span className={presetRowWorkspaceClass}>
						{summarizeWorkspace(preset)}
					</span>
				</div>
			</div>
			<PresetRowActions
				presetId={preset.id}
				onRun={onRun}
				onEdit={onEdit}
				onDelete={onDelete}
			/>
		</li>
	);
}

function PresetGroupListBlock(props: {
	group: GroupEntry;
	members: Preset[];
	open: boolean;
	expandedGroups: Set<string>;
	groupPlacement: ReadonlyMap<string, readonly string[]>;
	onToggle: (id: string) => void;
	summarizeWorkspace: (p: Preset) => string;
	onRun: (id: string) => void;
	onEdit: (id: string) => void;
	onDelete: (id: string) => void;
}): JSX.Element {
	const {
		group,
		members,
		open,
		groupPlacement,
		onToggle,
		summarizeWorkspace,
		onRun,
		onEdit,
		onDelete,
	} = props;
	return (
		<li
			key={group.id}
			className={groupRowClass}
			data-preset-group-id={group.id}
		>
			<div className={cx(LIST_ROW_GRID, groupRowTopClass)}>
				<div className={groupRowCenterClass}>
					<button
						type="button"
						className={groupToggleButtonClass}
						aria-expanded={open}
						aria-label={open ? "Collapse group" : "Expand group"}
						onClick={() => onToggle(group.id)}
					>
						<Icon
							icon={open ? ChevronDown : ChevronRight}
							size={13}
							className={groupToggleIconClass}
							aria-hidden
						/>
					</button>
				</div>
				<div className={groupRowCenterClass}>
					<GroupHeaderGlyph group={group} />
				</div>
				<button
					type="button"
					className={groupTitleButtonClass}
					onClick={() => onToggle(group.id)}
				>
					<div className={groupTitleClass}>
						{group.title?.trim() || group.id}
					</div>
					<div className={groupSubtitleClass}>
						Group · {members.length} items
						<span className={groupSubtitleDividerClass}>|</span>
						{groupWorkspaceSummary(group, groupPlacement)}
					</div>
				</button>
				<GroupRowActions
					groupId={group.id}
					onEdit={onEdit}
					onDelete={onDelete}
				/>
			</div>
			{open ? (
				<ul className={groupMembersListClass}>
					{members.map((p) => (
						<PresetListTreeItem
							key={p.id}
							preset={p}
							summarizeWorkspace={summarizeWorkspace}
							onRun={onRun}
							onEdit={onEdit}
							onDelete={onDelete}
						/>
					))}
				</ul>
			) : null}
		</li>
	);
}

function PresetListTree(props: {
	groupBlocks: { group: GroupEntry; members: Preset[] }[];
	ungroupedMembers: Preset[];
	expandedGroups: Set<string>;
	groupPlacement: ReadonlyMap<string, readonly string[]>;
	onToggleGroup: (id: string) => void;
	summarizeWorkspace: (p: Preset) => string;
	onRun: (id: string) => void;
	onEdit: (id: string) => void;
	onDelete: (id: string) => void;
}): ReactNode {
	const {
		groupBlocks,
		ungroupedMembers,
		expandedGroups,
		groupPlacement,
		onToggleGroup,
		summarizeWorkspace,
		onRun,
		onEdit,
		onDelete,
	} = props;
	return (
		<ul className={treeListClass}>
			{groupBlocks.map(({ group, members }) => (
				<PresetGroupListBlock
					key={group.id}
					group={group}
					members={members}
					open={expandedGroups.has(group.id)}
					expandedGroups={expandedGroups}
					groupPlacement={groupPlacement}
					onToggle={onToggleGroup}
					summarizeWorkspace={summarizeWorkspace}
					onRun={onRun}
					onEdit={onEdit}
					onDelete={onDelete}
				/>
			))}
			{ungroupedMembers.map((p) => (
				<PresetListTreeItem
					key={p.id}
					preset={p}
					summarizeWorkspace={summarizeWorkspace}
					onRun={onRun}
					onEdit={onEdit}
					onDelete={onDelete}
				/>
			))}
		</ul>
	);
}

function IconNavigateUpCard(props: {
	tileAspect: IconTileAspect;
	onNavigateUp: () => void;
	contextLabel?: string;
}): JSX.Element {
	const { tileAspect, onNavigateUp, contextLabel } = props;
	return (
		<button
			type="button"
			className={iconNavigateUpButtonClass}
			onClick={onNavigateUp}
			aria-label="Return to all presets"
			title={
				contextLabel
					? `Leave group "${contextLabel}" and return to the list`
					: "Return to list"
			}
		>
			<div
				className={cx(iconTileMediaClass(tileAspect), iconNavigateUpMediaClass)}
			>
				<div className={iconNavigateUpInnerClass}>
					<Icon icon={ArrowLeft} size={11} aria-hidden />
				</div>
			</div>
			<div className={iconNavigateUpTitleClass}>
				<div className={iconNavigateUpTitleTextClass}>All presets</div>
			</div>
		</button>
	);
}

function IconCatalogGroupCard(props: {
	tileAspect: IconTileAspect;
	group: GroupEntry;
	memberCount: number;
	onOpen: () => void;
	onEdit: () => void;
	onDelete: () => void;
}): JSX.Element {
	const { tileAspect, group, memberCount, onOpen, onEdit, onDelete } = props;
	return (
		<div data-preset-group-id={group.id} className={iconGroupCardClass}>
			<div className={iconGroupMediaWrapperClass}>
				<button
					type="button"
					className={cx(iconTileMediaClass(tileAspect), iconGroupButtonClass)}
					onDoubleClick={onOpen}
					onKeyDown={(ev) => {
						if (isIMEComposing(ev)) return;
						if (ev.key !== "Enter") return;
						ev.preventDefault();
						onOpen();
					}}
					aria-label={`Open group ${group.title ?? group.id}`}
					title={`${group.title?.trim() || group.id} (double-click to open)`}
				>
					<div className={iconGroupButtonInnerClass}>
						<GroupHeaderGlyph group={group} />
					</div>
				</button>
				<span className={iconGroupBadgeClass} aria-hidden>
					{memberCount}
				</span>
			</div>
			<div className={iconGroupTitleWrapperClass}>
				<div className={iconGroupTitleClass}>
					{group.title?.trim() || group.id}
				</div>
				<div className={iconGroupActionsClass}>
					<button
						type="button"
						className={tinyAct}
						aria-label="Edit group"
						onClick={(e) => {
							e.stopPropagation();
							onEdit();
						}}
					>
						<Icon icon={Pencil} size={11} />
					</button>
					<button
						type="button"
						className={tinyAct}
						aria-label="Delete group"
						onClick={(e) => {
							e.stopPropagation();
							onDelete();
						}}
					>
						<Icon icon={Trash2} size={11} />
					</button>
				</div>
			</div>
		</div>
	);
}

function IconPresetCard(props: {
	tileAspect: IconTileAspect;
	preset: Preset;
	workspaceLine: string;
	onRun: (id: string) => void;
	onEdit: (id: string) => void;
	onDelete: (id: string) => void;
}): JSX.Element {
	const { tileAspect, preset, workspaceLine, onRun, onEdit, onDelete } = props;
	return (
		<div data-preset-id={preset.id} className={iconPresetCardClass}>
			<button
				type="button"
				className={cx(iconTileMediaClass(tileAspect), iconPresetButtonClass)}
				onClick={() => onRun(preset.id)}
				aria-label={`Run ${preset.title || preset.id}`}
			>
				<div className={iconPresetButtonInnerClass}>
					<PresetGlyphById
						presetId={preset.id}
						preset={preset}
						boxClass="h-full w-full max-h-full max-w-full border-0 p-0.5"
						emojiClass="[&_.ws-preset-icon--emoji]:text-3xl [&_.ws-preset-icon--text:not([data-ws-preset-text-fit])]:text-(length:--ty-shell-text-size-sm)"
					/>
				</div>
			</button>
			<div
				className={iconPresetTitleWrapperClass}
				title={`${preset.title || basenamePath(preset.filePath)}\n${sourceLine(preset)}\n${workspaceLine}`}
			>
				<div className={iconPresetTitleClass}>
					{preset.title || basenamePath(preset.filePath)}
				</div>
				<div className={iconGroupActionsClass}>
					<button
						type="button"
						className={tinyAct}
						aria-label="Edit"
						onClick={(e) => {
							e.stopPropagation();
							void onEdit(preset.id);
						}}
					>
						<Icon icon={Pencil} size={11} />
					</button>
					<button
						type="button"
						className={tinyAct}
						aria-label="Delete"
						onClick={(e) => {
							e.stopPropagation();
							void onDelete(preset.id);
						}}
					>
						<Icon icon={Trash2} size={11} />
					</button>
				</div>
			</div>
		</div>
	);
}

function IconViewRoot(props: {
	iconRootEntries: Array<
		| { kind: "group"; group: GroupEntry; members: Preset[] }
		| { kind: "preset"; preset: Preset }
	>;
	iconTileAspect: IconTileAspect;
	onOpenGroup: (id: string) => void;
	onGroupEdit: (id: string) => void;
	onGroupDelete: (id: string) => void;
	onRun: (id: string) => void;
	onEdit: (id: string) => void;
	onDelete: (id: string) => void;
	summarizeWorkspace: (p: Preset) => string;
}): ReactNode {
	const {
		iconRootEntries,
		iconTileAspect,
		onOpenGroup,
		onGroupEdit,
		onGroupDelete,
		onRun,
		onEdit,
		onDelete,
		summarizeWorkspace,
	} = props;
	if (iconRootEntries.length === 0) {
		return null;
	}
	return (
		<div className={ICON_GRID_CLASS}>
			{iconRootEntries.map((entry) =>
				entry.kind === "group" ? (
					<IconCatalogGroupCard
						key={entry.group.id}
						tileAspect={iconTileAspect}
						group={entry.group}
						memberCount={entry.members.length}
						onOpen={() => onOpenGroup(entry.group.id)}
						onEdit={() => onGroupEdit(entry.group.id)}
						onDelete={() => onGroupDelete(entry.group.id)}
					/>
				) : (
					<IconPresetCard
						key={entry.preset.id}
						tileAspect={iconTileAspect}
						preset={entry.preset}
						workspaceLine={summarizeWorkspace(entry.preset)}
						onRun={onRun}
						onEdit={onEdit}
						onDelete={onDelete}
					/>
				),
			)}
		</div>
	);
}

function IconViewGroup(props: {
	iconBrowseGroup: { group: GroupEntry; members: Preset[] } | undefined;
	iconTileAspect: IconTileAspect;
	onNavigateUp: () => void;
	onRun: (id: string) => void;
	onEdit: (id: string) => void;
	onDelete: (id: string) => void;
	summarizeWorkspace: (p: Preset) => string;
}): ReactNode {
	const {
		iconBrowseGroup,
		iconTileAspect,
		onNavigateUp,
		onRun,
		onEdit,
		onDelete,
		summarizeWorkspace,
	} = props;
	if (!iconBrowseGroup) {
		return null;
	}
	const { group, members } = iconBrowseGroup;
	return (
		<div className={ICON_GRID_CLASS}>
			<IconNavigateUpCard
				tileAspect={iconTileAspect}
				onNavigateUp={onNavigateUp}
				contextLabel={group.title?.trim() || group.id}
			/>
			{members.map((p) => (
				<IconPresetCard
					key={p.id}
					tileAspect={iconTileAspect}
					preset={p}
					workspaceLine={summarizeWorkspace(p)}
					onRun={onRun}
					onEdit={onEdit}
					onDelete={onDelete}
				/>
			))}
		</div>
	);
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * Load phase of the **local** catalog.
 *
 * `"loaded"` is a distinct terminal phase rather than a return to `"idle"`.
 * Before this change a successful load and a failed load both ended up in a
 * state where the body could render "No matching presets", which is how a
 * gateway failure ended up looking like an empty catalog. The successful
 * terminal state has to be nameable for the body to be able to tell the two
 * apart.
 */
type LoadPhase = "idle" | "reading" | "streaming" | "loaded" | "error";

/**
 * Message for an arbitrary rejection reason. `Promise.allSettled` hands back
 * `unknown`, so every consumer needs this to turn one into something a reader
 * can be shown.
 */
const describeReason = (reason: unknown): string =>
	reason instanceof Error ? reason.message : String(reason);

/** The message of a settled rejection, or `null` when it fulfilled. */
const rejectionMessage = (
	result: PromiseSettledResult<unknown>,
): string | null =>
	result.status === "rejected" ? describeReason(result.reason) : null;

type LoadState = {
	phase: LoadPhase;
	/**
	 * Local catalog read failure. Distinct from "the catalog has no rows":
	 * `null` with `phase === "loaded"` means an empty catalog, non-null means
	 * the rows could not be read at all.
	 */
	presetsError: string | null;
	/** Group catalog read failure. Does not invalidate the preset rows. */
	groupsError: string | null;
	presets: Preset[];
	streamTotal: number;
	groups: readonly GroupEntry[];
	placement: ReadonlyMap<string, readonly string[]>;
	groupPlacement: ReadonlyMap<string, readonly string[]>;
};

type LoadAction =
	| { type: "START_READING" }
	| {
			type: "DATA_LOADED";
			presets: Preset[];
			groups: readonly GroupEntry[];
			placement: ReadonlyMap<string, readonly string[]>;
			groupPlacement: ReadonlyMap<string, readonly string[]>;
			streamTotal: number;
			groupsError: string | null;
	  }
	| { type: "STREAM_APPEND"; presets: Preset[] }
	| { type: "STREAM_DONE" }
	| { type: "SET_PRESETS_ERROR"; error: string };

function loadReducer(state: LoadState, action: LoadAction): LoadState {
	switch (action.type) {
		case "START_READING":
			return {
				...state,
				phase: "reading",
				presetsError: null,
				groupsError: null,
				presets: [],
				streamTotal: 0,
			};
		case "DATA_LOADED":
			return {
				...state,
				presets: [],
				groups: action.groups,
				placement: action.placement,
				groupPlacement: action.groupPlacement,
				streamTotal: action.streamTotal,
				groupsError: action.groupsError,
				phase: "streaming",
			};
		case "STREAM_APPEND":
			return { ...state, presets: [...state.presets, ...action.presets] };
		case "STREAM_DONE":
			return { ...state, phase: "loaded" };
		case "SET_PRESETS_ERROR":
			return { ...state, phase: "error", presetsError: action.error };
	}
}

export function PresetsDialog(): JSX.Element {
	const hostCode = useMemo(() => detectCepHostCode(), []);
	const { close: closeWindow } = useDialogClose({});

	const [filter, setFilter] = useState("");
	const [loadState, dispatchLoad] = useReducer(loadReducer, {
		phase: "idle" as const,
		presetsError: null,
		groupsError: null,
		presets: [] as Preset[],
		streamTotal: 0,
		groups: [] as readonly GroupEntry[],
		placement: new Map() as ReadonlyMap<string, readonly string[]>,
		groupPlacement: new Map() as ReadonlyMap<string, readonly string[]>,
	});
	const {
		phase: loadPhase,
		presetsError: loadError,
		groupsError,
		presets,
		streamTotal,
		groups,
		placement,
		groupPlacement,
	} = loadState;
	// Cloud health is tracked separately from the local catalog state on
	// purpose (Issue #145): the gateway being down is a fact about the online
	// side and must not decide what the local list renders.
	const gatewayHealth = useGatewayHealth();
	const {
		viewMode,
		setViewMode,
		toggleView: toggleViewMode,
	} = useCatalogViewMode();
	const [iconBrowse, setIconBrowse] = useState<
		"root" | { kind: "group"; id: string }
	>("root");
	const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
		() => new Set(),
	);

	const {
		scale: iconGridScale,
		setScale: setIconGridScale,
		hostRef: iconGridHostRef,
	} = useIconGridScale({
		storageKey: ICON_GRID_SCALE_LS_KEY,
		enabled: viewMode === "icons",
	});
	const { aspect: iconTileAspect, setAspect: setIconTileAspect } =
		useTileAspect({
			storageKey: ICON_TILE_ASPECT_LS_KEY,
		});

	const handlersRef = useRef({
		onRun: async (_id: string) => {},
		onEdit: async (_id: string) => {},
		onDelete: async (_id: string) => {},
		reload: async () => {},
		clearSearch: () => {},
		pasteSearch: async () => {},
		toggleView: () => {},
		copyId: async (_id: string) => {},
		groupEdit: (_id: string) => {},
		groupDelete: (_id: string) => {},
		closeWindow,
	});

	const fullListRef = useRef<Preset[]>([]);
	const streamTimerRef = useRef<number | null>(null);

	const loadEverything = useCallback(async () => {
		dispatchLoad({ type: "START_READING" });
		fullListRef.current = [];
		// The group catalog and the settings read are settled independently of
		// the preset rows. They used to share one `Promise.all`, so a failure
		// in any of the three wiped the whole body — including the group
		// catalog, which is file-backed and never needed the cloud at all.
		const [presetsResult, groupResult, settingsResult] =
			await Promise.allSettled([
				listPresets(),
				readGroupJson(window),
				readSettings(window),
			]);

		if (presetsResult.status === "rejected") {
			dispatchLoad({
				type: "SET_PRESETS_ERROR",
				error: describeReason(presetsResult.reason),
			});
			return;
		}

		const all = presetsResult.value;
		// A group-catalog failure degrades grouping only; the rows still render.
		const groupFailure = rejectionMessage(groupResult);
		const parsedGroups =
			groupResult.status === "fulfilled"
				? parseGroupFromText(groupResult.value)
				: [];
		const settingsJson =
			settingsResult.status === "fulfilled" ? settingsResult.value : null;

		const { presetLocations, groupLocations } = await buildPlacementHints(
			window,
			settingsJson,
			all,
			parsedGroups,
		).catch((reason: unknown) => {
			// Placement hints are an annotation on each row ("Workspace: ...").
			// Losing them is a degraded read, not a failed catalog read — the
			// rows themselves are already in hand.
			console.warn(
				"preset-list: placement hints unavailable",
				reason instanceof Error ? reason.message : String(reason),
			);
			return {
				presetLocations: new Map<string, readonly string[]>(),
				groupLocations: new Map<string, readonly string[]>(),
			};
		});
		dispatchLoad({
			type: "DATA_LOADED",
			presets: all,
			groups: parsedGroups,
			placement: presetLocations,
			groupPlacement: groupLocations,
			streamTotal: all.length,
			groupsError: groupFailure,
		});
		fullListRef.current = all;
		let offset = 0;
		const step = (): void => {
			const slice = fullListRef.current.slice(offset, offset + CHUNK);
			offset += CHUNK;
			dispatchLoad({ type: "STREAM_APPEND", presets: slice });
			if (offset < fullListRef.current.length) {
				streamTimerRef.current = window.requestAnimationFrame(step);
			} else {
				dispatchLoad({ type: "STREAM_DONE" });
				streamTimerRef.current = null;
			}
		};
		streamTimerRef.current = window.requestAnimationFrame(step);
	}, []);

	useEffect(() => {
		void loadEverything();
		return () => {
			if (streamTimerRef.current != null) {
				window.cancelAnimationFrame(streamTimerRef.current);
			}
		};
	}, [loadEverything]);

	const groupedIdSet = useMemo(() => {
		const s = new Set<string>();
		for (const g of groups) {
			for (const raw of g.presetIds) {
				const id = String(raw ?? "").trim();
				if (!id) {
					continue;
				}
				s.add(id);
				const bare = stripKnownIdPrefixes(id);
				if (bare && bare !== id) {
					s.add(bare);
				}
			}
		}
		return s;
	}, [groups]);

	const filteredPresets = useMemo(() => {
		const q = filter.trim();
		return presets.filter((p) => matchesPresetQuery(p, q));
	}, [filter, presets]);

	const filteredPresetMap = useMemo(
		() => new Map(filteredPresets.map((p) => [p.id, p])),
		[filteredPresets],
	);

	const { groupBlocks, ungroupedMembers } = useMemo(() => {
		const blocks: { group: GroupEntry; members: Preset[] }[] = [];
		for (const g of groups) {
			const members = g.presetIds
				.map((raw) => {
					const id = String(raw ?? "").trim();
					if (!id) {
						return undefined;
					}
					const bare = stripKnownIdPrefixes(id);
					return filteredPresetMap.get(id) ?? filteredPresetMap.get(bare);
				})
				.filter((p): p is Preset => Boolean(p));
			if (members.length === 0) {
				continue;
			}
			blocks.push({ group: g, members });
		}
		const ungrouped = filteredPresets.filter((p) => !groupedIdSet.has(p.id));
		return { groupBlocks: blocks, ungroupedMembers: ungrouped };
	}, [filteredPresetMap, filteredPresets, groupedIdSet, groups]);

	const presetParentGroupId = useMemo(() => {
		const m = new Map<string, string>();
		for (const g of groups) {
			for (const raw of g.presetIds) {
				const id = String(raw ?? "").trim();
				if (!id) {
					continue;
				}
				const bare = stripKnownIdPrefixes(id);
				m.set(id, g.id);
				if (bare && bare !== id) {
					m.set(bare, g.id);
				}
			}
		}
		return m;
	}, [groups]);

	const groupsById = useMemo(
		() => new Map(groups.map((g) => [g.id, g])),
		[groups],
	);

	const summarizePresetWorkspace = useCallback(
		(p: Preset) =>
			presetWorkspaceSummary(
				p,
				placement,
				groupPlacement,
				presetParentGroupId,
				groupsById,
			),
		[placement, groupPlacement, presetParentGroupId, groupsById],
	);

	useEffect(() => {
		if (viewMode !== "icons" || iconBrowse === "root") {
			return;
		}
		if (
			iconBrowse.kind === "group" &&
			!groupBlocks.some((b) => b.group.id === iconBrowse.id)
		) {
			setIconBrowse("root");
		}
	}, [viewMode, iconBrowse, groupBlocks]);

	const onRun = useCallback(
		async (id: string) => {
			try {
				const preset = await getPreset(id);
				if (!preset) return;
				await traceExecute(preset, "catalog-list", () =>
					executeWorkspacePresetForWindow(window, hostCode, preset),
				);
			} catch {
				/* status strip shows error via reload */
			}
		},
		[hostCode],
	);

	const onEdit = useCallback(
		async (id: string) => {
			const isGroup = groups.some((g) => g.id === id);
			if (isGroup) {
				await openPresetEditSurface(window, PRESETS_DIALOG_SURFACE_ID, id);
				return;
			}
			const preset = await getPreset(id);
			if (!preset) {
				return;
			}
			const toolSurface = resolvePresetToolSurfaceIdForPreset(preset);
			if (!getPresetToolDialogEntry(toolSurface)) {
				return;
			}
		},
		[groups],
	);

	const onDelete = useCallback(
		async (id: string) => {
			await removeLocalPreset(id);
			await loadEverything();
		},
		[loadEverything],
	);

	const clearSearch = useCallback(() => {
		setFilter("");
	}, []);

	const pasteSearch = useCallback(async () => {
		try {
			const t = await navigator.clipboard.readText();
			setFilter((prev) => `${prev}${t}`);
		} catch {
			/* ignore */
		}
	}, []);

	const copyId = useCallback(async (id: string) => {
		try {
			await navigator.clipboard.writeText(id);
		} catch {
			/* ignore */
		}
	}, []);

	const toggleView = useCallback(() => {
		toggleViewMode();
		setIconBrowse("root");
	}, [toggleViewMode]);

	const groupEdit = useCallback(
		(id: string) => {
			void onEdit(id);
		},
		[onEdit],
	);

	const groupDelete = useCallback(
		(id: string) => {
			void onDelete(id);
		},
		[onDelete],
	);

	useEffect(() => {
		handlersRef.current = {
			onRun,
			onEdit,
			onDelete,
			reload: loadEverything,
			clearSearch,
			pasteSearch,
			toggleView,
			copyId,
			groupEdit,
			groupDelete,
			closeWindow,
		};
	}, [
		onRun,
		onEdit,
		onDelete,
		loadEverything,
		clearSearch,
		pasteSearch,
		toggleView,
		copyId,
		groupEdit,
		groupDelete,
		closeWindow,
	]);

	useEffect(() => {
		const aspectMenu = (): CepMenuPayload["menu"] => {
			/** CEP JSON supports `checkable`/`checked`; keep current choice disabled so only the alternate switches. */
			const squareOn = iconTileAspect === "square";
			const wideOn = iconTileAspect === "wide";
			return [
				{
					id: CTX.iconTileSquare,
					label: "Tile shape · 1:1 square",
					checkable: true,
					checked: squareOn,
					enabled: !squareOn,
				},
				{
					id: CTX.iconTileWide,
					label: "Tile shape · 16:9 wide",
					checkable: true,
					checked: wideOn,
					enabled: !wideOn,
				},
			];
		};

		const defaultSurfaceMenu = (): CepMenuPayload => {
			const menu: CepMenuPayload["menu"] = [
				{ id: CTX.bodyReload, label: "Reload preset catalog" },
			];
			if (viewMode === "icons") {
				menu.push(...aspectMenu());
			}
			return { menu };
		};

		const buildPayload = (event: MouseEvent): CepMenuPayload | null => {
			const t = event.target as Element | null;
			if (!t?.closest?.(`[data-surface-id="${PRESETS_DIALOG_SURFACE_ID}"]`)) {
				return null;
			}
			const presetRow = t.closest?.("[data-preset-id]");
			if (presetRow) {
				const id = presetRow.getAttribute("data-preset-id")?.trim();
				if (!id) {
					return null;
				}
				const enc = encodeURIComponent(id);
				const menu: CepMenuPayload["menu"] = [
					{ id: CTX.bodyReload, label: "Reload preset list" },
				];
				if (viewMode === "icons") {
					menu.push(...aspectMenu());
					menu.push({ label: "---" });
				}
				menu.push(
					{ id: `${CTX.run}${enc}`, label: "Run" },
					{ id: `${CTX.edit}${enc}`, label: "Edit" },
					{ id: `${CTX.del}${enc}`, label: "Delete" },
					{ label: "---" },
					{ id: `${CTX.copy}${enc}`, label: "Copy preset ID" },
				);
				return { menu };
			}
			const groupRow = t.closest?.("[data-preset-group-id]");
			if (groupRow) {
				const gid = groupRow.getAttribute("data-preset-group-id")?.trim();
				if (!gid) {
					return null;
				}
				const enc = encodeURIComponent(gid);
				const menu: CepMenuPayload["menu"] = [
					{ id: CTX.bodyReload, label: "Reload preset list" },
				];
				if (viewMode === "icons") {
					menu.push(...aspectMenu());
					menu.push({ label: "---" });
				}
				menu.push(
					{ id: `${CTX.groupEdit}${enc}`, label: "Edit group" },
					{ id: `${CTX.groupDel}${enc}`, label: "Delete group" },
				);
				return { menu };
			}
			if (viewMode === "icons" && t.closest?.("[data-preset-icon-view-port]")) {
				return {
					menu: [
						{ id: CTX.bodyReload, label: "Reload preset list" },
						...aspectMenu(),
					],
				};
			}
			if (t.closest?.("[data-preset-list-search]")) {
				return {
					menu: [
						{ id: CTX.bodyReload, label: "Reload preset list" },
						{ label: "---" },
						{ id: CTX.searchClear, label: "Clear search" },
						{ id: CTX.searchPaste, label: "Paste into search" },
					],
				};
			}
			if (t.closest?.("[data-preset-list-toolbar]")) {
				return {
					menu: [
						{ id: CTX.bodyReload, label: "Reload preset list" },
						{
							id: CTX.toolbarToggle,
							label: "Switch list / icon view",
						},
					],
				};
			}
			if (t.closest?.("header[data-preset-list-chrome]")) {
				return {
					menu: [
						{ id: CTX.headerClose, label: "Close window" },
						{ id: CTX.bodyReload, label: "Reload preset catalog" },
					],
				};
			}
			return defaultSurfaceMenu();
		};

		const onMenuSelect = (menuId: string): void => {
			const h = handlersRef.current;
			if (menuId === CTX.headerClose) {
				h.closeWindow();
				return;
			}
			if (menuId === CTX.bodyReload) {
				void h.reload();
				return;
			}
			if (menuId === CTX.iconTileSquare) {
				setIconTileAspect("square");
				return;
			}
			if (menuId === CTX.iconTileWide) {
				setIconTileAspect("wide");
				return;
			}
			if (menuId === CTX.searchClear) {
				h.clearSearch();
				return;
			}
			if (menuId === CTX.searchPaste) {
				void h.pasteSearch();
				return;
			}
			if (menuId === CTX.toolbarToggle) {
				h.toggleView();
				return;
			}
			if (menuId.startsWith(CTX.run)) {
				void h.onRun(decodeURIComponent(menuId.slice(CTX.run.length)));
				return;
			}
			if (menuId.startsWith(CTX.edit)) {
				void h.onEdit(decodeURIComponent(menuId.slice(CTX.edit.length)));
				return;
			}
			if (menuId.startsWith(CTX.del)) {
				void h.onDelete(decodeURIComponent(menuId.slice(CTX.del.length)));
				return;
			}
			if (menuId.startsWith(CTX.copy)) {
				void h.copyId(decodeURIComponent(menuId.slice(CTX.copy.length)));
				return;
			}
			if (menuId.startsWith(CTX.groupEdit)) {
				h.groupEdit(decodeURIComponent(menuId.slice(CTX.groupEdit.length)));
				return;
			}
			if (menuId.startsWith(CTX.groupDel)) {
				h.groupDelete(decodeURIComponent(menuId.slice(CTX.groupDel.length)));
			}
		};

		return registerCepJsonContextMenuSurface(PRESETS_DIALOG_SURFACE_ID, {
			buildPayload,
			onMenuSelect,
		});
	}, [viewMode, iconTileAspect, setIconTileAspect]);

	const toggleGroup = useCallback((id: string) => {
		setExpandedGroups((prev) => {
			const n = new Set(prev);
			if (n.has(id)) {
				n.delete(id);
			} else {
				n.add(id);
			}
			return n;
		});
	}, []);

	const visibleCount = useMemo(() => {
		let n = ungroupedMembers.length;
		for (const b of groupBlocks) {
			n += b.members.length;
		}
		return n;
	}, [groupBlocks, ungroupedMembers]);

	const iconRootEntries = useMemo(() => {
		const entries: Array<
			| { kind: "group"; group: GroupEntry; members: Preset[] }
			| { kind: "preset"; preset: Preset }
		> = [];
		for (const b of groupBlocks) {
			entries.push({ kind: "group", group: b.group, members: b.members });
		}
		for (const p of ungroupedMembers) {
			entries.push({ kind: "preset", preset: p });
		}
		return entries;
	}, [groupBlocks, ungroupedMembers]);

	const iconBrowseGroup =
		iconBrowse !== "root" && iconBrowse.kind === "group"
			? groupBlocks.find((b) => b.group.id === iconBrowse.id)
			: undefined;

	/**
	 * Body for the case where no rows are visible.
	 *
	 * The three states a reader must be able to tell apart (Issue #145):
	 *
	 *   - **not read yet / reading** → still loading; no claim about the catalog.
	 *   - **load failed** (`presetsError`) → the catalog could not be read. Says
	 *     so, and offers a retry.
	 *   - **read succeeded, catalog has no rows** → an empty catalog. A
	 *     different sentence from the failure above.
	 *   - **read succeeded, filter matched nothing** → "No matching presets".
	 *     This sentence is reserved for exactly this case; it is never a
	 *     stand-in for "we could not read the catalog".
	 */
	const emptyBody = (): ReactNode => {
		if (loadPhase === "error") {
			return (
				<div className={errorStateClass} role="alert">
					<div className={errorTitleClass}>
						Failed to load the local catalog
					</div>
					<div className={errorDetailClass}>{loadError}</div>
					<button
						type="button"
						className={errorRetryClass}
						onClick={() => void loadEverything()}
					>
						Try again
					</button>
				</div>
			);
		}
		if (loadPhase === "idle" || loadPhase === "reading") {
			return <p className={emptyStateClass}>Loading local catalog…</p>;
		}
		if (loadPhase !== "loaded") {
			return null;
		}
		if (presets.length === 0) {
			return <p className={emptyStateClass}>No presets saved locally yet</p>;
		}
		return <p className={emptyStateClass}>No matching presets</p>;
	};

	const cloudNotice =
		gatewayHealth.state === "live" ? null : (
			<p className={cloudNoticeClass} data-preset-list-cloud-notice>
				<span className={css({ fontWeight: "medium", flexShrink: "0" })}>
					Cloud offline
				</span>
				<span>
					{gatewayHealth.state === "degraded"
						? gatewayHealth.failure.message
						: gatewayHealth.reason}{" "}
					— showing the local catalog only.
				</span>
			</p>
		);

	// A group-catalog read failure degrades grouping only. It is reported next
	// to the cloud note rather than replacing the body, because the preset rows
	// did load.
	const groupsNotice = groupsError ? (
		<p className={cloudNoticeClass} data-preset-list-groups-notice>
			<span className={css({ fontWeight: "medium", flexShrink: "0" })}>
				Groups unavailable
			</span>
			<span>{groupsError} — presets are listed without grouping.</span>
		</p>
	) : null;

	return (
		<DialogShell
			title="Preset List"
			surfaceId={PRESETS_DIALOG_SURFACE_ID}
			modifier="wsd-root--presets"
			contentClassName={contentClass}
			headerChromeProps={
				{
					"data-preset-list-chrome": "header",
				} as ShellProps["headerChromeProps"]
			}
		>
			<CatalogBrowserShell
				domPrefix="preset-list"
				headerRow={
					<div className={headerRowClass}>
						<div data-preset-list-search className={searchFieldWrapperClass}>
							<SearchField
								className={searchFieldClass}
								icon={Search}
								placeholder="Search by name, type, or path…"
								value={filter}
								onChange={(e) => setFilter(e.currentTarget.value)}
								showClearButton
								onClear={() => setFilter("")}
								showInlineTrailing
								inlineTrailing={
									<SearchStatusBar
										loadPhase={loadPhase}
										loadError={loadError}
										streamTotal={streamTotal}
										presetsLength={presets.length}
										visibleCount={visibleCount}
										filter={filter}
									/>
								}
							/>
						</div>
						<div data-preset-list-toolbar className={toolbarClass}>
							<CatalogBrowserViewModeToggle
								viewMode={viewMode}
								onViewModeChange={setViewMode}
								onEnterIconView={() => {
									setIconBrowse("root");
								}}
							/>
							<IconButton
								variant="ghost"
								size="sm"
								className={reloadButtonClass}
								aria-label="Reload catalog"
								title="Reload catalog"
								onClick={() => void loadEverything()}
							>
								<Icon icon={RefreshCw} size={10} />
							</IconButton>
						</div>
					</div>
				}
			>
				{cloudNotice}
				{groupsNotice}
				{viewMode === "list" ? (
					visibleCount === 0 && loadPhase !== "streaming" ? (
						emptyBody()
					) : (
						<PresetListTree
							groupBlocks={groupBlocks}
							ungroupedMembers={ungroupedMembers}
							expandedGroups={expandedGroups}
							groupPlacement={groupPlacement}
							onToggleGroup={toggleGroup}
							summarizeWorkspace={summarizePresetWorkspace}
							onRun={onRun}
							onEdit={onEdit}
							onDelete={onDelete}
						/>
					)
				) : (
					<div
						ref={iconGridHostRef}
						data-preset-icon-view-port
						className={iconViewPortClass}
						style={
							{
								"--preset-icon-cell": `${ICON_CELL_BASE_REM * iconGridScale}rem`,
							} as CSSProperties
						}
						title="Hold Ctrl and scroll to resize the icon grid"
					>
						{iconBrowse === "root" ? (
							visibleCount === 0 && loadPhase !== "streaming" ? (
								emptyBody()
							) : (
								<IconViewRoot
									iconRootEntries={iconRootEntries}
									iconTileAspect={iconTileAspect}
									onOpenGroup={(id) => setIconBrowse({ kind: "group", id })}
									onGroupEdit={groupEdit}
									onGroupDelete={groupDelete}
									onRun={onRun}
									onEdit={onEdit}
									onDelete={onDelete}
									summarizeWorkspace={summarizePresetWorkspace}
								/>
							)
						) : (
							<IconViewGroup
								iconBrowseGroup={iconBrowseGroup}
								iconTileAspect={iconTileAspect}
								onNavigateUp={() => setIconBrowse("root")}
								onRun={onRun}
								onEdit={onEdit}
								onDelete={onDelete}
								summarizeWorkspace={summarizePresetWorkspace}
							/>
						)}
					</div>
				)}
			</CatalogBrowserShell>
		</DialogShell>
	);
}
