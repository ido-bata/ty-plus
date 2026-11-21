import { SearchField } from "@ty-plus/ui";
import { Search } from "lucide-react";
import type { JSX, RefObject } from "react";
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
			})}
		>
			<SearchField
				icon={Search}
				uiSize="sm"
				value={value}
				onChange={(event) => onChange(event.target.value)}
				placeholder={placeholder}
				inputRef={inputRef}
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
