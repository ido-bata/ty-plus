import { Button, Icon } from "@ty-plus/ui";
import { LoaderCircle, Plus } from "lucide-react";
import type { JSX } from "react";
import { i18n } from "@/management/i18n/index";
import { authoringBusyClass } from "@/management/preset/authoring-layout";
import type { PresetIconEditorDraft } from "@/management/preset/icon/editor-state";
import { AccordionSection } from "@/management/setting/dialog/sections/AccordionSection";
import { css, cx } from "@/styled-system/css";
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

// Issue #753: busy used to be a bare 50% dim — no spinner or status text,
// so a slow save read as a frozen dialog.
const busyRowClass = css({
	display: "flex",
	alignItems: "center",
	gap: "2",
	fontSize: "shell-text-sm",
	color: "text.muted",
});

const busySpinnerClass = css({
	height: "3.5",
	width: "3.5",
	flexShrink: 0,
	animation: "spin",
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
		<div className={cx(columnClass, busy && authoringBusyClass)} inert={busy}>
			{busy ? (
				<div className={busyRowClass} role="status">
					<Icon
						icon={LoaderCircle}
						size={16}
						className={busySpinnerClass}
						aria-hidden
					/>
					<span>{i18n.t("common:status.saving")}</span>
				</div>
			) : null}
			<BaseIconCard
				baseIconDraft={baseIconDraft}
				onBaseIconDraftChange={onBaseIconDraftChange}
			/>
			<AccordionSection
				title={i18n.t("presets:group.rules")}
				defaultOpen={true}
			>
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
					<Button
						type="button"
						variant="outline"
						fullWidth
						disabled={busy}
						onClick={onAddRule}
					>
						<Plus size={16} /> {i18n.t("presets:group.addRule")}
					</Button>
				</div>
			</AccordionSection>
		</div>
	);
}
