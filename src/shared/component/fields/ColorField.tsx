import type { JSX } from "react";
import { ColorSwatch } from "@/shared/component/fields/ColorSwatch";
import { Input } from "@/shared/component/fields/Input";
import { cx } from "@/shared/util/cx";
import { css } from "@/styled-system/css";

export type ColorFieldProps = {
	label?: string;
	value: string;
	onChange: (value: string) => void;
	description?: string;
	className?: string;
};

const wrapper = css({ minWidth: 0, width: "full" });
const labelClass = css({
	fontSize: "text-xs",
	fontWeight: "medium",
	color: "text.primary",
});
const grid = css({
	display: "grid",
	width: "full",
	minWidth: 0,
	gridTemplateColumns: "8 minmax(0, 1fr)",
	alignItems: "center",
	gap: "2",
});
const gridTopGap = css({ marginTop: "1" });
const inputFull = css({ minWidth: 0, width: "full" });
const helper = css({
	marginTop: "1",
	fontSize: "text-xs",
	color: "text.muted",
});

/**
 * Rounded color swatch + hex text input.
 */
export function ColorField({
	label,
	value,
	onChange,
	description,
	className,
}: ColorFieldProps): JSX.Element {
	return (
		<div className={cx(wrapper, className)}>
			{label ? <div className={labelClass}>{label}</div> : null}
			<div className={cx(grid, label ? gridTopGap : "")}>
				<ColorSwatch
					value={value}
					onChange={onChange}
					aria-label={label ? `${label} color` : "Color"}
				/>
				<Input
					type="text"
					value={value}
					onChange={(e) => onChange(e.target.value)}
					aria-label={label ? `${label} value` : "Color value"}
					uiSize="sm"
					className={inputFull}
				/>
			</div>
			{description ? <div className={helper}>{description}</div> : null}
		</div>
	);
}
