import {
	ExternalLink,
	Grid3x3,
	LayoutGrid,
	List,
	LoaderCircle,
	PanelLeftClose,
	RefreshCw,
	Search,
	X,
} from "lucide-react";
import {
	type JSX,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { showExtendScriptAlert } from "@/management/ae/cep/eval";
import {
	type CepMenuPayload,
	registerCepJsonContextMenuSurface,
} from "@/management/dialog/dialogs/context-menu";
import { DownloadProgressIconButton } from "@/management/online/catalog/DownloadProgressIconButton";
import { gatewayRetryAffordance } from "@/management/online/catalog/gateway-retry";
import { sanitizeOnlineErrorMessage } from "@/management/online/catalog/sanitize-error";
import type { DownloadProgress } from "@/management/online/catalog/use-cases";
import {
	downloadAndInstallPreset,
	searchCatalog,
	syncCatalog,
} from "@/management/online/catalog/use-cases";
import type { PresetSearchItem } from "@/management/online/contract";
import {
	readGatewayHealth,
	subscribeGatewayHealth,
} from "@/management/online/runtime-gateway-health";
import type { GatewayBootFailureReason } from "@/management/panel/cloud-gateway-boot";
import { openUrlInDefaultBrowser } from "@/management/workspace/hooks/helpers";
import { notifyPanelsAfterPresetSave } from "@/management/workspace/placement/notify-panels-after-preset-save";
import { getDataServices } from "@/management/workspace/services";
import { Button } from "@/shared/component/controls/Button";
import { IconButton } from "@/shared/component/controls/IconButton";
import { SearchField } from "@/shared/component/fields/SearchField";
import { Icon } from "@/shared/component/icons/Icon";
import { cx } from "@/shared/util/cx";
import { css } from "@/styled-system/css";

const CATALOG_LIMIT = 50;

// Thumb
const thumbWrapperBaseClass = css({
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	overflow: "hidden",
	backgroundColor: "surface.widget",
});
const thumbSizeGalleryClass = css({
	width: "full",
	aspectRatio: "square",
});
const thumbSizeListClass = css({
	width: "12",
	height: "12",
	flexShrink: 0,
});
const thumbSizeCardClass = css({
	width: "full",
	height: "full",
});
const thumbImageClass = css({
	width: "full",
	height: "full",
	objectFit: "cover",
});
const thumbInitialsClass = css({
	fontSize: "sm",
	fontWeight: "medium",
	textTransform: "uppercase",
	letterSpacing: "wider",
	color: "text.muted",
});

// Category badge
const categoryBadgeClass = css({
	display: "inline-block",
	paddingInline: "1.5",
	paddingBlock: "0.5",
	fontSize: "xs",
	borderRadius: "sm",
	backgroundColor: "surface.panel",
	color: "text.muted",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
});

// Gallery card
const galleryCardClass = css({
	display: "flex",
	flexDirection: "column",
	borderRadius: "sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.panel",
	overflow: "hidden",
	transitionProperty: "colors",
	_hover: { backgroundColor: "surface.overlay" },
});
const galleryThumbWrapClass = css({
	position: "relative",
	width: "full",
	aspectRatio: "square",
	flexShrink: 0,
});
const galleryOverlayClass = css({
	position: "absolute",
	insetInline: 0,
	bottom: 0,
	zIndex: 10,
	backgroundColor: "surface.panel",
	padding: "2",
});
const galleryTitleClass = css({
	fontSize: "xs",
	fontWeight: "semibold",
	color: "text.primary",
	lineHeight: "tight",
	truncate: true,
	width: "full",
	marginBottom: "0.5",
});
const galleryDescriptionSlotClass = css({
	height: "8",
	marginBottom: "1",
});
const galleryDescriptionClass = css({
	fontSize: "2xs",
	color: "text.muted",
	lineHeight: "relaxed",
	lineClamp: 2,
});
const galleryActionsClass = css({
	display: "flex",
	alignItems: "center",
	gap: "0.5",
});
const iconSquareSmallClass = css({
	height: "6",
	width: "6",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
});

// Card item
const itemCardClass = css({
	display: "flex",
	borderRadius: "sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.panel",
	overflow: "hidden",
	transitionProperty: "colors",
	_hover: { backgroundColor: "surface.overlay" },
});
const itemThumbClass = css({
	width: "24",
	height: "24",
	flexShrink: 0,
});
const itemBodyClass = css({
	display: "flex",
	flexDirection: "column",
	flex: "1",
	minWidth: 0,
	padding: "2",
	gap: "1",
});
const itemHeaderClass = css({
	display: "flex",
	alignItems: "flex-start",
	justifyContent: "space-between",
	gap: "2",
	minWidth: 0,
	flex: "1",
});
const itemTitleClass = css({
	fontSize: "sm",
	fontWeight: "semibold",
	color: "text.primary",
	lineHeight: "tight",
	truncate: true,
	flex: "1",
});
const itemDescriptionRowClass = css({
	display: "flex",
	alignItems: "flex-start",
	gap: "2",
	flex: "1",
	minHeight: 0,
});
const itemDescriptionClass = css({
	fontSize: "xs",
	color: "text.muted",
	lineHeight: "relaxed",
	lineClamp: 2,
	flex: "1",
});
const itemActionsClass = css({
	display: "flex",
	alignItems: "center",
	flexShrink: 0,
	gap: "1",
});
const borderedButtonClass = css({
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
});

// Empty state
const emptyStateClass = css({
	display: "flex",
	flexDirection: "column",
	alignItems: "center",
	justifyContent: "center",
	flex: "1",
	padding: "8",
	gap: "3",
});
const emptyStateTextClass = css({
	fontSize: "sm",
	color: "text.muted",
});

// View mode toggle
const viewModeFieldsetClass = css({
	margin: "0",
	display: "flex",
	height: "7",
	flexShrink: 0,
	overflow: "hidden",
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.panel",
	padding: "px",
});
const viewModeBtnBaseClass = css({
	height: "full",
	minHeight: 0,
	width: "7",
	flexShrink: 0,
	borderRadius: "none",
	borderWidth: 0,
	padding: "0",
});
const viewModeBtnActiveClass = css({
	backgroundColor: "surface.widget",
	color: "text.primary",
	boxShadow: "sm",
});
const viewModeBtnInactiveClass = css({
	color: "text.muted",
});
const viewModeDividerClass = css({
	width: "px",
	flexShrink: 0,
	alignSelf: "stretch",
	backgroundColor: "border.default",
});

// Side panel
const sidePanelClass = css({
	width: "56",
	flexShrink: 0,
	borderRightWidth: "1px",
	borderRightStyle: "solid",
	borderRightColor: "border.default",
	display: "flex",
	flexDirection: "column",
	overflow: "hidden",
});
const sidePanelHeaderRowClass = css({
	display: "flex",
	alignItems: "center",
	gap: "2",
	paddingInline: "3",
	paddingBlock: "2",
	borderBottomWidth: "1px",
	borderBottomStyle: "solid",
	borderBottomColor: "border.default",
});
const sidePanelSearchWrapperClass = css({
	flex: "1",
	minWidth: 0,
});
const sidePanelSectionClass = css({
	display: "flex",
	flexDirection: "column",
	gap: "1",
	paddingInline: "3",
	paddingBlock: "2",
});
const sidePanelSectionHeaderClass = css({
	display: "flex",
	alignItems: "center",
	justifyContent: "space-between",
});
const sidePanelSectionTitleClass = css({
	fontSize: "sm",
	color: "text.muted",
	textTransform: "uppercase",
	letterSpacing: "wider",
});
const sidePanelCategoryListClass = css({
	display: "flex",
	flexDirection: "column",
	gap: "0.5",
});
const sidePanelCategoryBtnBaseClass = css({
	textAlign: "left",
	fontSize: "sm",
	paddingInline: "2",
	paddingBlock: "1",
	borderRadius: "sm",
	transitionProperty: "colors",
});
const sidePanelCategoryBtnActiveClass = css({
	backgroundColor: "surface.widget",
	color: "text.primary",
});
const sidePanelCategoryBtnInactiveClass = css({
	color: "text.muted",
	_hover: {
		backgroundColor: "surface.overlay",
		color: "text.primary",
	},
});
const sidePanelCategoryBtnTruncateClass = css({ truncate: true });
const sidePanelTagSectionClass = css({
	display: "flex",
	flexDirection: "column",
	gap: "1",
	paddingInline: "3",
	paddingBlock: "2",
	borderTopWidth: "1px",
	borderTopStyle: "solid",
	borderTopColor: "border.default",
	flex: "1",
	minHeight: 0,
	overflow: "auto",
});
const sidePanelTagHeaderClass = css({
	display: "flex",
	gap: "2",
});
const sidePanelTagListClass = css({
	display: "flex",
	flexDirection: "column",
	gap: "0.5",
});
const sidePanelTagLabelBaseClass = css({
	display: "flex",
	alignItems: "center",
	gap: "2",
	fontSize: "sm",
	paddingInline: "2",
	paddingBlock: "1",
	borderRadius: "sm",
	transitionProperty: "colors",
	cursor: "pointer",
});
const sidePanelTagLabelActiveClass = css({
	backgroundColor: "surface.widget",
	color: "text.primary",
});
const sidePanelTagLabelInactiveClass = css({
	color: "text.muted",
	_hover: { backgroundColor: "surface.overlay" },
});
const sidePanelTagCheckboxClass = css({
	width: "3",
	height: "3",
	flexShrink: 0,
	accentColor: "ty-text-accent",
});
const sidePanelTagTextClass = css({ truncate: true });
const sidePanelClearRowClass = css({
	paddingInline: "3",
	paddingBlock: "2",
	borderTopWidth: "1px",
	borderTopStyle: "solid",
	borderTopColor: "border.default",
});
const sidePanelClearBtnFullClass = css({ width: "full" });
const sidePanelClearLabelClass = css({
	marginLeft: "1",
	fontSize: "xs",
});

// List table
const listTableWrapperClass = css({
	display: "flex",
	flexDirection: "column",
	minHeight: 0,
	flex: "1",
	overflow: "auto",
});
const listTableClass = css({
	width: "full",
	borderCollapse: "collapse",
});
const listTableHeaderClass = css({
	position: "sticky",
	top: 0,
	zIndex: 10,
	backgroundColor: "surface.panel",
});
const listTableHeaderCellClass = css({
	paddingInline: "2",
	paddingBlock: "2",
	textAlign: "left",
	fontSize: "xs",
	textTransform: "uppercase",
	letterSpacing: "wider",
	color: "text.muted",
	fontWeight: "medium",
	borderBottomWidth: "1px",
	borderBottomStyle: "solid",
	borderBottomColor: "border.default",
});
const listTableThumbHeaderClass = css({
	width: "12",
	paddingInline: "2",
	paddingBlock: "2",
	textAlign: "left",
	fontSize: "xs",
	textTransform: "uppercase",
	letterSpacing: "wider",
	color: "text.muted",
	fontWeight: "medium",
	borderBottomWidth: "1px",
	borderBottomStyle: "solid",
	borderBottomColor: "border.default",
});
const listTableActionsHeaderClass = css({
	width: "32",
	paddingInline: "2",
	paddingBlock: "2",
	textAlign: "right",
	fontSize: "xs",
	textTransform: "uppercase",
	letterSpacing: "wider",
	color: "text.muted",
	fontWeight: "medium",
	borderBottomWidth: "1px",
	borderBottomStyle: "solid",
	borderBottomColor: "border.default",
});
const listTableRowClass = css({
	_hover: { backgroundColor: "surface.overlay" },
});
const listTableCellClass = css({
	paddingInline: "2",
	paddingBlock: "2",
	borderBottomWidth: "1px",
	borderBottomStyle: "solid",
	borderBottomColor: "border.default",
	verticalAlign: "middle",
});
const listTableCellRightClass = css({
	paddingInline: "2",
	paddingBlock: "2",
	borderBottomWidth: "1px",
	borderBottomStyle: "solid",
	borderBottomColor: "border.default",
	verticalAlign: "middle",
	textAlign: "right",
});
const listTableInfoColumnClass = css({
	display: "flex",
	flexDirection: "column",
	gap: "0.5",
	minWidth: 0,
});
const listTablePrimaryTextClass = css({
	fontSize: "sm",
	color: "text.primary",
	truncate: true,
});
const listTableSecondaryTextClass = css({
	fontSize: "xs",
	color: "text.muted",
	truncate: true,
});
const listTableMutedClass = css({ color: "text.muted" });
const listTableActionsClass = css({
	display: "flex",
	alignItems: "center",
	justifyContent: "flex-end",
	gap: "1",
});

// Footer
const footerClass = css({
	display: "flex",
	alignItems: "center",
	justifyContent: "space-between",
	gap: "2",
	paddingInline: "4",
	paddingBlock: "1.5",
	flexShrink: 0,
	borderTopWidth: "1px",
	borderTopStyle: "solid",
	borderTopColor: "border.default",
});
const footerTextClass = css({
	fontSize: "xs",
	color: "text.muted",
});
const footerZoomTextClass = css({
	fontSize: "2xs",
	color: "text.muted",
});

// Main preset library
const presetLibraryClass = css({
	display: "flex",
	flexDirection: "row",
	height: "full",
	minHeight: 0,
	backgroundColor: "surface.dialog",
});
const mainContentClass = css({
	display: "flex",
	flexDirection: "column",
	flex: "1",
	minWidth: 0,
	minHeight: 0,
});
const headerRowClass = css({
	display: "flex",
	alignItems: "center",
	gap: "2",
	paddingInline: "4",
	paddingBlock: "2",
	flexShrink: 0,
	borderBottomWidth: "1px",
	borderBottomStyle: "solid",
	borderBottomColor: "border.default",
});
const headerTitleClass = css({
	fontSize: "sm",
	fontWeight: "semibold",
	color: "text.primary",
	truncate: true,
});
const headerSpacerClass = css({
	marginLeft: "auto",
	display: "flex",
	alignItems: "center",
	gap: "1",
});
const spinningClass = css({ animation: "spin" });
const searchRowClass = css({
	display: "flex",
	alignItems: "center",
	gap: "2",
	paddingInline: "4",
	paddingBlock: "2",
	flexShrink: 0,
	borderBottomWidth: "1px",
	borderBottomStyle: "solid",
	borderBottomColor: "border.default",
});
const searchRowInputWrapperClass = css({
	flex: "1",
	minWidth: 0,
	height: "7",
});
const searchFieldFullClass = css({
	width: "full",
	height: "full",
});
const searchInputLgClass = css({ fontSize: "sm" });
const resultsAreaClass = css({
	display: "flex",
	flexDirection: "column",
	minHeight: 0,
	flex: "1",
	overflow: "auto",
	paddingInline: "4",
	paddingBlock: "3",
	gap: "2",
});
const gridGalleryClass = css({ display: "grid", gap: "2" });
const gridCardsClass = css({ display: "grid", gap: "2" });

function viewModeBtnClass(active: boolean): string {
	return cx(
		viewModeBtnBaseClass,
		active ? viewModeBtnActiveClass : viewModeBtnInactiveClass,
	);
}

function categoryBtnClass(active: boolean, truncate = false): string {
	return cx(
		sidePanelCategoryBtnBaseClass,
		active
			? sidePanelCategoryBtnActiveClass
			: sidePanelCategoryBtnInactiveClass,
		truncate && sidePanelCategoryBtnTruncateClass,
	);
}

function tagLabelClass(active: boolean): string {
	return cx(
		sidePanelTagLabelBaseClass,
		active ? sidePanelTagLabelActiveClass : sidePanelTagLabelInactiveClass,
	);
}

function thumbSizeClass(size: "gallery" | "list" | "card"): string {
	if (size === "gallery") return thumbSizeGalleryClass;
	if (size === "list") return thumbSizeListClass;
	return thumbSizeCardClass;
}

type ViewMode = "gallery" | "list" | "cards";

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.1;

const CTX = {
	headerClose: "ty.ctx.online-preset-library.header.close",
	bodyReload: "ty.ctx.online-preset-library.body.reload",
	sidePanelToggle: "ty.ctx.online-preset-library.sidepanel.toggle",
	viewGallery: "ty.ctx.online-preset-library.view.gallery",
	viewCards: "ty.ctx.online-preset-library.view.cards",
	viewList: "ty.ctx.online-preset-library.view.list",
	tagClearAll: "ty.ctx.online-preset-library.tag.clear-all",
	categoryClear: "ty.ctx.online-preset-library.category.clear",
	searchClear: "ty.ctx.online-preset-library.search.clear",
	clearAllFilters: "ty.ctx.online-preset-library.clear-all",
	itemDownload: "ty.ctx.online-preset-library.item.download",
	itemImport: "ty.ctx.online-preset-library.item.import",
	itemOpenNotion: "ty.ctx.online-preset-library.item.open-notion",
} as const;

function initialsFromName(name: string): string {
	const t = name.trim();
	if (!t) {
		return "?";
	}
	const parts = t.split(/\s+/).filter(Boolean);
	if (parts.length >= 2) {
		const a = parts[0]?.[0] ?? "";
		const b = parts[1]?.[0] ?? "";
		return `${a}${b}`.toUpperCase().slice(0, 2);
	}
	return t.slice(0, 2).toUpperCase();
}

function PresetMarketThumb(props: {
	item: PresetSearchItem;
	size: "gallery" | "list" | "card";
}) {
	const { item, size } = props;
	const src = item.thumbnailUrl?.trim();
	const [imgFailed, setImgFailed] = useState(false);
	const safeSrc = (() => {
		if (!src) return undefined;
		try {
			return new URL(src).protocol === "https:" ? src : undefined;
		} catch {
			return undefined;
		}
	})();
	const showImg = Boolean(safeSrc) && !imgFailed;

	return (
		<div
			className={cx(thumbWrapperBaseClass, thumbSizeClass(size))}
			data-ws-preset-thumb={item.presetId}
			aria-hidden
		>
			{showImg ? (
				<img
					className={thumbImageClass}
					src={safeSrc}
					alt=""
					loading="lazy"
					decoding="async"
					referrerPolicy="no-referrer"
					onError={() => setImgFailed(true)}
				/>
			) : (
				<span className={thumbInitialsClass}>
					{initialsFromName(item.name)}
				</span>
			)}
		</div>
	);
}

function CategoryBadge(props: { category: string }) {
	return <span className={categoryBadgeClass}>{props.category}</span>;
}

function GalleryCard(props: {
	item: PresetSearchItem;
	downloadingId: string | null;
	downloadState: {
		stage: DownloadProgress["stage"];
		bytesLoaded?: number;
		bytesTotal?: number;
	} | null;
	completedId: string | null;
	onDownload: () => void;
	isDownloaded?: boolean;
	onMouseEnter?: () => void;
	onMouseLeave?: () => void;
}) {
	const {
		item,
		downloadingId,
		downloadState,
		completedId,
		onDownload,
		isDownloaded,
	} = props;
	const hasDescription = Boolean(item.description);
	const isDownloading =
		downloadingId === item.presetId && downloadState !== null;
	const isComplete = completedId === item.presetId;
	return (
		<article
			className={galleryCardClass}
			data-ws-preset-card={item.presetId}
			onMouseEnter={props.onMouseEnter}
			onMouseLeave={props.onMouseLeave}
		>
			{/* Thumbnail with info overlay */}
			<div className={galleryThumbWrapClass}>
				<PresetMarketThumb item={item} size="gallery" />
				{/* Bottom overlay: solid bg with name, description, action buttons */}
				<div className={galleryOverlayClass}>
					<h3 className={galleryTitleClass}>{item.name}</h3>
					<div className={galleryDescriptionSlotClass}>
						{hasDescription ? (
							<p className={galleryDescriptionClass}>{item.description}</p>
						) : null}
					</div>
					<div className={galleryActionsClass}>
						<DownloadProgressIconButton
							iconSize={9}
							onClick={onDownload}
							isDownloaded={isDownloaded}
							isComplete={isComplete}
							stage={isDownloading ? downloadState?.stage : undefined}
							bytesLoaded={
								isDownloading ? downloadState?.bytesLoaded : undefined
							}
							bytesTotal={isDownloading ? downloadState?.bytesTotal : undefined}
							className={iconSquareSmallClass}
						/>
						{item.notionPageUrl ? (
							<IconButton
								size="sm"
								variant="ghost"
								title="Open Notion"
								onClick={() =>
									openUrlInDefaultBrowser(item.notionPageUrl ?? "")
								}
								className={iconSquareSmallClass}
							>
								<Icon icon={ExternalLink} size={9} />
							</IconButton>
						) : null}
					</div>
				</div>
			</div>
		</article>
	);
}

function CardItem(props: {
	item: PresetSearchItem;
	downloadingId: string | null;
	downloadState: {
		stage: DownloadProgress["stage"];
		bytesLoaded?: number;
		bytesTotal?: number;
	} | null;
	completedId: string | null;
	onDownload: () => void;
	isDownloaded?: boolean;
	onMouseEnter?: () => void;
	onMouseLeave?: () => void;
}) {
	const {
		item,
		downloadingId,
		downloadState,
		completedId,
		onDownload,
		isDownloaded,
	} = props;
	const isDownloading =
		downloadingId === item.presetId && downloadState !== null;
	const isComplete = completedId === item.presetId;
	return (
		<article
			className={itemCardClass}
			data-ws-preset-card={item.presetId}
			onMouseEnter={props.onMouseEnter}
			onMouseLeave={props.onMouseLeave}
		>
			{/* Thumbnail left */}
			<div className={itemThumbClass}>
				<PresetMarketThumb item={item} size="card" />
			</div>
			{/* Info + actions right */}
			<div className={itemBodyClass}>
				<div className={itemHeaderClass}>
					<h3 className={itemTitleClass}>{item.name}</h3>
					{item.category ? <CategoryBadge category={item.category} /> : null}
				</div>
				<div className={itemDescriptionRowClass}>
					<p className={itemDescriptionClass}>{item.description ?? ""}</p>
					<div className={itemActionsClass}>
						<DownloadProgressIconButton
							iconSize={10}
							onClick={onDownload}
							isDownloaded={isDownloaded}
							isComplete={isComplete}
							stage={isDownloading ? downloadState?.stage : undefined}
							bytesLoaded={
								isDownloading ? downloadState?.bytesLoaded : undefined
							}
							bytesTotal={isDownloading ? downloadState?.bytesTotal : undefined}
							className={borderedButtonClass}
						/>
						{item.notionPageUrl ? (
							<IconButton
								size="sm"
								variant="ghost"
								title="Open Notion"
								onClick={() =>
									openUrlInDefaultBrowser(item.notionPageUrl ?? "")
								}
								className={borderedButtonClass}
							>
								<Icon icon={ExternalLink} size={10} />
							</IconButton>
						) : null}
					</div>
				</div>
			</div>
		</article>
	);
}

// ── Extracted sub-components ──────────────────────────────────────────────────

function EmptyState(props: {
	loading: boolean;
	catalogLength: number;
	filteredLength: number;
	onRefresh: () => void;
	onClearFilters: () => void;
	disconnected?: boolean;
	disconnectedReason?: string;
	disconnectedReasonTag?: GatewayBootFailureReason;
}): JSX.Element | null {
	const {
		loading,
		catalogLength,
		filteredLength,
		onRefresh,
		onClearFilters,
		disconnected,
		disconnectedReason,
		disconnectedReasonTag,
	} = props;
	if (loading) return null;
	if (disconnected) {
		const retry = gatewayRetryAffordance(disconnectedReasonTag);
		return (
			<div
				className={emptyStateClass}
				data-online-preset-empty
				data-gateway-boot-reason={disconnectedReasonTag ?? ""}
			>
				<p className={emptyStateTextClass}>
					Online preset library is unavailable.
				</p>
				{disconnectedReason ? (
					<p className={emptyStateTextClass}>{disconnectedReason}</p>
				) : null}
				<IconButton
					size="sm"
					variant="ghost"
					title={retry.title}
					disabled={retry.disabled}
					onClick={onRefresh}
				>
					<Icon icon={RefreshCw} size={14} />
				</IconButton>
			</div>
		);
	}
	if (catalogLength === 0) {
		return (
			<div className={emptyStateClass} data-online-preset-empty>
				<p className={emptyStateTextClass}>No online catalog.</p>
				<IconButton
					size="sm"
					variant="ghost"
					title="Refresh catalog"
					onClick={onRefresh}
				>
					<Icon icon={RefreshCw} size={14} />
				</IconButton>
			</div>
		);
	}
	if (filteredLength === 0) {
		return (
			<div className={emptyStateClass} data-online-preset-empty>
				<p className={emptyStateTextClass}>No presets match filter.</p>
				<IconButton
					size="sm"
					variant="ghost"
					title="Clear all filters"
					onClick={onClearFilters}
				>
					<Icon icon={X} size={12} />
				</IconButton>
			</div>
		);
	}
	return null;
}

function ViewModeToggle(props: {
	mode: ViewMode;
	onModeChange: (mode: ViewMode) => void;
}): JSX.Element {
	const { mode, onModeChange } = props;
	return (
		<fieldset className={viewModeFieldsetClass}>
			<legend className={css({ srOnly: true })}>View mode</legend>
			<IconButton
				variant="ghost"
				size="sm"
				type="button"
				aria-pressed={mode === "gallery"}
				aria-label="Gallery view"
				title="Gallery (Ctrl+Wheel to zoom)"
				className={viewModeBtnClass(mode === "gallery")}
				onClick={() => onModeChange("gallery")}
			>
				<Icon icon={Grid3x3} size={10} />
			</IconButton>
			<div className={viewModeDividerClass} aria-hidden />
			<IconButton
				variant="ghost"
				size="sm"
				type="button"
				aria-pressed={mode === "cards"}
				aria-label="Cards view"
				title="Cards"
				className={viewModeBtnClass(mode === "cards")}
				onClick={() => onModeChange("cards")}
			>
				<Icon icon={LayoutGrid} size={10} />
			</IconButton>
			<div className={viewModeDividerClass} aria-hidden />
			<IconButton
				variant="ghost"
				size="sm"
				type="button"
				aria-pressed={mode === "list"}
				aria-label="List view"
				title="List"
				className={viewModeBtnClass(mode === "list")}
				onClick={() => onModeChange("list")}
			>
				<Icon icon={List} size={10} />
			</IconButton>
		</fieldset>
	);
}

function SidePanel(props: {
	showSidePanel: boolean;
	query: string;
	categories: string[];
	selectedCategory: string;
	allTags: string[];
	selectedTags: Set<string>;
	onTogglePanel: () => void;
	onQueryChange: (q: string) => void;
	onClearQuery: () => void;
	onCategoryChange: (cat: string) => void;
	onTagToggle: (tag: string) => void;
	onClearAllTags: () => void;
	onClearFilters: () => void;
}): JSX.Element | null {
	const {
		showSidePanel,
		query,
		categories,
		selectedCategory,
		allTags,
		selectedTags,
		onTogglePanel,
		onQueryChange,
		onClearQuery,
		onCategoryChange,
		onTagToggle,
		onClearAllTags,
		onClearFilters,
	} = props;

	if (!showSidePanel) return null;

	const hasFilters = Boolean(
		query || selectedCategory || selectedTags.size > 0,
	);

	return (
		<aside className={sidePanelClass}>
			{/* Side panel header with toggle */}
			<div className={sidePanelHeaderRowClass}>
				<IconButton
					size="sm"
					variant="ghost"
					title="Hide filters"
					onClick={onTogglePanel}
				>
					<Icon icon={PanelLeftClose} size={12} />
				</IconButton>
				<div className={sidePanelSearchWrapperClass}>
					<SearchField
						icon={Search}
						placeholder="Filter…"
						value={query}
						onChange={(e) => onQueryChange(e.currentTarget.value)}
						onClear={onClearQuery}
						showClearButton
						inputClassName={css({ fontSize: "xs" })}
						className={css({ height: "6" })}
					/>
				</div>
			</div>

			{/* Category filter */}
			<div className={sidePanelSectionClass}>
				<div className={sidePanelSectionHeaderClass}>
					<span className={sidePanelSectionTitleClass}>Category</span>
					<Button
						variant="ghost"
						uiSize="sm"
						disabled={!selectedCategory}
						onClick={() => onCategoryChange("")}
					>
						Clear
					</Button>
				</div>
				<div className={sidePanelCategoryListClass}>
					<button
						type="button"
						className={categoryBtnClass(selectedCategory === "")}
						onClick={() => onCategoryChange("")}
					>
						All categories
					</button>
					{categories.map((cat) => (
						<button
							key={cat}
							type="button"
							className={categoryBtnClass(selectedCategory === cat, true)}
							onClick={() => onCategoryChange(cat)}
						>
							{cat}
						</button>
					))}
				</div>
			</div>

			{/* Tags filter - checkbox list */}
			{allTags.length > 0 && (
				<div className={sidePanelTagSectionClass}>
					<div className={sidePanelSectionHeaderClass}>
						<span className={sidePanelSectionTitleClass}>Tags</span>
						<div className={sidePanelTagHeaderClass}>
							<Button
								variant="ghost"
								uiSize="sm"
								disabled={selectedTags.size === 0}
								onClick={onClearAllTags}
							>
								Clear
							</Button>
						</div>
					</div>
					<div className={sidePanelTagListClass}>
						{allTags.map((tag) => (
							<label key={tag} className={tagLabelClass(selectedTags.has(tag))}>
								<input
									type="checkbox"
									checked={selectedTags.has(tag)}
									onChange={() => onTagToggle(tag)}
									className={sidePanelTagCheckboxClass}
								/>
								<span className={sidePanelTagTextClass}>{tag}</span>
							</label>
						))}
					</div>
				</div>
			)}

			{/* Clear filters */}
			{hasFilters && (
				<div className={sidePanelClearRowClass}>
					<Button
						variant="ghost"
						uiSize="sm"
						onClick={onClearFilters}
						className={sidePanelClearBtnFullClass}
					>
						<Icon icon={X} size={10} />
						<span className={sidePanelClearLabelClass}>Clear all</span>
					</Button>
				</div>
			)}
		</aside>
	);
}

function ListTableView(props: {
	filtered: PresetSearchItem[];
	downloadingId: string | null;
	downloadState: {
		stage: DownloadProgress["stage"];
		bytesLoaded?: number;
		bytesTotal?: number;
	} | null;
	completedId: string | null;
	downloadedPresetIds: Set<string>;
	onDownload: (presetId: string) => void;
	onMouseEnter: (id: string) => void;
	onMouseLeave: () => void;
}): JSX.Element {
	const {
		filtered,
		downloadingId,
		downloadState,
		completedId,
		downloadedPresetIds,
		onDownload,
		onMouseEnter,
		onMouseLeave,
	} = props;
	return (
		<div className={listTableWrapperClass}>
			<table className={listTableClass}>
				<thead className={listTableHeaderClass}>
					<tr>
						<th className={listTableThumbHeaderClass}>Thumb</th>
						<th className={listTableHeaderCellClass}>Name / ID</th>
						<th className={listTableActionsHeaderClass}>Category</th>
						<th className={listTableActionsHeaderClass}>Actions</th>
					</tr>
				</thead>
				<tbody>
					{filtered.map((item) => (
						<tr
							key={item.presetId}
							className={listTableRowClass}
							onMouseEnter={() => onMouseEnter(item.presetId)}
							onMouseLeave={onMouseLeave}
						>
							<td className={listTableCellClass}>
								<PresetMarketThumb item={item} size="list" />
							</td>
							<td className={listTableCellClass}>
								<div className={listTableInfoColumnClass}>
									<span className={listTablePrimaryTextClass}>{item.name}</span>
									<span className={listTableSecondaryTextClass}>
										{item.presetId}
									</span>
								</div>
							</td>
							<td className={listTableCellRightClass}>
								{item.category ? (
									<CategoryBadge category={item.category} />
								) : (
									<span className={listTableMutedClass}>—</span>
								)}
							</td>
							<td className={listTableCellClass}>
								<div className={listTableActionsClass}>
									{item.notionPageUrl ? (
										<IconButton
											size="sm"
											variant="ghost"
											title="Open Notion"
											onClick={() =>
												openUrlInDefaultBrowser(item.notionPageUrl ?? "")
											}
											className={borderedButtonClass}
										>
											<Icon icon={ExternalLink} size={10} />
										</IconButton>
									) : null}
									<DownloadProgressIconButton
										iconSize={10}
										onClick={() => void onDownload(item.presetId)}
										isDownloaded={downloadedPresetIds.has(item.presetId)}
										isComplete={completedId === item.presetId}
										stage={
											downloadingId === item.presetId
												? downloadState?.stage
												: undefined
										}
										bytesLoaded={
											downloadingId === item.presetId
												? downloadState?.bytesLoaded
												: undefined
										}
										bytesTotal={
											downloadingId === item.presetId
												? downloadState?.bytesTotal
												: undefined
										}
										className={borderedButtonClass}
									/>
								</div>
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

function LibraryFooter({
	filtered,
	catalog,
	mode,
	scale,
}: {
	filtered: number;
	catalog: number;
	mode: string;
	scale: number;
}): JSX.Element {
	return (
		<div className={footerClass}>
			<span className={footerTextClass}>
				{filtered} / {catalog} items
			</span>
			{mode === "gallery" && (
				<span className={footerZoomTextClass}>
					Ctrl+Wheel: {Math.round(scale * 100)}%
				</span>
			)}
		</div>
	);
}

const SURFACE_ID = "dialog-preset-library";

export function PresetLibrary(): JSX.Element {
	const [catalog, setCatalog] = useState<PresetSearchItem[]>([]);
	const [_status, setStatus] = useState("");
	const [loading, setLoading] = useState(true);
	const [query, setQuery] = useState("");
	const [selectedCategory, setSelectedCategory] = useState<string>("");
	const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
	const [mode, setMode] = useState<ViewMode>("gallery");
	const [scale, setScale] = useState(1);
	const [showSidePanel, setShowSidePanel] = useState(true);
	const [downloadingId, setDownloadingId] = useState<string | null>(null);
	const [downloadState, setDownloadState] = useState<DownloadProgress | null>(
		null,
	);
	const cumulativeBytesRef = useRef(0);
	const lastStageRef = useRef<DownloadProgress["stage"] | null>(null);
	const [completedId, setCompletedId] = useState<string | null>(null);
	const [isReloading, setIsReloading] = useState(false);
	const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
	const contextItemIdRef = useRef<string | null>(null);
	const [downloadedPresetIds, setDownloadedPresetIds] = useState<Set<string>>(
		new Set(),
	);
	const [catalogLoadError, setCatalogLoadError] = useState<string | null>(null);

	// Subscribe to the gateway health store so the empty-state
	// `data-gateway-boot-reason` attribute reflects the actual
	// classified boot reason instead of a hard-coded
	// `"worker-runtime-failed"`. Only the `degraded` branch carries a
	// reason; `live` and `offline` map to `undefined` so the
	// PresetLibraryEmptyState renders the bare disconnected copy.
	const gatewayHealth = useSyncExternalStore(
		subscribeGatewayHealth,
		readGatewayHealth,
		readGatewayHealth,
	);
	const disconnectedReasonTag: GatewayBootFailureReason | undefined =
		gatewayHealth.state === "degraded"
			? gatewayHealth.failure.reason
			: undefined;

	const handlersRef = useRef<{
		closeWindow: () => void;
		reload: () => Promise<void>;
		clearSearch: () => void;
		pasteSearch: () => Promise<void>;
	}>({
		closeWindow: () => {},
		reload: async () => {},
		clearSearch: () => setQuery(""),
		pasteSearch: async () => {
			try {
				const text = await navigator.clipboard.readText();
				setQuery(text);
			} catch {
				// clipboard unavailable
			}
		},
	});

	const loadCatalog = useCallback(async () => {
		setLoading(true);
		setIsReloading(true);
		setStatus("");
		setCatalogLoadError(null);
		try {
			const result = await searchCatalog({ limit: CATALOG_LIMIT });
			setCatalog(result.items);
			setStatus("");
		} catch (err) {
			setCatalog([]);
			setCatalogLoadError(
				sanitizeOnlineErrorMessage(
					err instanceof Error ? err.message : String(err),
				),
			);
		}
		setLoading(false);
		setIsReloading(false);
	}, []);

	useEffect(() => {
		void loadCatalog();
	}, [loadCatalog]);

	// Initialize downloaded preset IDs
	useEffect(() => {
		if (catalog.length === 0) return;
		const checkDownloaded = async () => {
			const { presetRepository } = getDataServices();
			const locals = presetRepository.listLocalPresets();
			const downloadedSources = new Set(
				locals
					.map((row) => row.data?.sourceCatalogId)
					.filter((id): id is string => typeof id === "string"),
			);
			const downloaded = new Set<string>();
			for (const item of catalog) {
				if (downloadedSources.has(item.presetId)) {
					downloaded.add(item.presetId);
				}
			}
			setDownloadedPresetIds(downloaded);
		};
		void checkDownloaded();
	}, [catalog]);

	// Make handlers available to external callers via ref
	useEffect(() => {
		handlersRef.current.reload = loadCatalog;
	}, [loadCatalog]);

	useEffect(() => {
		handlersRef.current.closeWindow = () => {
			window.close();
		};
	}, []);

	// Ctrl+Wheel for zoom
	useEffect(() => {
		if (mode !== "gallery") return;
		const handleWheel = (e: Event): void => {
			const wheelEvent = e as WheelEvent;
			if (wheelEvent.ctrlKey || wheelEvent.metaKey) {
				e.preventDefault();
				const delta = wheelEvent.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
				setScale((s) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, s + delta)));
			}
		};
		const container = document.querySelector("[data-preset-gallery]");
		if (container) {
			container.addEventListener("wheel", handleWheel, {
				passive: false,
			} as AddEventListenerOptions);
			return () => container.removeEventListener("wheel", handleWheel);
		}
	}, [mode]);

	// Get unique categories
	const categories = useMemo(() => {
		const cats = new Set<string>();
		for (const item of catalog) {
			if (item.category) cats.add(item.category);
		}
		return Array.from(cats).sort();
	}, [catalog]);

	// Get unique tags
	const allTags = useMemo(() => {
		const tags = new Set<string>();
		for (const item of catalog) {
			for (const tag of item.tag ?? []) {
				tags.add(tag);
			}
		}
		return Array.from(tags).sort();
	}, [catalog]);

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		return catalog.filter((item) => {
			if (q) {
				const name = item.name.toLowerCase();
				const id = item.presetId.toLowerCase();
				const desc = item.description?.toLowerCase() ?? "";
				const tags = item.tag?.join(" ").toLowerCase() ?? "";
				if (
					!name.includes(q) &&
					!id.includes(q) &&
					!desc.includes(q) &&
					!tags.includes(q)
				) {
					return false;
				}
			}
			if (selectedCategory && item.category !== selectedCategory) {
				return false;
			}
			if (selectedTags.size > 0) {
				const itemTags = new Set(item.tag ?? []);
				let hasTag = false;
				for (const t of selectedTags) {
					if (itemTags.has(t)) {
						hasTag = true;
						break;
					}
				}
				if (!hasTag) return false;
			}
			return true;
		});
	}, [catalog, query, selectedCategory, selectedTags]);

	const handleDownload = useCallback(
		async (presetId: string) => {
			setDownloadingId(presetId);
			cumulativeBytesRef.current = 0;
			lastStageRef.current = null;
			setDownloadState({ stage: "fetch", bytesLoaded: 0 });
			const searchItem = catalog.find((i) => i.presetId === presetId);
			const thumbnailUrl = searchItem?.thumbnailUrl;
			try {
				const installed = await downloadAndInstallPreset(
					window,
					presetId,
					(event) => {
						if (event.stage !== lastStageRef.current) {
							cumulativeBytesRef.current = 0;
							lastStageRef.current = event.stage;
						}
						if (event.bytesLoaded !== undefined) {
							cumulativeBytesRef.current = Math.max(
								cumulativeBytesRef.current,
								event.bytesLoaded,
							);
						}
						setDownloadState({
							...event,
							bytesLoaded: cumulativeBytesRef.current,
						});
					},
					{
						title: searchItem?.name,
						category: searchItem?.category,
						description: searchItem?.description,
						thumbnailUrl,
					},
				);
				setDownloadedPresetIds((prev) => new Set(prev).add(presetId));
				setCompletedId(presetId);
				await notifyPanelsAfterPresetSave(window, {
					sourceSurfaceId: SURFACE_ID,
					catalogRefIds: [installed.preset.id],
				});
				await syncCatalog();
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				await showExtendScriptAlert(window, `Download failed: ${msg}`);
			}
			setDownloadingId(null);
			setDownloadState(null);
		},
		[catalog],
	);

	const handleClearQuery = useCallback(() => {
		setQuery("");
	}, []);

	const handleClearFilters = useCallback(() => {
		setQuery("");
		setSelectedCategory("");
		setSelectedTags(new Set());
	}, []);

	const handleTagToggle = useCallback((tag: string) => {
		setSelectedTags((prev) => {
			const n = new Set(prev);
			if (n.has(tag)) {
				n.delete(tag);
			} else {
				n.add(tag);
			}
			return n;
		});
	}, []);

	const handleClearAllTags = useCallback(() => {
		setSelectedTags(new Set());
	}, []);

	// Context menu registration
	useEffect(() => {
		const buildPayload = (event: MouseEvent): CepMenuPayload => {
			const target = event.target instanceof Element ? event.target : null;
			const card = target?.closest("[data-ws-preset-card]");
			const hitPresetId = card?.getAttribute("data-ws-preset-card") ?? "";
			const hasFilters = Boolean(
				query || selectedCategory || selectedTags.size > 0,
			);
			const currentItemId = hitPresetId || hoveredItemId;
			contextItemIdRef.current = currentItemId || null;
			const hoveredItem = currentItemId
				? catalog.find((i) => i.presetId === currentItemId)
				: null;
			const menu: Array<{
				id?: string;
				label: string;
				enabled?: boolean;
				checkable?: boolean;
				checked?: boolean;
				menu?: Array<{
					id?: string;
					label: string;
					enabled?: boolean;
					checkable?: boolean;
					checked?: boolean;
				}>;
			}> = [
				{ id: CTX.bodyReload, label: "Reload catalog" },
				{
					id: CTX.sidePanelToggle,
					label: showSidePanel ? "Hide side panel" : "Show side panel",
					checkable: true,
					checked: showSidePanel,
				},
				{
					id: "ty.ctx.online-preset-library.view",
					label: "View",
					menu: [
						{
							id: CTX.viewGallery,
							label: "Gallery",
							checkable: true,
							checked: mode === "gallery",
						},
						{
							id: CTX.viewCards,
							label: "Cards",
							checkable: true,
							checked: mode === "cards",
						},
						{
							id: CTX.viewList,
							label: "List",
							checkable: true,
							checked: mode === "list",
						},
					],
				},
			];
			if (hoveredItem) {
				menu.push({ label: "---" });
				menu.push({ id: CTX.itemDownload, label: "Download" });
				menu.push({ id: CTX.itemImport, label: "Import" });
				if (hoveredItem.notionPageUrl) {
					menu.push({ id: CTX.itemOpenNotion, label: "Open manual (Notion)" });
				}
			} else {
				menu.push({ label: "---" });
				menu.push({
					id: CTX.searchClear,
					label: "Clear search",
					enabled: query.length > 0,
				});
				menu.push({
					id: CTX.categoryClear,
					label: "Clear category filter",
					enabled: selectedCategory !== "",
				});
				menu.push({
					id: CTX.tagClearAll,
					label: "Clear tag selection",
					enabled: selectedTags.size > 0,
				});
				menu.push({
					id: CTX.clearAllFilters,
					label: "Clear all filters",
					enabled: hasFilters,
				});
			}
			return { menu };
		};

		const onMenuSelect = (menuId: string) => {
			if (menuId === CTX.headerClose) {
				handlersRef.current.closeWindow();
				return;
			}
			if (menuId === CTX.bodyReload) {
				void handlersRef.current.reload();
				return;
			}
			if (menuId === CTX.sidePanelToggle) {
				setShowSidePanel((p) => !p);
				return;
			}
			if (menuId === CTX.viewGallery) {
				setMode("gallery");
				return;
			}
			if (menuId === CTX.viewCards) {
				setMode("cards");
				return;
			}
			if (menuId === CTX.viewList) {
				setMode("list");
				return;
			}
			if (menuId === CTX.searchClear) {
				handlersRef.current.clearSearch();
				return;
			}
			if (menuId === CTX.categoryClear) {
				setSelectedCategory("");
				return;
			}
			if (menuId === CTX.tagClearAll) {
				handleClearAllTags();
				return;
			}
			if (menuId === CTX.clearAllFilters) {
				handleClearFilters();
				return;
			}
			if (menuId === CTX.itemDownload && contextItemIdRef.current) {
				void handleDownload(contextItemIdRef.current);
				return;
			}
			if (menuId === CTX.itemImport && contextItemIdRef.current) {
				void handleDownload(contextItemIdRef.current);
				return;
			}
			if (menuId === CTX.itemOpenNotion && contextItemIdRef.current) {
				const item = catalog.find(
					(i) => i.presetId === contextItemIdRef.current,
				);
				if (item?.notionPageUrl) openUrlInDefaultBrowser(item.notionPageUrl);
				return;
			}
		};

		return registerCepJsonContextMenuSurface(SURFACE_ID, {
			buildPayload,
			onMenuSelect,
		});
	}, [
		showSidePanel,
		query,
		selectedCategory,
		selectedTags,
		handleClearAllTags,
		handleClearFilters,
		handleDownload,
		hoveredItemId,
		catalog,
		mode,
	]);

	const emptyState = (
		<EmptyState
			loading={loading}
			catalogLength={catalog.length}
			filteredLength={filtered.length}
			onRefresh={() => void loadCatalog()}
			onClearFilters={handleClearFilters}
			disconnected={Boolean(catalogLoadError)}
			disconnectedReason={catalogLoadError ?? undefined}
			disconnectedReasonTag={disconnectedReasonTag}
		/>
	);

	const resultsBody =
		mode === "list" ? (
			<ListTableView
				filtered={filtered}
				downloadingId={downloadingId}
				downloadState={downloadState}
				completedId={completedId}
				downloadedPresetIds={downloadedPresetIds}
				onDownload={handleDownload}
				onMouseEnter={(id) => setHoveredItemId(id)}
				onMouseLeave={() => setHoveredItemId(null)}
			/>
		) : mode === "gallery" ? (
			<div
				className={gridGalleryClass}
				data-preset-gallery
				style={{
					gridTemplateColumns: `repeat(auto-fill, minmax(${140 * scale}px, 1fr))`,
				}}
			>
				{filtered.map((item) => (
					<GalleryCard
						key={item.presetId}
						item={item}
						downloadingId={downloadingId}
						downloadState={
							downloadingId === item.presetId ? downloadState : null
						}
						completedId={completedId}
						onDownload={() => void handleDownload(item.presetId)}
						isDownloaded={downloadedPresetIds.has(item.presetId)}
						onMouseEnter={() => setHoveredItemId(item.presetId)}
						onMouseLeave={() => setHoveredItemId(null)}
					/>
				))}
			</div>
		) : (
			<div
				className={gridCardsClass}
				data-preset-cards
				style={{
					gridTemplateColumns: "repeat(auto-fill, minmax(20rem, 1fr))",
				}}
			>
				{filtered.map((item) => (
					<CardItem
						key={item.presetId}
						item={item}
						downloadingId={downloadingId}
						downloadState={
							downloadingId === item.presetId ? downloadState : null
						}
						completedId={completedId}
						onDownload={() => void handleDownload(item.presetId)}
						isDownloaded={downloadedPresetIds.has(item.presetId)}
						onMouseEnter={() => setHoveredItemId(item.presetId)}
						onMouseLeave={() => setHoveredItemId(null)}
					/>
				))}
			</div>
		);

	return (
		<section
			className={presetLibraryClass}
			data-surface-id={SURFACE_ID}
			data-online-preset-library
		>
			{/* Side panel */}
			<SidePanel
				showSidePanel={showSidePanel}
				query={query}
				categories={categories}
				selectedCategory={selectedCategory}
				allTags={allTags}
				selectedTags={selectedTags}
				onTogglePanel={() => setShowSidePanel(false)}
				onQueryChange={setQuery}
				onClearQuery={handleClearQuery}
				onCategoryChange={setSelectedCategory}
				onTagToggle={handleTagToggle}
				onClearAllTags={handleClearAllTags}
				onClearFilters={handleClearFilters}
			/>

			{/* Main content */}
			<div className={mainContentClass}>
				{/* Header row */}
				<div className={headerRowClass}>
					{!showSidePanel && (
						<IconButton
							size="sm"
							variant="ghost"
							title="Show filters"
							onClick={() => setShowSidePanel(true)}
						>
							<Icon icon={PanelLeftClose} size={12} />
						</IconButton>
					)}
					<h1 className={headerTitleClass}>Online Preset Library</h1>
					<div className={headerSpacerClass}>
						<IconButton
							size="sm"
							variant="ghost"
							title={isReloading ? "Reloading…" : "Reload catalog"}
							onClick={() => void loadCatalog()}
							disabled={isReloading}
							className={cx(isReloading && spinningClass)}
						>
							<Icon icon={isReloading ? LoaderCircle : RefreshCw} size={12} />
						</IconButton>
					</div>
				</div>

				{/* Search row */}
				<div className={searchRowClass}>
					<div className={searchRowInputWrapperClass}>
						<SearchField
							icon={Search}
							placeholder="Filter by name, ID, description, category, tag"
							value={query}
							onChange={(e) => setQuery(e.currentTarget.value)}
							onClear={handleClearQuery}
							showClearButton
							className={searchFieldFullClass}
							inputClassName={searchInputLgClass}
						/>
					</div>
					{/* View toggle */}
					<ViewModeToggle mode={mode} onModeChange={setMode} />
				</div>

				{/* Results area */}
				<div className={resultsAreaClass}>
					{emptyState}
					{filtered.length > 0 ? resultsBody : null}
				</div>

				{/* Footer */}
				<LibraryFooter
					filtered={filtered.length}
					catalog={catalog.length}
					mode={mode}
					scale={scale}
				/>
			</div>
		</section>
	);
}
