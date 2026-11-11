import type { TFunction } from "i18next";
import {
	AlertCircle,
	CheckCircle,
	Copy,
	FolderOpen,
	Loader,
	MousePointerClick,
	Save,
	Timer,
} from "lucide-react";
import {
	type JSX,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useTranslation } from "react-i18next";

import { selectFolder } from "@/management/ae/cep/dialog-shim/bolt";
import { readUserHomeOrFallback, ToolDialog } from "@/management/preset";
import { saveAnimationPresetAsset } from "@/management/preset/authoring/write-preset-asset";
import { ArchiveDetailsSection } from "@/management/preset/catalog-add/ArchiveDetailsSection";
import { parseRootPathsFromSettingsJson } from "@/management/preset/catalog-add/parse-root-paths";
import { PresetIconEditor } from "@/management/preset/components/IconEditor";
import type { Preset } from "@/management/preset/contract";
import {
	createPresetIconDraft,
	presetIconDraftToPresetIcon,
} from "@/management/preset/icon-editor";
import {
	AuthoringField,
	AuthoringGrid,
	AuthoringSection,
} from "@/management/preset/tool-shell/archive-layout";
import { upsertLocalPreset } from "@/management/preset/use-cases";
import { FramedPresetGlyph } from "@/management/preset/workspace/glyph";
import {
	createCepNodeFileBrowserService,
	type FileBrowserEntry,
} from "@/management/storage/file-browser-service";
import { createInstanceId } from "@/management/storage/ids";
import { readSettings } from "@/management/workspace/persistence/store";
import { notifyPanelsAfterPresetSave } from "@/management/workspace/placement/notify-panels-after-preset-save";
import { Icon } from "@/shared/component";
import { Button } from "@/shared/component/controls/Button";
import { Input } from "@/shared/component/fields/Input";
import { css } from "@/styled-system/css";

type PresetStatus =
	| "idle"
	| "scanning"
	| "success"
	| "error"
	| "no-selection"
	| "timeout";

const SCAN_TIMEOUT_MS = 30000;
const SCAN_MAX_FILES = 5000;

type FileItem = {
	name: string;
	path: string;
	isDirectory: boolean;
	modifiedTime?: number;
};

const stepNumberClass = css({
	display: "flex",
	height: "6",
	width: "6",
	flexShrink: 0,
	alignItems: "center",
	justifyContent: "center",
	borderRadius: "full",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.widget",
	fontSize: "shell-text-sm",
	fontWeight: "bold",
	color: "text.primary",
});

const stepTitleClass = css({
	fontSize: "shell-text-sm",
	fontWeight: "semibold",
	color: "text.primary",
});

const stepDescClass = css({
	fontSize: "text-xs",
	color: "text.muted",
	lineHeight: "tight",
});

const pathBoxClass = css({
	fontFamily: "mono",
	fontSize: "text-xs",
	color: "text.primary",
	overflowWrap: "break-all",
	borderRadius: "shell-sm",
	backgroundColor: "surface.widget",
	paddingInline: "2",
	paddingBlock: "1",
	direction: "rtl",
	textAlign: "left",
});

const statusBannerBaseClass = css({
	display: "flex",
	alignItems: "flex-start",
	gap: "2",
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	padding: "2",
	fontSize: "text-xs",
});

const statusBannerVariant = {
	success: css({
		borderColor: "status.success/30",
		backgroundColor: "status.success/10",
		color: "status.success",
	}),
	warning: css({
		borderColor: "status.warning/30",
		backgroundColor: "status.warning/10",
		color: "status.warning",
	}),
	error: css({
		borderColor: "status.error/30",
		backgroundColor: "status.error/10",
		color: "status.error",
	}),
} as const;

const statusBannerClass = (variant: "success" | "warning" | "error"): string =>
	`${statusBannerBaseClass} ${statusBannerVariant[variant]}`;

const stepCardClass = css({
	display: "flex",
	width: "full",
	minWidth: 0,
	flexDirection: "column",
	gap: "3",
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.widget",
	padding: "4",
});

const headerRowClass = css({
	display: "flex",
	alignItems: "flex-start",
	gap: "3",
});

const headerColumnClass = css({
	display: "flex",
	minWidth: 0,
	flexDirection: "column",
	gap: "1",
});

const iconSquareClass = css({
	minWidth: 0,
	height: "7",
	width: "7",
	flexShrink: 0,
	padding: 0,
});

const sectionRowClass = css({
	display: "flex",
	minWidth: 0,
	flexDirection: "column",
	gap: "2",
});

const sectionRowInnerClass = css({
	display: "flex",
	alignItems: "flex-start",
	gap: "3",
});

const sectionColumnClass = css({
	display: "flex",
	minWidth: 0,
	flex: "1",
	flexDirection: "column",
	gap: "2",
});

const folderTitleRowClass = css({
	display: "flex",
	minWidth: 0,
	alignItems: "center",
	justifyContent: "space-between",
});

const folderActionRowClass = css({
	display: "flex",
	alignItems: "center",
	gap: "1",
});

const resetButtonClass = css({
	alignSelf: "flex-start",
	fontSize: "text-xs",
	color: "text.muted",
	textDecoration: "underline",
	_hover: { color: "text.primary" },
});

const busyButtonClass = css({
	opacity: 0.6,
});

const statusBannerInnerClass = css({
	display: "flex",
	minWidth: 0,
	flexDirection: "column",
	gap: "0.5",
});

const statusTitleClass = css({
	fontWeight: "semibold",
});

const statusHintClass = (variant: "success" | "warning" | "error"): string =>
	css({ opacity: 0.8, color: `status.${variant}` });

const detectedFileClass = css({
	fontFamily: "mono",
	fontSize: "text-xs",
	overflowWrap: "break-all",
});

function StepHeader({
	number,
	title,
	description,
}: {
	number: number;
	title: string;
	description: string;
}): JSX.Element {
	return (
		<div className={headerRowClass}>
			<span className={stepNumberClass}>{number}</span>
			<div className={headerColumnClass}>
				<span className={stepTitleClass}>{title}</span>
				<span className={stepDescClass}>{description}</span>
			</div>
		</div>
	);
}

function StatusBanner({
	variant,
	icon: BannerIcon,
	title,
	hint,
	children,
}: {
	variant: "success" | "warning" | "error";
	icon: typeof AlertCircle;
	title: string;
	hint?: string;
	children?: React.ReactNode;
}): JSX.Element {
	return (
		<div className={statusBannerClass(variant)}>
			<Icon icon={BannerIcon} size={16} aria-hidden />
			<div className={statusBannerInnerClass}>
				<span className={statusTitleClass}>{title}</span>
				{hint ? <span className={statusHintClass(variant)}>{hint}</span> : null}
				{children}
			</div>
		</div>
	);
}

function FolderPathSection({
	displayPath,
	customScanPath,
	busy,
	pathCopied,
	onBrowseFolder,
	onCopyPath,
	onResetPath,
	t,
}: {
	displayPath: string;
	customScanPath: string;
	busy: boolean;
	pathCopied: boolean;
	onBrowseFolder: () => void;
	onCopyPath: () => void;
	onResetPath: () => void;
	t: TFunction;
}): JSX.Element {
	return (
		<div className={stepCardClass}>
			<div className={sectionRowClass}>
				<div className={sectionRowInnerClass}>
					<span className={stepNumberClass}>2</span>
					<div className={sectionColumnClass}>
						<div className={folderTitleRowClass}>
							<span className={stepTitleClass}>
								{t("animationPreset.step2.title")}
							</span>
							<div className={folderActionRowClass}>
								<Button
									type="button"
									variant="ghost"
									uiSize="sm"
									className={iconSquareClass}
									onClick={onBrowseFolder}
									disabled={busy}
									title={t("common.browseFolder")}
								>
									<Icon icon={FolderOpen} size={14} aria-hidden />
								</Button>
								<Button
									type="button"
									variant="ghost"
									uiSize="sm"
									className={iconSquareClass}
									onClick={onCopyPath}
									disabled={!displayPath}
									title={t("common.copyPath")}
								>
									<Icon
										icon={pathCopied ? CheckCircle : Copy}
										size={14}
										aria-hidden
									/>
								</Button>
							</div>
						</div>
						<div className={pathBoxClass}>
							{displayPath ||
								t("animationPreset.path.notConfigured", "Not configured")}
						</div>
						{customScanPath ? (
							<button
								type="button"
								className={resetButtonClass}
								onClick={onResetPath}
							>
								{t("animationPreset.path.reset")}
							</button>
						) : null}
					</div>
				</div>
			</div>
		</div>
	);
}

function AnimationStatusSection({
	status,
	busy,
	displayPath,
	detectedNewFile,
	message,
	onOpenSaveDialog,
	t,
	getShortPath,
}: {
	status: PresetStatus;
	busy: boolean;
	displayPath: string;
	detectedNewFile: string | null;
	message: string | null;
	onOpenSaveDialog: () => void;
	t: TFunction;
	getShortPath: (path: string) => string;
}): JSX.Element {
	return (
		<div className={stepCardClass}>
			<div className={sectionRowInnerClass}>
				<span className={stepNumberClass}>3</span>
				<div className={sectionColumnClass}>
					<Button
						type="button"
						variant="primary"
						disabled={busy || !displayPath}
						onClick={onOpenSaveDialog}
						start={
							busy ? (
								<Icon icon={Loader} size={14} aria-hidden />
							) : (
								<Icon icon={Save} size={14} aria-hidden />
							)
						}
						className={busy ? busyButtonClass : ""}
					>
						{busy
							? t("animationPreset.step3.detecting")
							: t("animationPreset.step3.button")}
					</Button>

					{status === "success" && detectedNewFile ? (
						<StatusBanner
							variant="success"
							icon={CheckCircle}
							title={t("animationPreset.status.success")}
						>
							<span className={detectedFileClass}>
								{getShortPath(detectedNewFile)}
							</span>
						</StatusBanner>
					) : null}

					{status === "no-selection" ? (
						<StatusBanner
							variant="warning"
							icon={MousePointerClick}
							title={t("animationPreset.status.noSelection")}
							hint={t("animationPreset.status.noSelectionHint")}
						/>
					) : null}

					{status === "timeout" ? (
						<StatusBanner
							variant="warning"
							icon={Timer}
							title={t("animationPreset.status.timeout")}
							hint={t("animationPreset.status.timeoutHint")}
						/>
					) : null}

					{status === "error" ? (
						<StatusBanner
							variant="error"
							icon={AlertCircle}
							title={message || t("animationPreset.status.error")}
							hint={
								!message ? t("animationPreset.status.errorHint") : undefined
							}
						/>
					) : null}
				</div>
			</div>
		</div>
	);
}

// Load the configured presets root from CEP settings.
function useAnimationPresetsRoot(): string {
	const [presetsRoot, setPresetsRoot] = useState<string>("");
	useEffect(() => {
		void (async () => {
			try {
				const raw = await readSettings(window);
				const rawArg = raw ?? undefined;
				const roots = parseRootPathsFromSettingsJson(rawArg);
				if (roots.presetRoot) {
					setPresetsRoot(roots.presetRoot);
				}
			} catch {
				// ignore — fall back to empty path
			}
		})();
	}, []);
	return presetsRoot;
}

// Derive the `ty-plus/presets` subfolder of the configured presets root.
const useTyPlusPresetRoot = (presetsRoot: string): string =>
	useMemo(() => {
		const root = presetsRoot.trim();
		if (!root) return "";
		const sep = root.includes("\\") ? "\\" : "/";
		return `${root}${sep}ty-plus${sep}presets`;
	}, [presetsRoot]);

// Scan a directory for `.ffx` files via the CEP node file-browser service.
const useScanAllFfxFiles = (
	scanMaxFiles: number,
): ((dir: string) => Promise<{ files: FileItem[]; timedOut: boolean }>) =>
	useCallback(
		async (dir: string): Promise<{ files: FileItem[]; timedOut: boolean }> => {
			if (!dir.trim()) {
				return { files: [], timedOut: false };
			}
			try {
				const service = createCepNodeFileBrowserService({ win: window });
				const timeoutId = setTimeout(() => {}, SCAN_TIMEOUT_MS);
				const entries = await service.listDirectory(dir);
				clearTimeout(timeoutId);
				const ffx = entries.filter(
					(e: FileBrowserEntry) =>
						!e.isDirectory &&
						(e.extension === ".ffx" || e.name.toLowerCase().endsWith(".ffx")),
				);
				const limited = ffx.slice(0, scanMaxFiles);
				return {
					files: limited.map((e: FileBrowserEntry) => ({
						name: e.name,
						path: e.path,
						isDirectory: false,
						modifiedTime: e.modifiedAt
							? new Date(e.modifiedAt).getTime()
							: Date.now(),
					})),
					timedOut: false,
				};
			} catch {
				return { files: [], timedOut: false };
			}
		},
		[scanMaxFiles],
	);

// Resolve the effective scan directory: custom override > ty-plus subfolder > presets root > user home.
const resolveAnimationScanPath = (
	customScanPath: string,
	tyPlusPresetRoot: string,
	presetsRoot: string,
): string =>
	customScanPath || tyPlusPresetRoot || presetsRoot || readUserHomeOrFallback();

type AnimationScanInput = {
	name: string;
	customScanPath: string;
	presetsRoot: string;
	tyPlusPresetRoot: string;
	errorFallbackMessage: string;
	onAutoName: (nextName: string) => void;
	presetId?: string;
};

// Owns the scan/save-dialog flow that opens the AE save dialog, waits for the
// `.ffx` to appear on disk, and reports the detected file back via state.
function useAnimationPresetDetection(input: AnimationScanInput): {
	busy: boolean;
	status: PresetStatus;
	message: string | null;
	detectedNewFile: string | null;
	selectedPath: string | null;
	openSaveDialog: () => Promise<void>;
} {
	const {
		name,
		customScanPath,
		presetsRoot,
		tyPlusPresetRoot,
		errorFallbackMessage,
		onAutoName,
		presetId,
	} = input;
	const [status, setStatus] = useState<PresetStatus>("idle");
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	const [detectedNewFile, setDetectedNewFile] = useState<string | null>(null);
	const [selectedPath, setSelectedPath] = useState<string | null>(null);
	const fileSnapshotRef = useRef<Set<string>>(new Set());
	const scanAllFfxFiles = useScanAllFfxFiles(SCAN_MAX_FILES);

	const openSaveDialog = useCallback(async (): Promise<void> => {
		const scanPath = resolveAnimationScanPath(
			customScanPath,
			tyPlusPresetRoot,
			presetsRoot,
		);
		if (!scanPath) {
			setStatus("error");
			setMessage(errorFallbackMessage);
			return;
		}

		setBusy(true);
		setMessage(null);
		// A new attempt must not keep the previous attempt's target: a
		// re-scan that finds nothing would otherwise still let Create
		// persist the file detected under the old folder.
		setDetectedNewFile(null);
		setSelectedPath(null);
		setStatus("scanning");
		try {
			const { files: beforeFiles, timedOut: beforeTimedOut } =
				await scanAllFfxFiles(scanPath);

			if (beforeTimedOut) {
				setStatus("timeout");
				return;
			}

			fileSnapshotRef.current = new Set(beforeFiles.map((f) => f.path));

			// Issue #160: authorize the save root and make sure the target
			// directory exists before AE's native Save Animation Preset
			// dialog opens. The dialog owns the actual `.ffx` write; the
			// caller verifies the detected file before any record commits.
			const result = await saveAnimationPresetAsset(window, {
				name: name.trim() || "AnimationPreset",
				saveDir: scanPath,
				presetId,
			});

			if (!result.ok) {
				if (
					result.error.code === "host-preparation-failed" &&
					/select at least one layer/i.test(result.error.message)
				) {
					setStatus("no-selection");
					setMessage(null);
				} else {
					setStatus("error");
					setMessage(result.error.message || errorFallbackMessage);
				}
				return;
			}

			let newFiles: FileItem[] = [];
			for (let attempt = 0; attempt < 3; attempt++) {
				const delayMs = 1000 * (attempt + 1);
				await new Promise((r) => setTimeout(r, delayMs));

				const { files: afterFiles, timedOut } = await scanAllFfxFiles(scanPath);

				if (timedOut) {
					setStatus("timeout");
					return;
				}

				newFiles = afterFiles.filter(
					(f) =>
						!fileSnapshotRef.current.has(f.path) && f.path.endsWith(".ffx"),
				);

				if (newFiles.length > 0) {
					break;
				}
			}

			if (newFiles.length > 0) {
				const newest = newFiles.sort(
					(a, b) => (b.modifiedTime || 0) - (a.modifiedTime || 0),
				)[0];
				if (newest) {
					setSelectedPath(newest.path);
					setDetectedNewFile(newest.path);
					setStatus("success");
					const fileName = newest.name.replace(/\.ffx$/i, "");
					if (!name || name === "Animation Preset") {
						onAutoName(fileName);
					}
					setMessage(null);
				}
			} else {
				setStatus("error");
				setMessage(null);
			}
		} finally {
			setBusy(false);
		}
	}, [
		customScanPath,
		errorFallbackMessage,
		name,
		onAutoName,
		presetId,
		presetsRoot,
		scanAllFfxFiles,
		tyPlusPresetRoot,
	]);

	return {
		busy,
		status,
		message,
		detectedNewFile,
		selectedPath,
		openSaveDialog,
	};
}

// Browse/clipboard/reset controls for the custom scan-path input.
function useAnimationPathControls(input: {
	customScanPath: string;
	tyPlusPresetRoot: string;
	presetsRoot: string;
	setCustomScanPath: (next: string) => void;
}): {
	browseFolder: () => void;
	copyPath: () => Promise<void>;
	resetPath: () => void;
	pathCopied: boolean;
} {
	const { customScanPath, tyPlusPresetRoot, presetsRoot, setCustomScanPath } =
		input;
	const [pathCopied, setPathCopied] = useState(false);

	const browseFolder = useCallback((): void => {
		const start = resolveAnimationScanPath(
			customScanPath,
			tyPlusPresetRoot,
			presetsRoot,
		);
		selectFolder(start, "Select Scan Folder", (folder) => {
			if (folder) setCustomScanPath(folder);
		});
	}, [customScanPath, presetsRoot, setCustomScanPath, tyPlusPresetRoot]);

	const copyPath = useCallback(async (): Promise<void> => {
		const pathToCopy = customScanPath || tyPlusPresetRoot || presetsRoot;
		if (!pathToCopy) return;
		try {
			await navigator.clipboard.writeText(pathToCopy);
		} catch {
			const textArea = document.createElement("textarea");
			textArea.value = pathToCopy;
			document.body.appendChild(textArea);
			textArea.select();
			document.execCommand("copy");
			document.body.removeChild(textArea);
		}
		setPathCopied(true);
		setTimeout(() => setPathCopied(false), 2000);
	}, [customScanPath, presetsRoot, tyPlusPresetRoot]);

	const resetPath = useCallback((): void => {
		setCustomScanPath("");
	}, [setCustomScanPath]);

	return { browseFolder, copyPath, resetPath, pathCopied };
}

export function Dialog(): JSX.Element {
	const { t } = useTranslation("presets");
	const [name, setName] = useState(() => t("presetTool.animation.defaultName"));
	const [iconDraft, setIconDraft] = useState(() =>
		createPresetIconDraft("ANIM"),
	);
	const [description, setDescription] = useState("");
	const [descriptionImage, setDescriptionImage] = useState("");
	const [customScanPath, setCustomScanPath] = useState<string>("");

	const presetId = useMemo(() => createInstanceId(), []);
	const resolvedIcon = useMemo(
		() => presetIconDraftToPresetIcon(iconDraft),
		[iconDraft],
	);

	const presetsRoot = useAnimationPresetsRoot();
	const tyPlusPresetRoot = useTyPlusPresetRoot(presetsRoot);

	const { browseFolder, copyPath, resetPath, pathCopied } =
		useAnimationPathControls({
			customScanPath,
			tyPlusPresetRoot,
			presetsRoot,
			setCustomScanPath,
		});

	const {
		busy,
		status,
		message,
		detectedNewFile,
		selectedPath,
		openSaveDialog,
	} = useAnimationPresetDetection({
		name,
		customScanPath,
		presetsRoot,
		tyPlusPresetRoot,
		errorFallbackMessage: t("animationPreset.status.error"),
		onAutoName: setName,
		presetId,
	});

	const displayPath = resolveAnimationScanPath(
		customScanPath,
		tyPlusPresetRoot,
		presetsRoot,
	);

	const getShortPath = useCallback((fullPath: string): string => {
		if (!fullPath) return "";
		const parts = fullPath.split(/[/\\]/);
		if (parts.length <= 3) return fullPath;
		return `…/${parts.slice(-3).join("/")}`;
	}, []);

	const previewPreset = useMemo(
		(): Preset => ({
			id: "icon-preview",
			type: "preset",
			title: name.trim() || "Animation Preset",
			filePath: "ty-plus://icon-preview",
			icon: resolvedIcon ?? { type: "text", param: { text: "ANIM" } },
		}),
		[name, resolvedIcon],
	);

	const canCreate = name.trim().length > 0 && selectedPath && !busy;

	return (
		<ToolDialog
			surfaceId="dialog-animation-preset"
			title={t("presetTool.animation.title")}
			type="preset"
			description={t("presetTool.animation.lead")}
			defaultName={t("presetTool.animation.defaultName")}
			iconText="ANIM"
			resolveBrowseStartDir={readUserHomeOrFallback}
			entryPoint="tool-shell:animation"
			fields={[
				{ key: "saveDir", label: t("presetTool.animation.fields.saveFolder") },
				{
					key: "path",
					label: t("presetTool.animation.fields.path"),
					placeholder: t("presetTool.animation.fields.pathPlaceholder"),
				},
			]}
			beforeSave={async () => {
				// An empty path would make ToolDialog skip
				// `assertPresetAssetPresent` entirely and let
				// `persistOverride` commit a record with no file behind it.
				if (!selectedPath) {
					throw new Error(
						"Save the animation preset with After Effects' native dialog first.",
					);
				}
				return { filePath: selectedPath, status: "ok" };
			}}
			persistOverride={async () => {
				const record: Preset = {
					id: presetId,
					type: "preset",
					title: name.trim() || "Animation Preset",
					filePath: selectedPath ?? "",
					description: description.trim() || `Animation preset: ${name.trim()}`,
					...(descriptionImage.trim()
						? { descriptionImage: descriptionImage.trim() }
						: {}),
					icon: resolvedIcon ?? { type: "text", param: { text: "ANIM" } },
				};
				await upsertLocalPreset(record);
				await notifyPanelsAfterPresetSave(window, {
					sourceSurfaceId: "dialog-animation-preset",
					catalogRefIds: [record.id],
				});
				return { status: "ok" };
			}}
			renderForm={() => (
				<AuthoringGrid>
					<AuthoringSection title={t("presetTool.form.presetName")} span={6}>
						<Input
							value={name}
							onChange={(e) => setName(e.currentTarget.value)}
							uiSize="md"
							disabled={busy}
						/>
					</AuthoringSection>

					<AuthoringField span={6}>
						<div className={stepCardClass}>
							<StepHeader
								number={1}
								title={t("animationPreset.step1.title")}
								description={t("animationPreset.step1.desc")}
							/>
						</div>
					</AuthoringField>

					<AuthoringField span={6}>
						<FolderPathSection
							displayPath={displayPath}
							customScanPath={customScanPath}
							busy={busy}
							pathCopied={pathCopied}
							onBrowseFolder={browseFolder}
							onCopyPath={copyPath}
							onResetPath={resetPath}
							t={t}
						/>
					</AuthoringField>

					<AuthoringField span={6}>
						<AnimationStatusSection
							status={status}
							busy={busy}
							displayPath={displayPath}
							detectedNewFile={detectedNewFile}
							message={message}
							onOpenSaveDialog={openSaveDialog}
							t={t}
							getShortPath={getShortPath}
						/>
					</AuthoringField>

					<AuthoringField>
						<ArchiveDetailsSection
							description={description}
							onDescriptionChange={setDescription}
							descriptionImage={descriptionImage}
							onDescriptionImageChange={setDescriptionImage}
							browseDir={readUserHomeOrFallback()}
						/>
					</AuthoringField>

					<AuthoringSection title={t("presetTool.form.icon")} span={6}>
						<PresetIconEditor
							draft={iconDraft}
							onChange={setIconDraft}
							browseDir={readUserHomeOrFallback()}
							preview={
								<FramedPresetGlyph
									preset={previewPreset}
									boxClass="h-full w-full"
								/>
							}
						/>
					</AuthoringSection>
				</AuthoringGrid>
			)}
		/>
	);
}
