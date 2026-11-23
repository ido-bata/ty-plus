import { Input } from "@ty-plus/ui/fields/Input";
import { Icon } from "@ty-plus/ui/Icon";
import { cx } from "@ty-plus/ui/util/cx";
import type { LucideIcon } from "lucide-react";
import { X } from "lucide-react";
import type {
	ChangeEvent,
	InputHTMLAttributes,
	JSX,
	ReactNode,
	Ref,
} from "react";
import { useTranslation } from "react-i18next";
import { css } from "@/styled-system/css";

export type SearchFieldProps = {
	icon: LucideIcon;
	/**
	 * Control height in spacing units, matching the shared control scale.
	 * Callers must not override the height with `className` — the field's
	 * height is part of its contract.
	 */
	uiSize?: "sm" | "md" | "lg";
	/**
	 * When true, the inner input is uncontrolled (no `value` passed through to DOM).
	 * Use with `defaultValue` when a parent listens on bubble (e.g. `data-ws-action` + container `input`).
	 */
	uncontrolled?: boolean;
	className?: string;
	inputClassName?: string;
	/** Optional ref to the inner `<input>` (e.g. imperative clear + `input` dispatch). */
	inputRef?: Ref<HTMLInputElement | null>;
	/**
	 * When true, reserves space between the input and clear button for `inlineTrailing`
	 * (e.g. result count or loading state inside the field).
	 */
	showInlineTrailing?: boolean;
	/** Shown inside the field to the left of the clear button when `showInlineTrailing` is true. */
	inlineTrailing?: ReactNode;
	inlineTrailingClassName?: string;
	/** When set, clear is only shown while the input has text; clearing uses `onClear` or fires an empty `onChange`. */
	showClearButton?: boolean;
	onClear?: () => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

const root = css({
	display: "flex",
	width: "full",
	minWidth: 0,
	maxWidth: "full",
	flex: 1,
	alignItems: "center",
	gap: "1",
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.control",
	backgroundColor: "surface.widget",
	paddingInline: "1.5",
	paddingBlock: "0.5",
	transitionProperty: "border-color,box-shadow",
	_focusWithin: {
		borderColor: "interactive.focus",
		boxShadow: "var(--color-focus-ring)",
	},
});

const iconSlot = css({ flexShrink: 0, color: "text.muted" });

const sizeMap: Record<NonNullable<SearchFieldProps["uiSize"]>, string> = {
	sm: css({ height: "7", minHeight: "7", paddingBlock: 0 }),
	md: css({ height: "8", minHeight: "8", paddingBlock: 0 }),
	lg: css({ height: "9", minHeight: "9", paddingBlock: 0 }),
};

const innerInput = css({
	minWidth: 0,
	width: "full",
	flex: 1,
	border: 0,
	borderWidth: "0",
	borderColor: "transparent",
	backgroundColor: "transparent",
	boxShadow: "none",
	// Issue #144: the inner input must never paint its own focus border —
	// the wrapper's `_focusWithin` ring is the single focus indicator.
	_focus: { borderColor: "transparent" },
	// The wrapper owns the focus indicator (its `_focusWithin` ring). The
	// inner input must not paint a second one.
	_focusVisible: {
		borderColor: "transparent",
		boxShadow: "none",
	},
});

const inlineTrailingCls = css({
	pointerEvents: "none",
	display: "flex",
	minWidth: 0,
	maxWidth: "min(14rem, 42%)",
	flexShrink: 0,
	userSelect: "none",
	alignItems: "center",
	justifyContent: "flex-end",
	gap: "1",
	truncate: true,
	fontSize: "text-xs",
	color: "text.muted",
});

const clearButton = css({
	display: "inline-flex",
	flexShrink: 0,
	alignItems: "center",
	justifyContent: "center",
	borderRadius: "shell-sm",
	padding: "0.5",
	color: "text.muted",
	outline: "none",
	transitionProperty: "colors",
	_hover: {
		backgroundColor: "interactive.hover",
		color: "text.primary",
	},
	_focusVisible: {
		boxShadow: "var(--color-focus-ring)",
		outlineOffset: "0",
	},
});

export function SearchField({
	icon,
	uiSize = "md",
	uncontrolled = false,
	className,
	inputClassName,
	inputRef,
	showInlineTrailing,
	inlineTrailing,
	inlineTrailingClassName,
	showClearButton,
	onClear,
	value,
	onChange,
	...rest
}: SearchFieldProps): JSX.Element {
	const { t } = useTranslation();
	const str = uncontrolled
		? typeof rest.defaultValue === "string"
			? rest.defaultValue
			: ""
		: typeof value === "string"
			? value
			: value == null
				? ""
				: String(value);
	const showClear = Boolean(showClearButton && str.length > 0);

	const handleClear = (): void => {
		if (onClear) {
			onClear();
			return;
		}
		if (!onChange) {
			return;
		}
		const synthetic = {
			currentTarget: { value: "" },
			target: { value: "" },
		} as ChangeEvent<HTMLInputElement>;
		onChange(synthetic);
	};

	return (
		<div className={cx(root, sizeMap[uiSize], className)}>
			<Icon icon={icon} size={10} className={iconSlot} aria-hidden />
			<Input
				ref={inputRef}
				type="search"
				{...(uncontrolled
					? { defaultValue: rest.defaultValue, onChange }
					: { value, onChange })}
				className={cx(innerInput, inputClassName)}
				{...(uncontrolled
					? (() => {
							const { defaultValue: _d, ...r } = rest as typeof rest & {
								defaultValue?: unknown;
							};
							return r;
						})()
					: rest)}
			/>
			{showInlineTrailing ? (
				<div className={cx(inlineTrailingCls, inlineTrailingClassName)}>
					{inlineTrailing}
				</div>
			) : null}
			{showClear ? (
				<button
					type="button"
					className={clearButton}
					aria-label={t("ui.searchField.clearAria", {
						defaultValue: "Clear search",
					})}
					title={t("ui.searchField.clearTitle", { defaultValue: "Clear" })}
					onClick={handleClear}
				>
					<Icon icon={X} size={10} aria-hidden />
				</button>
			) : null}
		</div>
	);
}
