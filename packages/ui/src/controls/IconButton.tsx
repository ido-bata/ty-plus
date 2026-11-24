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
		borderWidth: "hairline",
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
		boxShadow: "var(--color-focus-ring)",
		outlineOffset: "0",
		outline: "2px solid transparent",
	},
});

/**
 * The selected surface of a toggle button. It is a fill plus a text colour —
 * not a border, not a size change — so the button keeps the same box in
 * both states and only the surface changes.
 *
 * `interactive.active` (ink-12) rather than `surface.widget`: on the ghost
 * variant the old fill was nearly identical to the surrounding dialog
 * surface, so `aria-pressed` toggles (e.g. the list/icons view switch)
 * looked pixel-identical in both states.
 */
// Attribute-scoped so the rule outranks the variant classes regardless of
// stylesheet order: `.cls[data-active]` (0,2,0) always beats a bare variant
// class (0,1,0). A plain class lost the cascade to `ghost`'s transparent
// background, making `aria-pressed` toggles pixel-identical (#470).
const activeSurface = css({
	"&[data-active]": {
		backgroundColor: "interactive.active",
		color: "text.primary",
	},
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
			data-active={active || undefined}
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
