import { ChevronDown, FolderOpen, Plus, Trash2 } from "lucide-react";
import { type JSX, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { readUserHomeOrFallback } from "@/management/preset/catalog-add/browse-start-dir";
import { PresetIconEditor } from "@/management/preset/components/IconEditor";
import type { Preset, PresetType } from "@/management/preset/contract";
import type {
	IconRule,
	IconRuleFilter,
} from "@/management/preset/group-catalog";
import type { PresetIconEditorDraft } from "@/management/preset/icon-editor";
import {
	createPresetIconDraft,
	presetIconDraftToPresetIcon,
} from "@/management/preset/icon-editor";
import { persistFolderGroupPreset } from "@/management/preset/persist-folder-group";
import {
	AuthoringField,
	AuthoringGrid,
	AuthoringSection,
} from "@/management/preset/tool-shell/archive-layout";
import { Dialog } from "@/management/preset/tool-shell/Dialog";
import { FolderDirectoryPicker } from "@/management/preset/tool-shell/FolderDirectoryPicker";
import { listPresets } from "@/management/preset/use-cases";
import { FramedPresetGlyph } from "@/management/preset/workspace/glyph";
import { AccordionSection } from "@/management/setting/dialog/sections/AccordionSection";
import { Icon } from "@/shared/component";
import { Button } from "@/shared/component/controls/Button";
import { Input } from "@/shared/component/fields/Input";
import { PathField } from "@/shared/component/fields/PathField";
import { css } from "@/styled-system/css";
import { ConditionRuleCard } from "./ConditionRuleCard";
import { FolderScanDepthSelector } from "./FolderScanDepthSelector";

/**
 * Create a preset group: select multiple presets from catalog or scan a folder.
 * Supports conditional icon rules based on preset type, name pattern, or specific selections.
 */
const escapeRegex = (value: string): string =>
	value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const columnClass = css({
	display: "flex",
	flexDirection: "column",
	gap: "2",
});

const rulesColumnClass = css({
	display: "flex",
	flexDirection: "column",
	gap: "3",
});

const buttonRowClass = css({
	display: "flex",
	alignItems: "center",
	gap: "2",
});

const baseIconCardClass = css({
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.widget",
	padding: "3",
});

const baseIconHeaderClass = css({
	display: "flex",
	alignItems: "center",
	justifyContent: "space-between",
});

const baseIconLabelClass = css({
	fontSize: "xs",
	fontWeight: "medium",
	textTransform: "uppercase",
	letterSpacing: "wide",
	color: "text.muted",
});

const baseIconEditorClass = css({
	marginTop: "3",
});

const pathRowClass = css({
	display: "flex",
	alignItems: "flex-start",
	gap: "2",
});

export function GroupDialog(): JSX.Element {
	const { t } = useTranslation("presets");
	// Base icon for icon rules (draft state)
	const [baseIconDraft, setBaseIconDraft] = useState<PresetIconEditorDraft>(
		createPresetIconDraft,
	);

	// Paths list for group members is stored as newline-separated value in field 'paths'
	// Condition rules: additive list where each rule has a namePattern and an icon draft
	const [conditionRules, setConditionRules] = useState<
		{
			id: string;
			filterType: "name" | "path" | "preset" | "presetType";
			pattern: string;
			matchMode?: "regex" | "contains" | "startsWith" | "endsWith";
			presetType?: PresetType;
			draft: PresetIconEditorDraft;
		}[]
	>([
		{
			id: `init-${Date.now()}`,
			filterType: "name",
			pattern: "",
			matchMode: "contains",
			draft: createPresetIconDraft(),
		},
	]);

	// Candidate presets and directories computed from selected paths
	const [candidatePresets, setCandidatePresets] = useState<
		{ id: string; title: string; filePath: string }[]
	>([]);
	const [candidateDirs, setCandidateDirs] = useState<string[]>([]);

	const _prevPathsRef = useRef<string | null>(null);
	const lastDetectKeyRef = useRef<string | null>(null);

	// Triggered by user action to detect candidates from current paths
	const detectCandidates = async (paths: string[]) => {
		const execDetectCandidates = async () => {
			if (paths.length === 0) {
				setCandidatePresets([]);
				setCandidateDirs([]);
				return;
			}
			const catalog = await listPresets();
			const matched = catalog.filter((p) => {
				const pfp = (p.filePath || "").replace(/\//g, "\\");
				const pfpNorm = pfp.toLowerCase();
				return paths.some((path) => {
					const pathNorm = path.replace(/\//g, "\\").toLowerCase();
					return pfpNorm.includes(pathNorm);
				});
			});
			// Fallback: if no matches found, surface top catalog entries so user can still pick
			let presets = matched.map((p) => ({
				id: p.id,
				title: p.title,
				filePath: p.filePath || "",
			}));
			const dirsSet = new Set<string>();
			if (matched.length === 0) {
				const sample = catalog.slice(0, 50);
				presets = sample.map((p) => ({
					id: p.id,
					title: p.title,
					filePath: p.filePath || "",
				}));
				for (const samplePreset of sample) {
					const fp = samplePreset.filePath || "";
					const idx = fp.lastIndexOf("\\");
					if (idx >= 0) dirsSet.add(fp.slice(0, idx));
					else dirsSet.add(fp);
				}
			} else {
				for (const preset of matched) {
					const fp = preset.filePath || "";
					const idx = fp.lastIndexOf("\\");
					if (idx >= 0) dirsSet.add(fp.slice(0, idx));
					else dirsSet.add(fp);
				}
			}
			setCandidatePresets(presets);
			setCandidateDirs(Array.from(dirsSet));

			// Auto-add a preset-type rule when presets detected, but avoid duplicates
			const idsKey = presets
				.map((x) => x.id)
				.slice(0, 20)
				.join("|");
			if (idsKey && lastDetectKeyRef.current !== idsKey) {
				const sampleIds = presets.map((x) => x.id).slice(0, 10);
				const autoDetectRulesUpdater = (
					prev: {
						id: string;
						filterType: "name" | "path" | "preset" | "presetType";
						pattern: string;
						matchMode?: "regex" | "contains" | "startsWith" | "endsWith";
						presetType?: PresetType;
						draft: PresetIconEditorDraft;
					}[],
				) => {
					const sampleIdsSet = new Set(sampleIds);
					const hasOverlap = prev.some(
						(r) =>
							r.filterType === "preset" &&
							r.pattern &&
							r.pattern.split(/\s*,\s*/).some((id) => sampleIdsSet.has(id)),
					);
					if (hasOverlap) return prev;
					return [
						...prev,
						{
							id: `det-${Date.now()}`,
							filterType: "preset" as const,
							pattern: sampleIds.join(","),
							draft: createPresetIconDraft(),
						},
					];
				};
				try {
					lastDetectKeyRef.current = idsKey;
					setConditionRules(autoDetectRulesUpdater);
				} catch {
					// ignore
				}
			}
		};
		try {
			await execDetectCandidates();
		} catch {
			setCandidatePresets([]);
			setCandidateDirs([]);
		}
	};

	return (
		<Dialog
			surfaceId="dialog-preset-add-folder"
			title={t("group.title")}
			type="preset"
			description={t("group.lead")}
			defaultName={t("group.defaultName")}
			iconText="GROUP"
			pathBrowse={{ fieldKey: "path", mode: "folder" }}
			resolveBrowseStartDir={readUserHomeOrFallback}
			renderForm={(ctx) => {
				const pathLines = ((ctx.values.paths ?? "") as string)
					.split(/\r?\n/)
					.map((l) => l.trim());
				return (
					<AuthoringGrid>
						{/* 1. Group name (no section label) */}
						<AuthoringField span={6}>
							<Input
								label={t("group.fields.groupName")}
								value={ctx.name}
								onChange={(event) => ctx.setName(event.currentTarget.value)}
								uiSize="md"
								disabled={ctx.busy}
							/>
						</AuthoringField>
						{/* 2. Group Members - Directory browser + Paths list */}
						<AuthoringSection title="" span={6}>
							<div className={columnClass}>
								<FolderScanDepthSelector
									recursive={ctx.values.recursive ?? "false"}
									onRecursiveChange={(v) =>
										ctx.setValue(
											"recursive",
											v === "recursive" ? "true" : "false",
										)
									}
								/>
								{/* Directory browser for adding files or folders */}
								<FolderDirectoryPicker
									value={""}
									selectedPaths={pathLines.filter(Boolean)}
									onToggleSelected={(p, selected) => {
										const lines = (ctx.values.paths ?? "")
											.split(/\r?\n/)
											.map((l) => l.trim())
											.filter(Boolean);
										const has = lines.includes(p);
										if (selected && !has) lines.push(p);
										if (!selected && has) lines.splice(lines.indexOf(p), 1);
										ctx.setValue("paths", lines.join("\n"));
										detectCandidates(lines.filter(Boolean));
									}}
									onChange={(p) => {
										const lines = (ctx.values.paths ?? "")
											.split(/\r?\n/)
											.map((l) => l.trim())
											.filter(Boolean);
										if (!lines.includes(p)) lines.push(p);
										ctx.setValue("paths", lines.join("\n"));
										detectCandidates(lines.filter(Boolean));
									}}
									selectionMode="both"
									label="Browse files & folders to add"
									candidatePresets={candidatePresets}
									candidateDirs={candidateDirs}
									onPickPreset={(id) => {
										const next = conditionRules.slice();
										const idx = next.findIndex(
											(r) => r.filterType === "preset",
										);
										if (idx === -1) {
											next.push({
												id: `auto-${Date.now()}`,
												filterType: "preset",
												pattern: id,
												draft: createPresetIconDraft(),
											});
										} else {
											const currentIds = next[idx].pattern
												.split(/\s*,\s*/)
												.filter(Boolean);
											const nextPattern = currentIds.includes(id)
												? currentIds
														.filter((currentId) => currentId !== id)
														.join(",")
												: [...currentIds, id].join(",");
											next[idx] = {
												...next[idx],
												pattern: nextPattern,
											};
										}
										setConditionRules(next);
									}}
								/>

								<div className={buttonRowClass}>
									<Button
										type="button"
										variant="outline"
										fullWidth
										onClick={() => {
											const lines = pathLines.slice();
											lines.push("");
											ctx.setValue("paths", lines.join("\n"));
											detectCandidates(lines.filter(Boolean));
										}}
									>
										<Plus size={16} /> Add path
									</Button>
									<Button
										type="button"
										variant="ghost"
										onClick={() => {
											detectCandidates(pathLines.filter(Boolean));
										}}
									>
										<ChevronDown size={14} /> Detect candidates
									</Button>
								</div>

								{/* Paths list: one folder path per item (preserve empty for add) */}
								<div className={columnClass}>
									{pathLines.map((p, idx) => {
										const stableKey = `path-${p.length}-${p.slice(0, 16)}`;
										return (
											<div key={stableKey} className={pathRowClass}>
												<PathField
													value={p}
													onChange={(next) => {
														const raw = ((ctx.values.paths ?? "") as string)
															.split(/\r?\n/)
															.map((l) => l.trim());
														raw[idx] = next;
														ctx.setValue(
															"paths",
															raw.filter(Boolean).join("\n"),
														);
														detectCandidates(raw.filter(Boolean));
													}}
													onBrowse={() => ctx.runPathBrowse(`paths[${idx}]`)}
													browseAriaLabel="Browse folder"
													browseSlot={
														<Icon icon={FolderOpen} size={16} aria-hidden />
													}
													placeholder="C:\path\folder"
													uiSize="md"
													disabled={ctx.busy}
												/>
												<Button
													variant="ghost"
													aria-label="Remove path"
													onClick={() => {
														const raw = ((ctx.values.paths ?? "") as string)
															.split(/\r?\n/)
															.map((l) => l.trim());
														raw.splice(idx, 1);
														ctx.setValue(
															"paths",
															raw.filter(Boolean).join("\n"),
														);
														detectCandidates(raw.filter(Boolean));
													}}
												>
													<Trash2 size={16} />
												</Button>
											</div>
										);
									})}
								</div>
							</div>
						</AuthoringSection>
						{/* 3. Icon Rules (Additive) */}
						<AuthoringSection title="Icon Rules" span={6}>
							<div className={rulesColumnClass}>
								<div className={baseIconCardClass}>
									<div className={baseIconHeaderClass}>
										<span className={baseIconLabelClass}>
											Base Icon (default for all presets)
										</span>
									</div>
									<div className={baseIconEditorClass}>
										<PresetIconEditor
											draft={baseIconDraft}
											onChange={setBaseIconDraft}
											label="Base icon"
											browseDir={readUserHomeOrFallback()}
											framed={true}
											preview={
												<FramedPresetGlyph
													preset={
														{
															id: "base-icon-preview",
															type: "preset" as const,
															title: "Preview",
															filePath: "ty-plus://base-icon-preview",
															icon: presetIconDraftToPresetIcon(
																baseIconDraft,
															) ?? { type: "text", param: { text: "?" } },
														} satisfies Preset
													}
													boxClass="h-full w-full"
												/>
											}
										/>
									</div>
								</div>

								<AccordionSection title="Rules" defaultOpen={true}>
									<div className={columnClass}>
										{conditionRules.map((r, i) => (
											<ConditionRuleCard
												key={r.id}
												rule={r}
												index={i}
												candidatePresets={candidatePresets}
												candidateDirs={candidateDirs}
												busy={ctx.busy}
												onChange={(next) => {
													const copy = conditionRules.slice();
													copy[i] = next;
													setConditionRules(copy);
												}}
												onRemove={() => {
													const copy = conditionRules.slice();
													copy.splice(i, 1);
													setConditionRules(copy);
												}}
											/>
										))}
										<Button
											type="button"
											variant="outline"
											fullWidth
											onClick={() => {
												setConditionRules([
													...conditionRules,
													{
														id: `${Date.now()}-${Math.random()}`,
														filterType: "name",
														pattern: "",
														matchMode: "contains",
														draft: createPresetIconDraft(),
													},
												]);
												const lines = (ctx.values.paths ?? "")
													.split(/\r?\n/)
													.map((l) => l.trim())
													.filter(Boolean);
												detectCandidates(lines);
											}}
										>
											<Plus size={16} /> Add rule
										</Button>
									</div>
								</AccordionSection>
							</div>
						</AuthoringSection>
						{/* 4. Group Icon */}
						<AuthoringSection title="Group Icon" span={6}>
							{ctx.icon}
						</AuthoringSection>
						{/* 5. Advanced Settings (Description + Image) */}
						<AuthoringSection title="Advanced Settings" span={6}>
							{ctx.details}
						</AuthoringSection>
					</AuthoringGrid>
				);
			}}
			persistOverride={async ({ win, presetId, name, values }) => {
				const folderPaths = (values.paths ?? "")
					.split(/\r?\n/)
					.map((l: string) => l.trim())
					.filter(Boolean);
				const condRules = conditionRules.flatMap<IconRule>((r) => {
					const icon = presetIconDraftToPresetIcon(r.draft);
					let filter: IconRuleFilter | undefined;
					if (r.filterType === "name" && r.pattern.trim())
						filter = { namePattern: r.pattern.trim() };
					if (r.filterType === "path" && r.pattern.trim())
						filter = { filePathPattern: r.pattern.trim() };
					if (r.filterType === "preset" && r.pattern.trim())
						filter = {
							specificPresetIds: r.pattern.split(/\s*,\s*/).filter(Boolean),
						};
					if (r.filterType === "presetType" && r.presetType)
						filter = { presetType: r.presetType };
					if (icon && filter) return [{ filter, icon }];
					if (icon) return [{ icon }];
					return [];
				});
				return persistFolderGroupPreset(win, {
					folderPaths,
					presetIdsText: values.presetIds ?? "",
					recursive: values.recursive === "true",
					groupId: presetId,
					groupName: name.trim() || t("group.defaultName"),
					baseIcon: baseIconDraft,
					conditionRules: condRules.length > 0 ? condRules : undefined,
				});
			}}
			fields={[
				{
					key: "paths",
					label: "Folder paths",
					kind: "textarea",
					placeholder: "One folder path per line",
				},
				{
					key: "presetIds",
					label: "Preset IDs",
					kind: "textarea",
					placeholder: "One preset ID per line",
				},
				{
					key: "recursive",
					label: "Recursive folder scan",
					kind: "checkbox",
					defaultValue: "false",
				},
			]}
		/>
	);
}
