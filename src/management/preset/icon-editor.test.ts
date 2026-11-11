import { describe, expect, it } from "vitest";

import {
	createPresetIconDraft,
	draftToIcon,
	PRESET_ICON_TEXT_MAX,
	presetIconDraftToPresetIcon,
	presetIconToDraft,
} from "./icon-editor";

describe("createPresetIconDraft", () => {
	it("returns an empty text draft when no initial text is given", () => {
		const draft = createPresetIconDraft();
		expect(draft).toEqual({
			type: "text",
			text: "",
			emoji: "",
			imagePath: "",
			bgColor: "#2b2b2b",
			color: "#ffffff",
		});
	});

	it("seeds the draft text from the initial argument", () => {
		const draft = createPresetIconDraft("ANIM");
		expect(draft.type).toBe("text");
		expect(draft.text).toBe("ANIM");
	});

	it("trims surrounding whitespace from the initial text", () => {
		const draft = createPresetIconDraft("  PRESET  ");
		expect(draft.text).toBe("PRESET");
	});

	it("clamps the initial text to PRESET_ICON_TEXT_MAX characters", () => {
		const overflow = "TOOLONGTEXT";
		const draft = createPresetIconDraft(overflow);
		expect(draft.text.length).toBe(PRESET_ICON_TEXT_MAX);
		expect(draft.text).toBe(overflow.slice(0, PRESET_ICON_TEXT_MAX));
	});

	it("round-trips through draftToIcon and presetIconText", () => {
		const icon = draftToIcon(createPresetIconDraft("CODE"));
		expect(icon).toEqual({
			type: "text",
			param: { text: "CODE", color: "#ffffff", backgroundColor: "#2b2b2b" },
		});
	});

	it("matches presetIconDraftToPresetIcon alias", () => {
		const draft = createPresetIconDraft("EASE");
		expect(presetIconDraftToPresetIcon(draft)).toEqual(draftToIcon(draft));
	});

	it("handles empty initial text the same as no argument", () => {
		expect(createPresetIconDraft("")).toEqual(createPresetIconDraft());
	});
});

describe("presetIconToDraft with seeded draft", () => {
	it("preserves text-type icons when round-tripping", () => {
		const icon = { type: "text" as const, param: { text: "ABC" } };
		const draft = presetIconToDraft(icon);
		expect(draft.text).toBe("ABC");
		expect(draft.type).toBe("text");
	});
});
