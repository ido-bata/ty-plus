import { type JSX, useCallback, useEffect } from "react";
import { Animation } from "@/function/onboarding/ui/Animation";
import { useCep } from "@/management/ae/cep/contexts/Context";
import { registerCepJsonContextMenuSurface } from "@/management/dialog/dialogs/context-menu";
import { useTranslation } from "@/management/i18n/Context";
import { usePublicLink } from "@/management/online/public-link/usePublicLink";
import { Button } from "@/shared";
import { css } from "@/styled-system/css";

declare global {
	interface Window {
		requestOpenTyPlusPanel?: (panelId: string) => void;
	}
}

const wrapperClass = css({
	position: "fixed",
	inset: 0,
	zIndex: 2147483647,
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	backgroundColor: "surface.dialog",
});

const innerClass = css({
	display: "grid",
	gridTemplateColumns: "minmax(0, 1fr)",
	gap: "4",
	width: "full",
	maxWidth: "var(--ty-shell-content-max-width)",
	paddingInline: "var(--ty-shell-pad-inline)",
});

const headerClass = css({
	display: "flex",
	flexDirection: "column",
	gap: "2",
});

const titleClass = css({
	fontSize: "lg",
	fontWeight: "semibold",
	color: "text.primary",
});

const bodyClass = css({
	fontSize: "sm",
	color: "text.muted",
	whiteSpace: "pre-line",
});

const animationSlotClass = css({
	width: "full",
	height: "28",
});

const buttonRowClass = css({
	display: "grid",
	gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
	gap: "2",
});

export function SetupRequired(): JSX.Element {
	const { t } = useTranslation("onboarding");
	const { panelSurfaceId } = useCep();
	const handleOpenPanelClick = useCallback(() => {
		window.requestOpenTyPlusPanel?.("panel-1");
	}, []);
	const handleRefreshClick = useCallback(() => {
		window.location.reload();
	}, []);

	const {
		open: openManual,
		status,
		url: manualUrl,
	} = usePublicLink("user-manual");
	const manualDisabled = manualUrl == null && status === "loading";

	// Surface for the SetupRequired view provides a ty-plus-controlled right
	// click with the actions that matter in this state: open the manual
	// (when the public link resolved) and reload the panel to re-check init
	// state. The rewrite itself is installed once in panel boot.tsx; this
	// effect only registers the per-surface payload, matching the modeless
	// dialog pattern in src/management/dialog/modeless/boot.tsx.
	useEffect(() => {
		return registerCepJsonContextMenuSurface(panelSurfaceId, {
			buildPayload: () => ({
				menu: [
					{
						id: "ty.ctx.setup-required.open-manual",
						label: "Open Manual",
						enabled: manualUrl != null,
					},
					{
						id: "ty.ctx.setup-required.refresh",
						label: "Refresh",
					},
				],
			}),
			onMenuSelect: (menuId) => {
				if (menuId === "ty.ctx.setup-required.open-manual") {
					openManual();
				} else if (menuId === "ty.ctx.setup-required.refresh") {
					handleRefreshClick();
				}
			},
		});
	}, [panelSurfaceId, openManual, manualUrl, handleRefreshClick]);

	return (
		<div className={wrapperClass} data-testid="setup-required">
			<div className={innerClass}>
				<div className={headerClass}>
					<h2 className={titleClass}>{t("secondaryPanel.title")}</h2>
					<p className={bodyClass}>{t("secondaryPanel.description")}</p>
				</div>
				<div className={animationSlotClass}>
					<Animation variant="intro" />
				</div>
				<div className={buttonRowClass}>
					<Button
						type="button"
						variant="outline"
						uiSize="sm"
						fullWidth
						onClick={openManual}
						disabled={manualDisabled}
					>
						{manualUrl
							? t("secondaryPanel.userManual")
							: t("secondaryPanel.linkUnavailable")}
					</Button>
					<Button
						type="button"
						variant="outline"
						uiSize="sm"
						fullWidth
						onClick={handleOpenPanelClick}
					>
						{t("secondaryPanel.openMainPanel")}
					</Button>
				</div>
			</div>
		</div>
	);
}
