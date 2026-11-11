import type { JSX } from "react";
import { Input } from "@/shared/component/fields/Input";
import { css } from "@/styled-system/css";

import type { PresetToolDialogProps } from "./Dialog";

const formColumnClass = css({
	display: "flex",
	flexDirection: "column",
	gap: "3",
});

const leadClass = css({
	margin: "0",
	fontSize: "shell-text-sm",
	color: "text.muted",
});

export type ToolDialogFormProps = {
	description: string;
	leadingSlots: PresetToolDialogProps["leadingSlots"];
	renderLeadingSlots: PresetToolDialogProps["renderLeadingSlots"];
	values: Record<string, string>;
	setValue: (fieldKey: string, value: string) => void;
	busy: boolean;
	name: string;
	setName: (value: string) => void;
	fields: JSX.Element;
	details: JSX.Element;
	icon: JSX.Element;
	nameLabel: string;
};

export function ToolDialogForm({
	description,
	leadingSlots,
	renderLeadingSlots,
	values,
	setValue,
	busy,
	name,
	setName,
	fields,
	details,
	icon,
	nameLabel,
}: ToolDialogFormProps): JSX.Element {
	return (
		<div className={formColumnClass}>
			<p className={leadClass}>{description}</p>
			{leadingSlots}
			{renderLeadingSlots?.({ values, setValue, busy })}
			<Input
				label={nameLabel}
				value={name}
				onChange={(event) => setName(event.currentTarget.value)}
				uiSize="md"
				disabled={busy}
			/>
			{fields}
			{details}
			{icon}
		</div>
	);
}
