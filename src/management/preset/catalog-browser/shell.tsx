import { ScrollArea } from "@ty-plus/ui";
import type { JSX, ReactNode } from "react";
import { css, cx } from "@/styled-system/css";

type ShellDomPrefix = "preset-list" | "directory-browser";

type ShellScrollMode = "all" | "list-only";

const directoryBrowserOuterClass = css({
	display: "flex",
	minHeight: "0",
	minWidth: "0",
	flex: "1",
	flexDirection: "column",
	gap: "3",
	paddingInline: "2.5",
	paddingBlock: "3",
	backgroundColor: "surface.dialog",
});

const presetListOuterClass = css({
	display: "flex",
	minHeight: "0",
	minWidth: "0",
	flex: "1",
	flexDirection: "column",
	gap: "2",
	// Issue #767: the preset-list shell had block padding only, so the
	// header, counter and row items rendered flush against the dialog
	// edges while the directory-browser shell kept a horizontal inset.
	// (`"shell-space"` was never a Panda token — it compiled to the invalid
	// `padding-*: shell-space` declaration the browser dropped, so the
	// block padding never applied either.)
	paddingInline: "shell",
	paddingBlock: "shell",
	backgroundColor: "surface.dialog",
});

const overflowHiddenClass = css({ overflow: "hidden" });

const headerSlotClass = css({
	display: "flex",
	minWidth: "0",
	flexShrink: "0",
	flexDirection: "column",
});

const listOnlyScrollAreaClass = css({
	minHeight: "0",
	minWidth: "0",
	flex: "1",
	width: "full",
	backgroundColor: "surface.dialog",
});

const sharedScrollAreaClass = css({
	minHeight: "0",
	flex: "1",
	width: "full",
	minWidth: "0",
	backgroundColor: "surface.dialog",
});

const listOnlyInnerClass = css({
	display: "flex",
	minHeight: "0",
	minWidth: "0",
	flexDirection: "column",
	gap: "2",
	paddingBottom: "0.5",
});

export type ShellProps = {
	domPrefix: ShellDomPrefix;
	headerRow: ReactNode;
	children: ReactNode;
	/**
	 * `all` (default): header + body share one scroll container.
	 * `list-only`: header stays fixed; only `children` scroll (directory-browser).
	 */
	scrollMode?: ShellScrollMode;
};

/**
 * Scroll shell shared by the preset list dialog and the workspace directory-browser widget.
 */
export function CatalogBrowserShell(props: ShellProps): JSX.Element {
	const { domPrefix, headerRow, children, scrollMode = "all" } = props;

	const outerPad =
		domPrefix === "directory-browser"
			? directoryBrowserOuterClass
			: presetListOuterClass;

	const bodyDataAttr =
		domPrefix === "preset-list"
			? { "data-preset-list-body": "" as const }
			: { "data-directory-browser-body": "" as const };

	if (scrollMode === "list-only" && domPrefix === "directory-browser") {
		return (
			<div className={cx(outerPad, overflowHiddenClass)} {...bodyDataAttr}>
				<div className={headerSlotClass}>{headerRow}</div>
				<ScrollArea className={listOnlyScrollAreaClass}>
					<div className={listOnlyInnerClass}>{children}</div>
				</ScrollArea>
			</div>
		);
	}

	return (
		<ScrollArea className={sharedScrollAreaClass}>
			<div className={outerPad} {...bodyDataAttr}>
				{headerRow}
				{children}
			</div>
		</ScrollArea>
	);
}
