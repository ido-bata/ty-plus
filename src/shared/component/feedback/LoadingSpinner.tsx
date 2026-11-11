import type { HTMLAttributes, JSX } from "react";
import { cx } from "@/shared/util/cx";
import { css } from "@/styled-system/css";

export type LoadingSpinnerProps = {
	/** Accessible label for the spinner. Defaults to "Loading". */
	label?: string;
	size?: "sm" | "md" | "lg";
	className?: string;
} & Omit<HTMLAttributes<HTMLElement>, "children">;

const root = css({
	display: "inline-flex",
	flexShrink: 0,
	alignItems: "center",
	justifyContent: "center",
});

const ring = css({
	display: "block",
	flexShrink: 0,
	borderRadius: "full",
	borderWidth: "1.5px",
	borderStyle: "solid",
	borderColor: "currentColor",
	borderTopColor: "transparent",
	animation: "spin",
});

const sizeMap = {
	sm: css({ height: "3", width: "3" }),
	md: css({ height: "4", width: "4" }),
	lg: css({ height: "5", width: "5" }),
};

const srOnly = css({
	position: "absolute",
	width: "1px",
	height: "1px",
	padding: 0,
	margin: "-1px",
	overflow: "hidden",
	clip: "rect(0,0,0,0)",
	whiteSpace: "nowrap",
	border: 0,
});

export function LoadingSpinner({
	label = "Loading",
	size = "md",
	className,
	...rest
}: LoadingSpinnerProps): JSX.Element {
	return (
		<output aria-label={label} className={cx(root, className)} {...rest}>
			{/* Non-arrow circular spinner using CSS border animation */}
			<span className={cx(ring, sizeMap[size])} aria-hidden />
			<span className={srOnly}>{label}</span>
		</output>
	);
}
