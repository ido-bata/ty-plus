import { ChevronDown, FileSearch } from "lucide-react";
import { forwardRef, type JSX, useImperativeHandle, useState } from "react";
import { useTranslation } from "react-i18next";
import { selectFile } from "@/management/ae/cep/dialog-shim/bolt";
import { MarkdownLiveEditor } from "@/management/preset/markdown/LiveEditor";
import { Icon } from "@/shared/component";
import { PathField } from "@/shared/component/fields/PathField";
import { css, cx } from "@/styled-system/css";

export type ArchiveDetailsSectionProps = {
	description: string;
	onDescriptionChange: (next: string) => void;
	descriptionImage: string;
	onDescriptionImageChange: (next: string) => void;
	browseDir: string;
	/**
	 * Whether to wrap description + image in a collapsible accordion.
	 * Defaults to true so add dialogs keep the section compact by default.
	 */
	useAccordion?: boolean;
	/**
	 * Initial open state for the accordion. Ignored when `useAccordion` is false.
	 * The edit dialog passes `true` so the existing description is visible without
	 * having to expand the section.
	 */
	defaultOpen?: boolean;
};

export type ArchiveDetailsSectionHandle = {
	/**
	 * Returns the current description. The MarkdownLiveEditor is fully
	 * controlled, so `props.description` is always the latest typed value
	 * after `onChange` has fired. Use this from save handlers to read the
	 * latest persisted state without holding an imperative ref.
	 */
	getDescription: () => string;
};

const blockClass = css({
	display: "flex",
	flexDirection: "column",
	gap: "1",
});

const fieldLabelClass = css({
	fontSize: "xs",
	fontWeight: "medium",
	textTransform: "uppercase",
	letterSpacing: "wide",
	color: "text.muted",
});

const previewBoxClass = css({
	marginTop: "2",
	overflow: "hidden",
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.widget",
});

const previewImageClass = css({
	maxHeight: "40",
	width: "full",
	objectFit: "contain",
});

const containerNoAccordionClass = css({
	display: "flex",
	flexDirection: "column",
	gap: "4",
});

const containerAccordionClass = css({
	display: "flex",
	width: "full",
	minWidth: "0",
	flexDirection: "column",
	gap: "0",
	borderRadius: "shell-sm",
});

const accordionTriggerClass = css({
	display: "flex",
	width: "full",
	minWidth: "0",
	alignItems: "center",
	justifyContent: "space-between",
	gap: "2",
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.widget",
	paddingInline: "3",
	paddingBlock: "2",
	textAlign: "left",
	fontSize: "shell-text-sm",
	fontWeight: "medium",
	color: "text.primary",
	_hover: { backgroundColor: "interactive.hover" },
});

const accordionPanelClass = css({
	display: "flex",
	width: "full",
	minWidth: "0",
	flexDirection: "column",
	gap: "4",
	borderLeftWidth: "1px",
	borderRightWidth: "1px",
	borderBottomWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.widget",
	paddingInline: "3",
	paddingBlock: "3",
});

const accordionChevronClass = css({
	flexShrink: "0",
	color: "text.muted",
	transitionProperty: "transform",
});

const accordionChevronOpenClass = css({ transform: "rotate-180" });

const editorMinHeightClass = css({ minHeight: "160px" });

/**
 * Detailed preset copy + hero image — collapsed into an accordion so add dialogs
 * stay compact, and opened by default in the edit dialog.
 */
export const ArchiveDetailsSection = forwardRef<
	ArchiveDetailsSectionHandle,
	ArchiveDetailsSectionProps
>(function ArchiveDetailsSection(props, ref): JSX.Element {
	const { t } = useTranslation("presets");
	const browseHint = props.browseDir.trim();
	const useAccordion = props.useAccordion ?? true;
	const [isOpen, setIsOpen] = useState(props.defaultOpen ?? false);

	useImperativeHandle(
		ref,
		() => ({
			getDescription: () => props.description,
		}),
		[props.description],
	);

	const descriptionBlock = (
		<div className={blockClass}>
			<label htmlFor="archive-details-description" className={fieldLabelClass}>
				{t("presetTool.form.description")}
			</label>
			<MarkdownLiveEditor
				id="archive-details-description"
				value={props.description}
				onChange={props.onDescriptionChange}
				placeholder={t("presetTool.form.descriptionPlaceholder")}
				className={editorMinHeightClass}
				aria-label={t("presetTool.form.description")}
				aria-labelledby="archive-details-description"
			/>
		</div>
	);

	const imageBlock = (
		<div className={blockClass}>
			<label
				htmlFor="archive-details-description-image"
				className={fieldLabelClass}
			>
				{t("presetTool.form.descriptionImage")}
			</label>
			<PathField
				value={props.descriptionImage}
				onChange={props.onDescriptionImageChange}
				onBrowse={() =>
					selectFile(browseHint, "Select image", props.onDescriptionImageChange)
				}
				browseAriaLabel={t("presetTool.form.descriptionImageBrowse")}
				browseSlot={<Icon icon={FileSearch} size={16} aria-hidden />}
				placeholder={t("presetTool.form.descriptionImagePlaceholder")}
				uiSize="md"
				aria-labelledby="archive-details-description-image"
			/>
			{props.descriptionImage.trim() ? (
				<div className={previewBoxClass}>
					<img
						src={props.descriptionImage.trim()}
						alt=""
						loading="lazy"
						className={previewImageClass}
					/>
				</div>
			) : null}
		</div>
	);

	if (!useAccordion) {
		return (
			<div className={containerNoAccordionClass}>
				{descriptionBlock}
				{imageBlock}
			</div>
		);
	}

	return (
		<div className={containerAccordionClass}>
			<button
				type="button"
				className={accordionTriggerClass}
				onClick={() => setIsOpen((open) => !open)}
				aria-expanded={isOpen}
				aria-controls="archive-details-section"
				data-archive-details-trigger
			>
				<span>{t("presetTool.form.details")}</span>
				<Icon
					icon={ChevronDown}
					size={16}
					aria-hidden
					className={cx(
						accordionChevronClass,
						isOpen ? accordionChevronOpenClass : "",
					)}
				/>
			</button>
			{isOpen ? (
				<div
					id="archive-details-section"
					className={accordionPanelClass}
					data-archive-details-panel
				>
					{descriptionBlock}
					{imageBlock}
				</div>
			) : null}
		</div>
	);
});
