import { Input } from "@ty-plus/ui/fields/Input";
import { cx } from "@ty-plus/ui/util/cx";
import type { InputHTMLAttributes, JSX } from "react";
import { useId } from "react";
import { css } from "@/styled-system/css";

export type NumberFieldProps = {
	label?: string;
	value: string | number;
	onChange: (value: string) => void;
	min?: number;
	max?: number;
	step?: number;
	unit?: string;
	description?: string;
	uiSize?: "sm" | "md" | "lg";
	className?: string;
	inputClassName?: string;
	/** WebKit steppers; hidden until focus when true (default). */
	numberSpinners?: boolean;
	disabled?: boolean;
} & Omit<
	InputHTMLAttributes<HTMLInputElement>,
	| "type"
	| "value"
	| "onChange"
	| "min"
	| "max"
	| "step"
	| "disabled"
	| "className"
	| "size"
>;

const wrapper = css({ minWidth: 0, width: "full" });
const labelClass = css({
	fontSize: "text-xs",
	fontWeight: "medium",
	color: "text.primary",
});
const helper = css({
	marginTop: "1",
	fontSize: "text-xs",
	color: "text.muted",
});
const inputTopGap = css({ marginTop: "1" });
const unitRowClass = css({
	display: "flex",
	alignItems: "center",
	gap: "1.5",
	minWidth: "0",
});
const unitInputClass = css({ flex: "1", minWidth: "0" });
const unitClass = css({
	flexShrink: "0",
	fontSize: "text-xs",
	color: "text.muted",
});

/**
 * Standalone numeric input (no slider). Spinners show on focus only by default.
 */
export function NumberField({
	label,
	value,
	onChange,
	min,
	max,
	step = 1,
	unit,
	description,
	uiSize = "md",
	className,
	inputClassName,
	numberSpinners = true,
	disabled,
	...inputProps
}: NumberFieldProps): JSX.Element {
	const inputId = useId();
	const control = (
		<Input
			id={inputId}
			type="number"
			value={value}
			onChange={(e) => onChange(e.target.value)}
			min={min}
			max={max}
			step={step}
			uiSize={uiSize}
			numberSpinners={numberSpinners}
			disabled={disabled}
			className={cx(
				unit ? unitInputClass : label ? inputTopGap : "",
				inputClassName,
			)}
			{...inputProps}
		/>
	);

	return (
		<div className={cx(wrapper, className)}>
			{label ? <div className={labelClass}>{label}</div> : null}
			{unit ? (
				<div className={cx(unitRowClass, label ? inputTopGap : "")}>
					{control}
					<span className={unitClass} data-number-field-unit>
						{unit}
					</span>
				</div>
			) : (
				control
			)}
			{description ? <div className={helper}>{description}</div> : null}
		</div>
	);
}
