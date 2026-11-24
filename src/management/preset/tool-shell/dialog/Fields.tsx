import {
	Checkbox,
	Icon,
	Input,
	ListSelect,
	PathField,
	Textarea,
} from "@ty-plus/ui";
import { FileSearch, FolderOpen } from "lucide-react";
import { type JSX, useId } from "react";
import { css } from "@/styled-system/css";
import { shellFieldLabelClass } from "../preset-tool-helpers";
import type { PathBrowseSpec, PresetToolField } from "./ToolDialog";

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
	const idPrefix = useId();

	return (
		<>
			{fields.map((field) =>
				field.kind === "checkbox" ? (
					<label
						key={field.key}
						htmlFor={`${idPrefix}-${field.key}`}
						className={checkboxLabelClass}
					>
						<Checkbox
							id={`${idPrefix}-${field.key}`}
							uiSize="md"
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
						<ListSelect
							aria-label={field.label}
							uiSize="sm"
							options={field.options}
							value={values[field.key] ?? ""}
							onChange={(next) => setValue(field.key, next)}
							disabled={busy}
						/>
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
			<div className={fieldColumnClass}>
				<span className={shellFieldLabelClass}>{field.label}</span>
				<Input
					aria-label={field.label}
					placeholder={field.placeholder}
					value={value}
					onChange={(event) => setValue(field.key, event.currentTarget.value)}
					uiSize="md"
					disabled={busy}
				/>
			</div>
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
