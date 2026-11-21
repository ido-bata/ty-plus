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

const sectionTitleClass = css({
	display: "flex",
	minWidth: "0",
	flexDirection: "column",
	gap: "0.5",
});

const sectionTitleTextClass = css({
	fontSize: "shell-text-sm",
	fontWeight: "semibold",
	color: "text.primary",
});

const sectionDescriptionClass = css({
	fontSize: "xs",
	color: "text.muted",
});

const segmentContainerClass = css({
	display: "inline-flex",
	width: "full",
	minWidth: "0",
	maxWidth: "full",
	gap: "1",
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.panel",
	padding: "0.5",
});

const segmentButtonBaseClass = css({
	height: "8",
	minWidth: "0",
	flex: "1",
	borderRadius: "shell-sm",
	paddingInline: "2",
	fontSize: "shell-text-sm",
	lineHeight: "tight",
	transitionProperty: "colors",
});

const segmentButtonActiveClass = css({
	backgroundColor: "text.accent",
	color: "surface.panel",
	boxShadow: "sm",
});

const segmentButtonInactiveClass = css({
	backgroundColor: "surface.widget",
	color: "text.muted",
	_hover: {
		backgroundColor: "interactive.hover",
		color: "text.primary",
	},
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
				<div className={sectionTitleClass}>
					<span className={sectionTitleTextClass}>{title}</span>
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
}: {
	value: string;
	onChange: (value: string) => void;
	options: readonly { value: string; label: string }[];
}): JSX.Element {
	return (
		<div className={segmentContainerClass}>
			{options.map((option) => (
				<button
					key={option.value}
					type="button"
					className={cx(
						segmentButtonBaseClass,
						value === option.value
							? segmentButtonActiveClass
							: segmentButtonInactiveClass,
					)}
					onClick={() => onChange(option.value)}
				>
					{option.label}
				</button>
			))}
		</div>
	);
}

function AuthoringInlineActions({
	children,
}: {
	children: ReactNode;
}): JSX.Element {
	return <div className={inlineActionsClass}>{children}</div>;
}
