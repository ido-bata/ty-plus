import {
	segmentedButtonActiveClass,
	segmentedButtonClass,
	segmentedButtonInactiveClass,
	segmentedStripClass,
} from "@ty-plus/ui/styles/segmented";
import { cx } from "@ty-plus/ui/util/cx";
import type { ReactElement } from "react";

type SegmentedOption = { value: string; label: string; disabled?: boolean };

export type SegmentedControlProps = {
	options: SegmentedOption[];
	value: string;
	onChange: (value: string) => void;
	className?: string;
	buttonClassName?: string;
	selectedClassName?: string;
	unselectedClassName?: string;
	/** Accessible name for the group (i18n is the caller's responsibility). */
	"aria-label"?: string;
};

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
			className={cx(segmentedStripClass, className)}
		>
			{options.map((opt) => {
				const selected = opt.value === value;
				return (
					<button
						key={opt.value}
						type="button"
						disabled={opt.disabled}
						aria-pressed={selected}
						className={cx(
							segmentedButtonClass,
							selected
								? (selectedClassName ?? segmentedButtonActiveClass)
								: (unselectedClassName ?? segmentedButtonInactiveClass),
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
