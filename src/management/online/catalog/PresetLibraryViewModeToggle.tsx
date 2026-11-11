import { Grid3x3, LayoutGrid, List } from "lucide-react";
import type { JSX } from "react";
import { IconButton } from "@/shared/component/controls/IconButton";
import { Icon } from "@/shared/component/icons/Icon";
import { cx } from "@/shared/util/cx";
import { css } from "@/styled-system/css";
import type { ViewMode } from "./preset-library-types";

const buttonBaseClass = css({
	height: "full",
	minHeight: 0,
	width: "7",
	flexShrink: 0,
	borderRadius: 0,
	borderWidth: 0,
	padding: 0,
});

const buttonActiveClass = css({
	backgroundColor: "surface.widget",
	color: "text.primary",
	boxShadow: "sm",
});

const buttonInactiveClass = css({
	color: "text.muted",
});

function viewModeBtnClass(active: boolean): string {
	return cx(buttonBaseClass, active ? buttonActiveClass : buttonInactiveClass);
}

const fieldsetClass = css({
	margin: 0,
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

const dividerClass = css({
	width: "px",
	flexShrink: 0,
	alignSelf: "stretch",
	backgroundColor: "border.default",
});

export type PresetLibraryViewModeToggleProps = {
	mode: ViewMode;
	onModeChange: (mode: ViewMode) => void;
};

export function PresetLibraryViewModeToggle(
	props: PresetLibraryViewModeToggleProps,
): JSX.Element {
	const { mode, onModeChange } = props;
	return (
		<fieldset className={fieldsetClass}>
			<legend className="sr-only">View mode</legend>
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
			<div className={dividerClass} aria-hidden />
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
			<div className={dividerClass} aria-hidden />
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
