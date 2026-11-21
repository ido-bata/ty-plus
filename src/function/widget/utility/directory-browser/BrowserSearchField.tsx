import { SearchField } from "@ty-plus/ui";
import { Search } from "lucide-react";
import type { JSX, ReactNode, RefObject } from "react";
import { css } from "@/styled-system/css";

export function BrowserSearchField(props: {
	inputRef: RefObject<HTMLInputElement | null>;
	value: string;
	onChange: (next: string) => void;
	onClear: () => void;
	placeholder: string;
	inlineTrailing?: ReactNode;
}): JSX.Element {
	const { inputRef, value, onChange, onClear, placeholder, inlineTrailing } =
		props;
	return (
		<div
			data-directory-browser-search
			className={css({ minHeight: 0, minWidth: 0 })}
		>
			<SearchField
				className={css({ minWidth: 0 })}
				uiSize="md"
				icon={Search}
				inputRef={inputRef}
				placeholder={placeholder}
				value={value}
				onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
					onChange(e.currentTarget.value);
				}}
				autoComplete="off"
				spellCheck={false}
				showClearButton
				onClear={onClear}
				showInlineTrailing
				inlineTrailing={inlineTrailing}
			/>
		</div>
	);
}
