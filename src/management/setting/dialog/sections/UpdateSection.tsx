import { type JSX, useCallback, useEffect, useState } from "react";
import { currentVersion } from "@/management/online/update/current-version";
import {
	checkForUpdate,
	type UpdateCheckResult,
} from "@/management/online/update/feed";
import { useSettings } from "@/management/setting/context";
import {
	SettingsField,
	SettingsGrid,
} from "@/management/setting/dialog/layout/SettingsGrid";
import { openUrlInDefaultBrowser } from "@/management/workspace/hooks/helpers";
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

const statusAttentionStyle = css({
	fontSize: "text-sm",
	fontWeight: "medium",
	color: "status.warning",
});

const statusMutedStyle = css({
	fontSize: "text-sm",
	fontWeight: "medium",
	color: "text.muted",
});

const linkStyle = css({
	fontSize: "text-sm",
	color: "text.link",
	textDecoration: "underline",
	cursor: "pointer",
});

const linkRowStyle = css({
	display: "flex",
	gap: "2",
	alignItems: "center",
});

/**
 * Update status (Issue #7). Reads the static update feed once on mount and
 * reports "update available / up to date / unavailable". Never installs or
 * executes anything — the release-notes link is the only action, and it
 * opens the user's browser.
 */
export function UpdateSection(): JSX.Element {
	const { isLoaded } = useSettings();
	const [result, setResult] = useState<UpdateCheckResult | null>(null);
	const [checking, setChecking] = useState(false);

	const runCheck = useCallback(async () => {
		setChecking(true);
		try {
			setResult(await checkForUpdate({ currentVersion }));
		} finally {
			setChecking(false);
		}
	}, []);

	useEffect(() => {
		if (!isLoaded) {
			return;
		}
		void runCheck();
	}, [isLoaded, runCheck]);

	const label = checking
		? "Checking…"
		: result === null
			? "Not checked"
			: result.status === "update-available"
				? `New version available: ${result.feed.version}`
				: result.status === "up-to-date"
					? "Up to date"
					: "Update check unavailable";

	const tone = checking
		? statusMutedStyle
		: result?.status === "update-available"
			? statusAttentionStyle
			: result?.status === "up-to-date"
				? statusReadyStyle
				: statusMutedStyle;

	return (
		<SettingsGrid>
			<SettingsField span={6}>
				<p className={mutedTextStyle}>
					Checks the official update feed once. Nothing is installed
					automatically; the panel stays fully usable offline.
				</p>
			</SettingsField>
			<SettingsField span={3}>
				<span className={mutedTextStyle}>Update status</span>
				<span className={tone}>{label}</span>
			</SettingsField>
			<SettingsField span={3}>
				<span className={mutedTextStyle}>Detail</span>
				<span className={linkRowStyle}>
					{result?.status === "update-available" ? (
						<button
							type="button"
							className={linkStyle}
							onClick={() =>
								openUrlInDefaultBrowser(result.feed.releaseNotesUrl)
							}
						>
							Release notes and download
						</button>
					) : (
						<span className={mutedTextStyle}>
							{result?.status === "unavailable" ? result.reason : "—"}
						</span>
					)}
				</span>
			</SettingsField>
		</SettingsGrid>
	);
}
