/**
 * Banner shown when the workspace layout could not be restored from disk
 * (Issue #204).
 *
 * A blocked restore is not a warning the user can dismiss: while it stands,
 * the write gate is closed and no edit reaches `workspace-N.json`. Presenting
 * that as a plain empty grid is what made the old failure look like "the
 * layout vanished". The banner therefore states the classification, names the
 * file, and offers the one action that can clear it — re-running the read
 * after the file has been repaired or restored.
 */

import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";
import type { LayoutRestoreNotice } from "@/management/workspace/layout/restore-plan";
import { Button } from "@/shared/component";
import { css } from "@/styled-system/css";

export type LayoutRestoreBannerProps = {
	notice: LayoutRestoreNotice;
	/** Re-runs the boot layout read; clears the banner when it succeeds. */
	onRetry: () => void;
};

const banner = css({
	flexShrink: "0",
	display: "flex",
	flexDirection: "column",
	gap: "1",
	padding: "2",
	backgroundColor: "surface.dialog",
	borderBottomWidth: "1px",
	borderBottomStyle: "solid",
	borderBottomColor: "border.subtle",
	color: "text.primary",
	fontSize: "shell-sm",
});

const heading = css({
	fontSize: "shell-sm",
	fontWeight: "bold",
	color: "text.primary",
});

const body = css({
	color: "text.muted",
	lineHeight: "tight",
});

const detail = css({
	fontFamily: "mono",
	fontSize: "shell-sm",
	color: "text.muted",
	overflowWrap: "anywhere",
});

const actions = css({
	display: "flex",
	gap: "1.5",
	marginTop: "0.5",
});

export const LayoutRestoreBanner = ({
	notice,
	onRetry,
}: LayoutRestoreBannerProps): ReactElement => {
	const { t } = useTranslation("workspace");
	return (
		<div
			role="alert"
			data-testid="layout-restore-banner"
			data-restore-status={notice.status}
			className={banner}
		>
			<strong className={heading}>{t("restore.title")}</strong>
			<span className={body}>
				{notice.status === "corrupt"
					? t("restore.corruptBody")
					: t("restore.readFailureBody")}
			</span>
			<span className={body}>{t("restore.savingPaused")}</span>
			<span className={body}>
				{t("restore.file", { wsIndex: notice.wsIndex })}
			</span>
			<code className={detail}>
				{notice.reason}: {notice.message}
			</code>
			<span className={actions}>
				<Button variant="primary" uiSize="sm" onClick={onRetry}>
					{t("restore.retry")}
				</Button>
			</span>
		</div>
	);
};
