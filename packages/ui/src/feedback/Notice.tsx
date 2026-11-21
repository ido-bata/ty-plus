import { cx } from "@ty-plus/ui/util/cx";
import type { HTMLAttributes, ReactElement, ReactNode } from "react";
import { css } from "@/styled-system/css";

export type NoticeTone = "info" | "success" | "warning" | "error";

export type NoticeProps = HTMLAttributes<HTMLDivElement> & {
	tone?: NoticeTone;
	children?: ReactNode;
};

const base = css({
	display: "flex",
	gap: "2.5",
	padding: "3.5",
	borderRadius: "surface-card",
	borderWidth: "1px",
	borderStyle: "solid",
	fontSize: "text-body",
	lineHeight: "relaxed",
});

const content = css({
	flex: "1",
	minWidth: 0,
});

const tones: Record<NoticeTone, string> = {
	info: css({
		backgroundColor: "surface.widget",
		borderColor: "border.subtle",
		color: "text.primary",
	}),
	success: css({
		backgroundColor: "surface.widget",
		borderColor: "border.subtle",
		color: "status.success",
	}),
	warning: css({
		backgroundColor: "surface.widget",
		borderColor: "border.subtle",
		color: "status.warning",
	}),
	error: css({
		backgroundColor: "surface.widget",
		borderColor: "border.subtle",
		color: "status.error",
	}),
};

/**
 * Inline notice/callout. Appearance is owned here; do not restyle.
 *
 * Children flow inside a single content block so inline text, links,
 * and multiple paragraphs render as normal document flow — they must
 * not become separate flex items of the notice frame.
 */
export function Notice(props: NoticeProps): ReactElement {
	const { className, tone = "info", children, ...rest } = props;
	return (
		<div className={cx(base, tones[tone], className)} {...rest}>
			<div className={content}>{children}</div>
		</div>
	);
}
