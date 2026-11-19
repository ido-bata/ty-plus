import { FolderOpen } from "lucide-react";
import type { JSX } from "react";
import { Icon, PathField } from "@/shared/component";
import { isIMEComposing } from "@/shared/util/keyboard";
import { css } from "@/styled-system/css";

export function BrowserPathField(props: {
	value: string;
	onChange: (next: string) => void;
	onCommit: () => void;
	onBrowse?: () => void;
	browseAriaLabel: string;
	placeholder: string;
	inputTitle: string;
}): JSX.Element {
	const {
		value,
		onChange,
		onCommit,
		onBrowse,
		browseAriaLabel,
		placeholder,
		inputTitle,
	} = props;
	return (
		<PathField
			value={value}
			onChange={onChange}
			onBrowse={onBrowse}
			browseSlot={<Icon icon={FolderOpen} size={12} />}
			browseAriaLabel={browseAriaLabel}
			placeholder={placeholder}
			uiSize="md"
			className={css({ minWidth: 0 })}
			inputProps={{
				title: inputTitle,
				onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>): void => {
					if (isIMEComposing(e)) return;
					if (e.key === "Enter") {
						e.preventDefault();
						onCommit();
					}
				},
			}}
		/>
	);
}
