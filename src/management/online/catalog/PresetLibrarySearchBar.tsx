import { Search } from "lucide-react";
import type { JSX } from "react";
import { SearchField } from "@/shared/component/fields/SearchField";
import { css } from "@/styled-system/css";
import { PresetLibraryViewModeToggle } from "./PresetLibraryViewModeToggle";
import type { ViewMode } from "./preset-library-types";

export type PresetLibrarySearchBarProps = {
	query: string;
	onQueryChange: (q: string) => void;
	onClearQuery: () => void;
	mode: ViewMode;
	onModeChange: (mode: ViewMode) => void;
};

const barClass = css({
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

const searchWrapperClass = css({
	flex: "1",
	minWidth: 0,
	height: "7",
});

const searchFullClass = css({
	width: "full",
	height: "full",
});

const searchInputClass = css({
	fontSize: "sm",
});

export function PresetLibrarySearchBar(
	props: PresetLibrarySearchBarProps,
): JSX.Element {
	const { query, onQueryChange, onClearQuery, mode, onModeChange } = props;
	return (
		<div className={barClass}>
			<div className={searchWrapperClass}>
				<SearchField
					icon={Search}
					placeholder="Filter by name, ID, description, category, tag"
					value={query}
					onChange={(e) => onQueryChange(e.currentTarget.value)}
					onClear={onClearQuery}
					showClearButton
					className={searchFullClass}
					inputClassName={searchInputClass}
				/>
			</div>
			<PresetLibraryViewModeToggle mode={mode} onModeChange={onModeChange} />
		</div>
	);
}
