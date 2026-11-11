import { FolderOpen } from "lucide-react";
import { type JSX, useCallback, useEffect, useRef, useState } from "react";
import { useCep } from "@/management/ae/cep/contexts/Context";
import { selectFolder } from "@/management/ae/cep/dialog-shim/bolt";
import { createCepSurfaceTransport } from "@/management/ae/cep/transport";
import { useSettings } from "@/management/setting/context";
import {
	SettingsField,
	SettingsFieldLabel,
	SettingsGrid,
} from "@/management/setting/dialog/layout/SettingsGrid";
import type { Settings } from "@/management/setting/models/settings";
import { resolveInitializationAppRoot } from "@/management/setting/onboarding/initialization";
import { deleteSupportRootRelocationSource } from "@/management/setting/persistence/delete-support-root-source";
import {
	askHostDeleteSourceConfirm,
	askHostPathChangeConfirm,
	askHostSupportRootCopyConfirm,
	showSupportRootChangeCompleteAlert,
	showSupportRootCopyCompleteAlert,
} from "@/management/setting/persistence/paths-change-alerts";
import {
	buildNextPaths,
	isSupportRootRelocation,
	type PathKey,
	pathValuesEqual,
} from "@/management/setting/persistence/paths-change-flow";
import { persistSettingsPaths } from "@/management/setting/persistence/persist-settings-paths";
import { relocateTyPlusSupportData } from "@/management/setting/persistence/relocate-support-root";
import { resolvePersistedSupportBrowseRoot } from "@/management/setting/persistence/resolve-persisted-paths";
import { publishShellMessage } from "@/management/workspace/messaging/publish-shell-message";
import { requestLayoutReload } from "@/management/workspace/onboarding/layout-reload-bridge";
import {
	type LayoutPayload,
	SHELL_CHANNELS,
} from "@/management/workspace/surface/contract";
import { PathField } from "@/shared/component/fields/PathField";
import { isIMEComposing } from "@/shared/util/keyboard";
import { normalizePathLike } from "@/shared/util/path";
import { css } from "@/styled-system/css";

const PATH_KEYS: readonly PathKey[] = [
	"supportRoot",
	"presetRoot",
	"scriptRoot",
	"pluginRoot",
] as const;

const PATH_LABELS: Record<PathKey, string> = {
	supportRoot: "Support Root",
	presetRoot: "Preset Root",
	scriptRoot: "Script Root",
	pluginRoot: "Plugin Root",
};

const errorMessageStyle = css({
	marginBottom: "2",
	fontSize: "shell-text-sm",
	color: "var(--ty-color-danger)",
});

const pathFieldClass = css({
	width: "full",
	minWidth: 0,
});

const requestWorkspaceLayoutReloadAfterSupportRootChange = async (
	win: Window,
	supportRoot: string,
): Promise<void> => {
	const trimmed = supportRoot.trim();
	if (!trimmed) return;
	requestLayoutReload({
		layoutReadSupportRoot: trimmed,
	});
	const payload: LayoutPayload = {
		kind: "reloadWorkspaceLayoutFromStorage",
		sourceSurfaceId: "settings",
		panelIds: ["panel-1", "panel-2", "panel-3", "panel-4", "panel-5"],
		layoutReadSupportRoot: trimmed,
	};
	await publishShellMessage(createCepSurfaceTransport(win), {
		channel: SHELL_CHANNELS.layout,
		kind: "publish",
		sourceSurfaceId: "settings",
		payload,
	});
};

async function resolveLocatorAppRootOrThrow(win: Window): Promise<string> {
	const locatorAppRoot = await resolveInitializationAppRoot(win);
	if (!locatorAppRoot) {
		throw new Error(
			"Ty Plus: cannot resolve the running After Effects install folder for ty-plus-init.json.",
		);
	}
	return locatorAppRoot;
}

async function executePathChange({
	win,
	key,
	normalizedValue,
	previousValue,
	previousPaths,
	relocation,
	locatorAppRoot,
	commitInFlightRef,
	setPathError,
	setDraftPaths,
	setIsApplying,
}: {
	win: Window;
	key: PathKey;
	normalizedValue: string;
	previousValue: string;
	previousPaths: Settings["core"]["paths"];
	relocation: boolean;
	locatorAppRoot: string | null;
	commitInFlightRef: { current: boolean };
	setPathError: (error: string | null) => void;
	setDraftPaths: (paths: Settings["core"]["paths"]) => void;
	setIsApplying: (applying: boolean) => void;
}): Promise<boolean> {
	if (commitInFlightRef.current) return false;
	commitInFlightRef.current = true;
	setPathError(null);
	setIsApplying(true);
	try {
		const changeConfirm = await askHostPathChangeConfirm(
			win,
			PATH_LABELS[key],
			previousValue,
			normalizedValue,
			relocation,
		);
		if (changeConfirm !== "yes") {
			setDraftPaths(previousPaths);
			return false;
		}

		if (relocation) {
			const prevSupport =
				previousPaths.supportRoot.trim() ||
				(await resolvePersistedSupportBrowseRoot(win))?.trim() ||
				"";

			const copyConfirm = await askHostSupportRootCopyConfirm(win);
			if (copyConfirm === "cancel") {
				setDraftPaths(previousPaths);
				return false;
			}

			if (copyConfirm === "yes") {
				await relocateTyPlusSupportData(win, {
					fromSupportRoot: prevSupport,
					toSupportRoot: normalizedValue,
				});
				await showSupportRootCopyCompleteAlert(win);

				const shouldDeleteSource =
					(await askHostDeleteSourceConfirm(win, prevSupport)) === "yes";
				if (shouldDeleteSource) {
					await deleteSupportRootRelocationSource(win, prevSupport);
				}
			}
		}

		await persistSettingsPaths(
			win,
			buildNextPaths(previousPaths, key, normalizedValue),
			{
				previousPaths,
				updateSupportRootLocator: relocation,
				locatorAppRoot,
			},
		);
		return true;
	} catch (error) {
		console.error("[PathsSection] Failed to apply path change:", error);
		const detail =
			error instanceof Error && error.message.trim()
				? error.message.trim()
				: "Failed to save paths.";
		setPathError(detail);
		setDraftPaths(previousPaths);
		return false;
	} finally {
		commitInFlightRef.current = false;
		setIsApplying(false);
	}
}

export function PathsSection(): JSX.Element {
	const { settings, updateSettings, refreshPathsFromDisk, isLoaded } =
		useSettings();
	const { isCep } = useCep();
	const [draftPaths, setDraftPaths] = useState(settings.core.paths);
	const [pathError, setPathError] = useState<string | null>(null);
	const [isApplying, setIsApplying] = useState(false);
	const commitInFlightRef = useRef(false);

	useEffect(() => {
		setDraftPaths(settings.core.paths);
	}, [settings.core.paths]);

	useEffect(() => {
		if (!isLoaded) {
			return;
		}
		void refreshPathsFromDisk();
	}, [isLoaded, refreshPathsFromDisk]);

	const commitPathChange = useCallback(
		async (key: PathKey, rawValue: string) => {
			const nextValue = normalizePathLike(rawValue);
			const previousValue = settings.core.paths[key] ?? "";
			if (pathValuesEqual(previousValue, nextValue)) {
				setDraftPaths(settings.core.paths);
				return;
			}

			const nextPaths = buildNextPaths(settings.core.paths, key, nextValue);
			const relocation = isSupportRootRelocation(
				settings.core.paths,
				nextPaths,
			);

			let locatorAppRoot: string | null = null;
			if (key === "supportRoot") {
				locatorAppRoot = await resolveLocatorAppRootOrThrow(window);
			}

			const success = await executePathChange({
				win: window,
				key,
				normalizedValue: nextValue,
				previousValue,
				previousPaths: settings.core.paths,
				relocation,
				locatorAppRoot,
				commitInFlightRef,
				setPathError,
				setDraftPaths,
				setIsApplying,
			});

			if (!success) return;

			updateSettings(
				{
					core: {
						...settings.core,
						paths: nextPaths,
					},
				},
				{ skipPathPersist: true },
			);
			setDraftPaths(nextPaths);

			if (relocation) {
				await requestWorkspaceLayoutReloadAfterSupportRootChange(
					window,
					nextPaths.supportRoot,
				);
				await showSupportRootChangeCompleteAlert(
					window,
					nextPaths.supportRoot.trim(),
				);
			}
		},
		[settings.core, updateSettings],
	);

	const handleDraftChange = useCallback((key: PathKey, value: string) => {
		setDraftPaths((current) => ({
			...current,
			[key]: value,
		}));
	}, []);

	const handleDraftCommit = useCallback(
		(key: PathKey) => {
			if (isApplying || commitInFlightRef.current) {
				return;
			}
			void commitPathChange(key, draftPaths[key] ?? "");
		},
		[commitPathChange, draftPaths, isApplying],
	);

	const browseFor = useCallback(
		(key: PathKey, title: string) => {
			if (!isCep || isApplying || commitInFlightRef.current) {
				return;
			}
			const current =
				draftPaths[key] ?? draftPaths.supportRoot ?? settings.core.paths[key];
			selectFolder(current || "", title, (picked) => {
				if (commitInFlightRef.current) {
					return;
				}
				const normalized = normalizePathLike(picked);
				if (pathValuesEqual(settings.core.paths[key], normalized)) {
					setDraftPaths(settings.core.paths);
					return;
				}
				void commitPathChange(key, normalized);
			});
		},
		[commitPathChange, draftPaths, isApplying, isCep, settings.core.paths],
	);

	return (
		<>
			{pathError ? <p className={errorMessageStyle}>{pathError}</p> : null}
			<SettingsGrid>
				{PATH_KEYS.map((key) => {
					const value = draftPaths[key] ?? "";
					const required = key === "supportRoot";
					return (
						<SettingsField key={key} span={6}>
							<SettingsFieldLabel>{PATH_LABELS[key]}</SettingsFieldLabel>
							<PathField
								value={value}
								onChange={(next) => handleDraftChange(key, next)}
								inputProps={{
									onBlur: () => handleDraftCommit(key),
									onKeyDown: (event) => {
										if (isIMEComposing(event)) return;
										if (event.key === "Enter") {
											event.currentTarget.blur();
										}
									},
								}}
								placeholder={required ? undefined : "Optional"}
								browseAriaLabel={`Browse ${PATH_LABELS[key]}`}
								browseSlot={
									<FolderOpen size={16} strokeWidth={2} aria-hidden />
								}
								onBrowse={
									isCep ? () => browseFor(key, PATH_LABELS[key]) : undefined
								}
								disabled={isApplying}
								uiSize="sm"
								className={pathFieldClass}
							/>
						</SettingsField>
					);
				})}
			</SettingsGrid>
		</>
	);
}
