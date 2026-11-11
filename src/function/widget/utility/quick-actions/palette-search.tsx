import type { JSX, RefObject } from "react";
import { SearchIcon } from "@/management/workspace/surface/widget-grid-icons";
import { css } from "@/styled-system/css";

export type PaletteSearchProps = {
	anchorRef: RefObject<HTMLDivElement | null>;
	inputRef: RefObject<HTMLInputElement | null>;
	value: string;
	placeholder: string;
	instanceAttr: Record<string, string | undefined>;
	onChange: (next: string) => void;
	onFocus: () => void;
	onBlur: (ev: React.FocusEvent<HTMLInputElement>) => void;
};

export function PaletteSearch({
	anchorRef,
	inputRef,
	value,
	placeholder,
	instanceAttr,
	onChange,
	onFocus,
	onBlur,
}: PaletteSearchProps): JSX.Element {
	return (
		<div
			ref={anchorRef}
			className={css({
				display: "flex",
				minHeight: 0,
				minWidth: 0,
				flex: 1,
				alignItems: "stretch",
				gap: "var(--ty-space-1-5)",
				borderRadius: "var(--radius)",
				borderWidth: "1px",
				borderStyle: "solid",
				borderColor: "border.default",
				backgroundColor: "surface.panel",
				paddingInline: "var(--ty-space-1-5)",
				paddingBlock: 0,
			})}
		>
			<SearchIcon
				className={css({
					height: "4",
					width: "4",
					flexShrink: 0,
					alignSelf: "center",
					color: "text.muted",
				})}
				aria-hidden
			/>
			<input
				ref={inputRef}
				className={css({
					minHeight: 0,
					minWidth: 0,
					flex: 1,
					borderWidth: 0,
					backgroundColor: "transparent",
					paddingBlock: "var(--ty-space-1)",
					fontFamily: "inherit",
					fontSize: "text-xs",
					lineHeight: "snug",
					color: "text.primary",
					outline: "none",
					_placeholder: { color: "text.muted" },
				})}
				type="text"
				placeholder={placeholder}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				data-ws-action="search"
				autoComplete="off"
				spellCheck={false}
				onFocus={onFocus}
				onBlur={onBlur}
				{...instanceAttr}
			/>
		</div>
	);
}
