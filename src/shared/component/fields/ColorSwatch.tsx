import type { JSX } from "react";
import { cx } from "@/shared/util/cx";
import { css } from "@/styled-system/css";

export type ColorSwatchProps = {
	value: string;
	onChange: (value: string) => void;
	disabled?: boolean;
	className?: string;
	"aria-label"?: string;
};

const COLOR_SWATCH_CLASS = cx(
	"h-8 w-8 shrink-0 cursor-pointer appearance-none rounded-shell",
	"border border-border-default bg-surface-widget p-0",
	"transition-colors hover:border-interactive-focus",
	"focus-visible:border-interactive-focus focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive-focus/30",
	"[&::-webkit-color-swatch-wrapper]:p-0.5",
	"[&::-webkit-color-swatch]:rounded-[length:var(--radius-shell-sm)]",
	"[&::-webkit-color-swatch]:border-0",
);

const swatch = css({
	height: "8",
	width: "8",
	flexShrink: 0,
	cursor: "pointer",
	appearance: "none",
	borderRadius: "shell",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.widget",
	padding: 0,
	transitionProperty: "colors",
	"&::-webkit-color-swatch-wrapper": {
		padding: "0.5",
	},
	"&::-webkit-color-swatch": {
		borderRadius: "shell-sm",
		border: 0,
	},
	_hover: { borderColor: "interactive.focus" },
	_focusVisible: {
		borderColor: "interactive.focus",
		outline: "none",
		boxShadow:
			"0 0 0 2px color-mix(in srgb, var(--color-interactive-focus) 30%, transparent)",
	},
});

function normalizeHexForColorInput(value: string): string {
	const trimmed = value.trim();
	if (trimmed.startsWith("#") && trimmed.length >= 4) {
		return trimmed;
	}
	return "#000000";
}

/**
 * Bare color swatch picker — swatch only, no text input.
 */
export function ColorSwatch({
	value,
	onChange,
	disabled,
	className,
	"aria-label": ariaLabel,
}: ColorSwatchProps): JSX.Element {
	const swatchColor = normalizeHexForColorInput(value);

	return (
		<input
			type="color"
			value={swatchColor}
			onChange={(e) => onChange(e.target.value)}
			aria-label={ariaLabel ?? "Color"}
			className={cx(swatch, className)}
			disabled={disabled}
		/>
	);
}
