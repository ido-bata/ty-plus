import type { JSX, ReactNode } from "react";
import { cx } from "@/shared/util/cx";
import { css } from "@/styled-system/css";

const SETTINGS_GRID_CLASS = css({
	display: "grid",
	width: "full",
	minWidth: 0,
	gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
	gap: "var(--ty-shell-space)",
	"& > *": {
		minWidth: 0,
	},
});

/** Shared height for paired settings controls (ListSelect, Button, Input md). */
export const SETTINGS_CONTROL_HEIGHT_CLASS = css({
	height: "var(--ty-space-8)",
	minHeight: "var(--ty-space-8)",
	maxHeight: "var(--ty-space-8)",
	boxSizing: "border-box",
	paddingBlock: "0",
	lineHeight: "none",
});

type ColSpan = 1 | 2 | 3 | 4 | 5 | 6;

const COL_SPAN_CLASS: Record<ColSpan, string> = {
	1: css({ gridColumn: "span 1 / span 1", minWidth: 0 }),
	2: css({ gridColumn: "span 2 / span 2", minWidth: 0 }),
	3: css({ gridColumn: "span 3 / span 3", minWidth: 0 }),
	4: css({ gridColumn: "span 4 / span 4", minWidth: 0 }),
	5: css({ gridColumn: "span 5 / span 5", minWidth: 0 }),
	6: css({ gridColumn: "span 6 / span 6", minWidth: 0 }),
};

const fieldStyle = css({
	display: "flex",
	width: "full",
	minWidth: 0,
	flexDirection: "column",
	gap: "var(--ty-space-1)",
});

const fieldLabelStyle = css({
	fontSize: "text-xs",
	fontWeight: "medium",
	color: "text.primary",
});

const sectionHeadingStyle = css({
	fontSize: "text-xs",
	fontWeight: "semibold",
	textTransform: "uppercase",
	letterSpacing: "wider",
	color: "text.primary",
});

export function SettingsGrid({
	children,
	className = "",
}: {
	children: ReactNode;
	className?: string;
}): JSX.Element {
	return <div className={cx(SETTINGS_GRID_CLASS, className)}>{children}</div>;
}

export function SettingsField({
	span = 6,
	children,
	className = "",
}: {
	span?: ColSpan;
	children: ReactNode;
	className?: string;
}): JSX.Element {
	return (
		<div className={cx(fieldStyle, COL_SPAN_CLASS[span], className)}>
			{children}
		</div>
	);
}

export function SettingsFieldLabel({
	children,
}: {
	children: ReactNode;
}): JSX.Element {
	return <span className={fieldLabelStyle}>{children}</span>;
}

export function SettingsSectionHeading({
	children,
}: {
	children: ReactNode;
}): JSX.Element {
	return (
		<SettingsField span={6}>
			<span className={sectionHeadingStyle}>{children}</span>
		</SettingsField>
	);
}
