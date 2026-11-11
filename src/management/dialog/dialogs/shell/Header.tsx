import type { HTMLAttributes, JSX } from "react";
import { cx } from "@/shared/util/cx";
import { css } from "@/styled-system/css";

export type HeaderProps = {
	title: string;
	meta?: string;
	className?: string;
	titleClassName?: string;
	chromeProps?: Omit<HTMLAttributes<HTMLElement>, "children">;
};

export function Header({
	title,
	meta,
	className,
	titleClassName,
	chromeProps,
}: HeaderProps): JSX.Element {
	const { className: chromeClassName, ...chromeRest } = chromeProps ?? {};
	return (
		<header
			data-dialog-header
			className={cx(
				css({
					flexShrink: 0,
					display: "flex",
					alignItems: "center",
					justifyContent: "between",
					gap: "3",
					py: "2.5",
					paddingInline: "var(--ty-shell-pad-inline)",
					bg: "surface.dialog",
				}),
				className,
				chromeClassName,
			)}
			{...chromeRest}
		>
			<h1
				className={cx(
					css({
						margin: "0",
						fontSize: "var(--ty-text-size-md)",
						fontWeight: "semibold",
						color: "text.primary",
					}),
					titleClassName,
				)}
			>
				{title}
			</h1>
			{meta ? (
				<span
					className={css({
						fontSize: "var(--ty-text-size-xs)",
						color: "text.muted",
						flexShrink: 0,
					})}
				>
					{meta}
				</span>
			) : null}
		</header>
	);
}
