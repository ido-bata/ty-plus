import { ChevronDown } from "lucide-react";
import { type JSX, type ReactNode, useEffect, useState } from "react";
import { settingsSectionIdFromTitle } from "@/management/setting/dialog/settings-context-menu-build";
import { Icon } from "@/shared/component/icons/Icon";
import { cx } from "@/shared/util/cx";
import { css } from "@/styled-system/css";

export type AccordionSectionProps = {
	title: string;
	children: ReactNode;
	defaultOpen?: boolean;
	searchTerms?: string;
	/** Stable id for context menu / `data-settings-section` (defaults from title). */
	sectionId?: string;
};

const sectionStyle = css({
	boxSizing: "border-box",
	width: "full",
	minWidth: 0,
	maxWidth: "none",
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.widget",
});

const triggerStyle = css({
	display: "flex",
	alignItems: "center",
	justifyContent: "space-between",
	width: "full",
	paddingInline: "3",
	paddingBlock: "2",
	textAlign: "left",
	borderRadius: "shell-sm",
	_hover: { backgroundColor: "interactive.hover" },
});

const triggerTitleStyle = css({
	fontSize: "text-sm",
	fontWeight: "medium",
	color: "text.primary",
});

const triggerIconStyle = css({
	color: "text.muted",
	transitionProperty: "transform",
});

const triggerIconOpenStyle = css({
	transform: "rotate(180deg)",
});

const bodyStyle = css({
	width: "full",
	minWidth: 0,
	borderTopWidth: "1px",
	borderTopStyle: "solid",
	borderTopColor: "border.default",
	paddingInline: "3",
	paddingBlock: "3",
});

export function AccordionSection({
	title,
	children,
	defaultOpen = false,
	searchTerms = "",
	sectionId: explicitSectionId,
}: AccordionSectionProps): JSX.Element {
	const sectionId = explicitSectionId ?? settingsSectionIdFromTitle(title);
	const [isOpen, setIsOpen] = useState(defaultOpen);

	useEffect(() => {
		const onCommand = (event: Event) => {
			const detail = (
				event as CustomEvent<{ command?: string; sectionId?: string }>
			).detail;
			if (detail?.sectionId !== sectionId) {
				return;
			}
			if (detail.command === "accordion.expand") {
				setIsOpen(true);
			} else if (detail.command === "accordion.collapse") {
				setIsOpen(false);
			}
		};
		window.addEventListener("ty-plus:settings-dialog-command", onCommand);
		return () => {
			window.removeEventListener("ty-plus:settings-dialog-command", onCommand);
		};
	}, [sectionId]);

	return (
		<div
			className={sectionStyle}
			data-search-terms={searchTerms}
			data-settings-section={sectionId}
		>
			<button
				type="button"
				data-settings-accordion-trigger
				className={triggerStyle}
				onClick={() => setIsOpen(!isOpen)}
				aria-expanded={isOpen}
			>
				<span className={triggerTitleStyle}>{title}</span>
				<Icon
					icon={ChevronDown}
					size={16}
					className={cx(triggerIconStyle, isOpen ? triggerIconOpenStyle : "")}
				/>
			</button>
			{isOpen ? <div className={bodyStyle}>{children}</div> : null}
		</div>
	);
}
