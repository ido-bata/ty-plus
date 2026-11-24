import type { JSX } from "react";
import { ArchiveDetailsSection } from "@/management/preset/catalog-add/ArchiveDetailsSection";
import { css } from "@/styled-system/css";

const areaClass = css({ minWidth: "0" });

export type ToolDialogDetailsSectionProps = {
	description: string;
	onDescriptionChange: (next: string) => void;
	descriptionImage: string;
	onDescriptionImageChange: (next: string) => void;
	browseDir: string;
	/** Forwarded to `ArchiveDetailsSection` — the accordion starts closed
	 *  unless the caller opts in. */
	defaultOpen?: boolean;
};

export function ToolDialogDetailsSection({
	description,
	onDescriptionChange,
	descriptionImage,
	onDescriptionImageChange,
	browseDir,
	defaultOpen,
}: ToolDialogDetailsSectionProps): JSX.Element {
	return (
		<div data-preset-tool-area="details" className={areaClass}>
			<ArchiveDetailsSection
				description={description}
				onDescriptionChange={onDescriptionChange}
				descriptionImage={descriptionImage}
				onDescriptionImageChange={onDescriptionImageChange}
				browseDir={browseDir}
				defaultOpen={defaultOpen}
			/>
		</div>
	);
}
