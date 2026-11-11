import { css } from "@/styled-system/css";

const PANEL_ID = "dialog-background-panel";

const BG_CTX = {
	save: "ty.ctx.background.save",
	cancel: "ty.ctx.background.cancel",
	clearAll: "ty.ctx.background.clear-all",
	addColor: "ty.ctx.background.add.color",
	addPattern: "ty.ctx.background.add.pattern",
	addImage: "ty.ctx.background.add.image",
	selectPrefix: "ty.ctx.background.select:",
	togglePrefix: "ty.ctx.background.toggle:",
	removePrefix: "ty.ctx.background.remove:",
	moveUpPrefix: "ty.ctx.background.move-up:",
	moveDownPrefix: "ty.ctx.background.move-down:",
	typeColorPrefix: "ty.ctx.background.type.color:",
	typePatternPrefix: "ty.ctx.background.type.pattern:",
	typeImagePrefix: "ty.ctx.background.type.image:",
} as const;

export const FIELD_LABEL_CLASS = css({
	fontSize: "text-xs",
	fontWeight: "medium",
	textTransform: "uppercase",
	letterSpacing: "wide",
	color: "text.muted",
});

export const QUIET_CONTROL_CLASS = css({
	borderColor: "var(--color-ty-widget-border)",
	backgroundColor: "surface.widget",
	_hover: {
		borderColor: "var(--color-ty-widget-border-strong)",
		backgroundColor: "var(--color-ty-ink-04)",
	},
});

export const QUIET_SELECTED_CLASS = css({
	borderColor: "var(--color-ty-widget-border-strong)",
	backgroundColor: "var(--color-ty-ink-10)",
	color: "text.primary",
	boxShadow: "none",
});

export const QUIET_UNSELECTED_CLASS = css({
	borderColor: "var(--color-ty-widget-border)",
	backgroundColor: "surface.widget",
	color: "text.muted",
	_hover: {
		backgroundColor: "var(--color-ty-ink-04)",
		color: "text.primary",
	},
});
