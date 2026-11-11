import type { JSX } from "react";
import type { DownloadProgress } from "@/management/online/catalog/use-cases";
import type { PresetSearchItem } from "@/management/online/contract";
import { css } from "@/styled-system/css";
import { PresetMarketCard, PresetMarketCardItem } from "./PresetMarketCard";
import { PresetMarketTable } from "./PresetMarketTable";
import type { ViewMode } from "./preset-library-types";

export type PresetMarketResultsProps = {
	mode: ViewMode;
	scale: number;
	filtered: PresetSearchItem[];
	downloadingId: string | null;
	downloadState: DownloadProgress | null;
	completedId: string | null;
	downloadedPresetIds: Set<string>;
	onDownload: (presetId: string) => void;
	onHover: (presetId: string | null) => void;
};

const galleryGridClass = css({
	display: "grid",
	gap: "2",
});

const cardsGridClass = css({
	display: "grid",
	gap: "2",
});

export function PresetMarketResults(
	props: PresetMarketResultsProps,
): JSX.Element {
	const {
		mode,
		scale,
		filtered,
		downloadingId,
		downloadState,
		completedId,
		downloadedPresetIds,
		onDownload,
		onHover,
	} = props;
	if (mode === "list") {
		return (
			<PresetMarketTable
				filtered={filtered}
				downloadingId={downloadingId}
				downloadState={downloadState}
				completedId={completedId}
				downloadedPresetIds={downloadedPresetIds}
				onDownload={onDownload}
				onMouseEnter={(id) => onHover(id)}
				onMouseLeave={() => onHover(null)}
			/>
		);
	}
	if (mode === "gallery") {
		return (
			<div
				className={galleryGridClass}
				data-preset-gallery
				style={{
					gridTemplateColumns: `repeat(auto-fill, minmax(${140 * scale}px, 1fr))`,
				}}
			>
				{filtered.map((item) => (
					<PresetMarketCard
						key={item.presetId}
						item={item}
						downloadingId={downloadingId}
						downloadState={
							downloadingId === item.presetId ? downloadState : null
						}
						completedId={completedId}
						onDownload={() => void onDownload(item.presetId)}
						isDownloaded={downloadedPresetIds.has(item.presetId)}
						onMouseEnter={() => onHover(item.presetId)}
						onMouseLeave={() => onHover(null)}
					/>
				))}
			</div>
		);
	}
	return (
		<div
			className={cardsGridClass}
			data-preset-cards
			style={{
				gridTemplateColumns: "repeat(auto-fill, minmax(20rem, 1fr))",
			}}
		>
			{filtered.map((item) => (
				<PresetMarketCardItem
					key={item.presetId}
					item={item}
					downloadingId={downloadingId}
					downloadState={downloadingId === item.presetId ? downloadState : null}
					completedId={completedId}
					onDownload={() => void onDownload(item.presetId)}
					isDownloaded={downloadedPresetIds.has(item.presetId)}
					onMouseEnter={() => onHover(item.presetId)}
					onMouseLeave={() => onHover(null)}
				/>
			))}
		</div>
	);
}
