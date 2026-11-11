import type { TFunction } from "i18next";
import { AlertCircle, FolderOpen } from "lucide-react";
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
import { assertPresetAssetPresent } from "@/management/preset/asset-verification";
import { hostSafeFileName } from "@/management/preset/authoring/host-safe-file-name";
import { authorCodePresetAsset } from "@/management/preset/authoring/write-preset-asset";
import { ArchiveDetailsSection } from "@/management/preset/catalog-add/ArchiveDetailsSection";
import { parseRootPathsFromSettingsJson } from "@/management/preset/catalog-add/parse-root-paths";
import { PresetIconEditor } from "@/management/preset/components/IconEditor";
import type { Preset, PresetIcon } from "@/management/preset/contract";
import { CodeEditor } from "@/management/preset/editor/Code";
import {
	createPresetIconDraft,
	presetIconDraftToPresetIcon,
} from "@/management/preset/icon-editor";
import {
	AuthoringField,
	AuthoringGrid,
	AuthoringSection,
	AuthoringSegment,
} from "@/management/preset/tool-shell/archive-layout";
import { upsertLocalPreset } from "@/management/preset/use-cases";
import { FramedPresetGlyph } from "@/management/preset/workspace/glyph";
import {
	canUseCepNodeFileBrowser,
	createCepNodeFileBrowserService,
} from "@/management/storage/file-browser-service";
import { createInstanceId } from "@/management/storage/ids";
import { readSettings } from "@/management/workspace/persistence/store";
import { notifyPanelsAfterPresetSave } from "@/management/workspace/placement/notify-panels-after-preset-save";
import { Icon } from "@/shared/component";
import { Input } from "@/shared/component/fields/Input";
import { PathField } from "@/shared/component/fields/PathField";
import { css } from "@/styled-system/css";

type CodeType = "extendscript" | "expression";
type PresetStatus = "idle" | "saving" | "success" | "error";

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

const bannerTitleClass = css({
	fontWeight: "semibold",
});

const previewColumnClass = css({
	display: "flex",
	minWidth: 0,
	flexDirection: "column",
	gap: "1",
});

const previewLabelClass = css({
	fontSize: "text-xs",
	fontWeight: "medium",
	textTransform: "uppercase",
	letterSpacing: "wide",
	color: "text.muted",
});

const previewBoxBaseClass = css({
	fontFamily: "mono",
	fontSize: "text-xs",
	color: "text.primary",
	overflowWrap: "break-all",
	borderRadius: "shell-sm",
	backgroundColor: "surface.widget",
	paddingInline: "2",
	paddingBlock: "1",
});

const previewBoxWarnClass = css({
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "status.warning/50",
});

const actionStatusColumnClass = css({
	display: "flex",
	minWidth: 0,
	flexDirection: "column",
	gap: "3",
});

function StatusBanner({
	variant,
	icon: BannerIcon,
	children,
}: {
	variant: "success" | "warning" | "error";
	icon: typeof AlertCircle;
	children: React.ReactNode;
}): JSX.Element {
	return (
		<div className={statusBannerClass(variant)} role="alert">
			<Icon icon={BannerIcon} size={14} aria-hidden />
			<span className={bannerTitleClass}>{children}</span>
		</div>
	);
}

function SavePreviewSection({
	fullFilePath,
	fileExists,
	t,
}: {
	fullFilePath: string;
	fileExists: boolean;
	t: TFunction;
}): JSX.Element | null {
	if (!fullFilePath) return null;
	return (
		<div className={previewColumnClass}>
			<span className={previewLabelClass}>
				{t("codePreset.savePreview", "Save preview")}
			</span>
			<div
				className={
					fileExists
						? `${previewBoxBaseClass} ${previewBoxWarnClass}`
						: previewBoxBaseClass
				}
			>
				{fullFilePath}
			</div>
			{fileExists ? (
				<StatusBanner variant="warning" icon={AlertCircle}>
					{t(
						"codePreset.status.fileExists",
						"File already exists — will be overwritten",
					)}
				</StatusBanner>
			) : null}
		</div>
	);
}

function CodeActionStatusSection({
	status,
	message,
	t,
}: {
	status: PresetStatus;
	message: string | null;
	t: TFunction;
}): JSX.Element | null {
	return (
		<div className={actionStatusColumnClass}>
			{status === "success" ? (
				<StatusBanner variant="success" icon={AlertCircle}>
					{t("codePreset.status.success", "Preset saved successfully!")}
				</StatusBanner>
			) : null}
			{status === "error" && message ? (
				<StatusBanner variant="error" icon={AlertCircle}>
					{message}
				</StatusBanner>
			) : null}
		</div>
	);
}

const buildExpressionScript = (expression: string): string => {
	const encoded = JSON.stringify(expression);
	return [
		"// ty-plus: expression preset",
		"(function () {",
		"  var comp = app.project.activeItem;",
		"  if (!(comp instanceof CompItem)) { alert('Please select a composition.'); return; }",
		"  var props = comp.selectedProperties;",
		"  if (!props || props.length === 0) { alert('Please select at least one property to apply the expression.'); return; }",
		"  app.beginUndoGroup('ty-plus: apply expression');",
		"  try {",
		"    var count = 0;",
		"    for (var i = 0; i < props.length; i++) {",
		"      var p = props[i];",
		"      if (p.canSetExpression) {",
		`        p.expression = ${encoded};`,
		"        p.expressionEnabled = true;",
		"        count++;",
		"      }",
		"    }",
		"    if (count === 0) alert('Selected properties do not accept expressions.');",
		"  } catch (e) {",
		"    alert('Error applying expression: ' + e.toString());",
		"  } finally {",
		"    app.endUndoGroup();",
		"  }",
		"})();",
		"",
	].join("\n");
};

const pathSeparator = (displayPath: string): string =>
	displayPath.includes("\\") ? "\\" : "/";

// Mirrors the host-side file-name sanitizer so the preview and the
// "file already exists" probe name the file that is actually written.
const sanitizeFileName = (name: string): string => hostSafeFileName(name);

const resolveCodeDisplayPath = (
	saveDir: string,
	defaultSavePath: string,
): string => saveDir.trim() || defaultSavePath;

const buildCodePresetFilePath = (displayPath: string, name: string): string => {
	if (!displayPath) return "";
	const safeName = sanitizeFileName(name);
	const fileName = `${safeName || "CodePreset"}.jsx`;
	const sep = pathSeparator(displayPath);
	return `${displayPath}${sep}${fileName}`;
};

const fileNameFromPath = (fullFilePath: string): string => {
	if (!fullFilePath) return "";
	const sep = fullFilePath.includes("\\") ? "\\" : "/";
	const idx = fullFilePath.lastIndexOf(sep);
	return idx >= 0 ? fullFilePath.slice(idx + 1) : fullFilePath;
};

// Load `scriptRoot` from CEP settings and derive the default code-preset save path.
function useCodeDefaultSavePath(): string {
	const [scriptRoot, setScriptRoot] = useState("");
	useEffect(() => {
		void (async () => {
			try {
				const raw = await readSettings(window);
				const rawArg = raw ?? undefined;
				const roots = parseRootPathsFromSettingsJson(rawArg);
				if (roots.scriptRoot) {
					setScriptRoot(roots.scriptRoot);
				}
			} catch {
				// ignore — fall back to empty path
			}
		})();
	}, []);
	return useMemo(() => {
		const root = scriptRoot.trim();
		if (!root) return "";
		const sep = root.includes("\\") ? "\\" : "/";
		return `${root}${sep}ty-plus${sep}code-presets`;
	}, [scriptRoot]);
}

// Watch `displayPath`/`fileName` and report whether the destination file already exists.
function useCodeFileExists(displayPath: string, fileName: string): boolean {
	const [fileExists, setFileExists] = useState(false);
	useEffect(() => {
		if (!displayPath || !fileName || !canUseCepNodeFileBrowser(window)) {
			setFileExists(false);
			return;
		}
		let cancelled = false;
		void (async () => {
			try {
				const service = createCepNodeFileBrowserService({ win: window });
				const entries = await service.listDirectory(displayPath);
				if (cancelled) return;
				setFileExists(
					entries.some((e) => e.name === fileName && !e.isDirectory),
				);
			} catch {
				if (!cancelled) setFileExists(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [displayPath, fileName]);
	return fileExists;
}

type CodePresetSaveInput = {
	name: string;
	codeType: CodeType;
	code: string;
	description: string;
	descriptionImage: string;
	resolvedIcon: PresetIcon | null;
	presetId: string;
	fullFilePath: string;
	displayPath: string;
};

// Owns the save flow + busy/status/message state for the code-preset dialog.
function useCodePresetSave(input: CodePresetSaveInput): {
	busy: boolean;
	status: PresetStatus;
	message: string | null;
	canSave: boolean;
	handleSave: () => Promise<void>;
} {
	const {
		name,
		codeType,
		code,
		description,
		descriptionImage,
		resolvedIcon,
		presetId,
		displayPath,
	} = input;
	const [status, setStatus] = useState<PresetStatus>("idle");
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState<string | null>(null);

	const canSave = name.trim().length > 0 && code.trim().length > 0 && !busy;

	const handleSave = useCallback(async (): Promise<void> => {
		if (!canSave) return;
		setBusy(true);
		setStatus("idle");
		setMessage(null);
		try {
			const scriptContent =
				codeType === "expression" ? buildExpressionScript(code) : code;

			// Issue #160: one authoring sequence for every text asset —
			// path authority, normal write, elevation only on a permission
			// failure, then read-back verification.
			const result = await authorCodePresetAsset(window, {
				name: name.trim(),
				saveDir: displayPath,
				code: scriptContent,
				presetId,
			});
			if (!result.ok) {
				setStatus("error");
				setMessage(result.error.message);
				return;
			}

			const writtenPath = result.presetPath;
			// Issue #130: re-verify the just-written asset before persisting
			// the catalog/workspace record, so a dropped or elevated-and-
			// declined write can never leave a ghost record.
			await assertPresetAssetPresent({
				win: window,
				presetId,
				type: "script",
				filePath: writtenPath,
			});

			const record: Preset = {
				id: presetId,
				type: "script",
				title: name.trim(),
				filePath: writtenPath,
				description: description.trim() || `Code preset: ${name.trim()}`,
				...(descriptionImage.trim()
					? { descriptionImage: descriptionImage.trim() }
					: {}),
				icon:
					resolvedIcon ??
					(codeType === "expression"
						? { type: "text", param: { text: "EXPR" } }
						: { type: "text", param: { text: "CODE" } }),
				data: { codeKind: codeType },
			};
			await upsertLocalPreset(record);
			await notifyPanelsAfterPresetSave(window, {
				sourceSurfaceId: "dialog-code-preset",
				catalogRefIds: [record.id],
			});
			setStatus("success");
		} catch (e) {
			setStatus("error");
			setMessage(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	}, [
		canSave,
		code,
		codeType,
		description,
		descriptionImage,
		displayPath,
		name,
		presetId,
		resolvedIcon,
	]);

	return { busy, status, message, canSave, handleSave };
}

export function Dialog(): JSX.Element {
	const { t } = useTranslation("presets");
	const [name, setName] = useState(() => t("presetTool.code.defaultName"));
	const [codeType, setCodeType] = useState<CodeType>("extendscript");
	const [code, setCode] = useState("// Write your script here\n");
	const [saveDir, setSaveDir] = useState("");
	const [iconDraft, setIconDraft] = useState(() =>
		createPresetIconDraft(codeType === "expression" ? "EXPR" : "CODE"),
	);
	const [description, setDescription] = useState("");
	const [descriptionImage, setDescriptionImage] = useState("");

	const presetId = createInstanceId();
	const resolvedIcon = presetIconDraftToPresetIcon(iconDraft);
	// Issue #160: the record must point at the path the writer actually
	// verified, not at the React-side preview string.
	const authoredPathRef = useRef("");

	const defaultSavePath = useCodeDefaultSavePath();
	const displayPath = resolveCodeDisplayPath(saveDir, defaultSavePath);
	const fullFilePath = buildCodePresetFilePath(displayPath, name);
	const fileName = fileNameFromPath(fullFilePath);
	const fileExists = useCodeFileExists(displayPath, fileName);

	const { busy, status, message, canSave, handleSave } = useCodePresetSave({
		name,
		codeType,
		code,
		description,
		descriptionImage,
		resolvedIcon,
		presetId,
		fullFilePath,
		displayPath,
	});

	const previewPreset: Preset = {
		id: "icon-preview",
		type: "script",
		title: name.trim() || "Code Preset",
		filePath: "ty-plus://icon-preview",
		icon:
			resolvedIcon ??
			(codeType === "expression"
				? { type: "text", param: { text: "EXPR" } }
				: { type: "text", param: { text: "CODE" } }),
	};

	const handleBrowseFolder = (): void => {
		selectFolder(
			displayPath || readUserHomeOrFallback(),
			"Select save folder",
			(folder: string) => {
				if (folder) setSaveDir(folder);
			},
		);
	};

	return (
		<ToolDialog
			surfaceId="dialog-code-preset"
			title={t("presetTool.code.title")}
			type="script"
			description={t("presetTool.code.lead")}
			defaultName={t("presetTool.code.defaultName")}
			iconText="CODE"
			resolveBrowseStartDir={readUserHomeOrFallback}
			entryPoint="tool-shell:code"
			fields={[]}
			beforeSave={async ({ authoring }) => {
				const scriptContent =
					codeType === "expression" ? buildExpressionScript(code) : code;
				const result = await authoring.code({
					name: name.trim(),
					saveDir: displayPath,
					code: scriptContent,
					presetId,
				});
				if (!result.ok) {
					throw new Error(result.error.message);
				}
				authoredPathRef.current = result.presetPath;
				return { filePath: result.presetPath, status: "ok" };
			}}
			buildFilePath={() => {
				if (!name.trim() || !code.trim()) return "";
				return fullFilePath;
			}}
			persistOverride={async () => {
				const record: Preset = {
					id: presetId,
					type: "script",
					title: name.trim(),
					// The path the writer verified, never the preview string.
					filePath: authoredPathRef.current || fullFilePath,
					description: description.trim() || `Code preset: ${name.trim()}`,
					...(descriptionImage.trim()
						? { descriptionImage: descriptionImage.trim() }
						: {}),
					icon:
						resolvedIcon ??
						(codeType === "expression"
							? { type: "text", param: { text: "EXPR" } }
							: { type: "text", param: { text: "CODE" } }),
					data: { codeKind: codeType },
				};
				await upsertLocalPreset(record);
				await notifyPanelsAfterPresetSave(window, {
					sourceSurfaceId: "dialog-code-preset",
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

					<AuthoringSection
						title={t("codePreset.saveLocation", "Save location")}
						span={6}
					>
						<PathField
							value={saveDir}
							onChange={(next) => setSaveDir(next)}
							onBrowse={handleBrowseFolder}
							browseAriaLabel="Browse folder"
							browseSlot={<Icon icon={FolderOpen} size={16} aria-hidden />}
							placeholder={defaultSavePath || "System default"}
							uiSize="md"
							disabled={busy}
						/>
					</AuthoringSection>

					<AuthoringSection
						title={t("codePreset.codeType", "Code type")}
						span={6}
					>
						<AuthoringSegment
							value={codeType}
							onChange={(v) => setCodeType(v as CodeType)}
							options={[
								{
									value: "extendscript",
									label: t("codePreset.type.script", "Script"),
								},
								{
									value: "expression",
									label: t("codePreset.type.expression", "Expression"),
								},
							]}
						/>
					</AuthoringSection>

					<AuthoringField span={6}>
						<div className={previewColumnClass}>
							<span className={previewLabelClass}>
								{codeType === "expression"
									? t("codePreset.editor.expression", "Expression")
									: t("codePreset.editor.script", "Script code (.jsx)")}
							</span>
							<CodeEditor
								value={code}
								onChange={setCode}
								language={codeType}
								className={css({ width: "full" })}
							/>
						</div>
					</AuthoringField>

					<AuthoringField span={6}>
						<SavePreviewSection
							fullFilePath={fullFilePath}
							fileExists={fileExists}
							t={t}
						/>
						<CodeActionStatusSection status={status} message={message} t={t} />
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
