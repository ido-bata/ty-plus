import {
	type JSX,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
	currentReleaseVersion,
	buildReleaseChannel,
} from "@/management/online/update/current-version";
import {
	isReleaseChannel,
	type ReleaseChannel,
} from "@/management/online/update/channel";
import {
	checkForUpdate,
	detectUpdatePlatform,
	OFFICIAL_RELEASES_URL,
	type UpdateCheckResult,
} from "@/management/online/update/feed";
import { useSettings } from "@/management/setting/context";
import {
	SettingsField,
	SettingsFieldLabel,
	SettingsGrid,
} from "@/management/setting/dialog/layout/SettingsGrid";
import { ListSelect } from "@/shared/component/fields/ListSelect";
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

const CHANNELS: ReleaseChannel[] = ["stable", "beta", "insider"];

/**
 * Official GitHub Releases update channel selection (Issue #55).
 * A channel change persists through the existing file-backed settings.
 * Checking never installs or runs code; a user opens the official release
 * page in their browser and installs manually.
 */
export function UpdateSection(): JSX.Element {
	const { t } = useTranslation("settings");
	const { settings, updateSettings, isLoaded } = useSettings();
	const channel = settings.ui.updateChannel ?? buildReleaseChannel;
	const [result, setResult] = useState<UpdateCheckResult | null>(null);
	const [checking, setChecking] = useState(false);
	const latestRequest = useRef(0);

	const runCheck = useCallback(async () => {
		const request = ++latestRequest.current;
		setResult(null);
		setChecking(true);
		const response = await checkForUpdate({
			currentVersion: currentReleaseVersion,
			channel,
			platform: detectUpdatePlatform(),
		});
		if (request === latestRequest.current) {
			setResult(response);
			setChecking(false);
		}
	}, [channel]);

	useEffect(() => {
		if (!isLoaded) return;
		void runCheck();
		return () => {
			latestRequest.current += 1;
		};
	}, [isLoaded, runCheck]);

	const handleChannelChange = useCallback(
		(value: string) => {
			if (!isReleaseChannel(value)) return;
			updateSettings({
				ui: { ...settings.ui, updateChannel: value },
			});
		},
		[settings.ui, updateSettings],
	);

	const label = checking
		? "Checking…"
		: result === null
			? "Not checked"
			: result.status === "update-available"
				? "New version available: " + result.feed.version
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
					Updates come from official GitHub Releases. Nothing is
					installed automatically; local features work offline.
				</p>
			</SettingsField>
			<SettingsField span={3}>
				<SettingsFieldLabel>{t("updates.channel")}</SettingsFieldLabel>
				<ListSelect
					options={CHANNELS.map((value) => ({
						value,
						label: t("updates." + value),
					}))}
					value={channel}
					onChange={handleChannelChange}
					placeholder="Choose a channel"
				/>
			</SettingsField>
			<SettingsField span={3}>
				<SettingsFieldLabel>Installed release</SettingsFieldLabel>
				<span className={mutedTextStyle}>{currentReleaseVersion}</span>
				<button
					type="button"
					className={linkStyle}
					onClick={() => void runCheck()}
					disabled={checking}
				>
					{t("updates.checkNow")}
				</button>
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
				<button
					type="button"
					className={linkStyle}
					onClick={() => openUrlInDefaultBrowser(OFFICIAL_RELEASES_URL)}
				>
					{t("updates.browse")}
				</button>
			</SettingsField>
		</SettingsGrid>
	);
}
