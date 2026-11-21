import type { PresetIcon } from "@/management/preset/contract";
import {
	presetIconCanvas,
	presetIconEmoji,
	presetIconImage,
	presetIconText,
} from "@/management/preset/contract";

export type PresetIconEditorDraft = {
	type: "text" | "emoji" | "image" | "canvas";
	text: string;
	emoji: string;
	imagePath: string;
	bgColor: string;
	color: string;
	/** For canvas type: stores the original cubic for round-trip */
	canvasCubic?: [number, number, number, number];
};

export const PRESET_ICON_TEXT_MAX = 6;

export const createPresetIconDraft = (
	initialText = "",
): PresetIconEditorDraft => {
	const text = initialText.trim().slice(0, PRESET_ICON_TEXT_MAX);
	return {
		type: "text",
		text,
		emoji: "",
		imagePath: "",
		bgColor: "#2b2b2b",
		color: "#ffffff",
	};
};

/** Convert a PresetIcon (including canvas) to an editor draft. */
export const presetIconToDraft = (icon: PresetIcon): PresetIconEditorDraft => {
	if (icon.type === "canvas") {
		return {
			type: "canvas",
			text: "",
			emoji: "",
			imagePath: "",
			bgColor: icon.param.backgroundColor ?? "#2b2b2b",
			color: icon.param.color ?? "#ffffff",
			canvasCubic: icon.param.cubic,
		};
	}
	if (icon.type === "emoji") {
		return {
			type: "emoji",
			text: "",
			emoji: icon.param.emoji,
			imagePath: "",
			bgColor: icon.param.backgroundColor ?? "#2b2b2b",
			color: "#ffffff",
		};
	}
	if (icon.type === "image") {
		return {
			type: "image",
			text: "",
			emoji: "",
			imagePath: icon.param.src,
			bgColor: "#2b2b2b",
			color: "#ffffff",
		};
	}
	return {
		type: "text",
		text: icon.param.text,
		emoji: "",
		imagePath: "",
		bgColor: icon.param.backgroundColor ?? "#2b2b2b",
		color: icon.param.color ?? "#ffffff",
	};
};

export const draftToIcon = (
	draft: PresetIconEditorDraft,
): PresetIcon | null => {
	if (draft.type === "canvas" && draft.canvasCubic) {
		return presetIconCanvas({
			cubic: draft.canvasCubic,
			color: draft.color,
			backgroundColor: draft.bgColor,
		});
	}
	if (draft.type === "image") {
		const p = draft.imagePath.trim();
		return p ? presetIconImage(p) : null;
	}
	if (draft.type === "emoji") {
		const e = draft.emoji.trim();
		return e ? presetIconEmoji(e, { backgroundColor: draft.bgColor }) : null;
	}
	const t = draft.text.trim().slice(0, PRESET_ICON_TEXT_MAX);
	return t
		? presetIconText(t, {
				color: draft.color,
				backgroundColor: draft.bgColor,
			})
		: null;
};

export { draftToIcon as presetIconDraftToPresetIcon };
