import type { Meta, StoryObj } from "@storybook/react";
import { type JSX, useRef, useState } from "react";
import { expect } from "storybook/test";
import { css } from "@/styled-system/css";

import {
	AddWidgetCatalogPanel,
	type AddWidgetCatalogPanelProps,
} from "./catalog";

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
	const [selectedType, setSelectedType] =
		useState<AddWidgetCatalogPanelProps["selectedType"]>(null);
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
export const Default: Story = {
	play: async ({ canvasElement }) => {
		// Issue #752: the listbox is a scroll container — cards past the
		// fold are clipped by design, but every card must stay reachable
		// by scrolling and paint fully inside the listbox once revealed.
		const listbox = canvasElement.querySelector<HTMLElement>(
			"[data-add-widget-listbox]",
		);
		if (!listbox) throw new Error("widget catalog listbox not found");
		const cards = listbox.querySelectorAll<HTMLElement>(
			"[data-add-widget-type]",
		);
		expect(cards.length).toBeGreaterThan(0);
		listbox.scrollTop = listbox.scrollHeight;
		await new Promise((resolve) => setTimeout(resolve, 50));
		const lastCard = cards[cards.length - 1].parentElement;
		if (!lastCard) throw new Error("last catalog card not found");
		const cardRect = lastCard.getBoundingClientRect();
		const boxRect = listbox.getBoundingClientRect();
		expect(
			cardRect.bottom,
			"last catalog card is clipped below the listbox after scrolling to the end",
		).toBeLessThanOrEqual(boxRect.bottom + 1);
		expect(
			cardRect.top,
			"last catalog card is clipped above the listbox after scrolling to the end",
		).toBeGreaterThanOrEqual(boxRect.top - 1);
	},
};

/** Pre-filtered query narrowing the catalog to easing-related widgets. */
export const Filtered: Story = {
	render: renderCatalog("easing"),
	// Issue #754: filtering narrows the list but does not select — the
	// unadorned result is spec, not a missing active style. Selection only
	// appears after a click (see SelectOnClick).
	play: async ({ canvasElement }) => {
		const items = canvasElement.querySelectorAll<HTMLElement>(
			"[data-add-widget-type]",
		);
		expect(items.length).toBeGreaterThan(0);
		for (const item of items) {
			expect(item.getAttribute("aria-pressed")).toBe("false");
		}
	},
};

/** Query that matches nothing — empty-results state. */
export const EmptyResults: Story = {
	render: renderCatalog("zzz-no-such-widget"),
};

// Issue #166: the catalog card is a real selection control — a click on
// the hit-area button must flip `aria-pressed` and repaint the card to
// the active surface. The post-play selected state is what capture
// screenshots.
export const SelectOnClick: Story = {
	play: async ({ canvasElement }) => {
		const hitArea = canvasElement.querySelector<HTMLButtonElement>(
			"button[data-add-widget-type]",
		);
		if (!hitArea) throw new Error("catalog item hit area not found");
		const card = hitArea.parentElement;
		if (!card) throw new Error("catalog card not found");
		const restingBg = getComputedStyle(card).backgroundColor;
		await expect(hitArea.getAttribute("aria-pressed")).toBe("false");
		const { userEvent } = await import("vitest/browser");
		await userEvent.click(hitArea);
		await expect(hitArea.getAttribute("aria-pressed")).toBe("true");
		await new Promise((resolve) => setTimeout(resolve, 300));
		await expect(getComputedStyle(card).backgroundColor).not.toBe(restingBg);
	},
};
