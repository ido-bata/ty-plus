import type { ReactElement } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { cx } from "@/shared/util/cx";
import { css } from "@/styled-system/css";

type ListSelectOption = { value: string; label: string };

const root = css({ position: "relative", width: "full", minWidth: 0 });

const optionBase = css({
	display: "flex",
	width: "full",
	minWidth: 0,
	alignItems: "center",
	paddingInline: "2.5",
	paddingBlock: "1.5",
	textAlign: "left",
	fontSize: "shell-text-sm",
	lineHeight: "snug",
	color: "text.primary",
});

const optionSelected = css({
	backgroundColor: "interactive.hover",
	fontWeight: "medium",
	color: "text.primary",
});

const optionUnselected = css({
	backgroundColor: "surface.dialog",
	_hover: { backgroundColor: "interactive.hover" },
});

const triggerSm = css({
	boxSizing: "border-box",
	height: "8",
	minHeight: "8",
	maxHeight: "8",
	paddingInline: "2.5",
	paddingBlock: 0,
	fontSize: "shell-text-sm",
	lineHeight: 1,
});

const triggerMd = css({
	minHeight: "9",
	paddingInline: "3",
	paddingBlock: "1.5",
	fontSize: "shell-text-sm",
});

const triggerBase = css({
	display: "flex",
	width: "full",
	minWidth: 0,
	alignItems: "center",
	justifyContent: "space-between",
	gap: "2",
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.widget",
	textAlign: "left",
	color: "text.primary",
	outline: "none",
	transitionProperty: "border-color,box-shadow,background-color",
	_hover: { backgroundColor: "interactive.hover" },
	_focusVisible: {
		borderColor: "interactive.focus",
		boxShadow: "inset 0 0 0 1px var(--color-interactive-focus)",
		outline: "none",
	},
	_disabled: {
		pointerEvents: "none",
		opacity: 0.5,
	},
});

const listBox = css({
	position: "absolute",
	left: 0,
	right: 0,
	top: "calc(100% + 4px)",
	zIndex: 50,
	maxHeight: "60",
	minWidth: 0,
	overflowY: "auto",
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.dialog",
	paddingBlock: "1",
	color: "text.primary",
	boxShadow: "control-panel",
});

const triggerLabel = css({ minWidth: 0, flex: 1, truncate: true });

const triggerCaret = css({
	flexShrink: 0,
	fontSize: "text-xs",
	color: "text.muted",
});

const optionCls = (isSel: boolean): string =>
	cx(optionBase, isSel ? optionSelected : optionUnselected);

export type ListSelectProps = {
	options: ListSelectOption[];
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	/** Compact trigger. Make text / tap area larger on the opened list side */
	uiSize?: "sm" | "md";
	className?: string;
	/** Extra classes on the trigger button (height, padding, typography). */
	triggerClassName?: string;
	id?: string;
	"aria-label"?: string;
	disabled?: boolean;
};

/** Semantic utility in the same family as Input / Select (follows `theme.css` / CEP-injected `--color-*`) */
export function ListSelect(props: ListSelectProps): ReactElement {
	const {
		options,
		value,
		onChange,
		placeholder = "Select…",
		uiSize = "md",
		className,
		triggerClassName,
		id: idProp,
		"aria-label": ariaLabel,
		disabled = false,
	} = props;
	const autoId = useId();
	const id = idProp ?? `ty-listselect-${autoId}`;
	const [open, setOpen] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);

	const selected = options.find((o) => o.value === value);
	const label = selected?.label ?? placeholder;

	useEffect(() => {
		if (!open) {
			return;
		}
		const onDoc = (e: MouseEvent) => {
			const el = rootRef.current;
			if (el && !el.contains(e.target as Node)) {
				setOpen(false);
			}
		};
		document.addEventListener("mousedown", onDoc, true);
		return () => document.removeEventListener("mousedown", onDoc, true);
	}, [open]);

	const triggerSize = uiSize === "sm" ? triggerSm : triggerMd;

	return (
		<div ref={rootRef} className={cx(root, className)}>
			<button
				id={id}
				type="button"
				disabled={disabled}
				aria-haspopup="listbox"
				aria-expanded={open}
				aria-controls={`${id}-listbox`}
				aria-label={ariaLabel}
				className={cx(triggerBase, triggerSize, triggerClassName)}
				onClick={() => !disabled && setOpen((o) => !o)}
			>
				<span className={triggerLabel}>{label}</span>
				<span className={triggerCaret} aria-hidden>
					▾
				</span>
			</button>
			{open ? (
				<div
					// biome-disable-next-line useSemanticElements -- listbox role requires div for proper ARIA structure
					id={`${id}-listbox`}
					role="listbox"
					tabIndex={-1}
					aria-labelledby={id}
					className={listBox}
				>
					{options.map((opt) => {
						const isSel = opt.value === value;
						return (
							<div
								// biome-disable-next-line useSemanticElements -- option role requires div for button containment
								key={opt.value}
							>
								<button
									type="button"
									role="option"
									aria-selected={isSel}
									className={optionCls(isSel)}
									onClick={() => {
										onChange(opt.value);
										setOpen(false);
									}}
								>
									{opt.label}
								</button>
							</div>
						);
					})}
				</div>
			) : null}
		</div>
	);
}
