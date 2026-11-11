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

export type PresetMarketTableProps = {
	filtered: PresetSearchItem[];
	downloadingId: string | null;
	downloadState: DownloadProgress | null;
	completedId: string | null;
	downloadedPresetIds: Set<string>;
	onDownload: (presetId: string) => void;
	onMouseEnter: (id: string) => void;
	onMouseLeave: () => void;
};

const tableWrapperClass = css({
	display: "flex",
	flexDirection: "column",
	minHeight: 0,
	flex: "1",
	overflow: "auto",
});

const tableClass = css({
	width: "full",
	borderCollapse: "collapse",
});

const headerRowClass = css({
	position: "sticky",
	top: 0,
	zIndex: 10,
	backgroundColor: "surface.panel",
});

const headerCellClass = css({
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

const thumbHeaderClass = css({
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

const actionsHeaderClass = css({
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

const rowClass = css({
	_hover: { backgroundColor: "surface.overlay" },
});

const cellClass = css({
	paddingInline: "2",
	paddingBlock: "2",
	borderBottomWidth: "1px",
	borderBottomStyle: "solid",
	borderBottomColor: "border.default",
	verticalAlign: "middle",
});

const cellRightClass = css({
	paddingInline: "2",
	paddingBlock: "2",
	borderBottomWidth: "1px",
	borderBottomStyle: "solid",
	borderBottomColor: "border.default",
	verticalAlign: "middle",
	textAlign: "right",
});

const infoColumnClass = css({
	display: "flex",
	flexDirection: "column",
	gap: "0.5",
	minWidth: 0,
});

const primaryTextClass = css({
	fontSize: "sm",
	color: "text.primary",
	truncate: true,
});

const secondaryTextClass = css({
	fontSize: "xs",
	color: "text.muted",
	truncate: true,
});

const mutedClass = css({
	color: "text.muted",
});

const actionsClass = css({
	display: "flex",
	alignItems: "center",
	justifyContent: "flex-end",
	gap: "1",
});

const borderedButtonClass = css({
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
});

export function PresetMarketTable(props: PresetMarketTableProps): JSX.Element {
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
		<div className={tableWrapperClass}>
			<table className={tableClass}>
				<thead className={headerRowClass}>
					<tr>
						<th className={thumbHeaderClass}>Thumb</th>
						<th className={headerCellClass}>Name / ID</th>
						<th className={actionsHeaderClass}>Category</th>
						<th className={actionsHeaderClass}>Actions</th>
					</tr>
				</thead>
				<tbody>
					{filtered.map((item) => (
						<tr
							key={item.presetId}
							className={rowClass}
							onMouseEnter={() => onMouseEnter(item.presetId)}
							onMouseLeave={onMouseLeave}
						>
							<td className={cellClass}>
								<PresetMarketThumb item={item} size="list" />
							</td>
							<td className={cellClass}>
								<div className={infoColumnClass}>
									<span className={primaryTextClass}>{item.name}</span>
									<span className={secondaryTextClass}>{item.presetId}</span>
								</div>
							</td>
							<td className={cellRightClass}>
								{item.category ? (
									<PresetCategoryBadge category={item.category} />
								) : (
									<span className={mutedClass}>—</span>
								)}
							</td>
							<td className={cellClass}>
								<div className={actionsClass}>
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
