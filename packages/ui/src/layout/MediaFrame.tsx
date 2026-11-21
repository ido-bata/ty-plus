import { cx } from "@ty-plus/ui/util/cx";
import type { HTMLAttributes, ReactElement } from "react";
import { css } from "@/styled-system/css";

export type MediaFrameProps = HTMLAttributes<HTMLDivElement>;

const frame = css({
	overflow: "hidden",
	borderRadius: "surface-card",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.subtle",
	backgroundColor: "surface.widget",
});

/**
 * Shared frame for product media (screenshots, figures). Owns border,
 * radius, background, and clipping; the caller supplies the <img>.
 */
export function MediaFrame(props: MediaFrameProps): ReactElement {
	const { className, ...rest } = props;
	return <div className={cx(frame, className)} {...rest} />;
}
