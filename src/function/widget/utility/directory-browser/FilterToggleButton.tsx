import type { JSX } from "react";
import { cx } from "@/shared/util/cx";
import { css } from "@/styled-system/css";

export function FilterToggleButton({
	pressed,
	label,
	onClick,
}: {
	pressed: boolean;
	label: string;
	onClick: () => void;
}): JSX.Element {
	const base = css({
		borderRadius: "shell-sm",
		borderWidth: "1px",
		borderStyle: "solid",
		paddingInline: "1.5",
		paddingBlock: "0.5",
		fontSize: "text-2xs",
	});
	return (
		<button
			type="button"
			className={cx(
				base,
				pressed
					? css({
							borderColor: "border.default",
							backgroundColor: "surface.widget",
							opacity: 0.4,
							color: "text.muted",
							textDecoration: "line-through",
						})
					: css({
							borderColor: "border.strong",
							backgroundColor: "surface.widget",
							color: "text.primary",
						}),
			)}
			onClick={onClick}
		>
			{label}
		</button>
	);
}
