import type { ReactElement } from "react";
import { cx } from "@/shared/util/cx";
import { css } from "@/styled-system/css";

type SegmentedOption = { value: string; label: string };

export type SegmentedControlProps = {
	options: SegmentedOption[];
	value: string;
	onChange: (value: string) => void;
	className?: string;
	buttonClassName?: string;
	selectedClassName?: string;
	unselectedClassName?: string;
	/** radiogroup label (i18n is caller's responsibility) */
	"aria-label": string;
};

const toolbar = css({
	display: "inline-flex",
	width: "full",
	minWidth: 0,
	maxWidth: "full",
	flexWrap: "wrap",
	gap: "1",
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.panel",
	padding: "0.5",
});

const buttonBase = css({
	height: "7",
	minWidth: 0,
	flex: 1,
	borderRadius: "shell-sm",
	paddingInline: "2",
	fontSize: "shell-text-sm",
	lineHeight: "tight",
	transitionProperty: "colors",
});

const buttonSelected = css({
	backgroundColor: "text.accent",
	color: "surface.panel",
	boxShadow: "sm",
});

const buttonUnselected = css({
	backgroundColor: "surface.widget",
	color: "text.muted",
	_hover: {
		backgroundColor: "interactive.hover",
		color: "text.primary",
	},
});

export function SegmentedControl(props: SegmentedControlProps): ReactElement {
	const {
		options,
		value,
		onChange,
		className,
		buttonClassName,
		selectedClassName,
		unselectedClassName,
		"aria-label": ariaLabel,
	} = props;
	return (
		<div
			role="toolbar"
			aria-label={ariaLabel}
			className={cx(toolbar, className)}
		>
			{options.map((opt) => {
				const selected = opt.value === value;
				return (
					<button
						key={opt.value}
						type="button"
						aria-pressed={selected}
						className={cx(
							buttonBase,
							selected
								? (selectedClassName ?? buttonSelected)
								: (unselectedClassName ?? buttonUnselected),
							buttonClassName,
						)}
						onClick={() => onChange(opt.value)}
					>
						{opt.label}
					</button>
				);
			})}
		</div>
	);
}
