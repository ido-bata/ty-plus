import { cx, fieldDescriptionClass, fieldLabelClass, Input } from "@ty-plus/ui";
import { type JSX, useId } from "react";
import { css } from "@/styled-system/css";

export type TokenEditorProps = {
	label: string;
	value: string;
	onChange: (value: string) => void;
	description?: string;
	className?: string;
};

// Issue #763: sibling token editors (ColorField / NumberField) render
// their label with the shared `fieldLabelClass` — title case, primary
// text. Routing the label through `Input`'s `label` prop painted it with
// the uppercase muted `labelClass`, so "TEXT RED CHANNEL" sat next to
// "App Background" in the same grid.
const fieldStyle = css({
	display: "flex",
	minWidth: 0,
	width: "full",
	flexDirection: "column",
});

const labelGapStyle = css({ marginTop: "1" });

export function TokenEditor({
	label,
	value,
	onChange,
	description,
	className,
}: TokenEditorProps): JSX.Element {
	const inputId = useId();

	return (
		<div
			className={cx(fieldStyle, className)}
			data-design-token-key={description}
		>
			<label className={fieldLabelClass} htmlFor={inputId}>
				{label}
			</label>
			<Input
				id={inputId}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				uiSize="sm"
				className={labelGapStyle}
			/>
			{description ? (
				<div className={cx(fieldDescriptionClass)}>{description}</div>
			) : null}
		</div>
	);
}
