export type FontSamplePreset = {
	id: string;
	text: string;
};

export const FONT_SAMPLE_PRESETS: readonly FontSamplePreset[] = [
	{
		id: "latin",
		text: "The quick brown fox jumps over the lazy dog. 0123456789",
	},
	{ id: "cjk", text: "天地玄黃宇宙洪荒 日月盈昃辰宿列張" },
	{ id: "emoji", text: "😀🎬🎨✨🔤" },
	{ id: "mixed", text: "Ty+ フォント 漢字 Кирилlica العربية" },
];
