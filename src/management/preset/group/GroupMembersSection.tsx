import { ChevronDown, FolderOpen, Plus, Trash2 } from "lucide-react";
import type { JSX, ReactNode } from "react";
import { AuthoringSection } from "@/management/preset/tool-shell/archive-layout";
import { FolderDirectoryPicker } from "@/management/preset/tool-shell/FolderDirectoryPicker";
import { Icon } from "@/shared/component";
import { Button } from "@/shared/component/controls/Button";
import { PathField } from "@/shared/component/fields/PathField";
import { css } from "@/styled-system/css";
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

export function GroupMembersSection({
	ctx,
	candidatePresets,
	candidateDirs,
	detectCandidates,
	onPickPreset,
}: {
	ctx: DialogFormContext;
	candidatePresets: CandidatePreset[];
	candidateDirs: string[];
	detectCandidates: (paths: readonly string[]) => Promise<void>;
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
			<div className={columnClass}>
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
					label="Browse files & folders to add"
					candidatePresets={candidatePresets}
					candidateDirs={candidateDirs}
					onPickPreset={onPickPreset}
				/>

				<div className={buttonRowClass}>
					<Button type="button" variant="outline" fullWidth onClick={addPath}>
						<Plus size={16} /> Add path
					</Button>
					<Button type="button" variant="ghost" onClick={detect}>
						<ChevronDown size={14} /> Detect candidates
					</Button>
				</div>

				<div className={columnClass}>
					{pathLines.map((p, idx) => {
						const stableKey = `path-${p.length}-${p.slice(0, 16)}`;
						return (
							<div key={stableKey} className={pathRowClass}>
								<PathField
									value={p}
									onChange={(next) => updatePath(idx, next)}
									onBrowse={() => ctx.runPathBrowse(`paths[${idx}]`)}
									browseAriaLabel="Browse folder"
									browseSlot={<Icon icon={FolderOpen} size={16} aria-hidden />}
									placeholder="C:\path\folder"
									uiSize="md"
									disabled={ctx.busy}
								/>
								<Button
									variant="ghost"
									aria-label="Remove path"
									onClick={() => removePath(idx)}
								>
									<Trash2 size={16} />
								</Button>
							</div>
						);
					})}
				</div>
			</div>
		</AuthoringSection>
	);
}
