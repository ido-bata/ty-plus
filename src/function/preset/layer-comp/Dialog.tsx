import { AlertCircle, FolderOpen } from "lucide-react";
import { type JSX, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { selectFolder } from "@/management/ae/cep/dialog-shim/bolt";
import { readUserHomeOrFallback, ToolDialog } from "@/management/preset";
import { hostSafeFileName } from "@/management/preset/authoring/host-safe-file-name";
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
	AuthoringSegment,
} from "@/management/preset/tool-shell/archive-layout";
import { upsertLocalPreset } from "@/management/preset/use-cases";
import { FramedPresetGlyph } from "@/management/preset/workspace/glyph";
import { createInstanceId } from "@/management/storage/ids";
import { readSettings } from "@/management/workspace/persistence/store";
import { notifyPanelsAfterPresetSave } from "@/management/workspace/placement/notify-panels-after-preset-save";
import { Icon } from "@/shared/component";
import { Input } from "@/shared/component/fields/Input";
import { PathField } from "@/shared/component/fields/PathField";
import { css } from "@/styled-system/css";

type LayerCompType = "layer" | "comp";

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

const headerColumnFullClass = css({
	display: "flex",
	minWidth: 0,
	flex: "1",
	flexDirection: "column",
	gap: "2",
});

const headerColumnClass = css({
	display: "flex",
	minWidth: 0,
	flexDirection: "column",
	gap: "1",
});

const step3ColumnClass = css({
	display: "flex",
	minWidth: 0,
	flexDirection: "column",
	gap: "2",
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

const previewBoxClass = css({
	fontFamily: "mono",
	fontSize: "text-xs",
	color: "text.primary",
	overflowWrap: "break-all",
	borderRadius: "shell-sm",
	backgroundColor: "surface.widget",
	paddingInline: "2",
	paddingBlock: "1",
});

const hintRowClass = css({
	display: "flex",
	alignItems: "flex-start",
	gap: "2",
	fontSize: "text-xs",
	color: "text.muted",
});

export function Dialog(): JSX.Element {
	const { t } = useTranslation("presets");
	const [name, setName] = useState(() => t("presetTool.layerComp.defaultName"));
	const [presetType, setPresetType] = useState<LayerCompType>("layer");
	const [saveDir, setSaveDir] = useState("");
	const [iconDraft, setIconDraft] = useState(() =>
		createPresetIconDraft(presetType === "layer" ? "LAYER" : "COMP"),
	);
	const [description, setDescription] = useState("");
	const [descriptionImage, setDescriptionImage] = useState("");

	const presetId = useMemo(() => createInstanceId(), []);
	const resolvedIcon = presetIconDraftToPresetIcon(iconDraft);
	// Issue #160: the record must point at the path the writer actually
	// verified, not at the React-side preview string.
	const authoredPathRef = useRef("");

	const [scriptRoot, setScriptRoot] = useState("");
	useEffect(() => {
		void (async () => {
			try {
				const raw = await readSettings(window);
				let rawArg: string | undefined;
				if (raw != null) rawArg = raw;
				const roots = parseRootPathsFromSettingsJson(rawArg);
				if (roots.scriptRoot) {
					setScriptRoot(roots.scriptRoot);
				}
			} catch {
				// ignore
			}
		})();
	}, []);

	const defaultSavePath = useMemo(() => {
		const root = scriptRoot.trim();
		if (!root) return "";
		const sep = root.includes("\\") ? "\\" : "/";
		const subfolder = presetType === "layer" ? "layer-presets" : "comp-presets";
		return `${root}${sep}ty-plus${sep}${subfolder}`;
	}, [scriptRoot, presetType]);

	const displayPath = saveDir.trim() || defaultSavePath;

	// Mirror host-side safeName() so the previewed filePath matches what the
	// host actually writes (see host-bundle.ext.ts `safeName`).
	const safeNamePreview = hostSafeFileName(name);
	const fileName = `${safeNamePreview || "LayerCompPreset"}.jsx`;
	const sep = displayPath.includes("\\") ? "\\" : "/";
	const fullFilePath = displayPath ? `${displayPath}${sep}${fileName}` : "";

	const previewIconText = presetType === "layer" ? "LAYER" : "COMP";

	const previewPreset: Preset = {
		id: "icon-preview",
		type: "script",
		title: name.trim() || t("presetTool.layerComp.defaultName"),
		filePath: "ty-plus://icon-preview",
		icon: resolvedIcon ?? {
			type: "text",
			param: { text: previewIconText },
		},
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
			surfaceId="dialog-layer-comp-preset"
			title={t("presetTool.layerComp.title")}
			type="script"
			description={t("presetTool.layerComp.lead")}
			defaultName={t("presetTool.layerComp.defaultName")}
			iconText={previewIconText}
			resolveBrowseStartDir={readUserHomeOrFallback}
			entryPoint="tool-shell:layer-comp"
			fields={[]}
			beforeSave={async ({ authoring }) => {
				const result = await authoring.layerComp({
					name: name.trim(),
					type: presetType,
					saveDir: displayPath,
					presetId,
				});
				if (!result.ok) {
					throw new Error(result.error.message);
				}
				authoredPathRef.current = result.presetPath;
				return { filePath: result.presetPath, status: "ok" };
			}}
			buildFilePath={() => {
				if (!name.trim()) return "";
				return fullFilePath;
			}}
			persistOverride={async () => {
				const recordTitle = name.trim();
				const recordDescription =
					description.trim() || `Layer/comp preset: ${name.trim()}`;
				const resolvedIconValue = resolvedIcon ?? {
					type: "text" as const,
					param: { text: previewIconText },
				};
				const record: Preset = {
					id: presetId,
					type: "script",
					title: recordTitle,
					// The path the writer verified, never the preview string.
					filePath: authoredPathRef.current || fullFilePath,
					description: recordDescription,
					...(descriptionImage.trim()
						? { descriptionImage: descriptionImage.trim() }
						: {}),
					icon: resolvedIconValue,
					data: { layerCompKind: presetType },
				};
				await upsertLocalPreset(record);
				await notifyPanelsAfterPresetSave(window, {
					sourceSurfaceId: "dialog-layer-comp-preset",
					catalogRefIds: [record.id],
				});
				return { status: "ok" };
			}}
			renderForm={() => (
				<AuthoringGrid>
					{/* Preset name */}
					<AuthoringSection title={t("presetTool.form.presetName")} span={6}>
						<Input
							value={name}
							onChange={(e) => setName(e.currentTarget.value)}
							uiSize="md"
						/>
					</AuthoringSection>

					{/* Step 1 - Preset type */}
					<AuthoringField span={6}>
						<div className={stepCardClass}>
							<div className={headerRowClass}>
								<span className={stepNumberClass}>1</span>
								<div className={headerColumnFullClass}>
									<span className={stepTitleClass}>
										{t("layerCompPreset.step1.title", "Preset type")}
									</span>
									<AuthoringSegment
										value={presetType}
										onChange={(v) => setPresetType(v as LayerCompType)}
										options={[
											{
												value: "layer",
												label: t("layerCompPreset.type.layer", "Layer"),
											},
											{
												value: "comp",
												label: t("layerCompPreset.type.comp", "Composition"),
											},
										]}
									/>
								</div>
							</div>
						</div>
					</AuthoringField>

					{/* Step 2 - AE source */}
					<AuthoringField span={6}>
						<div className={stepCardClass}>
							<div className={headerRowClass}>
								<span className={stepNumberClass}>2</span>
								<div className={headerColumnClass}>
									<span className={stepTitleClass}>
										{t(
											"layerCompPreset.step2.title",
											"Prepare in After Effects",
										)}
									</span>
									<span className={stepDescClass}>
										{presetType === "layer"
											? t(
													"layerCompPreset.desc.layer",
													"Select the layers you want to save. Project must be saved first.",
												)
											: t(
													"layerCompPreset.desc.comp",
													"Open the composition you want to save. Project must be saved first.",
												)}
									</span>
								</div>
							</div>
						</div>
					</AuthoringField>

					{/* Step 3 - Save location */}
					<AuthoringField span={6}>
						<div className={stepCardClass}>
							<div className={step3ColumnClass}>
								<div className={headerRowClass}>
									<span className={stepNumberClass}>3</span>
									<div className={headerColumnFullClass}>
										<span className={stepTitleClass}>
											{t("layerCompPreset.step3.title", "Save location")}
										</span>
										<PathField
											value={saveDir}
											onChange={(next) => setSaveDir(next)}
											onBrowse={handleBrowseFolder}
											browseAriaLabel="Browse folder"
											browseSlot={
												<Icon icon={FolderOpen} size={16} aria-hidden />
											}
											placeholder={defaultSavePath || "System default"}
											uiSize="md"
										/>
										{fullFilePath ? (
											<div className={previewColumnClass}>
												<span className={previewLabelClass}>
													{t("layerCompPreset.savePreview", "Save preview")}
												</span>
												<div className={previewBoxClass}>{fullFilePath}</div>
											</div>
										) : null}
										<div className={hintRowClass}>
											<Icon icon={AlertCircle} size={14} aria-hidden />
											<span>
												{t(
													"layerCompPreset.hint.saveButton",
													'Press "Create" at the bottom of the dialog to save.',
												)}
											</span>
										</div>
									</div>
								</div>
							</div>
						</div>
					</AuthoringField>

					{/* Details */}
					<AuthoringField>
						<ArchiveDetailsSection
							description={description}
							onDescriptionChange={setDescription}
							descriptionImage={descriptionImage}
							onDescriptionImageChange={setDescriptionImage}
							browseDir={readUserHomeOrFallback()}
						/>
					</AuthoringField>

					{/* Icon */}
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
