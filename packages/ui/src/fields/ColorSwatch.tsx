import { COLOR_INPUT_FALLBACK_HEX } from "@ty-plus/ui/literals/color-input";
import { cx } from "@ty-plus/ui/util/cx";
import type { JSX } from "react";
import { css } from "@/styled-system/css";

export type ColorSwatchProps = {
	value: string;
	onChange: (value: string) => void;
	disabled?: boolean;
	className?: string;
	"aria-label"?: string;
};

const swatch = css({
	height: "8",
	width: "8",
	flexShrink: 0,
	cursor: "pointer",
	appearance: "none",
	borderRadius: "shell",
	borderWidth: "hairline",
	borderStyle: "solid",
	borderColor: "border.control",
	backgroundColor: "surface.widget",
	padding: 0,
	transitionProperty: "color, background-color, border-color",
	"&::-webkit-color-swatch-wrapper": {
		padding: "0.5",
	},
	"&::-webkit-color-swatch": {
		borderRadius: "shell-sm",
		border: 0,
	},
	_hover: { borderColor: "interactive.focus" },
	_disabled: {
		opacity: 0.5,
		cursor: "not-allowed",
	},
	_focusVisible: {
		borderColor: "interactive.focus",
		outline: "none",
		boxShadow: "var(--color-focus-ring)",
	},
});

// Known limitation (issue #748): `<input type="color">` cannot represent
// alpha, so non-hex values such as `"transparent"` silently render as the
// opaque `COLOR_INPUT_FALLBACK_HEX` chip even though the stored value is
// fully transparent. Callers that accept non-hex colours should layer
// their own transparent-state affordance on top (see
// `src/management/workspace/background/Fields.tsx`); a dedicated swatch
// component with alpha support is deferred as real scope.
function normalizeHexForColorInput(value: string): string {
	const trimmed = value.trim();
	if (trimmed.startsWith("#") && trimmed.length >= 4) {
		return trimmed;
	}
	return COLOR_INPUT_FALLBACK_HEX;
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
