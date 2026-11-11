import {
	AlertCircle,
	FolderOpen,
	LoaderCircle,
	Maximize2,
	Minimize2,
} from "lucide-react";
import {
	type JSX,
	type Dispatch as ReactDispatch,
	type SetStateAction as ReactSetStateAction,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import { STEP_EXTENSIONS } from "@/function/onboarding/file-extensions-data";
import {
	type FilePickStep,
	STEP_SEQUENCE,
	type StepId,
} from "@/function/onboarding/steps-data";
import { Animation } from "@/function/onboarding/ui/Animation";
import { useFileBrowser } from "@/function/onboarding/useFileBrowser";
import { useMenu } from "@/function/onboarding/useMenu";
import {
	deriveSubfolders,
	isPathAeAppFolder,
	normalizePathLike,
	type Paths,
	resolveCurrentFolderPath,
} from "@/function/onboarding/usePaths";
import type { WidgetType } from "@/function/widget";
import { useCep } from "@/management/ae/cep/contexts/Context";
import { selectFolder } from "@/management/ae/cep/dialog-shim/bolt";
import { createCepSurfaceTransport } from "@/management/ae/cep/transport";
import { useAfterEffectsFilesGateway } from "@/management/ae/files/gateway-context";
import { BUNDLED_LOCALE_NAMES } from "@/management/i18n/bundled-resources";
import { useI18n } from "@/management/i18n/Context";
import {
	SUPPORTED_LOCALES,
	type SupportedLocale,
} from "@/management/i18n/config";
import { saveCepShellLocale } from "@/management/i18n/locale-storage";
import {
	importOnboardingPresets,
	type OnboardingImportOptions,
} from "@/management/preset/onboarding-service";
import { createCatalogRootPinnedPresetRepository } from "@/management/preset/repository/catalog-root-pinned";
import { completeOnboardingStorage } from "@/management/setting/onboarding/complete";
import {
	OnboardingFinishError,
	type OnboardingFinishNextAction,
} from "@/management/setting/onboarding/finish-error";
import {
	writeSettingsForFinish,
	writeSettingsPathsJsonForFinish,
} from "@/management/setting/onboarding/finish-settings-write";
import {
	completeInitialization,
	isInitializationComplete,
	mergeOnboardingSettings,
	readInitializationState,
	readSupportRootFromSettingsJson,
	resolveInitializationAppRoot,
} from "@/management/setting/onboarding/initialization";
import { readSettings } from "@/management/storage";
import { triggerCandidatesRebuild } from "@/management/storage/candidates-cache/runtime";
import {
	canUseCepNodeFileBrowser,
	createCepNodeFileBrowserService,
} from "@/management/storage/file-browser-service";
import {
	createScopedDirectoryService,
	readScopedDirectory,
	resolveScopedParentDirectory,
} from "@/management/storage/read/scoped-directory";
import { DirectoryBrowser } from "@/management/storage/ui/DirectoryBrowser";
import type { WidgetRecord } from "@/management/widget/record/types";
import type { Layout } from "@/management/workspace/layout/grid-document";
import { publishShellMessage } from "@/management/workspace/messaging/publish-shell-message";
import { logWorkspace } from "@/management/workspace/onboarding/flow-log";
import { buildOnboardingLayoutItems } from "@/management/workspace/placement/gateway";
import { getDataServices } from "@/management/workspace/services";
import { createInitialSurfaceState } from "@/management/workspace/state";
import { SHELL_CHANNELS } from "@/management/workspace/surface/contract";
import {
	layoutsFromSurface,
	widgetResolutionFromCatalogContext,
} from "@/management/workspace/surface/tiles";
import { Button } from "@/shared";
import { IconButton, ListSelect, PathField } from "@/shared/component/index";
import { isIMEComposing } from "@/shared/util/keyboard";
import { css } from "@/styled-system/css";

const errorBannerClass = css({
	display: "flex",
	alignItems: "center",
	gap: "1.5",
	borderRadius: "shell-sm",
	padding: "4",
	fontSize: "sm",
	backgroundColor:
		"color-mix(in srgb, var(--color-ty-status-error), 15%, var(--color-ty-bg-surface))",
	color: "text.primary",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor:
		"color-mix(in srgb, var(--color-ty-status-error), 55%, transparent)",
});

const errorIconClass = css({
	flexShrink: 0,
	color:
		"color-mix(in srgb, var(--color-ty-status-error), 85%, var(--color-text-primary))",
});

const errorTextClass = css({
	color: "text.primary",
});

const finishErrorPanelClass = css({
	display: "flex",
	flexDirection: "column",
	gap: "2",
	borderRadius: "shell-sm",
	padding: "4",
	fontSize: "sm",
	backgroundColor:
		"color-mix(in srgb, var(--color-ty-status-error), 15%, var(--color-ty-bg-surface))",
	color: "text.primary",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor:
		"color-mix(in srgb, var(--color-ty-status-error), 55%, transparent)",
});

const finishErrorHeaderClass = css({
	display: "flex",
	alignItems: "center",
	gap: "1.5",
	fontWeight: "semibold",
});

const finishErrorListClass = css({
	display: "flex",
	flexDirection: "column",
	gap: "1.5",
	fontSize: "xs",
});

const finishErrorItemClass = css({
	display: "flex",
	flexDirection: "column",
	gap: "0.5",
});

const finishErrorLabelClass = css({
	textTransform: "uppercase",
	letterSpacing: "0.04em",
	color: "text.muted",
});

const finishErrorMonoClass = css({
	fontFamily: "mono",
	overflowWrap: "break-all",
});

const finishErrorActionsClass = css({
	display: "flex",
	justifyContent: "flex-end",
	paddingTop: "1",
});

const stepNavClass = css({
	display: "grid",
	gridTemplateColumns: "1fr 1fr",
	alignItems: "center",
	gap: "2",
	paddingBlock: "3",
	paddingInline: "5",
	borderTopWidth: "1px",
	borderTopStyle: "solid",
	borderTopColor: "border.default",
});

const stepBodyClass = css({
	display: "flex",
	flexDirection: "column",
	gap: "3",
	flex: "1",
	minHeight: 0,
});

const stepBodyTextClass = css({
	fontSize: "sm",
	color: "text.muted",
	whiteSpace: "pre-line",
});

const animationSlotClass = css({
	width: "full",
	height: "28",
});

const supportHintClass = css({
	fontSize: "xs",
	color: "text.muted",
	backgroundColor: "surface.widget",
	borderRadius: "sm",
	paddingInline: "2",
	paddingBlock: "1",
});

const supportBrowseClass = css({
	display: "flex",
	flexDirection: "column",
	gap: "1",
	width: "full",
	minWidth: "full",
});

const supportPathFieldClass = css({
	width: "full",
});

const subfoldersStepClass = css({
	display: "flex",
	flexDirection: "column",
	gap: "1",
	width: "full",
});

const subfoldersLabelClass = css({
	fontSize: "text-xs",
	letterSpacing: "0.04em",
	textTransform: "uppercase",
	color: "text.muted",
});

const shellFullscreenClass = css({
	position: "fixed",
	inset: 0,
	zIndex: 2147483647,
	display: "flex",
	alignItems: "stretch",
	justifyContent: "stretch",
});

const shellModalClass = css({
	position: "fixed",
	inset: 0,
	zIndex: 2147483647,
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	backgroundColor: "black/40",
});

const dialogFullscreenClass = css({
	pointerEvents: "auto",
	width: "screen",
	height: "screen",
	display: "flex",
	flexDirection: "column",
	overflow: "hidden",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.dialog",
});

const dialogModalClass = css({
	pointerEvents: "auto",
	width: "full",
	maxWidth: "sm",
	height: "full",
	maxHeight: "420px",
	display: "flex",
	flexDirection: "column",
	overflow: "hidden",
	borderRadius: "shell-lg",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.dialog",
});

const dialogHeaderClass = css({
	paddingInline: "5",
	paddingBlock: "3",
	paddingBottom: 0,
	display: "flex",
	alignItems: "center",
	justifyContent: "space-between",
});

const dialogTitleClass = css({
	margin: 0,
	fontSize: "shell",
	fontWeight: "semibold",
	letterSpacing: "wide",
	color: "text.primary",
	lineHeight: "1.3",
});

const dialogHeaderRightClass = css({
	display: "flex",
	alignItems: "center",
	gap: "2",
});

const dialogProgressClass = css({
	fontSize: "text-xs",
	color: "text.muted",
	whiteSpace: "nowrap",
	fontVariantNumeric: "tabular-nums",
});

const dialogBodyClass = css({
	flex: "1",
	minHeight: 0,
	display: "flex",
	flexDirection: "column",
	gap: "3",
	paddingBlock: "3",
	paddingInline: "5",
	overflowY: "auto",
});

const fileStepBodyClass = css({
	display: "flex",
	flexDirection: "column",
	gap: "3",
	flex: "1",
	minHeight: 0,
});

function ErrorBanner({ error }: { error: string | null }): JSX.Element | null {
	if (!error) return null;
	return (
		<div className={errorBannerClass}>
			<AlertCircle size={14} className={errorIconClass} aria-hidden />
			<span className={errorTextClass}>{error}</span>
		</div>
	);
}

/**
 * Structured error UI for the finish-phase failure surfaced by
 * `OnboardingFinishError`. Renders the path, reason, and next action
 * with localization keys, plus a Retry button when UAC elevation is
 * available on the host.
 */
function FinishErrorPanel({
	finishError,
	onRetryWithElevation,
}: {
	finishError: OnboardingFinishError | null;
	onRetryWithElevation: () => void;
}): JSX.Element | null {
	const { t } = useTranslation("onboarding");
	if (!finishError) return null;

	const nextActionKey = nextActionI18nKey(finishError.nextAction);
	const nextActionText = t(nextActionKey);

	return (
		<div
			className={finishErrorPanelClass}
			data-testid="onboarding-finish-error"
		>
			<div className={finishErrorHeaderClass}>
				<AlertCircle size={14} aria-hidden />
				<span>{t("errors.finishErrorTitle")}</span>
			</div>
			<dl className={finishErrorListClass}>
				<div className={finishErrorItemClass}>
					<dt className={finishErrorLabelClass}>
						{t("errors.finishErrorPathLabel")}
					</dt>
					<dd
						className={finishErrorMonoClass}
						data-testid="onboarding-finish-error-path"
					>
						{finishError.path}
					</dd>
				</div>
				<div className={finishErrorItemClass}>
					<dt className={finishErrorLabelClass}>
						{t("errors.finishErrorReasonLabel")}
					</dt>
					<dd data-testid="onboarding-finish-error-reason">
						{finishError.reasonDetail}
					</dd>
				</div>
				<div className={finishErrorItemClass}>
					<dt className={finishErrorLabelClass}>
						{t("errors.finishErrorNextActionLabel")}
					</dt>
					<dd data-testid="onboarding-finish-error-next-action">
						{nextActionText}
					</dd>
				</div>
			</dl>
			{finishError.canAttemptElevation ? (
				<div className={finishErrorActionsClass}>
					<Button
						type="button"
						variant="primary"
						uiSize="sm"
						onClick={onRetryWithElevation}
						data-testid="onboarding-finish-retry-elevation"
					>
						{t("errors.finishErrorRetryWithElevation")}
					</Button>
				</div>
			) : null}
		</div>
	);
}

function nextActionI18nKey(nextAction: OnboardingFinishNextAction): string {
	switch (nextAction) {
		case "retry_with_elevation":
			return "errors.finishErrorNextActionRetry";
		case "adjust_support_root":
			return "errors.finishErrorNextActionAdjust";
		default:
			return "errors.finishErrorNextActionChooseTrusted";
	}
}

function StepNavigation({
	activeStep,
	stepIndex,
	stepValidationError,
	saving,
	onBack,
	onNext,
	onFinish,
}: {
	activeStep: string;
	stepIndex: number;
	stepValidationError: string | null;
	saving: boolean;
	onBack: () => void;
	onNext: () => void;
	onFinish: () => void;
}): JSX.Element {
	const { t } = useTranslation("onboarding");
	return (
		<div className={stepNavClass}>
			<Button
				type="button"
				variant="ghost"
				uiSize="sm"
				disabled={stepIndex === 0 || (saving && activeStep === "finish")}
				onClick={onBack}
			>
				{t("actions.back")}
			</Button>
			<Button
				type="button"
				variant="primary"
				uiSize="sm"
				start={
					saving && activeStep === "finish" ? (
						<LoaderCircle className={css({ animation: "spin" })} />
					) : undefined
				}
				aria-busy={saving && activeStep === "finish"}
				disabled={
					(saving && activeStep === "finish") ||
					(activeStep !== "finish" && stepValidationError !== null)
				}
				onClick={activeStep === "finish" ? onFinish : onNext}
			>
				{activeStep === "finish" ? t("actions.finish") : t("actions.next")}
			</Button>
		</div>
	);
}

function rootPathForStep(kind: FilePickStep, paths: Paths): string {
	if (kind === "presets") return paths.presetRoot;
	if (kind === "scripts") return paths.scriptRoot;
	return paths.pluginRoot;
}

function goUpScopedDir(
	kind: FilePickStep,
	currentDir: Record<FilePickStep, string>,
	paths: Paths,
): string | null {
	if (!canUseCepNodeFileBrowser(window)) {
		return null;
	}
	const service = createScopedDirectoryService(window);
	return resolveScopedParentDirectory(
		service,
		rootPathForStep(kind, paths),
		resolveCurrentFolderPath(kind, currentDir, paths),
	);
}

type ExtractedPaths = {
	presetRoot: string;
	scriptRoot: string;
	pluginRoot: string;
};

function IntroStep({ body }: { body: string }): JSX.Element {
	return (
		<div className={stepBodyClass}>
			<p className={stepBodyTextClass}>{body}</p>
			<div className={animationSlotClass}>
				<Animation variant="intro" />
			</div>
		</div>
	);
}

function LanguageStep({
	body,
	title,
}: {
	body: string;
	title: string;
}): JSX.Element {
	const { locale, setLocale } = useI18n();
	return (
		<div className={stepBodyClass}>
			<p className={stepBodyTextClass}>{body}</p>
			<div className={css({ width: "full" })}>
				<ListSelect
					value={locale}
					uiSize="sm"
					aria-label={title}
					onChange={(next) => void setLocale(next as SupportedLocale)}
					options={SUPPORTED_LOCALES.map((code) => ({
						value: code,
						label: BUNDLED_LOCALE_NAMES[locale]?.[code] ?? code,
					}))}
				/>
			</div>
		</div>
	);
}

function SupportStepBody({
	body,
	supportPath,
	isAeAppFolder,
	onSupportPathChange,
	onPathFinalize,
}: {
	body: string;
	supportPath: string;
	isAeAppFolder: boolean;
	onSupportPathChange: (next: string) => void;
	onPathFinalize: (path: string) => void;
}): JSX.Element {
	const { t } = useTranslation("onboarding");
	return (
		<div className={stepBodyClass}>
			<p className={stepBodyTextClass}>{body}</p>
			{isAeAppFolder ? (
				<p className={supportHintClass}>
					AE app folder detected — subfolders step will be skipped.
				</p>
			) : null}
			<div
				className={supportBrowseClass}
				data-testid="onboarding-support-browse"
			>
				<PathField
					value={supportPath}
					onChange={onSupportPathChange}
					placeholder={t("fields.supportPlaceholder")}
					browseAriaLabel={t("browseAriaLabel")}
					browseSlot={<FolderOpen size={16} strokeWidth={2} aria-hidden />}
					onBrowse={() => {
						void (async () => {
							const browseDir =
								supportPath ||
								(await resolveInitializationAppRoot(window)) ||
								"";
							selectFolder(
								browseDir,
								t("step.support.title"),
								(selectedPath) => {
									onPathFinalize(selectedPath);
								},
							);
							if (!browseDir) {
								const resolved = await resolveInitializationAppRoot(window);
								if (resolved) {
									onPathFinalize(resolved);
								}
							}
						})();
					}}
					inputProps={{
						onKeyDown: (e) => {
							if (isIMEComposing(e)) return;
							if (e.key === "Enter" && supportPath) {
								onPathFinalize(supportPath);
							}
						},
					}}
					size="sm"
					className={supportPathFieldClass}
				/>
			</div>
		</div>
	);
}

const SUBFOLDER_KEYS = ["presetRoot", "scriptRoot", "pluginRoot"] as const;

function SubfoldersStep({
	body,
	paths,
	supportPath,
	onPathsChange,
}: {
	body: string;
	paths: Paths;
	supportPath: string;
	onPathsChange: (next: Paths) => void;
}): JSX.Element {
	const { t } = useTranslation("onboarding");
	return (
		<div className={stepBodyClass}>
			<p className={stepBodyTextClass}>{body}</p>
			{SUBFOLDER_KEYS.map((key) => (
				<div key={key} className={subfoldersStepClass}>
					<div className={subfoldersLabelClass}>{t(`fields.${key}`)}</div>
					<PathField
						value={paths[key]}
						browseAriaLabel={t("browseAriaLabel")}
						browseSlot={<FolderOpen size={16} strokeWidth={2} aria-hidden />}
						onChange={(value) => onPathsChange({ ...paths, [key]: value })}
						onBrowse={() => {
							const browseDir = paths[key] || supportPath || "";
							selectFolder(browseDir, t(`fields.${key}`), (selectedPath) => {
								const normalized = normalizePathLike(selectedPath);
								onPathsChange({ ...paths, [key]: normalized });
							});
						}}
						size="sm"
						className={supportPathFieldClass}
					/>
				</div>
			))}
		</div>
	);
}

function WorkspaceStep({ body }: { body: string }): JSX.Element {
	return (
		<div className={stepBodyClass}>
			<p className={stepBodyTextClass}>{body}</p>
			<div className={animationSlotClass}>
				<Animation variant="workspace" />
			</div>
		</div>
	);
}

function AddingPresetsStep({ body }: { body: string }): JSX.Element {
	return (
		<div className={stepBodyClass}>
			<p className={stepBodyTextClass}>{body}</p>
		</div>
	);
}

function FinishStep({ body }: { body: string }): JSX.Element {
	return (
		<div className={stepBodyClass}>
			<p className={stepBodyTextClass}>{body}</p>
			<div className={animationSlotClass}>
				<Animation variant="intro" />
			</div>
		</div>
	);
}

function FileStepBrowser({
	kind,
	paths,
	currentDir,
	folderEntries,
	loadingFiles,
	selectedFiles,
	selectedFolders,
	setCurrentDir,
	setSelectedFiles,
	setSelectedFolders,
	t,
}: {
	kind: FilePickStep;
	paths: Paths;
	currentDir: Record<FilePickStep, string>;
	folderEntries: readonly {
		name: string;
		path: string;
		isDirectory: boolean;
	}[];
	loadingFiles: boolean;
	selectedFiles: Record<FilePickStep, Set<string>>;
	selectedFolders: Record<FilePickStep, Set<string>>;
	setCurrentDir: ReactDispatch<
		ReactSetStateAction<Record<FilePickStep, string>>
	>;
	setSelectedFiles: ReactDispatch<
		ReactSetStateAction<Record<FilePickStep, Set<string>>>
	>;
	setSelectedFolders: ReactDispatch<
		ReactSetStateAction<Record<FilePickStep, Set<string>>>
	>;
	t: (key: string) => string;
}): JSX.Element {
	const rootPath = rootPathForStep(kind, paths);
	const activeDir = resolveCurrentFolderPath(kind, currentDir, paths);
	const [viewMode, setViewMode] = useState<"list" | "icons">("list");
	const canGoUpFromCurrent =
		canUseCepNodeFileBrowser(window) &&
		(() => {
			try {
				const service = createScopedDirectoryService(window);
				return (
					resolveScopedParentDirectory(service, rootPath, activeDir) !== null
				);
			} catch {
				return false;
			}
		})();
	return (
		<div className={fileStepBodyClass}>
			<p className={stepBodyTextClass}>{t(`step.${kind}.body`)}</p>
			<DirectoryBrowser
				entries={[...folderEntries]}
				fileNameFilter={STEP_EXTENSIONS[kind]}
				loading={loadingFiles}
				canGoUp={canGoUpFromCurrent}
				onGoUp={() => {
					const parent = goUpScopedDir(kind, currentDir, paths);
					if (!parent) {
						return;
					}
					setCurrentDir((prev) => ({ ...prev, [kind]: parent }));
				}}
				onEntryClick={(entry) => {
					if (entry.isDirectory) {
						setCurrentDir((prev) => ({ ...prev, [kind]: entry.path }));
					}
				}}
				onEntryActivate={(entry) => {
					if (entry.isDirectory) {
						setCurrentDir((prev) => ({ ...prev, [kind]: entry.path }));
					}
				}}
				isSelected={(entryPath) =>
					selectedFiles[kind].has(entryPath) ||
					selectedFolders[kind].has(entryPath)
				}
				onToggleSelected={(entryPath, selectedKind) => {
					if (selectedKind === "folder") {
						setSelectedFolders((prev) => {
							const next = new Set(prev[kind]);
							if (next.has(entryPath)) next.delete(entryPath);
							else next.add(entryPath);
							return { ...prev, [kind]: next };
						});
						return;
					}
					setSelectedFiles((prev) => {
						const next = new Set(prev[kind]);
						if (next.has(entryPath)) next.delete(entryPath);
						else next.add(entryPath);
						return { ...prev, [kind]: next };
					});
				}}
				selectionMode="both"
				selectedSummary={{
					files: selectedFiles[kind].size,
					folders: selectedFolders[kind].size,
				}}
				viewMode={viewMode}
				onViewModeChange={setViewMode}
				scale={1}
				aspect="square"
				loadingLabel="Loading..."
				emptyLabel={t("empty")}
				upLabel={t("goUp")}
			/>
		</div>
	);
}

const runFinishPhase = async <T,>(
	phase: string,
	task: () => Promise<T> | T,
): Promise<T> => {
	try {
		return await task();
	} catch (error) {
		// `OnboardingFinishError` already self-prefixes its `.message` with the
		// `[onboarding finish:${phase}]` marker (see `finish-error.ts`). Re-wrapping
		// here would produce two prefixes back-to-back, so we rethrow unchanged.
		if (error instanceof OnboardingFinishError) {
			throw error;
		}
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`[onboarding finish:${phase}] ${message}`);
	}
};

const extractPathsFromSettingsJson = (
	settingsJson: string,
): ExtractedPaths | null => {
	try {
		const payload = JSON.parse(settingsJson) as {
			core?: { paths?: Record<string, unknown> };
			workspace?: {
				onboardingPaths?: {
					presetRoot?: string;
					scriptRoot?: string;
					pluginRoot?: string;
				};
			};
		};
		let presetRoot = "";
		let scriptRoot = "";
		let pluginRoot = "";
		const corePaths = payload.core?.paths;
		if (corePaths && typeof corePaths === "object") {
			presetRoot =
				typeof corePaths.presetRoot === "string" ? corePaths.presetRoot : "";
			scriptRoot =
				typeof corePaths.scriptRoot === "string" ? corePaths.scriptRoot : "";
			pluginRoot =
				typeof corePaths.pluginRoot === "string" ? corePaths.pluginRoot : "";
		}
		if (!presetRoot && !scriptRoot && !pluginRoot) {
			const legacy = payload.workspace?.onboardingPaths;
			if (legacy && typeof legacy === "object") {
				presetRoot =
					typeof legacy.presetRoot === "string" ? legacy.presetRoot : "";
				scriptRoot =
					typeof legacy.scriptRoot === "string" ? legacy.scriptRoot : "";
				pluginRoot =
					typeof legacy.pluginRoot === "string" ? legacy.pluginRoot : "";
			}
		}
		if (!presetRoot && !scriptRoot && !pluginRoot) {
			return null;
		}
		return { presetRoot, scriptRoot, pluginRoot };
	} catch {
		return null;
	}
};

type OnboardingSettings = {
	supportPath: string;
	paths: Paths;
	isAeAppFolder: boolean;
	setSupportPath: (next: string) => void;
	setPaths: (next: Paths) => void;
	handleSupportPathFinalize: (path: string) => void;
};

// Owns the support path, derived subfolders, and "is this the AE app folder"
// detection. On mount it loads persisted settings + init state; whenever
// `supportPath` changes it re-derives the subfolders and re-checks app-folder.
function useOnboardingSettings(activeStep: StepId): OnboardingSettings {
	const [supportPath, setSupportPath] = useState("");
	const [paths, setPaths] = useState(() => deriveSubfolders(""));
	const [isAeAppFolder, setIsAeAppFolder] = useState(false);

	useEffect(() => {
		let active = true;
		const load = async () => {
			const detectedAppRoot = await resolveInitializationAppRoot(window);
			const initState = detectedAppRoot
				? await readInitializationState(window, detectedAppRoot)
				: null;
			if (!active) {
				return;
			}
			const settingsJson = await readSettings(window);
			const { completed } = isInitializationComplete(initState);
			let settingsPresetRoot = "";
			let settingsScriptRoot = "";
			let settingsPluginRoot = "";
			if (completed && settingsJson) {
				const extracted = extractPathsFromSettingsJson(settingsJson);
				if (extracted) {
					settingsPresetRoot = extracted.presetRoot;
					settingsScriptRoot = extracted.scriptRoot;
					settingsPluginRoot = extracted.pluginRoot;
				}
			}
			const fromLocator = initState?.supportRoot?.trim()
				? normalizePathLike(initState.supportRoot)
				: "";
			const fromSettings = settingsJson
				? (readSupportRootFromSettingsJson(settingsJson)?.trim() ?? "")
				: "";
			const fromAppRoot = detectedAppRoot
				? normalizePathLike(detectedAppRoot)
				: "";
			const support =
				fromLocator ||
				(fromSettings ? normalizePathLike(fromSettings) : "") ||
				fromAppRoot;
			setSupportPath((prev) => (prev.trim() ? prev : support));
			setPaths((prev) => ({
				presetRoot:
					normalizePathLike(settingsPresetRoot) ||
					(support ? deriveSubfolders(support).presetRoot : prev.presetRoot),
				scriptRoot:
					normalizePathLike(settingsScriptRoot) ||
					(support ? deriveSubfolders(support).scriptRoot : prev.scriptRoot),
				pluginRoot:
					normalizePathLike(settingsPluginRoot) ||
					(support ? deriveSubfolders(support).pluginRoot : prev.pluginRoot),
			}));
		};
		void load();
		return () => {
			active = false;
		};
	}, []);

	// Retry app-folder detection when the support step opens before ExtendScript is ready.
	useEffect(() => {
		if (activeStep !== "support" || supportPath.trim()) {
			return;
		}
		let cancelled = false;
		void resolveInitializationAppRoot(window).then((root) => {
			if (cancelled || !root?.trim()) {
				return;
			}
			setSupportPath((prev) => (prev.trim() ? prev : normalizePathLike(root)));
		});
		return () => {
			cancelled = true;
		};
	}, [activeStep, supportPath]);

	// Keep `paths` in sync with the support root whenever it changes.
	useEffect(() => {
		const next = deriveSubfolders(supportPath);
		setPaths((prev) => ({
			presetRoot:
				!normalizePathLike(prev.presetRoot) ||
				normalizePathLike(prev.presetRoot) ===
					normalizePathLike(deriveSubfolders("").presetRoot)
					? next.presetRoot
					: prev.presetRoot,
			scriptRoot:
				!normalizePathLike(prev.scriptRoot) ||
				normalizePathLike(prev.scriptRoot) ===
					normalizePathLike(deriveSubfolders("").scriptRoot)
					? next.scriptRoot
					: prev.scriptRoot,
			pluginRoot:
				!normalizePathLike(prev.pluginRoot) ||
				normalizePathLike(prev.pluginRoot) ===
					normalizePathLike(deriveSubfolders("").pluginRoot)
					? next.pluginRoot
					: prev.pluginRoot,
		}));
	}, [supportPath]);

	useEffect(() => {
		if (!supportPath) {
			setIsAeAppFolder(false);
			return;
		}
		let active = true;
		void isPathAeAppFolder(window, supportPath).then((result) => {
			if (active) {
				setIsAeAppFolder(result);
			}
		});
		return () => {
			active = false;
		};
	}, [supportPath]);

	const handleSupportPathFinalize = useCallback((path: string) => {
		const normalized = normalizePathLike(path);
		setSupportPath(normalized);
		void isPathAeAppFolder(window, normalized).then((result) => {
			setIsAeAppFolder(result);
		});
	}, []);

	return {
		supportPath,
		paths,
		isAeAppFolder,
		setSupportPath,
		setPaths,
		handleSupportPathFinalize,
	};
}

type OnboardingFinishInput = {
	supportPath: string;
	paths: Paths;
	selectedFiles: Record<FilePickStep, Set<string>>;
	selectedFolders: Record<FilePickStep, Set<string>>;
	locale: SupportedLocale;
	panelSurfaceId: string;
	setSaving: (next: boolean) => void;
	setError: (next: string | null) => void;
	setFinishError: (next: OnboardingFinishError | null) => void;
	onCompleted?: (detail: { layoutReadSupportRoot: string }) => void;
};

// Owns the finish-phase orchestration: locale save, init complete, settings
// merge, preset import, layout build, storage commit, broadcast completion.
function useOnboardingFinish(input: OnboardingFinishInput): {
	handleFinish: () => Promise<void>;
	handleRetryWithElevation: () => Promise<void>;
} {
	const {
		supportPath,
		paths,
		selectedFiles,
		selectedFolders,
		locale,
		panelSurfaceId,
		setSaving,
		setError,
		setFinishError,
		onCompleted,
	} = input;
	const thumbnailGateway = useAfterEffectsFilesGateway();
	const handleFinish = useCallback(async () => {
		setSaving(true);
		setError(null);
		setFinishError(null);
		try {
			await runFinishPhase("locale", () => saveCepShellLocale(window, locale));
			const normalizedSupportPath = supportPath.trim();
			const normalizedSubfolders = {
				presetRoot: normalizePathLike(paths.presetRoot),
				scriptRoot: normalizePathLike(paths.scriptRoot),
				pluginRoot: normalizePathLike(paths.pluginRoot),
			};
			if (
				!normalizedSupportPath ||
				!normalizedSubfolders.presetRoot ||
				!normalizedSubfolders.scriptRoot ||
				!normalizedSubfolders.pluginRoot
			) {
				throw new Error("Support path and onboarding subfolders are required");
			}
			const appRoot = await resolveInitializationAppRoot(window);
			if (!appRoot) {
				throw new Error(
					"Ty Plus: cannot resolve the After Effects application folder for ty-plus-init.json. Open the panel inside After Effects and try again.",
				);
			}
			await runFinishPhase("init-complete", () =>
				completeInitialization(window, appRoot, {
					supportRoot: normalizedSupportPath,
					presetRoot: normalizedSubfolders.presetRoot,
					scriptRoot: normalizedSubfolders.scriptRoot,
					pluginRoot: normalizedSubfolders.pluginRoot,
				}),
			);
			const currentSettingsJson =
				(await runFinishPhase("settings-read", () => readSettings(window))) ??
				"";
			const mergedSettingsJson = await runFinishPhase("settings-merge", () =>
				mergeOnboardingSettings(currentSettingsJson, {
					supportRoot: normalizedSupportPath,
					presetRoot: normalizedSubfolders.presetRoot,
					scriptRoot: normalizedSubfolders.scriptRoot,
					pluginRoot: normalizedSubfolders.pluginRoot,
				}),
			);
			await runFinishPhase("settings-write", () =>
				writeSettingsForFinish(window, mergedSettingsJson),
			);
			const supportRootFromSettings =
				readSupportRootFromSettingsJson(mergedSettingsJson);
			if (!supportRootFromSettings) {
				throw new Error(
					"[onboarding finish:settings-root] merged settings must include core.paths.supportRoot",
				);
			}
			const selectedFolderPaths = new Set<string>();
			for (const key of ["presets", "scripts", "plugins"] as const) {
				for (const path of selectedFolders[key]) {
					selectedFolderPaths.add(path);
				}
			}
			const hasSelectedFolders = selectedFolderPaths.size > 0;
			const listDirectory = async (dirPath: string) => {
				const normalizedDir = normalizePathLike(dirPath);
				const scopedKind = (["presets", "scripts", "plugins"] as const).find(
					(kind) => {
						const root = normalizePathLike(
							rootPathForStep(kind, normalizedSubfolders),
						);
						return (
							Boolean(root) &&
							(normalizedDir === root || normalizedDir.startsWith(`${root}/`))
						);
					},
				);
				const rows = scopedKind
					? await readScopedDirectory({
							win: window,
							rootPath: rootPathForStep(scopedKind, normalizedSubfolders),
							dirPath,
							allowedExtensions: STEP_EXTENSIONS[scopedKind],
							includeCompanionImages: true,
						})
					: await createCepNodeFileBrowserService({
							win: window,
						}).listDirectory(dirPath);
				return rows.map((entry) => ({
					name: entry.name,
					path: entry.path,
					isDirectory: entry.isDirectory,
				}));
			};
			const importOptions: OnboardingImportOptions = {
				selectedFiles,
				selectedFolders,
				canScanFolders: hasSelectedFolders && canUseCepNodeFileBrowser(window),
			};
			const services = getDataServices();
			const importPresetRepository = createCatalogRootPinnedPresetRepository(
				window,
				{
					cloud: services.gateway,
				},
			);
			const {
				presets,
				addedPresets,
				addedPresetIds,
				addedGroupCatalogEntries,
				workspacePanelRefIds,
			} = await importOnboardingPresets(
				importOptions,
				importPresetRepository,
				listDirectory,
				thumbnailGateway,
			);
			logWorkspace("onboardingView:after-preset-import", {
				presetCatalogCount: presets.length,
				addedPresetIds,
				workspacePanelRefIds,
			});
			const bootstrapState = createInitialSurfaceState({
				panelId: panelSurfaceId,
				hostCode: "AEFT",
				hostName: "After Effects",
				mode: "static",
			});
			const transport = createCepSurfaceTransport(window);
			await runFinishPhase("preset-publish", () =>
				publishShellMessage(transport, {
					channel: SHELL_CHANNELS.presets,
					kind: "publish",
					sourceSurfaceId: panelSurfaceId,
					payload: {
						kind: "snapshot" as const,
						presets,
						syncStatus: {
							provider: "supabase",
							state: "idle" as const,
							label: "Local Update",
							checkedAt: new Date().toISOString(),
						},
						sourceSurfaceId: panelSurfaceId,
					},
				}),
			);
			const onboardingLayout = buildOnboardingLayoutItems({
				bootstrapWidgets: layoutsFromSurface(
					bootstrapState.surfaceTiles,
					widgetResolutionFromCatalogContext(bootstrapState),
				),
				panelPresetRefIds: workspacePanelRefIds,
			});
			const initialLayoutItems = onboardingLayout.layoutItems;
			logWorkspace("onboardingView:initial-layout-built", {
				itemCount: initialLayoutItems.length,
				sampleItems: initialLayoutItems.slice(0, 14).map((i) => ({
					id: i.id,
					x: i.x,
					y: i.y,
				})),
			});
			const initialWidgetRecords: WidgetRecord[] = layoutsFromSurface(
				bootstrapState.surfaceTiles,
				widgetResolutionFromCatalogContext(bootstrapState),
			).map(
				(w: Layout): WidgetRecord => ({
					id: w.id,
					type: w.widgetType as WidgetType,
					param: w.data ?? {},
				}),
			);
			logWorkspace("onboardingView:before-complete-storage", {
				panelSurfaceId,
				supportRoot: supportRootFromSettings,
				widgetRecordCount: initialWidgetRecords.length,
			});
			await completeOnboardingStorage(window, {
				panelSurfaceId,
				mergedSettingsJson,
				initialLayoutItems,
				initialWidgetRecords,
				importedPresets: addedPresets,
				addedGroupCatalogEntries,
				writeSettingsImpl: writeSettingsForFinish,
				writeSettingsPathsJsonImpl: writeSettingsPathsJsonForFinish,
			});
			void triggerCandidatesRebuild(window).catch((error) => {
				console.warn("[ty-plus] candidates index rebuild failed", error);
			});
			await runFinishPhase("broadcast-completed", () =>
				publishShellMessage(transport, {
					channel: SHELL_CHANNELS.onboarding,
					kind: "publish",
					sourceSurfaceId: panelSurfaceId,
					payload: {
						kind: "completed",
						sourceSurfaceId: panelSurfaceId,
						layoutReadSupportRoot: supportRootFromSettings,
						at: new Date().toISOString(),
					},
				}),
			);
			onCompleted?.({ layoutReadSupportRoot: supportRootFromSettings });
		} catch (err) {
			if (err instanceof OnboardingFinishError) {
				setFinishError(err);
			} else {
				setError(err instanceof Error ? err.message : String(err));
			}
		} finally {
			setSaving(false);
		}
	}, [
		locale,
		onCompleted,
		panelSurfaceId,
		paths.pluginRoot,
		paths.presetRoot,
		paths.scriptRoot,
		selectedFiles,
		selectedFolders,
		setError,
		setFinishError,
		setSaving,
		supportPath,
		thumbnailGateway,
	]);

	// Retry the failed write with UAC/osascript elevation. The first call
	// inside `handleFinish` already attempted elevation; if it failed the
	// user can click the Retry button (after granting admin at the OS
	// dialog) to re-run the full flow.
	const handleRetryWithElevation = useCallback(async () => {
		await handleFinish();
	}, [handleFinish]);

	return { handleFinish, handleRetryWithElevation };
}

export type ViewProps = {
	onCompleted?: (detail: { layoutReadSupportRoot: string }) => void;
};

export function View({ onCompleted }: ViewProps = {}): JSX.Element {
	const { t } = useTranslation("onboarding");
	const { panelSurfaceId } = useCep();
	const [activeStep, setActiveStep] = useState<StepId>("intro");
	const [error, setError] = useState<string | null>(null);
	const [finishError, setFinishError] = useState<OnboardingFinishError | null>(
		null,
	);
	const [saving, setSaving] = useState(false);
	const [selectedFiles, setSelectedFiles] = useState<
		Record<FilePickStep, Set<string>>
	>({
		presets: new Set(),
		scripts: new Set(),
		plugins: new Set(),
	});
	const [selectedFolders, setSelectedFolders] = useState<
		Record<FilePickStep, Set<string>>
	>({
		presets: new Set(),
		scripts: new Set(),
		plugins: new Set(),
	});
	const [currentDir, setCurrentDir] = useState<Record<FilePickStep, string>>({
		presets: "",
		scripts: "",
		plugins: "",
	});
	const [viewMode, setViewMode] = useState<"modal" | "fullscreen">("modal");

	const {
		supportPath,
		paths,
		isAeAppFolder,
		setSupportPath,
		setPaths,
		handleSupportPathFinalize,
	} = useOnboardingSettings(activeStep);

	const stepIndex = STEP_SEQUENCE.indexOf(activeStep);

	const stepValidationError = useMemo((): string | null => {
		if (activeStep === "support" && !supportPath.trim()) {
			return t("errors.supportRequired");
		}
		if (activeStep === "subfolders") {
			const missingSubfolder =
				!normalizePathLike(paths.presetRoot) ||
				!normalizePathLike(paths.scriptRoot) ||
				!normalizePathLike(paths.pluginRoot);
			if (missingSubfolder) {
				return t("errors.subfoldersRequired");
			}
		}
		return null;
	}, [activeStep, paths, supportPath, t]);

	useEffect(() => {
		if (stepValidationError) {
			return;
		}
		setError((current) => {
			if (
				current === t("errors.supportRequired") ||
				current === t("errors.subfoldersRequired")
			) {
				return null;
			}
			return current;
		});
	}, [stepValidationError, t]);

	const nextStep = useCallback(() => {
		if (stepValidationError) {
			setError(stepValidationError);
			return;
		}
		setError(null);
		if (activeStep === "support" && isAeAppFolder) {
			setActiveStep("presets");
			return;
		}
		const nextIdx = Math.min(stepIndex + 1, STEP_SEQUENCE.length - 1);
		setActiveStep(STEP_SEQUENCE[nextIdx]);
	}, [stepValidationError, activeStep, isAeAppFolder, stepIndex]);

	const prevStep = useCallback(() => {
		const prevIdx = Math.max(stepIndex - 1, 0);
		setActiveStep(STEP_SEQUENCE[prevIdx]);
	}, [stepIndex]);

	useEffect(() => {
		document.body.classList.add("ty-plus-onboarding-active");
		return () => {
			document.body.classList.remove("ty-plus-onboarding-active");
		};
	}, []);

	const currentFileStep = useMemo<FilePickStep | null>(() => {
		if (
			activeStep === "presets" ||
			activeStep === "scripts" ||
			activeStep === "plugins"
		) {
			return activeStep;
		}
		return null;
	}, [activeStep]);

	const canGoUp = useMemo(() => {
		if (!currentFileStep) return false;
		const activeDir = resolveCurrentFolderPath(
			currentFileStep,
			currentDir,
			paths,
		);
		return (
			Boolean(activeDir) &&
			activeDir !== rootPathForStep(currentFileStep, paths)
		);
	}, [currentFileStep, currentDir, paths]);

	const isFileSelected = useCallback(
		(path: string) =>
			selectedFiles.presets.has(path) ||
			selectedFiles.scripts.has(path) ||
			selectedFiles.plugins.has(path),
		[selectedFiles],
	);

	const isFolderSelected = useCallback(
		(path: string) =>
			selectedFolders.presets.has(path) ||
			selectedFolders.scripts.has(path) ||
			selectedFolders.plugins.has(path),
		[selectedFolders],
	);

	const effectiveCurrentDir = useMemo<Record<FilePickStep, string>>(() => {
		if (!currentFileStep) return currentDir;
		if (currentDir[currentFileStep]) return currentDir;
		const rootPath = rootPathForStep(currentFileStep, paths);
		return { ...currentDir, [currentFileStep]: rootPath };
	}, [currentFileStep, currentDir, paths]);

	const {
		folderEntries,
		loadingFiles,
		refresh: refreshBrowser,
	} = useFileBrowser(currentFileStep, effectiveCurrentDir, paths, setError);

	const goUpBrowser = useCallback(() => {
		if (!currentFileStep) {
			return;
		}
		const parent = goUpScopedDir(currentFileStep, effectiveCurrentDir, paths);
		if (!parent) {
			return;
		}
		setCurrentDir((prev) => ({ ...prev, [currentFileStep]: parent }));
	}, [currentFileStep, effectiveCurrentDir, paths]);

	const openBrowserEntry = useCallback(
		(path: string) => {
			if (!currentFileStep || !path.trim()) {
				return;
			}
			const trimmed = path.trim();
			setCurrentDir((prev) => ({ ...prev, [currentFileStep]: trimmed }));
		},
		[currentFileStep],
	);

	const toggleBrowserFile = useCallback(
		(path: string) => {
			if (!currentFileStep || !path.trim()) {
				return;
			}
			const trimmed = path.trim();
			setSelectedFiles((prev) => {
				const next = new Set(prev[currentFileStep]);
				if (next.has(trimmed)) next.delete(trimmed);
				else next.add(trimmed);
				return { ...prev, [currentFileStep]: next };
			});
		},
		[currentFileStep],
	);

	const toggleBrowserFolder = useCallback(
		(path: string) => {
			if (!currentFileStep || !path.trim()) {
				return;
			}
			const trimmed = path.trim();
			setSelectedFolders((prev) => {
				const next = new Set(prev[currentFileStep]);
				if (next.has(trimmed)) next.delete(trimmed);
				else next.add(trimmed);
				return { ...prev, [currentFileStep]: next };
			});
		},
		[currentFileStep],
	);

	useMenu({
		onNext: nextStep,
		onBack: prevStep,
		canGoUp,
		isFileSelected,
		isFolderSelected,
		onRefreshBrowser: refreshBrowser,
		onGoUpBrowser: goUpBrowser,
		onOpenBrowserEntry: openBrowserEntry,
		onToggleBrowserFile: toggleBrowserFile,
		onToggleBrowserFolder: toggleBrowserFolder,
	});

	const { handleFinish, handleRetryWithElevation } = useOnboardingFinish({
		supportPath,
		paths,
		selectedFiles,
		selectedFolders,
		locale: SUPPORTED_LOCALES[0],
		panelSurfaceId,
		setSaving,
		setError,
		setFinishError,
		onCompleted,
	});

	const stepCopy = useMemo(
		() =>
			Object.fromEntries(
				STEP_SEQUENCE.map((step) => [
					step,
					{
						title: t(`step.${step}.title`),
						body: t(`step.${step}.body`),
						label: t(`step.${step}.label`),
					},
				]),
			) as Record<StepId, { title: string; body: string; label: string }>,
		[t],
	);

	const stepTitles = STEP_SEQUENCE.map((step) => stepCopy[step].title);

	const renderFileStep = (kind: FilePickStep) => (
		<FileStepBrowser
			kind={kind}
			paths={paths}
			currentDir={currentDir}
			folderEntries={folderEntries}
			loadingFiles={loadingFiles}
			selectedFiles={selectedFiles}
			selectedFolders={selectedFolders}
			setCurrentDir={setCurrentDir}
			setSelectedFiles={setSelectedFiles}
			setSelectedFolders={setSelectedFolders}
			t={t}
		/>
	);

	const renderBody = (): JSX.Element | null => {
		switch (activeStep) {
			case "intro":
				return <IntroStep body={stepCopy.intro.body} />;
			case "language":
				return (
					<LanguageStep
						body={stepCopy.language.body}
						title={stepCopy.language.title}
					/>
				);
			case "support":
				return (
					<SupportStepBody
						body={stepCopy.support.body}
						supportPath={supportPath}
						isAeAppFolder={isAeAppFolder}
						onSupportPathChange={setSupportPath}
						onPathFinalize={handleSupportPathFinalize}
					/>
				);
			case "subfolders":
				return (
					<SubfoldersStep
						body={stepCopy.subfolders.body}
						paths={paths}
						supportPath={supportPath}
						onPathsChange={setPaths}
					/>
				);
			case "presets":
			case "scripts":
			case "plugins":
				return renderFileStep(activeStep);
			case "workspace":
				return <WorkspaceStep body={stepCopy.workspace.body} />;
			case "adding-presets":
				return <AddingPresetsStep body={stepCopy["adding-presets"].body} />;
			case "finish":
				return <FinishStep body={stepCopy.finish.body} />;
			default:
				return null;
		}
	};

	const isFullscreen = viewMode === "fullscreen";

	return (
		<div
			className={isFullscreen ? shellFullscreenClass : shellModalClass}
			data-testid="onboarding-shell"
			data-view-mode={viewMode}
		>
			<div className={isFullscreen ? dialogFullscreenClass : dialogModalClass}>
				<div className={dialogHeaderClass}>
					<h2 className={dialogTitleClass} data-testid="onboarding-title">
						{stepIndex + 1}. {stepTitles[stepIndex]}
					</h2>
					<div className={dialogHeaderRightClass}>
						<span
							className={dialogProgressClass}
							data-testid="onboarding-progress"
						>
							{stepIndex + 1} / {stepTitles.length}
						</span>
						<IconButton
							size="sm"
							variant="ghost"
							aria-label={
								viewMode === "fullscreen"
									? t("actions.toggleModal")
									: t("actions.toggleFullscreen")
							}
							aria-pressed={viewMode === "fullscreen"}
							data-testid="onboarding-view-mode-toggle"
							onClick={() =>
								setViewMode((prev) =>
									prev === "fullscreen" ? "modal" : "fullscreen",
								)
							}
						>
							{viewMode === "fullscreen" ? (
								<Minimize2 size={16} aria-hidden />
							) : (
								<Maximize2 size={16} aria-hidden />
							)}
						</IconButton>
					</div>
				</div>
				<div className={dialogBodyClass}>
					<ErrorBanner error={error} />
					<FinishErrorPanel
						finishError={finishError}
						onRetryWithElevation={() => {
							void handleRetryWithElevation();
						}}
					/>
					{renderBody()}
				</div>
				<StepNavigation
					activeStep={activeStep}
					stepIndex={stepIndex}
					stepValidationError={stepValidationError}
					saving={saving}
					onBack={prevStep}
					onNext={() => {
						if (activeStep !== "finish") void nextStep();
					}}
					onFinish={() => {
						void handleFinish();
					}}
				/>
			</div>
		</div>
	);
}

// Wrapper hook removed: View now uses useCep() directly to read panelSurfaceId.
