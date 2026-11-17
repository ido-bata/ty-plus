import { css } from "@/styled-system/css";

// Shared `boxClass` / `emojiClass` recipes for FramedPresetGlyph and
// PresetGlyphById call sites. Keep these as PandaCSS `css()` output — raw
// Tailwind utility strings generate zero CSS in the Panda-only bundle
// (Issue #127/#143). Lives outside glyph.tsx so that module only exports
// components (react-doctor only-export-components).
export const glyphBoxFillClass = css({
	height: "full",
	width: "full",
});

export const glyphBoxCompactClass = css({
	height: "7",
	width: "7",
});

export const glyphBoxCompactPadClass = css({
	height: "7",
	width: "7",
	padding: "0.5",
});

export const glyphBoxFlushClass = css({
	height: "full",
	width: "full",
	maxHeight: "full",
	maxWidth: "full",
	borderWidth: 0,
	padding: "0.5",
});

export const glyphEmojiProminentClass = css({
	"& .ws-preset-icon--emoji": { fontSize: "3xl" },
	"& .ws-preset-icon--text:not([data-ws-preset-text-fit])": {
		fontSize: "shell-text-sm",
	},
});
