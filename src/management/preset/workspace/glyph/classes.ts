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

export const DEFAULT_EMOJI_CLASS = "";

export const frameBase = css({
	display: "flex",
	flexShrink: 0,
	alignItems: "center",
	justifyContent: "center",
	overflow: "hidden",
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.widget",
	minHeight: "0",
	minWidth: "0",
	containerType: "size",
	"& [data-ws-preset-icon='image']": {
		display: "flex",
		height: "full",
		minHeight: "0",
		width: "full",
		minWidth: "0",
		overflow: "hidden",
	},
	"& [data-ws-preset-icon='image'] img": {
		height: "full",
		width: "full",
		minHeight: "0",
		minWidth: "0",
		objectFit: "cover",
		objectPosition: "center",
	},
});

export const framedTextClass = css({
	"& [data-ws-preset-text]:not([data-ws-preset-text-fit])": {
		fontSize: "2xs",
	},
});
