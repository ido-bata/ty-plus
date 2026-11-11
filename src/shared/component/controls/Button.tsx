import type { ButtonHTMLAttributes, ReactElement, ReactNode } from "react";
import { cx } from "@/shared/util/cx";
import { css } from "@/styled-system/css";

type ButtonVariant =
	| "primary"
	| "default"
	| "secondary"
	| "outline"
	| "ghost"
	| "danger";
type ButtonSize = "sm" | "md" | "lg";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
	variant?: ButtonVariant;
	uiSize?: ButtonSize;
	/** Expands to fill parent width within grid cell */
	fullWidth?: boolean;
	/** Start slot (Lucide etc.). Text i18n is caller's responsibility */
	start?: ReactNode;
	/** End slot */
	end?: ReactNode;
};

const base = css({
	display: "inline-flex",
	alignItems: "center",
	justifyContent: "center",
	gap: "1.5",
	userSelect: "none",
	whiteSpace: "nowrap",
	cursor: "pointer",
	borderRadius: "shell-sm",
	paddingInline: "2.5",
	fontSize: "shell-text-sm",
	lineHeight: "tight",
	fontWeight: "medium",
	outline: "none",
	transitionProperty: "colors",
	_disabled: {
		opacity: 0.5,
		pointerEvents: "none",
		cursor: "default",
	},
	"& svg": {
		pointerEvents: "none",
		flexShrink: 0,
	},
});

const sizes: Record<ButtonSize, string> = {
	sm: css({
		height: "7",
		minHeight: "7",
		paddingInline: "2",
		"& svg": { boxSize: "3.5" },
	}),
	md: css({
		height: "8",
		minHeight: "8",
		paddingInline: "2.5",
		"& svg": { boxSize: "4" },
	}),
	lg: css({
		height: "9",
		minHeight: "9",
		paddingInline: "3",
		fontSize: "text-md",
		"& svg": { boxSize: "1.125rem" },
	}),
};

const variants: Record<ButtonVariant, string> = {
	default: css({
		backgroundColor: "surface.widget",
		color: "text.primary",
		borderWidth: "1px",
		borderStyle: "solid",
		borderColor: "border.subtle",
		_hover: { backgroundColor: "interactive.hover" },
		_active: { backgroundColor: "interactive.active" },
		_focusVisible: {
			boxShadow: "0 0 0 2px var(--color-interactive-focus)",
			outlineOffset: "0",
		},
	}),
	primary: css({
		backgroundColor: "text.accent",
		color: "surface.panel",
		_hover: { opacity: 0.9 },
		_active: { opacity: 0.85 },
		_focusVisible: {
			boxShadow: "0 0 0 2px var(--color-interactive-focus)",
			outlineOffset: "0",
		},
	}),
	secondary: css({
		backgroundColor: "surface.panel",
		color: "text.primary",
		borderWidth: "1px",
		borderStyle: "solid",
		borderColor: "border.subtle",
		_hover: { backgroundColor: "interactive.hover" },
		_active: { backgroundColor: "interactive.active" },
		_focusVisible: {
			boxShadow: "0 0 0 2px var(--color-interactive-focus)",
			outlineOffset: "0",
		},
	}),
	outline: css({
		backgroundColor: "transparent",
		color: "text.primary",
		borderWidth: "1px",
		borderStyle: "solid",
		borderColor: "border.strong",
		_hover: { backgroundColor: "interactive.hover" },
		_active: { backgroundColor: "interactive.active" },
		_focusVisible: {
			boxShadow: "0 0 0 2px var(--color-interactive-focus)",
			outlineOffset: "0",
		},
	}),
	ghost: css({
		borderWidth: "1px",
		borderStyle: "solid",
		borderColor: "border.default",
		backgroundColor: "transparent",
		color: "text.muted",
		_hover: {
			backgroundColor: "interactive.hover",
			color: "text.primary",
		},
		_active: { backgroundColor: "interactive.active" },
		_focusVisible: {
			borderColor: "interactive.focus",
			boxShadow: "inset 0 0 0 1px var(--color-interactive-focus)",
			outline: "none",
		},
	}),
	danger: css({
		backgroundColor: "transparent",
		color: "status.error",
		borderWidth: "1px",
		borderStyle: "solid",
		borderColor: "border.subtle",
		_hover: { backgroundColor: "interactive.hover" },
		_focusVisible: {
			boxShadow: "0 0 0 2px var(--color-interactive-focus)",
			outlineOffset: "0",
		},
	}),
};

const startEndSlot = css({
	display: "inline-flex",
	flexShrink: 0,
	alignItems: "center",
	justifyContent: "center",
});

const labelSlot = css({
	minWidth: 0,
	truncate: true,
});

export function Button(props: ButtonProps): ReactElement {
	const {
		className,
		type,
		variant = "default",
		uiSize = "md",
		fullWidth,
		start,
		end,
		children,
		...rest
	} = props;
	const content =
		start || end ? (
			<>
				{start ? <span className={startEndSlot}>{start}</span> : null}
				{children ? <span className={labelSlot}>{children}</span> : null}
				{end ? <span className={startEndSlot}>{end}</span> : null}
			</>
		) : (
			children
		);
	return (
		<button
			type={type ?? "button"}
			className={cx(
				base,
				sizes[uiSize],
				variants[variant],
				fullWidth ? css({ width: "full" }) : "",
				className,
			)}
			{...rest}
		>
			{content}
		</button>
	);
}
