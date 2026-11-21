import { IconButton } from "@ty-plus/ui/controls/IconButton";
import { Icon } from "@ty-plus/ui/icons/Icon";
import { cx } from "@ty-plus/ui/util/cx";
import { LoaderCircle, PanelLeftClose, RefreshCw } from "lucide-react";
import type { JSX } from "react";
import { i18n } from "@/management/i18n/index";
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
					title={i18n.t("online:catalog.showFilters")}
					onClick={onShowSidePanel}
				>
					<Icon icon={PanelLeftClose} size={12} />
				</IconButton>
			)}
			<h1 className={titleClass}>{i18n.t("online:catalog.title")}</h1>
			<div className={actionRowClass}>
				<IconButton
					size="sm"
					variant="ghost"
					title={
						isReloading
							? i18n.t("online:catalog.reloadingCatalog")
							: i18n.t("online:catalog.reloadCatalog")
					}
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
