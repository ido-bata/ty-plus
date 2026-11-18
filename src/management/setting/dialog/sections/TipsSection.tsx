import { type JSX, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	SettingsField,
	SettingsFieldLabel,
	SettingsGrid,
} from "@/management/setting/dialog/layout/SettingsGrid";
import { resetTutorialState } from "@/management/tutorial/state-store";
import { Button } from "@/shared/component/controls/Button";
import { css } from "@/styled-system/css";

const statusStyle = css({
	fontSize: "text-xs",
	color: "text.secondary",
});

/**
 * Tips / tutorial guidance reset (Issue #158).
 *
 * Clears `settings/tutorial-state.json` so every widget's help summary and
 * first-run hint is presented again on next view. The store keys state by
 * widget type + content version, so this is the only user-facing reset path.
 */
export function TipsSection(): JSX.Element {
	const { t } = useTranslation("settings");
	const [status, setStatus] = useState<"idle" | "done" | "error">("idle");

	const handleReset = useCallback(() => {
		setStatus("idle");
		void resetTutorialState(window)
			.then(() => setStatus("done"))
			.catch(() => setStatus("error"));
	}, []);

	return (
		<SettingsGrid>
			<SettingsField span={6}>
				<SettingsFieldLabel>{t("tipsSectionLabel")}</SettingsFieldLabel>
				<div
					className={css({
						display: "flex",
						minWidth: 0,
						flexDirection: "column",
						gap: "var(--ty-space-2)",
					})}
				>
					<span className={statusStyle}>{t("tipsSectionDescription")}</span>
					<div>
						<Button
							variant="default"
							uiSize="sm"
							onClick={handleReset}
							data-settings-tips-reset=""
						>
							{t("tipsReset")}
						</Button>
					</div>
					{status === "done" ? (
						<span className={statusStyle} role="status">
							{t("tipsResetDone")}
						</span>
					) : null}
					{status === "error" ? (
						<span className={statusStyle} role="alert">
							{t("tipsResetFailed")}
						</span>
					) : null}
				</div>
			</SettingsField>
		</SettingsGrid>
	);
}
