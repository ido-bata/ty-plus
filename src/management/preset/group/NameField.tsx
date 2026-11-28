import { Input } from "@ty-plus/ui";
import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import {
	AuthoringField,
	authoringBusyClass,
} from "@/management/preset/authoring-layout";

export function NameField({
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
		// Issue #794: while the dialog saves, the name field used to stay
		// at full contrast next to the dimmed sections — apply the same
		// busy treatment (dim + inert) so the whole form reads as frozen.
		<AuthoringField
			span={6}
			className={busy ? authoringBusyClass : undefined}
			inert={busy}
		>
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
