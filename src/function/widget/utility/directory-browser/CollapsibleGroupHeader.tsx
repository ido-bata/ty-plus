import { Badge, Button, Icon, rowLabelClass } from "@ty-plus/ui";
import { ChevronDown } from "lucide-react";
import { type JSX, type ReactNode, useId, useState } from "react";
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
	const panelId = useId();

	return (
		<div
			className={css({
				boxSizing: "border-box",
				width: "full",
				minWidth: 0,
				borderRadius: "shell-sm",
				borderWidth: "hairline",
				borderStyle: "solid",
				borderColor: "border.default",
				backgroundColor: "surface.widget",
			})}
			data-directory-browser-group
			data-group-id={title}
		>
			<Button
				type="button"
				variant="bare"
				uiSize="sm"
				fullWidth
				className={css({
					justifyContent: "flex-start",
					textAlign: "left",
				})}
				start={
					<Icon
						icon={ChevronDown}
						size={14}
						className={css({
							flexShrink: 0,
							transitionProperty: "transform",
							transform: isOpen ? "rotate(0)" : "rotate(-90deg)",
						})}
						aria-hidden
					/>
				}
				end={
					<span className={css({ marginLeft: "auto" })}>
						<Badge tone="neutral">{count}</Badge>
					</span>
				}
				onClick={() => {
					const next = !isOpen;
					setIsOpen(next);
					onToggle?.(next);
				}}
				aria-expanded={isOpen}
				aria-controls={panelId}
			>
				<span className={rowLabelClass}>{title}</span>
			</Button>
			{isOpen ? (
				<div
					id={panelId}
					className={css({
						display: "flex",
						width: "full",
						minWidth: 0,
						flexDirection: "column",
						gap: "1",
						borderTopWidth: "hairline",
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
