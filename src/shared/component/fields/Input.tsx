import type { InputHTMLAttributes } from "react";
import { forwardRef, useId } from "react";

import { css } from "@/styled-system/css";

export type InputProps = {
	label?: string;
	error?: string;
	uiSize?: "sm" | "md" | "lg";
	className?: string;
	/** For `type="number"`: show WebKit stepper buttons (default true). */
	numberSpinners?: boolean;
} & InputHTMLAttributes<HTMLInputElement>;

const sizes: Record<NonNullable<InputProps["uiSize"]>, string> = {
	sm: css({
		height: "7",
		minHeight: "7",
		paddingInline: "2",
		fontSize: "shell-text-sm",
	}),
	md: css({
		height: "8",
		minHeight: "8",
		paddingInline: "2.5",
		fontSize: "shell-text-sm",
	}),
	lg: css({
		height: "9",
		minHeight: "9",
		paddingInline: "3",
		fontSize: "text-md",
	}),
};

const base = css({
	width: "full",
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	backgroundColor: "surface.widget",
	paddingInline: "2.5",
	color: "text.primary",
	outline: "none",
	transitionProperty: "colors",
	_disabled: { opacity: 0.5 },
});

const errorState = css({
	borderColor: "status.error",
	opacity: 0.6,
	_focus: { borderColor: "status.error" },
});

const defaultState = css({
	borderColor: "border.default",
	_focus: { borderColor: "interactive.focus" },
});

const numberSpinnerHidden = css({
	appearance: "textfield",
	"&::-webkit-inner-spin-button, &::-webkit-outer-spin-button": {
		margin: 0,
		height: 0,
		width: 0,
		opacity: 0,
		pointerEvents: "none",
	},
});

const numberSpinnerFocus = css({
	paddingRight: "0.5",
	_focus: {
		appearance: "auto",
		"&::-webkit-inner-spin-button, &::-webkit-outer-spin-button": {
			pointerEvents: "auto",
			height: "4",
			minHeight: "4",
			width: "4",
			cursor: "pointer",
			opacity: 0.8,
		},
	},
});

const wrapper = css({
	display: "flex",
	flexDirection: "column",
	gap: "1",
});

const labelClass = css({
	fontSize: "text-xs",
	fontWeight: "medium",
	textTransform: "uppercase",
	letterSpacing: "wide",
	color: "text.muted",
});

const errorLabel = css({
	fontSize: "text-xs",
	color: "status.error",
});

export const Input = forwardRef<HTMLInputElement | null, InputProps>(
	function Input(
		{
			label,
			error,
			uiSize = "md",
			className = "",
			id: idProp,
			type,
			numberSpinners = true,
			...props
		},
		ref,
	) {
		const autoId = useId();
		const inputId = idProp ?? (label ? autoId : undefined);
		const isNumber = type === "number";
		const showSpinners = isNumber && numberSpinners;
		const hasError = Boolean(error);
		const stateClass = hasError ? errorState : defaultState;
		const spinnersClass = showSpinners
			? `${numberSpinnerHidden} ${numberSpinnerFocus}`
			: isNumber
				? numberSpinnerHidden
				: "";
		const inputClass =
			`ty-ui-input ${base} ${stateClass} ${sizes[uiSize]} ${spinnersClass} ${className}`.trim();

		const control = (
			<input
				ref={ref}
				id={inputId}
				type={type}
				aria-invalid={hasError}
				className={inputClass}
				{...props}
			/>
		);

		if (!label && !error) {
			return control;
		}

		return (
			<div className={wrapper}>
				{label ? (
					<label className={labelClass} htmlFor={inputId}>
						{label}
					</label>
				) : null}
				{control}
				{error ? <span className={errorLabel}>{error}</span> : null}
			</div>
		);
	},
);
