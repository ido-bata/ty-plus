import { LoaderCircle, PanelLeftClose, RefreshCw } from "lucide-react";
import type { JSX } from "react";
import { IconButton } from "@/shared/component/controls/IconButton";
import { Icon } from "@/shared/component/icons/Icon";
import { cx } from "@/shared/util/cx";
import { css } from "@/styled-system/css";

export type PresetLibraryHeaderProps = {
	showSidePanel: boolean;
	isReloading: boolean;
	onShowSidePanel: () => void;
	onReload: () => void;
};

const headerClass = css({
	display: "flex",
	alignItems: "center",
	gap: "2",
	paddingInline: "4",
	paddingBlock: "2",
	flexShrink: 0,
	borderBottomWidth: "1px",
	borderBottomStyle: "solid",
	borderBottomColor: "border.default",
});

const titleClass = css({
	fontSize: "sm",
	fontWeight: "semibold",
	color: "text.primary",
	truncate: true,
});

const actionRowClass = css({
	marginLeft: "auto",
	display: "flex",
	alignItems: "center",
	gap: "1",
});

const spinningClass = css({
	animation: "spin",
});

export function PresetLibraryHeader(
	props: PresetLibraryHeaderProps,
): JSX.Element {
	const { showSidePanel, isReloading, onShowSidePanel, onReload } = props;
	return (
		<div className={headerClass}>
			{!showSidePanel && (
				<IconButton
					size="sm"
					variant="ghost"
					title="Show filters"
					onClick={onShowSidePanel}
				>
					<Icon icon={PanelLeftClose} size={12} />
				</IconButton>
			)}
			<h1 className={titleClass}>Online Preset Library</h1>
			<div className={actionRowClass}>
				<IconButton
					size="sm"
					variant="ghost"
					title={isReloading ? "Reloading…" : "Reload catalog"}
					onClick={onReload}
					disabled={isReloading}
					className={cx(isReloading && spinningClass)}
				>
					<Icon icon={isReloading ? LoaderCircle : RefreshCw} size={12} />
				</IconButton>
			</div>
		</div>
	);
}
