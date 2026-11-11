import type { JSX, ReactNode } from "react";
import { ScrollArea } from "@/shared/component";
import { css } from "@/styled-system/css";

const dialogScrollArea = css({
	minHeight: 0,
	width: "full",
	flex: 1,
	backgroundColor: "surface.dialog",
});

const sheet = css({
	display: "flex",
	minWidth: 0,
	flexDirection: "column",
	gap: "var(--ty-shell-space)",
	paddingInline: "var(--ty-shell-pad-inline)",
	paddingBlock: "var(--ty-shell-space)",
	backgroundColor: "surface.dialog",
});

/**
 * Provides only the same scroll + padding + `ty-shell-sheet` as `SettingsDialog`.
 * Avoid placing a double "panel" component inside the dialog (e.g., Card wrapping).
 * Compose sections using tokens and existing UI combinations.
 */
export function DialogBody(props: { children: ReactNode }): JSX.Element {
	const { children } = props;
	return (
		<ScrollArea className={dialogScrollArea}>
			<div className={`ty-shell-sheet ${sheet}`}>{children}</div>
		</ScrollArea>
	);
}
