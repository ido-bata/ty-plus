import type { JSX } from "react";
import { ListSelect } from "@/shared/component";
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
			className={css({ width: "full", minWidth: 0 })}
			triggerClassName={css({
				minHeight: "8",
				height: "8",
				maxHeight: "8",
				paddingBlock: 0,
				paddingInline: "2",
				fontSize: "text-2xs",
			})}
			uiSize="sm"
			value={value}
			options={options as { value: string; label: string }[]}
			onChange={(next: string) => onChange(next as FileBrowserBrowseMode)}
			aria-label={ariaLabel}
		/>
	);
}
