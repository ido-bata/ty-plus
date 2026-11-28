import { fieldLabelClass, Input, RangeField } from "@ty-plus/ui";
import type { JSX } from "react";
import { DEFAULT_LAYER_COLOR } from "@/management/workspace/literals/layer-colors";
import { css } from "@/styled-system/css";

/*
 * Issue #768: field-level labels in the background editors share the
 * `fieldLabelClass` treatment (sentence case, primary text) that
 * `RangeField` already applies to its own label — the previous
 * `sectionLabelClass` (uppercase, muted, wide-tracked) made sibling
 * labels like "Opacity" and "COLOR" read as two different hierarchies.
 * `SECTION_LABEL_CLASS` in constants.ts remains for true section
 * headers (e.g. the preview band).
 */
export function FieldLabel(props: { children: string }): JSX.Element {
	return <span className={fieldLabelClass}>{props.children}</span>;
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

const colorSwatchWrap = css({
	position: "relative",
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

/**
 * `<input type="color">` can only hold a concrete `#rrggbb` value, so a
 * non-hex colour like `"transparent"` falls back to an opaque swatch.
 * This checkerboard badge is painted over the picker instead, keeping the
 * field honest about the real (fully transparent) value.
 */
const transparentBadge = css({
	position: "absolute",
	inset: "0",
	borderRadius: "shell-sm",
	// Issue #768: the badge overlays the swatch edge-to-edge, so it must
	// carry the same perimeter border the `<input type="color">` swatch
	// has — otherwise the checkerboard bleeds into the canvas with no
	// bounding stroke.
	borderWidth: "hairline",
	borderStyle: "solid",
	borderColor: "var(--color-ty-widget-border)",
	backgroundColor: "surface.panel",
	backgroundImage:
		"linear-gradient(45deg, var(--color-ty-ink-08) 25%, transparent 25%, transparent 75%, var(--color-ty-ink-08) 75%), linear-gradient(45deg, var(--color-ty-ink-08) 25%, transparent 25%, transparent 75%, var(--color-ty-ink-08) 75%)",
	backgroundSize: "0.5rem 0.5rem",
	backgroundPosition: "0 0, 0.25rem 0.25rem",
	pointerEvents: "none",
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
			// Issue #768: the readout sits beside `md` colour/text controls
			// in these editors — match their height tier.
			numberUiSize="md"
		/>
	);
}

export function ColorField(props: {
	label: string;
	value: string;
	onColorChange: (value: string) => void;
}): JSX.Element {
	// `#rgb`/`#rrggbb`/`#rrggbbaa`-style literals are the only values
	// `<input type="color">` can represent; everything else (e.g.
	// `"transparent"`) gets the opaque fallback plus the checkerboard badge.
	const isHexColor = /^#[0-9a-f]{3,8}$/i.test(props.value.trim());
	const colorValue = isHexColor ? props.value : DEFAULT_LAYER_COLOR;
	return (
		<div className={colorRow}>
			<span className={fieldLabelClass}>{props.label}</span>
			<div className={colorControls}>
				<div className={colorSwatchWrap}>
					<Input
						type="color"
						className={colorSwatch}
						value={colorValue}
						onChange={(e) => props.onColorChange(e.currentTarget.value)}
						uiSize="md"
					/>
					{isHexColor ? null : (
						<div
							className={transparentBadge}
							data-testid="color-field-transparent-badge"
							aria-hidden="true"
						/>
					)}
				</div>
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
