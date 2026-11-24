import { Button, IconButton } from "@ty-plus/ui";
import { Folder, Home as HomeIcon, Settings } from "lucide-react";
import type { JSX } from "react";
import { i18n } from "@/management/i18n/index";
import { css } from "@/styled-system/css";
import { PreviewGroup } from "./ComponentPreviewSection";

const buttonsGridStyle = css({
	display: "grid",
	gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
	gap: "2",
	sm: {
		gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
	},
	lg: {
		gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
	},
});

const iconButtonsGridStyle = css({
	display: "grid",
	gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
	gap: "2",
	sm: {
		gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
	},
});

export function ButtonsPreview(): JSX.Element {
	return (
		<>
			<PreviewGroup title={i18n.t("settings:previewButtons")}>
				<div className={buttonsGridStyle}>
					<Button variant="default" uiSize="sm">
						{i18n.t("settings:componentPreview.buttonDefault")}
					</Button>
					<Button variant="secondary" uiSize="sm">
						{i18n.t("settings:componentPreview.buttonSecondary")}
					</Button>
					<Button variant="primary" uiSize="sm">
						{i18n.t("settings:componentPreview.buttonPrimary")}
					</Button>
					<Button variant="outline" uiSize="sm">
						{i18n.t("settings:componentPreview.buttonOutline")}
					</Button>
					<Button variant="ghost" uiSize="sm">
						{i18n.t("settings:componentPreview.buttonGhost")}
					</Button>
					<Button variant="danger" uiSize="sm">
						{i18n.t("settings:componentPreview.buttonDanger")}
					</Button>
					<Button variant="primary" uiSize="sm" start={<HomeIcon size={14} />}>
						{i18n.t("settings:componentPreview.buttonWithIcon")}
					</Button>
				</div>
				<div className={buttonsGridStyle}>
					<Button variant="default" uiSize="md">
						{i18n.t("settings:componentPreview.buttonMedium")}
					</Button>
					<Button variant="primary" uiSize="lg">
						{i18n.t("settings:componentPreview.buttonLarge")}
					</Button>
					<Button variant="default" uiSize="sm" disabled>
						{i18n.t("settings:componentPreview.buttonDisabled")}
					</Button>
				</div>
			</PreviewGroup>
			<PreviewGroup title={i18n.t("settings:componentPreview.iconButtons")}>
				<div className={iconButtonsGridStyle}>
					<IconButton variant="ghost" size="sm">
						<HomeIcon size={14} />
					</IconButton>
					<IconButton variant="ghost" size="md">
						<Folder size={16} />
					</IconButton>
					<IconButton variant="ghost" size="lg">
						<Settings size={18} />
					</IconButton>
					<IconButton variant="default" size="sm">
						<HomeIcon size={14} />
					</IconButton>
					<IconButton variant="default" size="md">
						<Folder size={16} />
					</IconButton>
					<IconButton variant="default" size="lg">
						<Settings size={18} />
					</IconButton>
				</div>
			</PreviewGroup>
		</>
	);
}
