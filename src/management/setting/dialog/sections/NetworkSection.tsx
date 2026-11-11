import { type JSX, useCallback, useEffect, useState } from "react";
import type { SyncStatus } from "@/management/online/contract";
import { useSettings } from "@/management/setting/context";
import {
	SettingsField,
	SettingsGrid,
} from "@/management/setting/dialog/layout/SettingsGrid";
import { getDataServices } from "@/management/workspace/services";
import { cx } from "@/shared/util/cx";
import { css } from "@/styled-system/css";

const mutedTextStyle = css({
	fontSize: "text-xs",
	color: "text.muted",
});

const statusReadyStyle = css({
	fontSize: "text-sm",
	fontWeight: "medium",
	color: "status.success",
});

const statusErrorStyle = css({
	fontSize: "text-sm",
	fontWeight: "medium",
	color: "status.error",
});

const statusMutedStyle = css({
	fontSize: "text-sm",
	fontWeight: "medium",
	color: "text.muted",
});

const monoBreakStyle = css({
	fontSize: "text-xs",
	fontFamily: "mono",
	color: "text.primary",
	wordBreak: "break-all",
});

const errorTextStyle = css({
	fontSize: "text-xs",
	color: "status.error",
	wordBreak: "break-word",
});

function statusTone(state: SyncStatus["state"]): string {
	if (state === "ready") {
		return statusReadyStyle;
	}
	if (state === "error") {
		return statusErrorStyle;
	}
	return statusMutedStyle;
}

export function NetworkSection(): JSX.Element {
	const { isLoaded } = useSettings();
	const [status, setStatus] = useState<SyncStatus | null>(null);
	const [checking, setChecking] = useState(false);

	const runCheck = useCallback(async () => {
		setChecking(true);
		try {
			const { cloudSync } = getDataServices();
			const result = await cloudSync.syncPresets();
			setStatus(result.status);
		} catch (error) {
			setStatus({
				provider: "supabase",
				state: "error",
				label: "Connection check failed",
				checkedAt: new Date().toISOString(),
				errorMessage: error instanceof Error ? error.message : String(error),
			});
		}
		setChecking(false);
	}, []);

	useEffect(() => {
		if (!isLoaded) {
			return;
		}
		void runCheck();
	}, [isLoaded, runCheck]);

	return (
		<SettingsGrid>
			<SettingsField span={6}>
				<p className={mutedTextStyle}>
					Connection health only. API URLs and keys are never shown in the UI.
				</p>
			</SettingsField>
			<SettingsField span={3}>
				<span className={mutedTextStyle}>Ty Plus API</span>
				<span
					className={cx(status ? statusTone(status.state) : statusMutedStyle)}
				>
					{checking ? "Checking…" : (status?.label ?? "Not checked")}
				</span>
			</SettingsField>
			<SettingsField span={3}>
				<span className={mutedTextStyle}>Last checked</span>
				<span className={monoBreakStyle}>{status?.checkedAt ?? "—"}</span>
			</SettingsField>
			{status?.errorMessage ? (
				<SettingsField span={6}>
					<span className={mutedTextStyle}>Detail</span>
					<span className={errorTextStyle}>{status.errorMessage}</span>
				</SettingsField>
			) : null}
		</SettingsGrid>
	);
}
