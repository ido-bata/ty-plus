import { cx } from "@ty-plus/ui/util/cx";
import type { HTMLAttributes, ReactElement, ReactNode } from "react";
import { css } from "@/styled-system/css";

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "error";

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
	tone?: BadgeTone;
	children?: ReactNode;
};

const base = css({
	display: "inline-flex",
	alignItems: "center",
	gap: "1.5",
	paddingInline: "2",
	paddingBlock: "0.5",
	borderRadius: "full",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.subtle",
	backgroundColor: "surface.widget",
	fontSize: "text-2xs",
	fontWeight: "medium",
	lineHeight: "tight",
	whiteSpace: "nowrap",
	userSelect: "none",
});

const tones: Record<BadgeTone, string> = {
	neutral: css({ color: "text.muted" }),
	accent: css({ color: "text.accent" }),
	success: css({ color: "status.success" }),
	warning: css({ color: "status.warning" }),
	error: css({ color: "status.error" }),
};

/** Small status/metadata label. Appearance is owned here; do not restyle. */
export function Badge(props: BadgeProps): ReactElement {
	const { className, tone = "neutral", ...rest } = props;
	return <span className={cx(base, tones[tone], className)} {...rest} />;
}
