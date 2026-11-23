import { sectionLabelClass } from "@ty-plus/ui";
import { css } from "@/styled-system/css";

export const FIELD_LABEL_CLASS = sectionLabelClass;

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
