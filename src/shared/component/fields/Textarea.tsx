import type { ReactElement, TextareaHTMLAttributes } from "react";
import { cx } from "@/shared/util/cx";
import { css } from "@/styled-system/css";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
	uiSize?: "sm" | "md" | "lg";
};

const base = css({
	width: "full",
	minWidth: 0,
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.widget",
	color: "text.primary",
	"&::placeholder": { color: "text.muted" },
	outline: "none",
	transitionProperty: "border-color,box-shadow",
	_focusVisible: {
		borderColor: "interactive.focus",
		boxShadow: "inset 0 0 0 1px var(--color-interactive-focus)",
		outline: "none",
	},
});

const sizeSm = css({
	minHeight: "16",
	paddingInline: "2",
	paddingBlock: "1.5",
	fontSize: "shell-text-sm",
});

const sizeMd = css({
	minHeight: "20",
	paddingInline: "2.5",
	paddingBlock: "2",
	fontSize: "shell-text-sm",
});

const sizeLg = css({
	minHeight: "24",
	paddingInline: "3",
	paddingBlock: "2.5",
	fontSize: "text-md",
});

const sizeMap: Record<NonNullable<TextareaProps["uiSize"]>, string> = {
	sm: sizeSm,
	md: sizeMd,
	lg: sizeLg,
};

export function Textarea(props: TextareaProps): ReactElement {
	const { className, uiSize = "md", ...rest } = props;
	return (
		<textarea className={cx(base, sizeMap[uiSize], className)} {...rest} />
	);
}
