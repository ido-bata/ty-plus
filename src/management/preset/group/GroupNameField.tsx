import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import { AuthoringField } from "@/management/preset/tool-shell/archive-layout";
import { Input } from "@/shared/component/fields/Input";

export function GroupNameField({
	name,
	busy,
	onNameChange,
}: {
	name: string;
	busy: boolean;
	onNameChange: (next: string) => void;
}): JSX.Element {
	const { t } = useTranslation("presets");
	return (
		<AuthoringField span={6}>
			<Input
				label={t("group.fields.groupName")}
				value={name}
				onChange={(event) => onNameChange(event.currentTarget.value)}
				uiSize="md"
				disabled={busy}
			/>
		</AuthoringField>
	);
}
