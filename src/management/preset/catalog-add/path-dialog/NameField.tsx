import { Input } from "@ty-plus/ui";
import type { JSX } from "react";
import { i18n } from "@/management/i18n/index";

export function PathDialogNameField(props: {
	name: string;
	onNameChange: (next: string) => void;
}): JSX.Element {
	const { name, onNameChange } = props;
	return (
		<Input
			label={i18n.t("presets:catalogAdd.name")}
			value={name}
			onChange={(e) => onNameChange(e.target.value)}
			placeholder={i18n.t("presets:catalogAdd.namePlaceholder")}
			autoComplete="off"
			spellCheck={false}
			uiSize="md"
		/>
	);
}
