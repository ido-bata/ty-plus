import { Button } from "@ty-plus/ui/controls/Button";
import { Input } from "@ty-plus/ui/fields/Input";
import { RegexEditor } from "@ty-plus/ui/fields/RegexEditor";
import { Trash2 } from "lucide-react";
import type { JSX } from "react";
import { AuthoringSegment } from "@/management/preset/authoring-layout";
import { readUserHomeOrFallback } from "@/management/preset/catalog-add/browse-start-dir";
import type { Preset, PresetType } from "@/management/preset/contract";
import { PresetIconEditor } from "@/management/preset/icon/Editor";
import { presetIconDraftToPresetIcon } from "@/management/preset/icon/editor-state";
import { glyphBoxFillClass } from "@/management/preset/workspace/glyph/classes";
import { FramedPresetGlyph } from "@/management/preset/workspace/glyph/WorkspaceGlyph";
import { FileEntryList } from "@/management/storage/ui/file-entry/FileEntryList";
import { css } from "@/styled-system/css";
import type { ConditionRule } from "./condition-rule-helpers";

const escapeRegex = (value: string): string =>
	value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const cardClass = css({
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.panel",
	padding: "3",
});

const rowClass = css({
	display: "flex",
	alignItems: "center",
	justifyContent: "space-between",
	gap: "2",
});

const fieldsClass = css({
	display: "flex",
	flexDirection: "column",
	gap: "2",
	marginTop: "2",
});

const matchModeGridClass = css({
	display: "grid",
	gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
	gap: "1",
});

const directoryHostClass = css({
	height: "12rem",
	minHeight: "0",
	overflow: "hidden",
});

const fullWidthClass = css({
	width: "full",
});

const fullWidthMinHeightClass = css({
	width: "full",
	minHeight: "24",
});

export function ConditionRuleCard({
	rule,
	candidatePresets,
	candidateDirs,
	busy,
	onChange,
	onRemove,
}: {
	rule: ConditionRule;
	index: number;
	candidatePresets: { id: string; title: string; filePath: string }[];
	candidateDirs: string[];
	busy: boolean;
	onChange: (next: ConditionRule) => void;
	onRemove: () => void;
}): JSX.Element {
	const r = rule;
	return (
		<div className={cardClass}>
			<div className={rowClass}>
				<AuthoringSegment
					value={r.filterType}
					onChange={(v) => {
						onChange({
							...r,
							filterType: v as ConditionRule["filterType"],
						});
					}}
					options={[
						{ value: "name", label: "Name" },
						{ value: "path", label: "Path" },
						{ value: "preset", label: "Preset ID" },
						{ value: "presetType", label: "Preset Type" },
					]}
				/>
				<Button variant="ghost" aria-label="Remove rule" onClick={onRemove}>
					<Trash2 size={16} />
				</Button>
			</div>

			<div className={fieldsClass}>
				{r.filterType === "name" ? (
					<>
						{r.matchMode === "regex" ? (
							<RegexEditor
								value={r.pattern}
								onChange={(v) => onChange({ ...r, pattern: v })}
								placeholder="Name regex (e.g. ^Header.*$)"
								className={fullWidthMinHeightClass}
								disabled={busy}
							/>
						) : (
							<Input
								value={r.pattern}
								onChange={(e) =>
									onChange({ ...r, pattern: e.currentTarget.value })
								}
								placeholder="Name pattern"
								uiSize="sm"
								disabled={busy}
								className={fullWidthClass}
							/>
						)}
						<div className={matchModeGridClass}>
							{[
								{ value: "contains", label: "Contains" },
								{ value: "startsWith", label: "Starts" },
								{ value: "endsWith", label: "Ends" },
								{ value: "regex", label: "Regex" },
							].map((mode) => (
								<Button
									key={mode.value}
									type="button"
									uiSize="sm"
									variant={r.matchMode === mode.value ? "primary" : "ghost"}
									fullWidth
									onClick={() =>
										onChange({
											...r,
											matchMode: mode.value as ConditionRule["matchMode"],
										})
									}
								>
									{mode.label}
								</Button>
							))}
						</div>
					</>
				) : null}

				{r.filterType === "presetType" ? (
					<AuthoringSegment
						value={r.presetType ?? "preset"}
						onChange={(v) => onChange({ ...r, presetType: v as PresetType })}
						options={[
							{ value: "preset", label: "Preset" },
							{ value: "script", label: "Script" },
							{ value: "plugin", label: "Plugin" },
							{ value: "footage", label: "Footage" },
						]}
					/>
				) : null}

				{r.filterType === "path" ? (
					<div className={directoryHostClass}>
						<FileEntryList
							selectionMode="folders"
							entries={candidateDirs.map((d) => ({
								path: d,
								name: d.split(/[\\/]/).pop() || d,
								isDirectory: true,
							}))}
							loading={false}
							onEntryClick={() => {}}
							onEntryActivate={() => {}}
							isSelected={(entryPath) =>
								r.pattern === `^${escapeRegex(entryPath)}(?:\\\\|/|$)`
							}
							onToggleSelected={(entryPath) => {
								onChange({
									...r,
									pattern: `^${escapeRegex(entryPath)}(?:\\\\|/|$)`,
								});
							}}
							selectedSummary={{ files: 0, folders: 0 }}
							loadingLabel=""
							emptyLabel={
								candidateDirs.length === 0 ? "No directories detected" : ""
							}
							upLabel=""
						/>
					</div>
				) : null}

				{r.filterType === "preset"
					? (() => {
							const candidateByPath = new Map(
								candidatePresets.map((p) => [p.filePath || "", p]),
							);
							const selectedPresetIds = new Set(
								(r.pattern || "").split(/\s*,\s*/).filter(Boolean),
							);
							return (
								<div className={directoryHostClass}>
									<FileEntryList
										selectionMode="files"
										entries={candidatePresets.map((p) => ({
											path: p.filePath,
											name: p.title,
											isDirectory: false,
										}))}
										loading={false}
										onEntryClick={() => {}}
										onEntryActivate={() => {}}
										isSelected={(entryPath) => {
											const p = candidateByPath.get(entryPath);
											if (!p) return false;
											return selectedPresetIds.has(p.id);
										}}
										onToggleSelected={(entryPath) => {
											const p = candidateByPath.get(entryPath);
											if (!p) return;
											const ids = new Set(
												r.pattern.split(/\s*,\s*/).filter(Boolean),
											);
											if (ids.has(p.id)) ids.delete(p.id);
											else ids.add(p.id);
											onChange({
												...r,
												pattern: Array.from(ids).join(","),
											});
										}}
										selectedSummary={{ files: 0, folders: 0 }}
										viewMode="list"
										onViewModeChange={() => {}}
										scale={1}
										aspect="square"
										loadingLabel=""
										emptyLabel={
											candidatePresets.length === 0 ? "No presets detected" : ""
										}
										upLabel=""
									/>
								</div>
							);
						})()
					: null}
			</div>

			<PresetIconEditor
				draft={r.draft}
				onChange={(d) => onChange({ ...r, draft: d })}
				label="Rule icon"
				browseDir={readUserHomeOrFallback()}
				framed={true}
				preview={
					<FramedPresetGlyph
						preset={
							{
								id: `rule-preview-${r.id}`,
								type: "preset" as const,
								title: "Preview",
								filePath: `ty-plus://rule-preview-${r.id}`,
								icon: presetIconDraftToPresetIcon(r.draft) ?? {
									type: "text",
									param: { text: "?" },
								},
							} satisfies Preset
						}
						boxClass={glyphBoxFillClass}
					/>
				}
			/>
		</div>
	);
}
