import { cx } from "@ty-plus/ui/util/cx";
import type {
	ButtonHTMLAttributes,
	ComponentPropsWithRef,
	ElementType,
	ReactElement,
	ReactNode,
} from "react";
import { css } from "@/styled-system/css";

type ButtonVariant =
	| "primary"
	| "default"
	| "secondary"
	| "outline"
	| "ghost"
	| "danger"
	/**
	 * No chrome of its own: transparent surface, no border, inherited text
	 * colour and weight. Use it when the button IS the whole surface of a
	 * composite (a list row, a tile) and the surrounding container owns the
	 * border, fill, and hover treatment. It keeps the shared focus ring and
	 * the shared size scale, so the control still behaves like every other
	 * button in the app.
	 */
	| "bare"
	/**
	 * Inline text link: no box at all — the caller pairs it with
	 * `uiSize="content"`. Used for actions that read as links inside prose
	 * or status text (release notes, check-now, browse).
	 */
	| "link";
type ButtonSize = "sm" | "md" | "lg" | "content";

type ButtonOwnProps = {
	variant?: ButtonVariant;
	uiSize?: ButtonSize;
	/** Expands to fill parent width within grid cell */
	fullWidth?: boolean;
	/** Start slot (Lucide etc.). Text i18n is caller's responsibility */
	start?: ReactNode;
	/** End slot */
	end?: ReactNode;
};

/**
 * Polymorphic button. Defaults to a native `<button>`; pass `as` to render
 * another element or component (e.g. a router link) while keeping the shared
 * appearance. Extra props for the rendered element are forwarded as-is.
 */
export type ButtonProps = ButtonOwnProps &
	ButtonHTMLAttributes<HTMLButtonElement> & {
		as?: ElementType;
		[key: string]: unknown;
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
	fontSize: "shell-text-sm",
	lineHeight: "tight",
	fontWeight: "medium",
	outline: "none",
	transitionProperty: "color, background-color, border-color",
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
	/**
	 * No box metrics of its own: the caller's className owns sizing, padding,
	 * and layout (list rows, accordion triggers, tab strips). Still keeps the
	 * shared focus ring and disabled treatment.
	 */
	content: css({
		height: "auto",
		minHeight: "0",
		paddingInline: "0",
	}),
};

const variants: Record<ButtonVariant, string> = {
	default: css({
		backgroundColor: "surface.widget",
		color: "text.primary",
		borderWidth: "hairline",
		borderStyle: "solid",
		borderColor: "border.subtle",
		_hover: { backgroundColor: "interactive.hover" },
		_active: { backgroundColor: "interactive.active" },
		_focusVisible: {
			boxShadow: "var(--color-focus-ring)",
			outlineOffset: "0",
		},
	}),
	primary: css({
		backgroundColor: "text.accent",
		color: "surface.panel",
		// Issue #763: a disabled primary must drop the accent fill — at
		// rest-opacity 0.5 it still read as an active CTA (settings
		// feedback submit, background editor). It rests on the same muted
		// surface as every other disabled control; the base `_disabled`
		// dim still applies on top.
		// Issue #798: it must also keep the disabled-control chrome —
		// every other variant retains its hairline `border.subtle` frame
		// when disabled, so a chromeless disabled primary read as a bare
		// label next to its enabled sibling. The enabled primary stays
		// chromeless; only the disabled state gains the frame.
		_disabled: {
			backgroundColor: "surface.widget",
			color: "text.muted",
			borderWidth: "hairline",
			borderStyle: "solid",
			borderColor: "border.subtle",
		},
		_hover: { opacity: 0.9 },
		_active: { opacity: 0.85 },
		_focusVisible: {
			boxShadow: "var(--color-focus-ring)",
			outlineOffset: "0",
		},
	}),
	secondary: css({
		backgroundColor: "surface.panel",
		color: "text.primary",
		borderWidth: "hairline",
		borderStyle: "solid",
		borderColor: "border.subtle",
		_hover: { backgroundColor: "interactive.hover" },
		_active: { backgroundColor: "interactive.active" },
		_focusVisible: {
			boxShadow: "var(--color-focus-ring)",
			outlineOffset: "0",
		},
	}),
	outline: css({
		backgroundColor: "transparent",
		color: "text.primary",
		borderWidth: "hairline",
		borderStyle: "solid",
		// Issue #761: `border.strong` (#0e0e0e) is darker than the dark
		// canvas, so the outline frame was effectively invisible. The
		// outline variant IS the identifiable-control border, so it rests
		// on `border.control` (text-derived α0.38) — visible on both
		// light and dark surfaces.
		borderColor: "border.control",
		_hover: { backgroundColor: "interactive.hover" },
		_active: { backgroundColor: "interactive.active" },
		_focusVisible: {
			boxShadow: "var(--color-focus-ring)",
			outlineOffset: "0",
		},
	}),
	ghost: css({
		borderWidth: "hairline",
		borderStyle: "solid",
		// Issue #722: ghost rests on the same `border.subtle` tier as the
		// default/secondary/danger variants; focus escalates to
		// `interactive.focus` + the shared ring.
		borderColor: "border.subtle",
		backgroundColor: "transparent",
		color: "text.muted",
		_hover: {
			backgroundColor: "interactive.hover",
			color: "text.primary",
		},
		_active: { backgroundColor: "interactive.active" },
		_focusVisible: {
			borderColor: "interactive.focus",
			boxShadow: "var(--color-focus-ring)",
			outline: "none",
		},
	}),
	bare: css({
		backgroundColor: "transparent",
		borderWidth: "0",
		color: "text.primary",
		fontWeight: "normal",
		_focusVisible: {
			boxShadow: "var(--color-focus-ring)",
			outlineOffset: "0",
		},
	}),
	link: css({
		backgroundColor: "transparent",
		borderWidth: "0",
		color: "text.accent",
		fontSize: "text-sm",
		fontWeight: "normal",
		textDecoration: "underline",
		_focusVisible: {
			boxShadow: "var(--color-focus-ring)",
			outlineOffset: "0",
		},
	}),
	danger: css({
		backgroundColor: "transparent",
		color: "status.error",
		borderWidth: "hairline",
		borderStyle: "solid",
		borderColor: "border.subtle",
		_hover: { backgroundColor: "interactive.hover" },
		_focusVisible: {
			boxShadow: "var(--color-focus-ring)",
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
		as: Component = "button",
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
	const buttonProps = {
		// `type` only applies to native buttons; links must not receive it.
		...(Component === "button" ? { type: type ?? "button" } : {}),
		className: cx(
			base,
			sizes[uiSize],
			variants[variant],
			fullWidth ? css({ width: "full" }) : "",
			className,
		),
		...rest,
	};
	return (
		<Component {...(buttonProps as ComponentPropsWithRef<ElementType>)}>
			{content}
		</Component>
	);
}
