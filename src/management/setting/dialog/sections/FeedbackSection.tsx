import { Button, cx, Input, ListSelect, Textarea } from "@ty-plus/ui";
import { type JSX, useCallback, useEffect, useReducer } from "react";
import { i18n } from "@/management/i18n/index";
import {
	SettingsField,
	SettingsFieldLabel,
	SettingsGrid,
} from "@/management/setting/dialog/layout/SettingsGrid";
import { openUrlInDefaultBrowser } from "@/management/workspace/hooks/open-surfaces";
import { css } from "@/styled-system/css";

const CATEGORIES: { value: string; labelKey: string }[] = [
	{ value: "bug", labelKey: "settings:feedbackSection.categoryBug" },
	{ value: "feature", labelKey: "settings:feedbackSection.categoryFeature" },
	{ value: "question", labelKey: "settings:feedbackSection.categoryQuestion" },
	{
		value: "feedback",
		labelKey: "settings:feedbackSection.categoryGeneral",
	},
	{ value: "other", labelKey: "settings:feedbackSection.categoryOther" },
];

type FeedbackState = {
	category: string;
	subject: string;
	presetId: string;
	description: string;
	status: "idle" | "success" | "error";
	message: string;
};

type FeedbackAction =
	| {
			type: "SET_FIELD";
			field: "category" | "subject" | "presetId" | "description";
			value: string;
	  }
	| {
			type: "SET_STATUS";
			status: "idle" | "success" | "error";
			message?: string;
	  }
	| { type: "SUBMIT_SUCCESS"; message: string }
	| { type: "RESET" };

const INITIAL_STATE: FeedbackState = {
	category: "feedback",
	subject: "",
	presetId: "",
	description: "",
	status: "idle",
	message: "",
};

function feedbackReducer(
	state: FeedbackState,
	action: FeedbackAction,
): FeedbackState {
	switch (action.type) {
		case "SET_FIELD":
			return { ...state, [action.field]: action.value };
		case "SET_STATUS":
			return { ...state, status: action.status, message: action.message ?? "" };
		case "SUBMIT_SUCCESS":
			return { ...INITIAL_STATE, status: "success", message: action.message };
		case "RESET":
			return { ...INITIAL_STATE };
		default:
			return state;
	}
}

const messageBaseStyle = css({
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	paddingInline: "var(--ty-shell-space)",
	paddingBlock: "var(--ty-space-2)",
	fontSize: "text-xs",
});

const messageErrorStyle = css({
	borderColor: "colorMix(in srgb, status.error 30%, transparent)",
	backgroundColor: "colorMix(in srgb, status.error 10%, transparent)",
	color: "status.error",
});

const messageSuccessStyle = css({
	borderColor: "colorMix(in srgb, status.success 30%, transparent)",
	backgroundColor: "colorMix(in srgb, status.success 10%, transparent)",
	color: "status.success",
});

const mutedTextStyle = css({
	fontSize: "text-xs",
	color: "text.muted",
});

const GITHUB_ISSUES_NEW_URL = "https://github.com/ido-bata/ty-plus/issues/new";

export function FeedbackSection(): JSX.Element {
	const [state, dispatch] = useReducer(feedbackReducer, INITIAL_STATE);
	const { category, subject, presetId, description, status, message } = state;

	// Issue #83: there is no feedback backend — the previous implementation
	// only console.logged the report and then claimed "Report sent
	// successfully!". The honest path is to hand the composed report to the
	// project's public issue tracker and let the user submit it there.
	const handleSubmit = useCallback(() => {
		if (!subject.trim() || !description.trim()) return;

		const params = new URLSearchParams({
			title: subject.trim(),
			body: [
				`${i18n.t("common:settings.labels.category")}: ${category}`,
				presetId.trim()
					? `${i18n.t("common:settings.labels.presetId")}: ${presetId.trim()}`
					: null,
				"",
				description.trim(),
			]
				.filter((line): line is string => line !== null)
				.join("\n"),
		});
		openUrlInDefaultBrowser(`${GITHUB_ISSUES_NEW_URL}?${params.toString()}`);
		dispatch({
			type: "SUBMIT_SUCCESS",
			message: i18n.t("settings:feedbackSection.submitSuccess"),
		});
	}, [category, subject, presetId, description]);

	const clearForm = useCallback(() => {
		dispatch({ type: "RESET" });
	}, []);

	useEffect(() => {
		const onCommand = (event: Event) => {
			const detail = (event as CustomEvent<{ command?: string }>).detail;
			if (detail?.command === "feedback.clear") {
				clearForm();
			}
		};
		window.addEventListener("ty-plus:settings-dialog-command", onCommand);
		return () => {
			window.removeEventListener("ty-plus:settings-dialog-command", onCommand);
		};
	}, [clearForm]);

	return (
		<SettingsGrid>
			<SettingsField span={6}>
				<SettingsFieldLabel>
					{i18n.t("common:settings.labels.category")}
				</SettingsFieldLabel>
				<ListSelect
					options={CATEGORIES.map((c) => ({
						value: c.value,
						label: i18n.t(c.labelKey),
					}))}
					value={category}
					onChange={(v: string) =>
						dispatch({ type: "SET_FIELD", field: "category", value: v })
					}
					placeholder={i18n.t("settings:feedbackSection.selectCategory")}
				/>
			</SettingsField>

			<SettingsField span={6}>
				<SettingsFieldLabel>
					{i18n.t("common:settings.labels.subject")}
				</SettingsFieldLabel>
				<Input
					type="text"
					value={subject}
					onChange={(e) =>
						dispatch({
							type: "SET_FIELD",
							field: "subject",
							value: e.target.value,
						})
					}
					placeholder={i18n.t("settings:feedbackSection.subjectPlaceholder")}
				/>
			</SettingsField>

			<SettingsField span={6}>
				<SettingsFieldLabel>
					{i18n.t("common:settings.labels.presetId")}
				</SettingsFieldLabel>
				<Input
					type="text"
					value={presetId}
					onChange={(e) =>
						dispatch({
							type: "SET_FIELD",
							field: "presetId",
							value: e.target.value,
						})
					}
					placeholder={i18n.t("settings:feedbackSection.presetIdPlaceholder")}
				/>
			</SettingsField>

			<SettingsField span={6}>
				<SettingsFieldLabel>
					{i18n.t("common:settings.labels.description")}
				</SettingsFieldLabel>
				<Textarea
					value={description}
					onChange={(e) =>
						dispatch({
							type: "SET_FIELD",
							field: "description",
							value: e.target.value,
						})
					}
					placeholder={i18n.t(
						"settings:feedbackSection.descriptionPlaceholder",
					)}
					rows={4}
				/>
			</SettingsField>

			{message ? (
				<SettingsField span={6}>
					<div
						className={cx(
							messageBaseStyle,
							status === "error" ? messageErrorStyle : messageSuccessStyle,
						)}
					>
						{message}
					</div>
				</SettingsField>
			) : null}

			<SettingsField span={6}>
				<Button
					onClick={handleSubmit}
					variant="primary"
					uiSize="sm"
					disabled={!subject.trim() || !description.trim()}
				>
					{i18n.t("settings:feedbackSection.openIssue")}
				</Button>
			</SettingsField>

			<SettingsField span={6}>
				<p className={mutedTextStyle}>
					{i18n.t("settings:feedbackSection.hint")}
				</p>
			</SettingsField>
		</SettingsGrid>
	);
}
