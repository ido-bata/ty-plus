import { Plus } from "lucide-react";
import type { JSX } from "react";
import type { PresetIconEditorDraft } from "@/management/preset/icon-editor";
import { AccordionSection } from "@/management/setting/dialog/sections/AccordionSection";
import { Button } from "@/shared/component/controls/Button";
import { css } from "@/styled-system/css";
import { BaseIconCard } from "./BaseIconCard";
import { ConditionRuleCard } from "./ConditionRuleCard";
import type { ConditionRule } from "./condition-rule-helpers";

const columnClass = css({
	display: "flex",
	flexDirection: "column",
	gap: "3",
});

const rulesColumnClass = css({
	display: "flex",
	flexDirection: "column",
	gap: "2",
});

type CandidatePreset = { id: string; title: string; filePath: string };

export function ConditionRulesSection({
	baseIconDraft,
	onBaseIconDraftChange,
	conditionRules,
	candidatePresets,
	candidateDirs,
	busy,
	onChangeRule,
	onRemoveRule,
	onAddRule,
}: {
	baseIconDraft: PresetIconEditorDraft;
	onBaseIconDraftChange: (next: PresetIconEditorDraft) => void;
	conditionRules: readonly ConditionRule[];
	candidatePresets: CandidatePreset[];
	candidateDirs: string[];
	busy: boolean;
	onChangeRule: (index: number, next: ConditionRule) => void;
	onRemoveRule: (index: number) => void;
	onAddRule: () => void;
}): JSX.Element {
	return (
		<div className={columnClass}>
			<BaseIconCard
				baseIconDraft={baseIconDraft}
				onBaseIconDraftChange={onBaseIconDraftChange}
			/>
			<AccordionSection title="Rules" defaultOpen={true}>
				<div className={rulesColumnClass}>
					{conditionRules.map((r, i) => (
						<ConditionRuleCard
							key={r.id}
							rule={r}
							index={i}
							candidatePresets={candidatePresets}
							candidateDirs={candidateDirs}
							busy={busy}
							onChange={(next) => onChangeRule(i, next)}
							onRemove={() => onRemoveRule(i)}
						/>
					))}
					<Button type="button" variant="outline" fullWidth onClick={onAddRule}>
						<Plus size={16} /> Add rule
					</Button>
				</div>
			</AccordionSection>
		</div>
	);
}
