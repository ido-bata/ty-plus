import type { JSX } from "react";
import { Input } from "@/shared/component/fields/Input";
import { NumberField } from "@/shared/component/fields/NumberField";
import { RANGE_INPUT_CLASS } from "@/shared/component/fields/RangeField";
import { cx } from "@/shared/util/cx";
import { css } from "@/styled-system/css";

export type ColorOpacityFieldProps = {
	label?: string;
	color: string;
	onColorChange: (value: string) => void;
	/** Alpha percentage (0-100) composited over the swatch checkerboard. */
	opacity: number;
	onOpacityChange: (value: number) => void;
	className?: string;
};

const clamp = (value: number, min: number, max: number): number =>
	Math.min(max, Math.max(min, value));

const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

function isHexColor(value: string): boolean {
	return HEX_COLOR_RE.test(value.trim());
}

/** `input[type=color]` only accepts #rgb / #rrggbb — reduce longer forms. */
function toPickerHex(value: string): string {
	const trimmed = value.trim();
	if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
		return trimmed;
	}
	if (/^#[0-9a-fA-F]{8}$/.test(trimmed)) {
		return trimmed.slice(0, 7);
	}
	if (/^#[0-9a-fA-F]{3,4}$/.test(trimmed)) {
		const hex = trimmed.slice(1, 4);
		return `#${hex
			.split("")
			.map((c) => c + c)
			.join("")}`;
	}
	return "#000000";
}

const wrapper = css({ minWidth: 0, width: "full" });
const labelClass = css({
	fontSize: "text-xs",
	fontWeight: "medium",
	color: "text.primary",
});
const row = css({
	display: "flex",
	width: "full",
	minWidth: 0,
	flexWrap: "nowrap",
	alignItems: "center",
	gap: "2",
});
const rowTopGap = css({ marginTop: "1" });
const hexInputClass = css({ flex: 1, minWidth: 0 });
const numberClass = css({
	width: "14",
	flexShrink: 0,
	flexBasis: "14",
});
const numberInputClass = css({
	paddingInline: "1.5",
	textAlign: "center",
	fontVariantNumeric: "tabular-nums",
});

// Square swatch frame. Layers inside (checkerboard, alpha tint, invisible
// native picker) are absolutely positioned and clipped by the frame's
// border-radius via overflow:hidden.
const swatchFrame = css({
	position: "relative",
	display: "inline-block",
	height: "8",
	width: "8",
	flexShrink: 0,
	overflow: "hidden",
	borderRadius: "shell",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.widget",
	"&:has(> input:focus-visible)": {
		borderColor: "interactive.focus",
		boxShadow:
			"0 0 0 2px color-mix(in srgb, var(--color-interactive-focus) 30%, transparent)",
	},
});

const checkerStyle = css({
	position: "absolute",
	inset: "0",
	backgroundImage:
		"repeating-conic-gradient(" +
		"color-mix(in srgb, var(--colors-text-primary) 22%, transparent) 0% 25%," +
		"color-mix(in srgb, var(--colors-text-primary) 9%, transparent) 0% 50%)",
	backgroundSize: "8px 8px",
});

const tintStyle = css({
	position: "absolute",
	inset: "0",
});

// Invisible native color input over the preview — clicking anywhere on the
// swatch opens the OS color picker while the frame renders the alpha-aware
// preview. `opacity: 0` keeps the element rendered (unlike display:none,
// which would remove it from hit-testing and keyboard focus).
const pickerInput = css({
	position: "absolute",
	inset: "0",
	width: "full",
	height: "full",
	margin: 0,
	padding: 0,
	border: 0,
	opacity: "0",
	cursor: "pointer",
	"&:disabled": { cursor: "default" },
});

function AlphaColorSwatch({
	value,
	onChange,
	opacity,
	disabled,
	ariaLabel,
}: {
	value: string;
	onChange: (value: string) => void;
	opacity: number;
	disabled?: boolean;
	ariaLabel?: string;
}): JSX.Element {
	const alpha = clamp(opacity, 0, 100);
	const tint = isHexColor(value)
		? `color-mix(in srgb, ${value.trim()} ${alpha}%, transparent)`
		: null;

	return (
		<span className={swatchFrame}>
			<span className={checkerStyle} aria-hidden="true" />
			{tint ? (
				<span
					className={tintStyle}
					style={{ backgroundColor: tint }}
					aria-hidden="true"
				/>
			) : null}
			<input
				type="color"
				value={toPickerHex(value)}
				onChange={(e) => onChange(e.target.value)}
				aria-label={ariaLabel ?? "Color"}
				className={pickerInput}
				disabled={disabled}
			/>
		</span>
	);
}

/**
 * Square alpha-aware color swatch + hex input + opacity slider + numeric
 * field on a single row. The swatch composites the color over a
 * checkerboard at the current opacity so transparency is visible while
 * editing. All controls share the `md` (32px) control height.
 */
export function ColorOpacityField({
	label,
	color,
	onColorChange,
	opacity,
	onOpacityChange,
	className,
}: ColorOpacityFieldProps): JSX.Element {
	const commitOpacity = (next: number): void => {
		if (!Number.isFinite(next)) {
			return;
		}
		onOpacityChange(clamp(next, 0, 100));
	};

	return (
		<div className={cx(wrapper, className)}>
			{label ? <div className={labelClass}>{label}</div> : null}
			<div className={cx(row, label ? rowTopGap : "")}>
				<AlphaColorSwatch
					value={color}
					onChange={onColorChange}
					opacity={opacity}
					ariaLabel={label ? `${label} color` : "Color"}
				/>
				<Input
					type="text"
					value={color}
					onChange={(e) => onColorChange(e.target.value)}
					aria-label={label ? `${label} value` : "Color value"}
					uiSize="md"
					className={hexInputClass}
				/>
				<input
					type="range"
					min={0}
					max={100}
					step={1}
					value={opacity}
					onChange={(e) => commitOpacity(Number(e.target.value))}
					aria-label={label ? `${label} opacity` : "Opacity"}
					className={RANGE_INPUT_CLASS}
				/>
				<NumberField
					min={0}
					max={100}
					step={1}
					value={opacity}
					onChange={(v) => commitOpacity(Number(v))}
					aria-label={label ? `${label} opacity value` : "Opacity value"}
					uiSize="md"
					numberSpinners={false}
					className={numberClass}
					inputClassName={numberInputClass}
				/>
			</div>
		</div>
	);
}
