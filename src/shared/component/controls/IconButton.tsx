import type { ButtonHTMLAttributes, ReactElement, ReactNode } from "react";
import { cx } from "@/shared/util/cx";
import { css } from "@/styled-system/css";

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
	variant?: "ghost" | "default";
	size?: "sm" | "md" | "lg";
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

export function IconButton(props: IconButtonProps): ReactElement {
	const {
		className,
		type,
		variant = "ghost",
		size = "md",
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
				focusRing,
				className,
			)}
			{...rest}
		>
			{children}
		</button>
	);
}
