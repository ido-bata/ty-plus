import { ListSelect } from "@ty-plus/ui";
import type { JSX } from "react";
import { css } from "@/styled-system/css";
import type { FileBrowserBrowseMode } from "./lib/types";

export type BrowseModeOption = {
	value: FileBrowserBrowseMode;
	label: string;
};

export function BrowserBrowseModeSelect(props: {
	value: FileBrowserBrowseMode;
	options: readonly BrowseModeOption[];
	onChange: (next: FileBrowserBrowseMode) => void;
	ariaLabel: string;
}): JSX.Element {
	const { value, options, onChange, ariaLabel } = props;
	return (
		<ListSelect
			className={css({ minWidth: 0 })}
			uiSize="sm"
			value={value}
			options={options as { value: string; label: string }[]}
			onChange={(next: string) => onChange(next as FileBrowserBrowseMode)}
			aria-label={ariaLabel}
		/>
	);
}
