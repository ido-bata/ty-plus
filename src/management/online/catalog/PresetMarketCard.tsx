import { ExternalLink } from "lucide-react";
import type { JSX } from "react";
import { DownloadProgressIconButton } from "@/management/online/catalog/DownloadProgressIconButton";
import type { DownloadProgress } from "@/management/online/catalog/use-cases";
import type { PresetSearchItem } from "@/management/online/contract";
import { openUrlInDefaultBrowser } from "@/management/workspace/hooks/helpers";
import { IconButton } from "@/shared/component/controls/IconButton";
import { Icon } from "@/shared/component/icons/Icon";
import { css } from "@/styled-system/css";
import { PresetCategoryBadge, PresetMarketThumb } from "./PresetMarketThumb";

export type PresetMarketCardProps = {
	item: PresetSearchItem;
	downloadingId: string | null;
	downloadState: DownloadProgress | null;
	completedId: string | null;
	onDownload: () => void;
	isDownloaded?: boolean;
	onMouseEnter?: () => void;
	onMouseLeave?: () => void;
};

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

const borderedButtonClass = css({
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
});

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

export function PresetMarketCard(props: PresetMarketCardProps): JSX.Element {
	const {
		item,
		downloadingId,
		downloadState,
		completedId,
		onDownload,
		isDownloaded,
		onMouseEnter,
		onMouseLeave,
	} = props;
	const hasDescription = Boolean(item.description);
	const isDownloading =
		downloadingId === item.presetId && downloadState !== null;
	const isComplete = completedId === item.presetId;
	return (
		<article
			className={galleryCardClass}
			data-ws-preset-card={item.presetId}
			onMouseEnter={onMouseEnter}
			onMouseLeave={onMouseLeave}
		>
			<div className={galleryThumbWrapClass}>
				<PresetMarketThumb item={item} size="gallery" />
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

export function PresetMarketCardItem(
	props: PresetMarketCardProps,
): JSX.Element {
	const {
		item,
		downloadingId,
		downloadState,
		completedId,
		onDownload,
		isDownloaded,
		onMouseEnter,
		onMouseLeave,
	} = props;
	const isDownloading =
		downloadingId === item.presetId && downloadState !== null;
	const isComplete = completedId === item.presetId;
	return (
		<article
			className={itemCardClass}
			data-ws-preset-card={item.presetId}
			onMouseEnter={onMouseEnter}
			onMouseLeave={onMouseLeave}
		>
			<div className={itemThumbClass}>
				<PresetMarketThumb item={item} size="card" />
			</div>
			<div className={itemBodyClass}>
				<div className={itemHeaderClass}>
					<h3 className={itemTitleClass}>{item.name}</h3>
					{item.category ? (
						<PresetCategoryBadge category={item.category} />
					) : null}
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
