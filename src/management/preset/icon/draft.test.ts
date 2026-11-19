import { describe, expect, it } from "vitest";
import {
	presetIconCanvas,
	presetIconEmoji,
	presetIconImage,
	presetIconText,
} from "../contract";
import {
	createPresetIconDraft,
	draftToIcon,
	PRESET_ICON_TEXT_MAX,
	presetIconDraftToPresetIcon,
	presetIconToDraft,
} from "./draft";

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

describe("presetIconToDraft / draftToIcon round-trip (issue #191)", () => {
	it("round-trips an image icon without converting it to a raw string", () => {
		const icon = presetIconImage("C:/icons/logo.png");
		const draft = presetIconToDraft(icon);
		expect(draft.type).toBe("image");
		expect(draft.imagePath).toBe("C:/icons/logo.png");
		expect(draftToIcon(draft)).toEqual(icon);
	});

	it("round-trips an emoji icon with its background color", () => {
		const icon = presetIconEmoji("🎬", { backgroundColor: "#112233" });
		const draft = presetIconToDraft(icon);
		expect(draft.type).toBe("emoji");
		expect(draft.emoji).toBe("🎬");
		expect(draft.bgColor).toBe("#112233");
		expect(draftToIcon(draft)).toEqual(icon);
	});

	it("round-trips a canvas icon preserving the cubic curve", () => {
		const icon = presetIconCanvas({
			cubic: [0.1, 0.2, 0.3, 0.4],
			color: "#aabbcc",
			backgroundColor: "#001122",
		});
		const draft = presetIconToDraft(icon);
		expect(draft.type).toBe("canvas");
		expect(draft.canvasCubic).toEqual([0.1, 0.2, 0.3, 0.4]);
		expect(draftToIcon(draft)).toEqual(icon);
	});

	it("round-trips a multi-segment canvas icon without dropping points", () => {
		const points: [number, number, number, number, number, number][] = [
			[0, 0, 0.1, 0.1, 0.2, 0.2],
			[0.5, 1, 0.4, 0.9, 0.6, 0.8],
			[1, 0, 0.9, 0.1, 0.8, 0.2],
		];
		const icon = presetIconCanvas({
			cubic: [0.1, 0.2, 0.3, 0.4],
			points,
			color: "#aabbcc",
			backgroundColor: "#001122",
		});
		const draft = presetIconToDraft(icon);
		expect(draft.canvasPoints).toEqual(points);
		expect(draftToIcon(draft)).toEqual(icon);
	});

	it("round-trips a text icon with colors", () => {
		const icon = presetIconText("FFX", {
			color: "#ffffff",
			backgroundColor: "#2b2b2b",
		});
		const draft = presetIconToDraft(icon);
		expect(draft.type).toBe("text");
		expect(draft.text).toBe("FFX");
		expect(draftToIcon(draft)).toEqual(icon);
	});

	it("returns null for empty image/emoji/text drafts", () => {
		const base = createPresetIconDraft("");
		expect(draftToIcon({ ...base, type: "image", imagePath: "  " })).toBeNull();
		expect(draftToIcon({ ...base, type: "emoji", emoji: " " })).toBeNull();
		expect(draftToIcon({ ...base, type: "text", text: " " })).toBeNull();
	});
});
