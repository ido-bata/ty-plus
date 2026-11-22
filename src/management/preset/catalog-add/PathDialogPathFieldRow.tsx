import { Icon, PathField, sectionLabelClass } from "@ty-plus/ui";
import { FileSearch } from "lucide-react";
import type { JSX } from "react";
import { selectFile } from "@/management/ae/cep/dialog-shim/bolt";
import { css } from "@/styled-system/css";

const fieldColumnClass = css({
	display: "flex",
	flexDirection: "column",
	gap: "1",
});

export function PathDialogPathFieldRow(props: {
	value: string;
	onChange: (next: string) => void;
	browseHint: string;
	placeholder: string;
}): JSX.Element {
	const { value, onChange, browseHint, placeholder } = props;
	return (
		<div className={fieldColumnClass}>
			<span className={sectionLabelClass}>File Path</span>
			<PathField
				value={value}
				onChange={onChange}
				onBrowse={() =>
					selectFile(browseHint, "Select File", (picked) => onChange(picked))
				}
				browseAriaLabel="Browse file"
				browseSlot={<Icon icon={FileSearch} size={16} aria-hidden />}
				placeholder={placeholder}
				uiSize="md"
			/>
		</div>
	);
}
