import { PanelLeftClose, Search, X } from "lucide-react";
import type { JSX } from "react";
import { Button } from "@/shared/component/controls/Button";
import { IconButton } from "@/shared/component/controls/IconButton";
import { SearchField } from "@/shared/component/fields/SearchField";
import { Icon } from "@/shared/component/icons/Icon";
import { cx } from "@/shared/util/cx";
import { css } from "@/styled-system/css";

export type PresetLibrarySidePanelProps = {
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
};

const asideClass = css({
	width: "56",
	flexShrink: 0,
	borderRightWidth: "1px",
	borderRightStyle: "solid",
	borderRightColor: "border.default",
	display: "flex",
	flexDirection: "column",
	overflow: "hidden",
});

const headerRowClass = css({
	display: "flex",
	alignItems: "center",
	gap: "2",
	paddingInline: "3",
	paddingBlock: "2",
	borderBottomWidth: "1px",
	borderBottomStyle: "solid",
	borderBottomColor: "border.default",
});

const searchWrapperClass = css({
	flex: "1",
	minWidth: 0,
});

const searchInputSmallClass = css({
	fontSize: "xs",
});

const searchFieldHeightClass = css({
	height: "6",
});

const categorySectionClass = css({
	display: "flex",
	flexDirection: "column",
	gap: "1",
	paddingInline: "3",
	paddingBlock: "2",
});

const sectionHeaderClass = css({
	display: "flex",
	alignItems: "center",
	justifyContent: "space-between",
});

const sectionTitleClass = css({
	fontSize: "sm",
	color: "text.muted",
	textTransform: "uppercase",
	letterSpacing: "wider",
});

const categoryListClass = css({
	display: "flex",
	flexDirection: "column",
	gap: "0.5",
});

const categoryButtonBaseClass = css({
	textAlign: "left",
	fontSize: "sm",
	paddingInline: "2",
	paddingBlock: "1",
	borderRadius: "sm",
	transitionProperty: "colors",
});

const categoryButtonActiveClass = css({
	backgroundColor: "surface.widget",
	color: "text.primary",
});

const categoryButtonInactiveClass = css({
	color: "text.muted",
	_hover: {
		backgroundColor: "surface.overlay",
		color: "text.primary",
	},
});

const categoryButtonTruncateClass = css({
	truncate: true,
});

const tagSectionClass = css({
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

const tagHeaderClass = css({
	display: "flex",
	gap: "2",
});

const tagListClass = css({
	display: "flex",
	flexDirection: "column",
	gap: "0.5",
});

const tagLabelBaseClass = css({
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

const tagLabelActiveClass = css({
	backgroundColor: "surface.widget",
	color: "text.primary",
});

const tagLabelInactiveClass = css({
	color: "text.muted",
	_hover: { backgroundColor: "surface.overlay" },
});

const checkboxClass = css({
	width: "3",
	height: "3",
	flexShrink: 0,
	accentColor: "ty-text-accent",
});

const tagTextClass = css({
	truncate: true,
});

const clearAllRowClass = css({
	paddingInline: "3",
	paddingBlock: "2",
	borderTopWidth: "1px",
	borderTopStyle: "solid",
	borderTopColor: "border.default",
});

const fullWidthButtonClass = css({
	width: "full",
});

const clearAllLabelClass = css({
	marginLeft: "1",
	fontSize: "xs",
});

function categoryButtonClass(active: boolean, truncate = false): string {
	return cx(
		categoryButtonBaseClass,
		active ? categoryButtonActiveClass : categoryButtonInactiveClass,
		truncate && categoryButtonTruncateClass,
	);
}

function tagLabelClass(active: boolean): string {
	return cx(
		tagLabelBaseClass,
		active ? tagLabelActiveClass : tagLabelInactiveClass,
	);
}

export function PresetLibrarySidePanel(
	props: PresetLibrarySidePanelProps,
): JSX.Element | null {
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
		<aside className={asideClass}>
			<div className={headerRowClass}>
				<IconButton
					size="sm"
					variant="ghost"
					title="Hide filters"
					onClick={onTogglePanel}
				>
					<Icon icon={PanelLeftClose} size={12} />
				</IconButton>
				<div className={searchWrapperClass}>
					<SearchField
						icon={Search}
						placeholder="Filter…"
						value={query}
						onChange={(e) => onQueryChange(e.currentTarget.value)}
						onClear={onClearQuery}
						showClearButton
						inputClassName={searchInputSmallClass}
						className={searchFieldHeightClass}
					/>
				</div>
			</div>

			<div className={categorySectionClass}>
				<div className={sectionHeaderClass}>
					<span className={sectionTitleClass}>Category</span>
					<Button
						variant="ghost"
						uiSize="sm"
						disabled={!selectedCategory}
						onClick={() => onCategoryChange("")}
					>
						Clear
					</Button>
				</div>
				<div className={categoryListClass}>
					<button
						type="button"
						className={categoryButtonClass(selectedCategory === "")}
						onClick={() => onCategoryChange("")}
					>
						All categories
					</button>
					{categories.map((cat) => (
						<button
							key={cat}
							type="button"
							className={categoryButtonClass(selectedCategory === cat, true)}
							onClick={() => onCategoryChange(cat)}
						>
							{cat}
						</button>
					))}
				</div>
			</div>

			{allTags.length > 0 && (
				<div className={tagSectionClass}>
					<div className={sectionHeaderClass}>
						<span className={sectionTitleClass}>Tags</span>
						<div className={tagHeaderClass}>
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
					<div className={tagListClass}>
						{allTags.map((tag) => (
							<label key={tag} className={tagLabelClass(selectedTags.has(tag))}>
								<input
									type="checkbox"
									checked={selectedTags.has(tag)}
									onChange={() => onTagToggle(tag)}
									className={checkboxClass}
								/>
								<span className={tagTextClass}>{tag}</span>
							</label>
						))}
					</div>
				</div>
			)}

			{hasFilters && (
				<div className={clearAllRowClass}>
					<Button
						variant="ghost"
						uiSize="sm"
						onClick={onClearFilters}
						className={fullWidthButtonClass}
					>
						<Icon icon={X} size={10} />
						<span className={clearAllLabelClass}>Clear all</span>
					</Button>
				</div>
			)}
		</aside>
	);
}
