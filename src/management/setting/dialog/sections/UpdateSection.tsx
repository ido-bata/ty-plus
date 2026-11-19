import { type JSX, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { OperationWorkerAttemptError } from "@/management/ipc/operation-worker-runner";
import {
	isReleaseChannel,
	type ReleaseChannel,
} from "@/management/online/update/channel";
import {
	buildReleaseChannel,
	currentReleaseVersion,
} from "@/management/online/update/current-version";
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
import { openUrlInDefaultBrowser } from "@/management/workspace/hooks/helpers";
import { getUpdateInstaller } from "@/management/workspace/services";
import { ListSelect } from "@/shared/component/fields/ListSelect";
import { css } from "@/styled-system/css";
import { installableZipAsset, installFailureKey } from "./update-install";

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

type InstallState =
	| { kind: "idle" }
	| { kind: "installing" }
	| { kind: "done"; status: "installed" | "pending" | "manual_required" }
	| { kind: "failed"; code?: string };

/**
 * Official GitHub Releases update channel selection (Issue #55).
 * A channel change persists through the existing file-backed settings.
 * Checking never installs or runs code; install goes through the
 * `update.install` worker operation after the user confirms.
 */
export function UpdateSection(): JSX.Element {
	const { t } = useTranslation("settings");
	const { settings, updateSettings, isLoaded } = useSettings();
	const channel = settings.ui.updateChannel ?? buildReleaseChannel;
	const [result, setResult] = useState<UpdateCheckResult | null>(null);
	const [checking, setChecking] = useState(false);
	const [installState, setInstallState] = useState<InstallState>({
		kind: "idle",
	});
	const latestRequest = useRef(0);

	const runCheck = useCallback(async () => {
		const request = ++latestRequest.current;
		setResult(null);
		setInstallState({ kind: "idle" });
		setChecking(true);
		try {
			const response = await checkForUpdate({
				currentVersion: currentReleaseVersion,
				channel,
				platform: detectUpdatePlatform(),
			});
			if (request === latestRequest.current) setResult(response);
		} catch {
			// `checkForUpdate` is documented not to throw, but a stuck
			// "Checking…" state with a permanently disabled button is worse
			// than reporting an unavailable check, so never depend on it.
			if (request === latestRequest.current) {
				setResult({ status: "unavailable", reason: "update check failed" });
			}
		} finally {
			if (request === latestRequest.current) setChecking(false);
		}
	}, [channel]);

	useEffect(() => {
		if (!isLoaded) return;
		void runCheck();
		return () => {
			latestRequest.current += 1;
		};
	}, [isLoaded, runCheck]);

	const runInstall = useCallback(async () => {
		if (result?.status !== "update-available") return;
		const installer = getUpdateInstaller();
		const platform = detectUpdatePlatform();
		const asset = installableZipAsset(result.feed, platform);
		if (installer === null || asset === null) {
			setInstallState({ kind: "done", status: "manual_required" });
			return;
		}
		setInstallState({ kind: "installing" });
		try {
			const installed = await installer.installUpdate({
				release_version: result.feed.version,
				tag: `v${result.feed.version}`,
				asset: {
					url: asset.url,
					file_name: asset.fileName,
					sha256: asset.sha256,
				},
			});
			setInstallState({
				kind: "done",
				status:
					installed.status === "installed" ||
					installed.status === "pending" ||
					installed.status === "manual_required"
						? installed.status
						: "manual_required",
			});
		} catch (error) {
			setInstallState({
				kind: "failed",
				code:
					error instanceof OperationWorkerAttemptError ? error.code : undefined,
			});
		}
	}, [result]);

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
		? t("updates.checking")
		: result === null
			? t("updates.notChecked")
			: result.status === "update-available"
				? t("updates.available", { version: result.feed.version })
				: result.status === "up-to-date"
					? t("updates.upToDate")
					: t("updates.unavailable");

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
				<p className={mutedTextStyle}>{t("updates.description")}</p>
			</SettingsField>
			<SettingsField span={3}>
				<SettingsFieldLabel>{t("updates.channel")}</SettingsFieldLabel>
				<ListSelect
					options={CHANNELS.map((value) => ({
						value,
						label: t(`updates.${value}`),
					}))}
					value={channel}
					onChange={handleChannelChange}
					placeholder={t("updates.channelPlaceholder")}
				/>
			</SettingsField>
			<SettingsField span={3}>
				<SettingsFieldLabel>{t("updates.installed")}</SettingsFieldLabel>
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
				<span className={mutedTextStyle}>{t("updates.status")}</span>
				<span className={tone}>{label}</span>
			</SettingsField>
			<SettingsField span={3}>
				<span className={mutedTextStyle}>{t("updates.detail")}</span>
				<span className={linkRowStyle}>
					{result?.status === "update-available" ? (
						<>
							<button
								type="button"
								className={linkStyle}
								onClick={() =>
									openUrlInDefaultBrowser(result.feed.releaseNotesUrl)
								}
							>
								{t("updates.releaseNotes")}
							</button>
							{installState.kind !== "done" ||
							installState.status === "manual_required" ? (
								<button
									type="button"
									className={linkStyle}
									onClick={() => void runInstall()}
									disabled={installState.kind === "installing"}
								>
									{installState.kind === "installing"
										? t("updates.installing")
										: t("updates.install")}
								</button>
							) : null}
						</>
					) : (
						<span className={mutedTextStyle}>
							{result?.status === "unavailable" ? result.reason : "—"}
						</span>
					)}
				</span>
				{installState.kind === "done" || installState.kind === "failed" ? (
					<span
						className={
							installState.kind === "failed"
								? statusAttentionStyle
								: statusReadyStyle
						}
					>
						{installState.kind === "failed"
							? t(`updates.${installFailureKey(installState.code)}`)
							: installState.status === "installed"
								? t("updates.installDone")
								: installState.status === "pending"
									? t("updates.installPending")
									: t("updates.installManual")}
					</span>
				) : null}
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
