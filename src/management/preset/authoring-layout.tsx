import { SegmentedControl, sectionTitleClass } from "@ty-plus/ui";
import type { JSX, ReactNode } from "react";
import { css, cx } from "@/styled-system/css";

const gridClass = css({
	display: "grid",
	width: "full",
	minWidth: "0",
	minHeight: "0",
	gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
	gap: "shell",
	"& > *": { minWidth: "0" },
});

const fieldBaseClass = css({
	display: "flex",
	width: "full",
	minWidth: "0",
	flexDirection: "column",
	gap: "1",
});

const spanClassBy: Record<2 | 3 | 4 | 6, string> = {
	2: css({ gridColumn: "span 2" }),
	3: css({ gridColumn: "span 3" }),
	4: css({ gridColumn: "span 4" }),
	6: css({ gridColumn: "span 6" }),
};

const sectionColumnClass = css({
	display: "flex",
	width: "full",
	minWidth: "0",
	flexDirection: "column",
	gap: "2",
});

const sectionHeadingClass = css({
	display: "flex",
	minWidth: "0",
	flexDirection: "column",
	gap: "0.5",
});

const sectionDescriptionClass = css({
	fontSize: "xs",
	color: "text.muted",
});

const inlineActionsClass = css({
	display: "flex",
	width: "full",
	minWidth: "0",
	flexWrap: "wrap",
	gap: "2",
});

export function AuthoringGrid({
	children,
}: {
	children: ReactNode;
}): JSX.Element {
	return <div className={gridClass}>{children}</div>;
}

export function AuthoringField({
	children,
	span = 6,
}: {
	children: ReactNode;
	span?: 2 | 3 | 4 | 6;
}): JSX.Element {
	const spanClass = spanClassBy[span];
	return <div className={cx(fieldBaseClass, spanClass)}>{children}</div>;
}

export function AuthoringSection({
	title,
	description,
	children,
	span = 6,
}: {
	title: string;
	description?: string;
	children?: ReactNode;
	span?: 3 | 6;
}): JSX.Element {
	return (
		<AuthoringField span={span}>
			<div className={sectionColumnClass}>
				<div className={sectionHeadingClass}>
					<span className={sectionTitleClass}>{title}</span>
					{description ? (
						<span className={sectionDescriptionClass}>{description}</span>
					) : null}
				</div>
				{children}
			</div>
		</AuthoringField>
	);
}

export function AuthoringSegment({
	value,
	onChange,
	options,
	ariaLabel,
}: {
	value: string;
	onChange: (value: string) => void;
	options: readonly { value: string; label: string }[];
	/** Accessible name for the group. */
	ariaLabel?: string;
}): JSX.Element {
	return (
		<SegmentedControl
			value={value}
			onChange={onChange}
			options={[...options]}
			aria-label={ariaLabel}
		/>
	);
}

function AuthoringInlineActions({
	children,
}: {
	children: ReactNode;
}): JSX.Element {
	return <div className={inlineActionsClass}>{children}</div>;
}
