import { NumberField } from "@ty-plus/ui/fields/NumberField";
import { cx } from "@ty-plus/ui/util/cx";
import type { JSX } from "react";
import { css } from "@/styled-system/css";
import { fieldLabelClass } from "../styles/typography";

export type RangeFieldProps = {
	label?: string;
	value: number;
	onChange: (value: number) => void;
	min?: number;
	max?: number;
	step?: number;
	/** Appended to the numeric readout (e.g. "%"). */
	unit?: string;
	className?: string;
};

const clamp = (value: number, min: number, max: number): number =>
	Math.min(max, Math.max(min, value));

const wrapper = css({ minWidth: 0, width: "full" });
const labelClass = fieldLabelClass;
const row = css({
	display: "flex",
	width: "full",
	minWidth: 0,
	flexWrap: "nowrap",
	alignItems: "center",
	gap: "2",
});
const rowTopGap = css({ marginTop: "1" });

const RANGE_INPUT_CLASS = cx(
	"ty-ui-range",
	css({
		height: "4",
		minWidth: "16",
		flex: 1,
		cursor: "pointer",
		appearance: "none",
		backgroundColor: "transparent",
		accentColor: "text.primary",
		"&::-webkit-slider-runnable-track": {
			height: "1",
			borderRadius: "full",
			backgroundColor: "border.control",
		},
		"&::-webkit-slider-thumb": {
			marginTop: "-1.5",
			height: "4",
			width: "4",
			cursor: "pointer",
			appearance: "none",
			borderRadius: "full",
			borderWidth: "2px",
			borderStyle: "solid",
			borderColor: "border.control",
			backgroundColor: "text.primary",
		},
	}),
);

/**
 * Horizontal range slider paired with a numeric input on one row.
 */
export function RangeField({
	label,
	value,
	onChange,
	min = 0,
	max = 100,
	step = 1,
	unit,
	className,
}: RangeFieldProps): JSX.Element {
	// Issue #679: the label names the control only; the paired NumberField is
	// the single place that shows the value, with `unit` as its suffix.
	const labelText = label || undefined;
	const valueLabel = `${label ?? "Range"} value${unit !== undefined ? ` ${unit}` : ""}`;

	const commit = (next: number): void => {
		if (!Number.isFinite(next)) {
			return;
		}
		onChange(clamp(next, min, max));
	};

	return (
		<div className={cx(wrapper, className)}>
			{labelText ? <div className={labelClass}>{labelText}</div> : null}
			<div className={cx(row, labelText ? rowTopGap : "")}>
				<input
					type="range"
					min={min}
					max={max}
					step={step}
					value={value}
					onChange={(e) => commit(Number(e.target.value))}
					aria-label={label ?? "Range"}
					aria-valuetext={unit !== undefined ? `${value}${unit}` : undefined}
					className={RANGE_INPUT_CLASS}
				/>
				<NumberField
					min={min}
					max={max}
					step={step}
					value={value}
					onChange={(v) => commit(Number(v))}
					unit={unit}
					aria-label={valueLabel}
					uiSize="sm"
					numberSpinners={false}
					className={css({
						// Issue #448: 14 (56px) clipped multi-digit values such as
						// "-2000.5" — the input needs ~7ch plus inline padding.
						// (spacing "18" does not exist in the token scale.)
						width: "20",
						flexShrink: 0,
						flexBasis: "20",
					})}
					inputClassName={css({
						paddingInline: "1.5",
						textAlign: "center",
						fontVariantNumeric: "tabular-nums",
					})}
				/>
			</div>
		</div>
	);
}
