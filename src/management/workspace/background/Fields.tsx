import { RangeField } from "@ty-plus/ui";
import { Input } from "@ty-plus/ui/fields/Input";
import type { JSX } from "react";
import { FIELD_LABEL_CLASS } from "@/management/workspace/background/constants";
import { DEFAULT_COLOR } from "@/management/workspace/background/layer-factory";
import { css } from "@/styled-system/css";

export function FieldLabel(props: { children: string }): JSX.Element {
	return <span className={FIELD_LABEL_CLASS}>{props.children}</span>;
}

const colorRow = css({
	display: "grid",
	gap: "1",
});

const colorControls = css({
	display: "grid",
	gridTemplateColumns:
		"minmax(var(--ty-space-12),var(--ty-space-16)) minmax(0,1fr)",
	gap: "2",
});

const colorSwatch = css({
	height: "8",
	minHeight: "8",
	width: "full",
	minWidth: "12",
	cursor: "pointer",
	borderRadius: "shell-sm",
	borderWidth: "hairline",
	borderStyle: "solid",
	borderColor: "var(--color-ty-widget-border)",
	backgroundColor: "surface.widget",
	padding: "0",
});

const colorText = css({
	borderColor: "var(--color-ty-widget-border)",
});

export function NumberField(props: {
	label: string;
	value: number;
	min: number;
	max: number;
	onValueChange: (value: number) => void;
}): JSX.Element {
	return (
		<RangeField
			label={props.label}
			value={props.value}
			min={props.min}
			max={props.max}
			onChange={props.onValueChange}
		/>
	);
}

export function ColorField(props: {
	label: string;
	value: string;
	onColorChange: (value: string) => void;
}): JSX.Element {
	const colorValue =
		props.value === "transparent" ? DEFAULT_COLOR : props.value;
	return (
		<div className={colorRow}>
			<span className={FIELD_LABEL_CLASS}>{props.label}</span>
			<div className={colorControls}>
				<Input
					type="color"
					className={colorSwatch}
					value={colorValue}
					onChange={(e) => props.onColorChange(e.currentTarget.value)}
					uiSize="md"
				/>
				<Input
					value={props.value}
					onChange={(e) => props.onColorChange(e.currentTarget.value)}
					uiSize="md"
					className={colorText}
				/>
			</div>
		</div>
	);
}
