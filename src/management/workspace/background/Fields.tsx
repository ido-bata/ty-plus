import type { ChangeEventHandler, JSX } from "react";
import { FIELD_LABEL_CLASS } from "@/management/workspace/background/constants";
import { DEFAULT_COLOR } from "@/management/workspace/background/layer-factory";
import { Input } from "@/shared/component/fields/Input";
import { css } from "@/styled-system/css";

export function FieldLabel(props: { children: string }): JSX.Element {
	return <span className={FIELD_LABEL_CLASS}>{props.children}</span>;
}

const numberRow = css({
	display: "grid",
	gridTemplateColumns:
		"minmax(0,var(--ty-space-24)) minmax(0,1fr) minmax(var(--ty-space-14),var(--ty-space-20))",
	alignItems: "center",
	gap: "2",
});

const numberLabel = css({
	overflow: "hidden",
	textOverflow: "ellipsis",
	whiteSpace: "nowrap",
	fontSize: "text-xs",
	color: "text.muted",
});

const numberRange = css({
	height: "4",
	width: "full",
	cursor: "pointer",
	accentColor: "var(--ty-text-muted)",
	colorScheme: "dark",
});

const numberInput = css({
	borderColor: "var(--color-ty-widget-border)",
});

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
	borderWidth: "1px",
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
	const handleChange: ChangeEventHandler<HTMLInputElement> = (e) => {
		props.onValueChange(Number(e.currentTarget.value));
	};

	return (
		<div className={numberRow}>
			<span className={numberLabel}>{props.label}</span>
			<input
				type="range"
				min={props.min}
				max={props.max}
				value={props.value}
				onChange={handleChange}
				aria-label={props.label}
				className={numberRange}
			/>
			<Input
				type="number"
				min={props.min}
				max={props.max}
				value={props.value}
				onChange={handleChange}
				aria-label={props.label}
				uiSize="md"
				className={numberInput}
			/>
		</div>
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
