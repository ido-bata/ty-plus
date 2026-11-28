import { IconButton } from "@ty-plus/ui/controls/IconButton";
import { cx } from "@ty-plus/ui/util/cx";
import {
	type InputHTMLAttributes,
	type ReactElement,
	type ReactNode,
	useLayoutEffect,
	useRef,
} from "react";
import { css } from "@/styled-system/css";

export type PathFieldProps = {
	value: string;
	onChange: (value: string) => void;
	onBrowse?: () => void;
	/** Browse button (bordered variant recommended) */
	browseSlot: ReactNode;
	browseAriaLabel: string;
	placeholder?: string;
	uiSize?: "sm" | "md" | "lg";
	size?: "sm" | "md" | "lg";
	className?: string;
	disabled?: boolean;
	readOnly?: boolean;
	/** Extra props on the path `<input>` (e.g. `onKeyDown` for Enter-to-apply). */
	inputProps?: Omit<
		InputHTMLAttributes<HTMLInputElement>,
		"value" | "onChange" | "type"
	>;
};

const sizes: Record<NonNullable<PathFieldProps["uiSize"]>, string> = {
	sm: css({
		height: "7",
		minHeight: "7",
		paddingInline: "2",
		fontSize: "shell-text-sm",
	}),
	md: css({
		height: "8",
		minHeight: "8",
		paddingInline: "2.5",
		fontSize: "shell-text-sm",
	}),
	lg: css({
		height: "9",
		minHeight: "9",
		paddingInline: "3",
		fontSize: "text-md",
	}),
};

const inputClass = css({
	width: "full",
	minWidth: 0,
	flex: 1,
	borderRadius: "shell-sm",
	borderWidth: "hairline",
	borderStyle: "solid",
	borderColor: "border.input",
	backgroundColor: "surface.widget",
	color: "text.primary",
	outline: "none",
	transitionProperty: "color, background-color, border-color",
	_focus: {
		borderColor: "interactive.focus",
		boxShadow: "var(--color-focus-ring)",
	},
	// Issue #798: disabled text-entry chrome drops to the passive
	// `border.subtle` tier — the same contract Input/SearchField follow.
	_disabled: { opacity: 0.5, borderColor: "border.subtle" },
});

const wrapper = css({
	display: "flex",
	width: "full",
	alignItems: "center",
	gap: "1.5",
	// Issue #798: the browse button sits flush against the path input, so
	// when the whole field is disabled its frame must drop to the same
	// passive `border.subtle` tier instead of staying at `border.control`.
	"&[data-disabled='true'] button": {
		borderColor: "border.subtle",
	},
});

const browseButton = css({
	flexShrink: 0,
	borderWidth: "hairline",
	borderStyle: "solid",
	// The browse button sits flush against the path input, so its resting
	// border must match the input's `border.control` tier.
	borderColor: "border.control",
	backgroundColor: "surface.widget",
	_hover: {
		backgroundColor: "interactive.hover",
		color: "text.primary",
	},
});

export function PathField(props: PathFieldProps): ReactElement {
	const {
		value,
		onChange,
		onBrowse,
		browseSlot,
		browseAriaLabel,
		placeholder,
		uiSize = "md",
		size,
		className,
		disabled,
		readOnly,
		inputProps,
	} = props;
	const resolvedSize = size ?? uiSize;
	const inputRef = useRef<HTMLInputElement | null>(null);

	// Pin the tail of long paths (the filename end) into view. The previous
	// `direction: rtl` trick reordered leading neutral characters such as `/`,
	// so absolute paths rendered as `sample/preset/bg.png/`.
	// biome-ignore lint/correctness/useExhaustiveDependencies: re-pin the tail whenever the value changes
	useLayoutEffect(() => {
		const el = inputRef.current;
		if (el) {
			el.scrollLeft = el.scrollWidth;
		}
	}, [value]);

	return (
		<div
			className={cx(wrapper, className)}
			data-path-field
			data-disabled={disabled ? "true" : undefined}
		>
			<input
				ref={inputRef}
				type="text"
				{...inputProps}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				placeholder={placeholder}
				className={cx("ty-ui-input", inputClass, sizes[resolvedSize])}
				disabled={disabled}
				readOnly={readOnly}
				autoComplete="off"
				spellCheck={false}
			/>
			<IconButton
				type="button"
				variant="ghost"
				size={resolvedSize}
				className={browseButton}
				aria-label={browseAriaLabel}
				disabled={disabled || !onBrowse}
				onClick={onBrowse}
			>
				{browseSlot}
			</IconButton>
		</div>
	);
}
