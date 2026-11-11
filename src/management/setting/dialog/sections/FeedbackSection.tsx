import { type JSX, useCallback, useEffect, useReducer } from "react";
import {
	SettingsField,
	SettingsFieldLabel,
	SettingsGrid,
} from "@/management/setting/dialog/layout/SettingsGrid";
import { Button } from "@/shared/component/controls/Button";
import { Input } from "@/shared/component/fields/Input";
import { ListSelect } from "@/shared/component/fields/ListSelect";
import { Textarea } from "@/shared/component/fields/Textarea";
import { cx } from "@/shared/util/cx";
import { css } from "@/styled-system/css";

const CATEGORIES: { value: string; label: string }[] = [
	{ value: "bug", label: "Bug Report" },
	{ value: "feature", label: "Feature Request" },
	{ value: "question", label: "Question" },
	{ value: "feedback", label: "General Feedback" },
	{ value: "other", label: "Other" },
];

type FeedbackState = {
	category: string;
	subject: string;
	presetId: string;
	description: string;
	status: "idle" | "submitting" | "success" | "error";
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
			status: "idle" | "submitting" | "success" | "error";
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

export function FeedbackSection(): JSX.Element {
	const [state, dispatch] = useReducer(feedbackReducer, INITIAL_STATE);
	const { category, subject, presetId, description, status, message } = state;

	const handleSubmit = useCallback(() => {
		if (!subject.trim() || !description.trim()) return;

		dispatch({ type: "SET_STATUS", status: "submitting" });

		console.log("[FeedbackSection] Submit:", {
			category,
			subject,
			presetId,
			description,
		});

		setTimeout(() => {
			dispatch({
				type: "SUBMIT_SUCCESS",
				message: "Report sent successfully! Thank you for your feedback.",
			});
		}, 1000);
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
				<SettingsFieldLabel>Category</SettingsFieldLabel>
				<ListSelect
					options={CATEGORIES}
					value={category}
					onChange={(v: string) =>
						dispatch({ type: "SET_FIELD", field: "category", value: v })
					}
					placeholder="Select category"
					disabled={status === "submitting"}
				/>
			</SettingsField>

			<SettingsField span={6}>
				<SettingsFieldLabel>Subject</SettingsFieldLabel>
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
					placeholder="Brief summary"
					disabled={status === "submitting"}
				/>
			</SettingsField>

			<SettingsField span={6}>
				<SettingsFieldLabel>Preset ID</SettingsFieldLabel>
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
					placeholder="e.g. TY-001 (if related to a preset)"
					disabled={status === "submitting"}
				/>
			</SettingsField>

			<SettingsField span={6}>
				<SettingsFieldLabel>Description</SettingsFieldLabel>
				<Textarea
					value={description}
					onChange={(e) =>
						dispatch({
							type: "SET_FIELD",
							field: "description",
							value: e.target.value,
						})
					}
					placeholder="Details about what happened..."
					rows={4}
					disabled={status === "submitting"}
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
					disabled={status === "submitting" || !subject || !description}
				>
					{status === "submitting" ? "Sending..." : "Submit"}
				</Button>
			</SettingsField>

			<SettingsField span={6}>
				<p className={mutedTextStyle}>
					Reports are sent securely to our team. Please include as much detail
					as possible.
				</p>
			</SettingsField>
		</SettingsGrid>
	);
}
