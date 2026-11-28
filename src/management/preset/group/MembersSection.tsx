import { Button, Icon, IconButton, PathField } from "@ty-plus/ui";
import { FolderOpen, Plus, ScanSearch, Trash2 } from "lucide-react";
import type { JSX, ReactNode } from "react";
import { i18n } from "@/management/i18n/index";
import {
	AuthoringSection,
	authoringBusyClass,
} from "@/management/preset/authoring-layout";
import { FolderDirectoryPicker } from "@/management/preset/tool-shell/FolderDirectoryPicker";
import { css, cx } from "@/styled-system/css";
import { FolderScanDepthSelector } from "./FolderScanDepthSelector";

const columnClass = css({
	display: "flex",
	flexDirection: "column",
	gap: "2",
});

const buttonRowClass = css({
	display: "flex",
	alignItems: "center",
	gap: "2",
});

const pathRowClass = css({
	display: "flex",
	alignItems: "flex-start",
	gap: "2",
});

// `IconButton` does not set `flex-shrink`, so in a tight path row the
// square metrics collapsed to a ~30px-wide rectangle — pin it.
const removePathButtonClass = css({
	flexShrink: "0",
});

const detectStatusClass = css({
	fontSize: "xs",
	color: "text.muted",
});

type CandidatePreset = { id: string; title: string; filePath: string };

export type DialogFormContext = {
	name: string;
	setName: (next: string) => void;
	values: Record<string, string>;
	setValue: (key: string, value: string) => void;
	busy: boolean;
	fields: ReactNode;
	icon: ReactNode;
	details: ReactNode;
	runPathBrowse: (fieldKey: string) => void;
};

export function MembersSection({
	ctx,
	candidatePresets,
	candidateDirs,
	detectCandidates,
	detectState,
	detectCounts,
	onPickPreset,
}: {
	ctx: DialogFormContext;
	candidatePresets: CandidatePreset[];
	candidateDirs: string[];
	detectCandidates: (paths: readonly string[]) => Promise<void>;
	detectState: "idle" | "running" | "done";
	detectCounts: { presets: number; dirs: number };
	onPickPreset: (id: string) => void;
}): JSX.Element {
	const pathLines = (ctx.values.paths ?? "")
		.split(/\r?\n/)
		.map((l) => l.trim());
	const pathLinesNonEmpty = pathLines.filter(Boolean);

	const detect = () => {
		void detectCandidates(pathLinesNonEmpty);
	};

	const addPath = () => {
		const lines = pathLines.slice();
		lines.push("");
		ctx.setValue("paths", lines.join("\n"));
		void detectCandidates(lines.filter(Boolean));
	};

	const togglePath = (p: string, selected: boolean) => {
		const lines = (ctx.values.paths ?? "")
			.split(/\r?\n/)
			.map((l) => l.trim())
			.filter(Boolean);
		const has = lines.includes(p);
		if (selected && !has) lines.push(p);
		if (!selected && has) lines.splice(lines.indexOf(p), 1);
		ctx.setValue("paths", lines.join("\n"));
		void detectCandidates(lines.filter(Boolean));
	};

	const addFromPicker = (p: string) => {
		const lines = (ctx.values.paths ?? "")
			.split(/\r?\n/)
			.map((l) => l.trim())
			.filter(Boolean);
		if (!lines.includes(p)) lines.push(p);
		ctx.setValue("paths", lines.join("\n"));
		void detectCandidates(lines.filter(Boolean));
	};

	const updatePath = (idx: number, next: string) => {
		const raw = (ctx.values.paths ?? "").split(/\r?\n/).map((l) => l.trim());
		raw[idx] = next;
		ctx.setValue("paths", raw.filter(Boolean).join("\n"));
		void detectCandidates(raw.filter(Boolean));
	};

	const removePath = (idx: number) => {
		const raw = (ctx.values.paths ?? "").split(/\r?\n/).map((l) => l.trim());
		raw.splice(idx, 1);
		ctx.setValue("paths", raw.filter(Boolean).join("\n"));
		void detectCandidates(raw.filter(Boolean));
	};

	return (
		<AuthoringSection title="" span={6}>
			<div
				className={cx(columnClass, ctx.busy && authoringBusyClass)}
				inert={ctx.busy}
			>
				<FolderScanDepthSelector
					recursive={ctx.values.recursive ?? "false"}
					onRecursiveChange={(v) =>
						ctx.setValue("recursive", v === "recursive" ? "true" : "false")
					}
				/>
				<FolderDirectoryPicker
					value={""}
					selectedPaths={pathLinesNonEmpty}
					onToggleSelected={togglePath}
					onChange={addFromPicker}
					selectionMode="both"
					label={i18n.t("presets:group.browseMembers")}
					candidatePresets={candidatePresets}
					candidateDirs={candidateDirs}
					onPickPreset={onPickPreset}
				/>

				<div className={buttonRowClass}>
					{/* Issue #767: `fullWidth` here stretched "Add path" across
					    ~75% of the row while "Detect candidates" stayed intrinsic —
					    both actions now size to their labels. */}
					<Button
						type="button"
						variant="outline"
						disabled={ctx.busy}
						onClick={addPath}
					>
						<Plus size={16} /> {i18n.t("presets:group.addPath")}
					</Button>
					<Button
						type="button"
						variant="ghost"
						fullWidth
						disabled={ctx.busy}
						onClick={detect}
					>
						{/* ScanSearch, not ChevronDown — a chevron reads as a
						    dropdown/disclosure, not a scan action (issue #766). */}
						<ScanSearch size={16} /> {i18n.t("presets:group.detectCandidates")}
					</Button>
				</div>

				{/* Detection feedback (issue #766): candidates and the
				    auto-added rule render below the fold, so the result
				    count must be announced next to the action. */}
				{detectState !== "idle" ? (
					<div className={detectStatusClass} role="status">
						{detectState === "running"
							? i18n.t("presets:group.detecting")
							: detectCounts.presets + detectCounts.dirs === 0
								? i18n.t("presets:group.detectNone")
								: `${i18n.t("presets:group.detectPresets", { count: detectCounts.presets })} · ${i18n.t("presets:group.detectDirs", { count: detectCounts.dirs })}`}
					</div>
				) : null}

				<div className={columnClass}>
					{pathLines.map((p, idx) => {
						const stableKey = `path-${idx}`;
						return (
							// eslint-disable-next-line react-doctor/no-array-index-as-key -- rows are controlled inputs with no per-row state, so position keys are correct; content-derived keys remount and drop focus on every keystroke
							<div key={stableKey} className={pathRowClass}>
								<PathField
									value={p}
									onChange={(next) => updatePath(idx, next)}
									onBrowse={() => ctx.runPathBrowse(`paths[${idx}]`)}
									browseAriaLabel={i18n.t("presets:group.browseFolder")}
									browseSlot={<Icon icon={FolderOpen} size={16} aria-hidden />}
									placeholder="C:\path\folder"
									uiSize="md"
									disabled={ctx.busy}
								/>
								{/* Issue #767: a text-padded Button next to the
								    square PathField browse IconButton read as a
								    mismatched rectangle — use the same square
								    IconButton metrics. */}
								<IconButton
									variant="ghost"
									size="md"
									className={removePathButtonClass}
									aria-label={i18n.t("presets:group.removePath")}
									disabled={ctx.busy}
									onClick={() => removePath(idx)}
								>
									<Trash2 size={16} />
								</IconButton>
							</div>
						);
					})}
				</div>
			</div>
		</AuthoringSection>
	);
}
