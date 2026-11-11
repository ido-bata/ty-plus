import { ChevronDown } from "lucide-react";
import { type JSX, type ReactNode, useState } from "react";
import { Icon } from "@/shared/component";
import { css } from "@/styled-system/css";

export type CollapsibleGroupHeaderProps = {
	title: string;
	count: number;
	children: ReactNode;
	defaultOpen?: boolean;
	onToggle?: (isOpen: boolean) => void;
};

/**
 * Collapsible group header for catalog presets.
 * Scope: catalog browser only — not coupled to the settings dialog command bus.
 */
export function CollapsibleGroupHeader({
	title,
	count,
	children,
	defaultOpen = true,
	onToggle,
}: CollapsibleGroupHeaderProps): JSX.Element {
	const [isOpen, setIsOpen] = useState(defaultOpen);

	return (
		<div
			className={css({
				boxSizing: "border-box",
				width: "full",
				minWidth: 0,
				borderRadius: "shell-sm",
				borderWidth: "1px",
				borderStyle: "solid",
				borderColor: "border.default",
				backgroundColor: "surface.widget",
				opacity: 0.4,
			})}
			data-directory-browser-group
			data-group-id={title}
		>
			<button
				type="button"
				className={css({
					display: "flex",
					width: "full",
					alignItems: "center",
					justifyContent: "space-between",
					gap: "2",
					borderRadius: "shell-sm",
					paddingInline: "2.5",
					paddingBlock: "1.5",
					textAlign: "left",
					fontFamily: "inherit",
					_hover: { backgroundColor: "interactive.hover" },
					_focusVisible: {
						boxShadow: "0 0 0 2px var(--color-interactive-focus)",
					},
				})}
				onClick={() => {
					const next = !isOpen;
					setIsOpen(next);
					onToggle?.(next);
				}}
				aria-expanded={isOpen}
			>
				<span
					className={css({
						display: "flex",
						minWidth: 0,
						alignItems: "center",
						gap: "2",
					})}
				>
					<Icon
						icon={ChevronDown}
						size={14}
						className={css({
							flexShrink: 0,
							color: "text.muted",
							transitionProperty: "transform",
							transform: isOpen ? "rotate(0)" : "rotate(-90deg)",
						})}
						aria-hidden
					/>
					<span
						className={css({
							truncate: true,
							fontSize: "shell-text-sm",
							fontWeight: "medium",
							color: "text.primary",
						})}
					>
						{title}
					</span>
				</span>
				<span
					className={css({
						flexShrink: 0,
						borderRadius: "shell-sm",
						borderWidth: "1px",
						borderStyle: "solid",
						borderColor: "border.default",
						backgroundColor: "surface.dialog",
						paddingInline: "1.5",
						paddingBlock: "0.5",
						fontSize: "text-2xs",
						color: "text.muted",
						fontVariantNumeric: "tabular-nums",
					})}
				>
					{count}
				</span>
			</button>
			{isOpen ? (
				<div
					className={css({
						display: "flex",
						width: "full",
						minWidth: 0,
						flexDirection: "column",
						gap: "1",
						borderTopWidth: "1px",
						borderTopStyle: "solid",
						borderTopColor: "border.default",
						paddingInline: "1.5",
						paddingBlock: "1.5",
					})}
				>
					{children}
				</div>
			) : null}
		</div>
	);
}
