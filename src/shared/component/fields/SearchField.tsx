import type { LucideIcon } from "lucide-react";
import { X } from "lucide-react";
import type {
	ChangeEvent,
	InputHTMLAttributes,
	JSX,
	ReactNode,
	Ref,
} from "react";
import { Icon } from "@/shared/component/icons/Icon";
import { cx, Input } from "@/shared/component/index";
import { css } from "@/styled-system/css";

export type SearchFieldProps = {
	icon: LucideIcon;
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
	borderColor: "border.default",
	backgroundColor: "surface.widget",
	paddingInline: "1.5",
	paddingBlock: "0.5",
	transitionProperty: "border-color,box-shadow",
	_focusWithin: {
		borderColor: "interactive.focus",
		boxShadow: "inset 0 0 0 1px var(--color-interactive-focus)",
	},
});

const iconSlot = css({ flexShrink: 0, color: "text.muted" });

const innerInput = css({
	minWidth: 0,
	width: "full",
	flex: 1,
	border: 0,
	backgroundColor: "transparent",
	boxShadow: "none",
	_focusVisible: { boxShadow: "none" },
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
	_hover: {
		backgroundColor: "interactive.hover",
		color: "text.primary",
	},
});

export function SearchField({
	icon,
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
		<div className={cx(root, className)}>
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
					aria-label="Clear search"
					title="Clear"
					onClick={handleClear}
				>
					<Icon icon={X} size={10} aria-hidden />
				</button>
			) : null}
		</div>
	);
}
