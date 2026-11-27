import {
	segmentedButtonActiveClass,
	segmentedButtonClass,
	segmentedButtonInactiveClass,
	segmentedMeasureHostClass,
	segmentedMeasureStripClass,
	segmentedStripClass,
} from "@ty-plus/ui/styles/segmented";
import { cx } from "@ty-plus/ui/util/cx";
import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";

type SegmentedOption = {
	value: string;
	label: string;
	/**
	 * Shorter stand-in for `label`, rendered when the strip is too narrow
	 * for every full label on a single row. The full label always remains
	 * the accessible name and the hover title.
	 */
	compactLabel?: string;
	disabled?: boolean;
};

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

const compactLabelOf = (opt: SegmentedOption): string | undefined =>
	typeof opt.compactLabel === "string" && opt.compactLabel !== ""
		? opt.compactLabel
		: undefined;

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

	const hasCompactLabels = options.some(
		(opt) => compactLabelOf(opt) !== undefined,
	);
	const [compact, setCompact] = useState(false);
	const stripRef = useRef<HTMLDivElement | null>(null);
	const fullMeasureRef = useRef<HTMLDivElement | null>(null);
	const compactMeasureRef = useRef<HTMLDivElement | null>(null);

	// The observer watches the strip and both measurement twins, so label,
	// option, or class changes re-measure through their size changes — no
	// dependency on the (inline-rebuilt) `options` array is needed. The
	// strip's width comes from its parent (`width: full`), never from the
	// rendered labels, so the decision cannot feed back into itself.
	useEffect(() => {
		if (!hasCompactLabels) {
			setCompact(false);
			return;
		}
		const strip = stripRef.current;
		const fullMeasure = fullMeasureRef.current;
		const compactMeasure = compactMeasureRef.current;
		if (!strip || !fullMeasure) return;
		const update = () => {
			// `clientWidth` is the padding box on both the strip and the
			// measurement twins, so the comparison needs no border
			// correction. 1px slack absorbs sub-pixel rounding. Compact
			// mode is only useful when it is actually narrower.
			const available = strip.clientWidth;
			const fullWidth = fullMeasure.clientWidth;
			const compactWidth = compactMeasure?.clientWidth ?? fullWidth;
			setCompact(fullWidth > available + 1 && compactWidth <= fullWidth);
		};
		update();
		if (typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(update);
		observer.observe(strip);
		observer.observe(fullMeasure);
		if (compactMeasure) observer.observe(compactMeasure);
		return () => observer.disconnect();
	}, [hasCompactLabels]);

	const segmentClass = (opt: SegmentedOption): string =>
		cx(
			segmentedButtonClass,
			opt.value === value
				? (selectedClassName ?? segmentedButtonActiveClass)
				: (unselectedClassName ?? segmentedButtonInactiveClass),
			buttonClassName,
		);

	const visibleLabel = (opt: SegmentedOption): string => {
		const short = compactLabelOf(opt);
		return compact && short !== undefined ? short : opt.label;
	};

	return (
		<>
			<div
				ref={stripRef}
				role="toolbar"
				aria-label={ariaLabel}
				className={cx(segmentedStripClass, className)}
			>
				{options.map((opt) => {
					const selected = opt.value === value;
					const short = compactLabelOf(opt);
					return (
						<button
							key={opt.value}
							type="button"
							disabled={opt.disabled}
							aria-pressed={selected}
							aria-label={opt.label}
							title={compact && short !== undefined ? opt.label : undefined}
							className={segmentClass(opt)}
							onClick={() => onChange(opt.value)}
						>
							{visibleLabel(opt)}
						</button>
					);
				})}
			</div>
			{hasCompactLabels ? (
				<div aria-hidden="true" className={segmentedMeasureHostClass}>
					<div
						ref={fullMeasureRef}
						className={cx(segmentedMeasureStripClass, className)}
					>
						{options.map((opt) => (
							<span key={opt.value} className={segmentClass(opt)}>
								{opt.label}
							</span>
						))}
					</div>
					<div
						ref={compactMeasureRef}
						className={cx(segmentedMeasureStripClass, className)}
					>
						{options.map((opt) => (
							<span key={opt.value} className={segmentClass(opt)}>
								{compactLabelOf(opt) ?? opt.label}
							</span>
						))}
					</div>
				</div>
			) : null}
		</>
	);
}
