import type { InputHTMLAttributes, ReactElement, ReactNode } from "react";
import { IconButton } from "@/shared/component/controls/IconButton";
import { cx } from "@/shared/util/cx";
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
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.input",
	backgroundColor: "surface.widget",
	color: "text.primary",
	outline: "none",
	transitionProperty: "colors",
	_focus: { borderColor: "interactive.focus" },
	_disabled: { opacity: 0.5 },
});

const wrapper = css({
	display: "flex",
	width: "full",
	alignItems: "center",
	gap: "1.5",
});

const browseButton = css({
	flexShrink: 0,
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.widget",
	opacity: 0.5,
	color: "text.muted",
	_hover: {
		backgroundColor: "interactive.hover",
		color: "text.primary",
	},
});

// RTL direction with LTR text alignment keeps the trailing portion of long
// paths pinned to the start of the field (so the browse button can sit flush
// against it) while still rendering paths left-to-right.
const PATH_INPUT_STYLE = { direction: "rtl", textAlign: "left" } as const;

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

	return (
		<div className={cx(wrapper, className)} data-path-field>
			<input
				type="text"
				{...inputProps}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				placeholder={placeholder}
				style={PATH_INPUT_STYLE}
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
