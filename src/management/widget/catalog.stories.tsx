import type { Meta, StoryObj } from "@storybook/react";
import { type JSX, useRef, useState } from "react";
import type { WidgetType } from "@/function/widget";
import { css } from "@/styled-system/css";

import { AddWidgetCatalogPanel } from "./catalog";

/**
 * Storybook harness for the shared widget catalog panel (Issue #610).
 *
 * `AddWidgetCatalogPanel` is fully controlled — the dialog (`add-dialog.tsx`)
 * and the in-panel overlay (`picker-overlay.tsx`) own `query` /
 * `selectedType`. This harness mirrors that contract so the catalog's
 * search, grouping, and list/icon view modes can be reviewed without a
 * dialog shell.
 */

const frameStyle = css({
	display: "flex",
	minHeight: "0",
	height: "480px",
	width: "560px",
	flexDirection: "column",
	overflow: "hidden",
	borderRadius: "shell-lg",
	borderWidth: "hairline",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.dialog",
	padding: "3",
});

function CatalogHarness(props: { initialQuery?: string }): JSX.Element {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const [query, setQuery] = useState(props.initialQuery ?? "");
	const [selectedType, setSelectedType] = useState<WidgetType | null>(null);
	return (
		<AddWidgetCatalogPanel
			containerRef={containerRef}
			query={query}
			onQueryChange={setQuery}
			selectedType={selectedType}
			onSelectType={setSelectedType}
			onActivateType={() => undefined}
		/>
	);
}

const renderCatalog = (initialQuery?: string) => (): JSX.Element => (
	<div className={frameStyle}>
		<CatalogHarness initialQuery={initialQuery} />
	</div>
);

const meta = {
	title: "Management/Widget/AddWidgetCatalogPanel",
	render: renderCatalog(),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Full catalog, icon (card) view — the default view mode. */
export const Default: Story = {};

/** Pre-filtered query narrowing the catalog to easing-related widgets. */
export const Filtered: Story = {
	render: renderCatalog("easing"),
};

/** Query that matches nothing — empty-results state. */
export const EmptyResults: Story = {
	render: renderCatalog("zzz-no-such-widget"),
};
