import type { JSX } from "react";
import { NumberField } from "@/shared/component/fields/NumberField";
import { cx } from "@/shared/util/cx";
import { css } from "@/styled-system/css";

export type RangeFieldProps = {
	label?: string;
	value: number;
	onChange: (value: number) => void;
	min?: number;
	max?: number;
	step?: number;
	/** Appended to the label (e.g. "%"). */
	unit?: string;
	className?: string;
};

const clamp = (value: number, min: number, max: number): number =>
	Math.min(max, Math.max(min, value));

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
			backgroundColor: "border.default",
		},
		"&::-webkit-slider-thumb": {
			marginTop: "calc((1 - 4) / 2)",
			height: "4",
			width: "4",
			cursor: "pointer",
			appearance: "none",
			borderRadius: "full",
			borderWidth: "2px",
			borderStyle: "solid",
			borderColor: "border.default",
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
	const labelText =
		label && unit !== undefined
			? `${label} ${value}${unit}`
			: label
				? `${label} ${value}`
				: undefined;

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
					className={RANGE_INPUT_CLASS}
				/>
				<NumberField
					min={min}
					max={max}
					step={step}
					value={value}
					onChange={(v) => commit(Number(v))}
					aria-label={label ? `${label} value` : "Range value"}
					uiSize="sm"
					numberSpinners={false}
					className={css({ width: "14", flexShrink: 0, flexBasis: "14" })}
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
