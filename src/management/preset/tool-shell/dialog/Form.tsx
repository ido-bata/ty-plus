import { Input } from "@ty-plus/ui";
import type { JSX } from "react";
import { css } from "@/styled-system/css";
import { shellFieldLabelClass } from "../preset-tool-helpers";

import type { PresetToolDialogProps } from "./ToolDialog";

const formColumnClass = css({
	display: "flex",
	flexDirection: "column",
	gap: "3",
});

const nameFieldClass = css({
	display: "flex",
	minWidth: "0",
	flexDirection: "column",
	gap: "1",
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
			{/* Issue #793: the name label used `Input`'s built-in label
			    (10px), reading smaller than the `shellFieldLabelClass`
			    labels on every sibling field — render the shared shell
			    label here like `ToolDialogFields` does. */}
			<div className={nameFieldClass}>
				<span className={shellFieldLabelClass}>{nameLabel}</span>
				<Input
					aria-label={nameLabel}
					value={name}
					onChange={(event) => setName(event.currentTarget.value)}
					uiSize="md"
					disabled={busy}
				/>
			</div>
			{fields}
			{details}
			{icon}
		</div>
	);
}
