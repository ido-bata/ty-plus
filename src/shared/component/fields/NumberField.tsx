import type { InputHTMLAttributes, JSX } from "react";
import { useId } from "react";
import { Input } from "@/shared/component/fields/Input";
import { cx } from "@/shared/util/cx";
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

	return (
		<div className={cx(wrapper, className)}>
			{label ? <div className={labelClass}>{label}</div> : null}
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
				className={cx(label ? inputTopGap : "", inputClassName)}
				{...inputProps}
			/>
			{unit ? <div className={helper}>{unit}</div> : null}
			{description ? <div className={helper}>{description}</div> : null}
		</div>
	);
}
