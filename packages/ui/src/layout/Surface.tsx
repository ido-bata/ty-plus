import { cx } from "@ty-plus/ui/util/cx";
import type { HTMLAttributes, ReactElement } from "react";
import { css } from "@/styled-system/css";

export type SurfaceVariant = "default" | "raised" | "overlay" | "inset";
export type SurfacePadding = "none" | "sm" | "md" | "lg";

export type SurfaceProps = HTMLAttributes<HTMLDivElement> & {
	variant?: SurfaceVariant;
	padding?: SurfacePadding;
};

const base = css({
	borderRadius: "surface-card",
	borderWidth: "1px",
	borderStyle: "solid",
});

const variants: Record<SurfaceVariant, string> = {
	default: css({
		backgroundColor: "surface.widget",
		borderColor: "border.subtle",
	}),
	raised: css({
		backgroundColor: "surface.panel",
		borderColor: "border.subtle",
	}),
	overlay: css({
		backgroundColor: "surface.overlay",
		borderColor: "border.strong",
	}),
	inset: css({
		backgroundColor: "surface.panel",
		borderColor: "border.subtle",
		boxShadow: "inset 0 1px 0 0 var(--color-border-subtle)",
	}),
};

const paddings: Record<SurfacePadding, string> = {
	none: "",
	sm: css({ padding: "3" }),
	md: css({ padding: "4" }),
	lg: css({ padding: "6" }),
};

/**
 * Shared surface container (cards, panels, media frames). Owns background,
 * border, radius, and padding; callers compose layout around it.
 */
export function Surface(props: SurfaceProps): ReactElement {
	const { className, variant = "default", padding = "md", ...rest } = props;
	return (
		<div
			className={cx(base, variants[variant], paddings[padding], className)}
			{...rest}
		/>
	);
}
