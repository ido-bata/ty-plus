import { AnchoredPopover } from "@ty-plus/ui/interaction/AnchoredPopover";
import { cx } from "@ty-plus/ui/util/cx";
import type { ReactElement } from "react";
import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { css } from "@/styled-system/css";

type ListSelectOption = { value: string; label: string };

const rootFull = css({ width: "full", minWidth: 0 });

/*
 * Intrinsic-width variant for compact picker rows (e.g. the font viewer
 * sample row): the trigger shrink-wraps its label instead of claiming the
 * full flex line and wrapping sibling controls (issue #754).
 */
const rootFitContent = css({
	width: "fit-content",
	maxWidth: "full",
	minWidth: 0,
});

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
	borderWidth: "hairline",
	borderStyle: "solid",
	// Issue #754: the trigger is an identifiable control (clickable select),
	// so per the `ty-border-control` contract it rests on `border.control`
	// like Input/Textarea/Checkbox — not the passive-chrome `border.subtle`.
	// Focus still escalates to `interactive.focus` + the shared ring.
	borderColor: "border.control",
	backgroundColor: "surface.widget",
	textAlign: "left",
	color: "text.primary",
	outline: "none",
	transitionProperty: "border-color,box-shadow,background-color",
	_hover: { backgroundColor: "interactive.hover" },
	_focusVisible: {
		borderColor: "interactive.focus",
		boxShadow: "var(--color-focus-ring)",
		outline: "none",
	},
	_disabled: {
		pointerEvents: "none",
		opacity: 0.5,
	},
});

const listBox = css({
	minWidth: 0,
	overflowY: "auto",
	borderRadius: "shell-sm",
	borderWidth: "hairline",
	borderStyle: "solid",
	borderColor: "border.subtle",
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
	/**
	 * `full` (default) stretches the trigger across the container — the
	 * form-row contract. `fitContent` shrink-wraps the trigger to its
	 * label for compact picker rows.
	 */
	width?: "full" | "fitContent";
	id?: string;
	"aria-label"?: string;
	disabled?: boolean;
};

/** Semantic utility in the same family as Input / Select (follows `theme.css` / CEP-injected `--color-*`) */
export function ListSelect(props: ListSelectProps): ReactElement {
	const { t } = useTranslation();
	const {
		options,
		value,
		onChange,
		placeholder,
		uiSize = "md",
		className,
		triggerClassName,
		width = "full",
		id: idProp,
		"aria-label": ariaLabel,
		disabled = false,
	} = props;
	const autoId = useId();
	const id = idProp ?? `ty-listselect-${autoId}`;
	const [open, setOpen] = useState(false);
	const triggerRef = useRef<HTMLButtonElement>(null);

	const selected = options.find((o) => o.value === value);
	const label =
		selected?.label ??
		placeholder ??
		t("ui.listSelect.placeholder", { defaultValue: "Select…" });

	const triggerSize = uiSize === "sm" ? triggerSm : triggerMd;

	return (
		<div
			className={cx(
				width === "fitContent" ? rootFitContent : rootFull,
				className,
			)}
		>
			<button
				ref={triggerRef}
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
			<AnchoredPopover
				open={open}
				onClose={() => setOpen(false)}
				anchorRef={triggerRef}
				align="start"
				matchAnchorWidth
				maxHeight="15rem"
				// biome-disable-next-line useSemanticElements -- listbox role requires div for proper ARIA structure
				id={`${id}-listbox`}
				role="listbox"
				aria-labelledby={id}
				tabIndex={-1}
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
			</AnchoredPopover>
		</div>
	);
}
