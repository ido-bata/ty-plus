import { sectionLabelClass } from "@ty-plus/ui";
import { css } from "@/styled-system/css";

// Section-band headers only (e.g. the preview label). Field-level labels
// use `fieldLabelClass` — see Fields.tsx (issue #768).
export const SECTION_LABEL_CLASS = sectionLabelClass;

/*
 * Issue #795: these overrides used `--color-ty-widget-border` (#0e0e0e) —
 * darker than the dialog surface, i.e. an invisible border — which left
 * the add buttons and unselected rows effectively chromeless and made the
 * enabled "move down" arrow read almost identical to the disabled "move
 * up". The resting tier is now `border.subtle` (passive chrome) with
 * `border.control` on hover, matching the Button variant contract
 * (#722/#726).
 */
export const QUIET_CONTROL_CLASS = css({
	borderColor: "border.subtle",
	backgroundColor: "surface.widget",
	_hover: {
		borderColor: "border.control",
		backgroundColor: "var(--color-ty-ink-04)",
	},
});

export const QUIET_SELECTED_CLASS = css({
	// `border.control` (not the invisible `#000` widget-border-strong) is
	// what makes the selected segment/row read as selected at a glance —
	// jobs6 flagged the Cover/None segments as needing a closer look.
	borderColor: "border.control",
	backgroundColor: "var(--color-ty-ink-10)",
	color: "text.primary",
	boxShadow: "none",
});

export const QUIET_UNSELECTED_CLASS = css({
	// Same resting border as the Button `default` variant this class is
	// applied to — the previous widget-border override only removed the
	// boundary the variant contract provides.
	borderColor: "border.subtle",
	backgroundColor: "surface.widget",
	color: "text.muted",
	_hover: {
		backgroundColor: "var(--color-ty-ink-04)",
		color: "text.primary",
	},
});
