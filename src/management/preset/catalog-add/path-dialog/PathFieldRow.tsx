import { Icon, PathField, sectionLabelClass } from "@ty-plus/ui";
import { FileSearch } from "lucide-react";
import type { JSX } from "react";
import { selectFile } from "@/management/ae/cep/dialog-shim/bolt";
import { i18n } from "@/management/i18n/index";
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
			<span className={sectionLabelClass}>
				{i18n.t("presets:catalogAdd.filePath")}
			</span>
			<PathField
				value={value}
				onChange={onChange}
				onBrowse={() =>
					selectFile(
						browseHint,
						i18n.t("presets:catalogAdd.selectFile"),
						(picked) => onChange(picked),
					)
				}
				browseAriaLabel={i18n.t("presets:catalogAdd.browseFile")}
				browseSlot={<Icon icon={FileSearch} size={16} aria-hidden />}
				placeholder={placeholder}
				uiSize="md"
			/>
		</div>
	);
}
