import { cx } from "@ty-plus/ui/util/cx";
import type { InputHTMLAttributes, ReactElement } from "react";
import { useEffect, useId, useRef } from "react";
import { css } from "@/styled-system/css";

export type CheckboxProps = Omit<
	InputHTMLAttributes<HTMLInputElement>,
	"type" | "size"
> & {
	/**
	 * Renders the mixed state. The DOM `indeterminate` property is set on
	 * mount/update because React does not expose it as an attribute.
	 */
	indeterminate?: boolean;
	/** Visible label rendered next to the box. */
	label?: string;
	uiSize?: "sm" | "md";
};

/**
 * Shared checkbox.
 *
 * The native `<input type="checkbox">` is kept as the control (so keyboard
 * semantics, form participation, and screen-reader announcements come from
 * the platform) and only its appearance is replaced. Feature code must not
 * hand-roll a checkbox: the box metrics, the accent fill, the check glyph,
 * and the focus ring live here so every surface renders the same control.
 */
const box = css({
	appearance: "none",
	margin: 0,
	flexShrink: 0,
	borderRadius: "sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.widget",
	outline: "none",
	position: "relative",
	transitionProperty: "colors",
	cursor: "pointer",
	_checked: {
		borderColor: "text.accent",
		backgroundColor: "text.accent",
	},
	"&[data-indeterminate='true']": {
		borderColor: "text.accent",
		backgroundColor: "text.accent",
	},
	_focusVisible: {
		boxShadow: "0 0 0 2px var(--color-interactive-focus)",
		outlineOffset: "0",
	},
	_disabled: {
		opacity: 0.5,
		cursor: "not-allowed",
	},
});

/**
 * The check glyph is drawn with a rotated border so it stays crisp at any
 * box size without an extra SVG.
 */
const checkGlyph = css({
	"&::after": {
		content: '""',
		position: "absolute",
		insetInlineStart: "28%",
		insetBlockStart: "12%",
		width: "28%",
		height: "56%",
		borderStyle: "solid",
		borderWidth: "0 2px 2px 0",
		borderColor: "surface.panel",
		transform: "rotate(45deg)",
	},
});

const indeterminateGlyph = css({
	"&::after": {
		content: '""',
		position: "absolute",
		insetInlineStart: "20%",
		insetBlockStart: "44%",
		width: "60%",
		height: "2px",
		backgroundColor: "surface.panel",
	},
});

const sizes: Record<NonNullable<CheckboxProps["uiSize"]>, string> = {
	sm: css({ width: "3.5", height: "3.5" }),
	md: css({ width: "4", height: "4" }),
};

const labelClass = css({
	display: "inline-flex",
	alignItems: "center",
	gap: "1.5",
	fontSize: "shell-text-sm",
	color: "text.primary",
	cursor: "pointer",
});

export function Checkbox({
	indeterminate = false,
	label,
	uiSize = "md",
	className,
	id: idProp,
	...props
}: CheckboxProps): ReactElement {
	const ref = useRef<HTMLInputElement | null>(null);
	const autoId = useId();
	const id = idProp ?? autoId;

	useEffect(() => {
		if (ref.current) {
			ref.current.indeterminate = indeterminate;
		}
	}, [indeterminate]);

	const control = (
		<input
			ref={ref}
			id={id}
			type="checkbox"
			aria-checked={indeterminate ? "mixed" : undefined}
			data-indeterminate={indeterminate ? "true" : undefined}
			className={cx(
				box,
				sizes[uiSize],
				indeterminate ? indeterminateGlyph : checkGlyph,
				className,
			)}
			{...props}
		/>
	);

	if (!label) {
		return control;
	}

	return (
		<label className={labelClass} htmlFor={id}>
			{control}
			<span>{label}</span>
		</label>
	);
}
