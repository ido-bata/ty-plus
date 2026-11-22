import { type JSX, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	AuthoringGrid,
	AuthoringSection,
} from "@/management/preset/authoring-layout";
import { readUserHomeOrFallback } from "@/management/preset/catalog-add/browse-start-dir";
import { persistFolderGroupPreset } from "@/management/preset/group/persist-folder";
import {
	createPresetIconDraft,
	type PresetIconEditorDraft,
} from "@/management/preset/icon/editor-state";
import { listPresets } from "@/management/preset/operations";
import { Dialog } from "@/management/preset/tool-shell/dialog/ToolDialog";
import { ConditionRulesSection } from "./ConditionRulesSection";
import {
	type ConditionRule,
	conditionRulesToIconRules,
} from "./condition-rule-helpers";
import { MembersSection } from "./MembersSection";
import { NameField } from "./NameField";

/**
 * Create a preset group: select multiple presets from catalog or scan a folder.
 * Supports conditional icon rules based on preset type, name pattern, or specific selections.
 */
const escapeRegex = (value: string): string =>
	value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function GroupDialog(): JSX.Element {
	const { t } = useTranslation("presets");
	// Base icon for icon rules (draft state)
	const [baseIconDraft, setBaseIconDraft] = useState<PresetIconEditorDraft>(
		createPresetIconDraft,
	);

	// Paths list for group members is stored as newline-separated value in field 'paths'
	// Condition rules: additive list where each rule has a namePattern and an icon draft
	const [conditionRules, setConditionRules] = useState<ConditionRule[]>([
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
	const detectCandidates = async (paths: readonly string[]) => {
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
				const autoDetectRulesUpdater = (prev: ConditionRule[]) => {
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

	// Toggle a candidate preset in the `preset` rule's pattern list.
	const pickPreset = (id: string) => {
		const next = conditionRules.slice();
		const idx = next.findIndex((r) => r.filterType === "preset");
		if (idx === -1) {
			next.push({
				id: `auto-${Date.now()}`,
				filterType: "preset",
				pattern: id,
				draft: createPresetIconDraft(),
			});
		} else {
			const currentIds = next[idx].pattern.split(/\s*,\s*/).filter(Boolean);
			const nextPattern = currentIds.includes(id)
				? currentIds.filter((currentId) => currentId !== id).join(",")
				: [...currentIds, id].join(",");
			next[idx] = {
				...next[idx],
				pattern: nextPattern,
			};
		}
		setConditionRules(next);
	};

	const changeRule = (index: number, next: ConditionRule) => {
		const copy = conditionRules.slice();
		copy[index] = next;
		setConditionRules(copy);
	};

	const removeRule = (index: number) => {
		const copy = conditionRules.slice();
		copy.splice(index, 1);
		setConditionRules(copy);
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
			renderForm={(ctx) => (
				<AuthoringGrid>
					{/* 1. Group name (no section label) */}
					<NameField
						name={ctx.name}
						busy={ctx.busy}
						onNameChange={ctx.setName}
					/>
					{/* 2. Group Members - Directory browser + Paths list */}
					<MembersSection
						ctx={ctx}
						candidatePresets={candidatePresets}
						candidateDirs={candidateDirs}
						detectCandidates={detectCandidates}
						onPickPreset={pickPreset}
					/>
					{/* 3. Icon Rules (Additive) */}
					<AuthoringSection title="Icon Rules" span={6}>
						<ConditionRulesSection
							baseIconDraft={baseIconDraft}
							onBaseIconDraftChange={setBaseIconDraft}
							conditionRules={conditionRules}
							candidatePresets={candidatePresets}
							candidateDirs={candidateDirs}
							busy={ctx.busy}
							onChangeRule={changeRule}
							onRemoveRule={removeRule}
							onAddRule={() => {
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
								const lines = ((ctx.values.paths ?? "") as string)
									.split(/\r?\n/)
									.map((l) => l.trim())
									.filter(Boolean);
								detectCandidates(lines);
							}}
						/>
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
			)}
			persistOverride={async ({ win, presetId, name, values }) => {
				const folderPaths = (values.paths ?? "")
					.split(/\r?\n/)
					.map((l: string) => l.trim())
					.filter(Boolean);
				const condRules = conditionRulesToIconRules(conditionRules);
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
