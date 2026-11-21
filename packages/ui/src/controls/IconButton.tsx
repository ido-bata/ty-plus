import { cx } from "@ty-plus/ui/util/cx";
import type { ButtonHTMLAttributes, ReactElement, ReactNode } from "react";
import { css } from "@/styled-system/css";

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
	variant?: "ghost" | "default";
	/**
	 * Control height in spacing units. `xs` (6) is the compact overlay size
	 * used by icon-grid tiles; `sm`/`md`/`lg` align with the Button scale.
	 */
	size?: "xs" | "sm" | "md" | "lg";
	/**
	 * Renders the selected/pressed surface. Use it for toggle buttons (view
	 * mode, filter toggles) together with `aria-pressed` — the shared
	 * component owns the selected appearance so callers do not re-skin it
	 * with a `className` override.
	 */
	active?: boolean;
	children?: ReactNode;
};

const base = css({
	display: "inline-flex",
	alignItems: "center",
	justifyContent: "center",
	userSelect: "none",
	borderRadius: "shell-sm",
	outline: "none",
	transitionProperty: "all",
	transitionDuration: "fast",
	_disabled: { opacity: 0.5, pointerEvents: "none" },
	"& svg": { pointerEvents: "none", flexShrink: 0 },
});

const sizeMap: Record<NonNullable<IconButtonProps["size"]>, string> = {
	xs: css({ height: "6", width: "6" }),
	sm: css({ height: "7", width: "7" }),
	md: css({ height: "8", width: "8" }),
	lg: css({ height: "9", width: "9" }),
};

const variantMap: Record<NonNullable<IconButtonProps["variant"]>, string> = {
	default: css({
		borderWidth: "1px",
		borderStyle: "solid",
		borderColor: "border.subtle",
		backgroundColor: "surface.widget",
		color: "text.primary",
		_hover: { backgroundColor: "interactive.hover" },
		_active: { backgroundColor: "interactive.active" },
	}),
	ghost: css({
		backgroundColor: "transparent",
		color: "text.muted",
		_hover: {
			backgroundColor: "interactive.hover",
			color: "text.primary",
		},
		_active: {
			backgroundColor: "interactive.active",
			scale: 0.95,
		},
	}),
};

const focusRing = css({
	_focusVisible: {
		boxShadow: "0 0 0 2px var(--color-interactive-focus)",
		outlineOffset: "0",
		outline: "2px solid transparent",
	},
});

/**
 * The selected surface of a toggle button. It is a fill plus a text colour —
 * not a border, not a size change — so the button keeps the same box in
 * both states and only the surface changes.
 */
const activeSurface = css({
	backgroundColor: "surface.widget",
	color: "text.primary",
});

export function IconButton(props: IconButtonProps): ReactElement {
	const {
		className,
		type,
		variant = "ghost",
		size = "md",
		active = false,
		children,
		...rest
	} = props;

	return (
		<button
			type={type ?? "button"}
			className={cx(
				base,
				sizeMap[size],
				variantMap[variant],
				active ? activeSurface : "",
				focusRing,
				className,
			)}
			{...rest}
		>
			{children}
		</button>
	);
}
