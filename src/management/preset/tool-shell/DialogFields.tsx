import { FileSearch, FolderOpen } from "lucide-react";
import type { JSX } from "react";
import { Icon } from "@/shared/component";
import { Input } from "@/shared/component/fields/Input";
import { PathField } from "@/shared/component/fields/PathField";
import { Textarea } from "@/shared/component/fields/Textarea";
import { css } from "@/styled-system/css";

import type { PathBrowseSpec, PresetToolField } from "./Dialog";
import { shellFieldLabelClass } from "./preset-tool-helpers";

const fieldColumnClass = css({
	display: "flex",
	minWidth: "0",
	flexDirection: "column",
	gap: "1",
});

const checkboxLabelClass = css({
	display: "flex",
	cursor: "pointer",
	alignItems: "center",
	gap: "2",
	fontSize: "shell-text-sm",
	color: "text.primary",
});

const checkboxInputClass = css({
	height: "4",
	width: "4",
	flexShrink: "0",
	borderRadius: "sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.widget",
});

const selectClass = css({
	width: "full",
	minWidth: "0",
	cursor: "pointer",
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.widget",
	paddingInline: "2.5",
	paddingBlock: "2",
	fontSize: "shell-text-sm",
	color: "text.primary",
	outline: "none",
	_focus: { borderColor: "interactive.focus" },
	_disabled: { opacity: "0.5" },
});

export type ToolDialogFieldsProps = {
	fields: PresetToolField[];
	values: Record<string, string>;
	busy: boolean;
	browseSpecs: PathBrowseSpec[];
	runPathBrowse: (fieldKey: string) => void;
	setValue: (fieldKey: string, value: string) => void;
};

export function ToolDialogFields({
	fields,
	values,
	busy,
	browseSpecs,
	runPathBrowse,
	setValue,
}: ToolDialogFieldsProps): JSX.Element {
	return (
		<>
			{fields.map((field) =>
				field.kind === "checkbox" ? (
					<label key={field.key} className={checkboxLabelClass}>
						<input
							type="checkbox"
							className={checkboxInputClass}
							checked={(values[field.key] ?? "") === "true"}
							onChange={(event) =>
								setValue(field.key, event.target.checked ? "true" : "false")
							}
							disabled={busy}
						/>
						<span className={shellFieldLabelClass}>{field.label}</span>
					</label>
				) : field.kind === "select" && field.options?.length ? (
					<div key={field.key} className={fieldColumnClass}>
						<span className={shellFieldLabelClass}>{field.label}</span>
						<select
							aria-label={field.label}
							className={selectClass}
							value={values[field.key] ?? ""}
							onChange={(event) => setValue(field.key, event.target.value)}
							disabled={busy}
						>
							{field.options.map((opt) => (
								<option key={opt.value} value={opt.value}>
									{opt.label}
								</option>
							))}
						</select>
					</div>
				) : field.kind === "textarea" ? (
					<div key={field.key} className={fieldColumnClass}>
						<span className={shellFieldLabelClass}>{field.label}</span>
						<Textarea
							aria-label={field.label}
							placeholder={field.placeholder}
							value={values[field.key] ?? ""}
							onChange={(event) => setValue(field.key, event.target.value)}
							uiSize="md"
							disabled={busy}
						/>
					</div>
				) : (
					<PlainInputField
						key={field.key}
						field={field}
						value={values[field.key] ?? ""}
						busy={busy}
						spec={browseSpecs.find((s) => s.fieldKey === field.key)}
						runPathBrowse={runPathBrowse}
						setValue={setValue}
					/>
				),
			)}
		</>
	);
}

type PlainInputFieldProps = {
	field: PresetToolField;
	value: string;
	busy: boolean;
	spec: PathBrowseSpec | undefined;
	runPathBrowse: (fieldKey: string) => void;
	setValue: (fieldKey: string, value: string) => void;
};

function PlainInputField({
	field,
	value,
	busy,
	spec,
	runPathBrowse,
	setValue,
}: PlainInputFieldProps): JSX.Element {
	if (!spec) {
		return (
			<Input
				label={field.label}
				placeholder={field.placeholder}
				value={value}
				onChange={(event) => setValue(field.key, event.currentTarget.value)}
				uiSize="md"
				disabled={busy}
			/>
		);
	}
	return (
		<div className={fieldColumnClass}>
			<span className={shellFieldLabelClass}>{field.label}</span>
			<PathField
				value={value}
				onChange={(next) => setValue(field.key, next)}
				onBrowse={() => runPathBrowse(field.key)}
				browseAriaLabel={
					spec.mode === "folder" ? "Browse folder" : "Browse file"
				}
				browseSlot={
					<Icon
						icon={spec.mode === "folder" ? FolderOpen : FileSearch}
						size={16}
						aria-hidden
					/>
				}
				placeholder={field.placeholder}
				uiSize="md"
				disabled={busy}
			/>
		</div>
	);
}
