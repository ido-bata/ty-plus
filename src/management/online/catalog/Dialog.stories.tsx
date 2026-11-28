import type { Decorator, Meta, StoryObj } from "@storybook/react";
import { expect, waitFor } from "storybook/test";

import type { PresetSearchItem } from "@/management/online/contract";
import { createStorybookCloudGateway } from "@/storybook/cloud-gateway-fixture";
import { OnlineServicesBoundary } from "@/storybook/online-services";

import { PresetLibrary } from "./Dialog";

// PresetLibrary renders the real production component. It has no props —
// the catalog arrives through `searchCatalog` → `getDataServices().gateway`.
// `OnlineServicesBoundary` installs an in-memory `CloudGateway` fixture
// (plus an in-memory persistence gateway so the downloaded-preset lookup
// resolves deterministically) for the lifetime of each story.

const SAMPLE_CATALOG: PresetSearchItem[] = [
	{
		presetId: "cat-glow-01",
		name: "Glow Essentials",
		description: "Soft glow presets for text and shapes.",
		category: "Color",
		tag: ["glow", "light"],
		notionPageUrl: "https://example.com/glow",
	},
	{
		presetId: "cat-glow-02",
		name: "Glow Intense",
		description: "High-intensity glow for hero titles.",
		category: "Color",
		tag: ["glow"],
	},
	{
		presetId: "cat-chroma-01",
		name: "Chroma Key Kit",
		description: "Green-screen keying presets.",
		category: "Keying",
		tag: ["chroma", "keying"],
	},
	{
		presetId: "cat-vignette-01",
		name: "Vignette Pack",
		description: "Edge darkening presets.",
		category: "Color",
		tag: ["vignette"],
	},
	{
		presetId: "cat-shake-01",
		name: "Camera Shake",
		description: "Handheld shake expressions.",
		category: "Motion",
		tag: ["shake", "camera"],
	},
	{
		presetId: "cat-type-01",
		name: "Typewriter",
		description: "Character-by-character reveal.",
		category: "Text",
		tag: ["type", "text"],
	},
	{
		presetId: "cat-grade-01",
		name: "Film Grade",
		description: "35mm film look presets.",
		category: "Color",
		tag: ["grade", "film"],
	},
	{
		presetId: "cat-glitch-01",
		name: "Glitch Burst",
		description: "Digital glitch transitions.",
		category: "Motion",
		tag: ["glitch"],
	},
	{
		presetId: "cat-bokeh-01",
		name: "Bokeh Blur",
		description: "Depth-of-field blur presets.",
		category: "Blur",
		tag: ["bokeh", "blur"],
	},
	{
		presetId: "cat-noise-01",
		name: "Film Grain",
		description: "Analog noise overlays.",
		category: "Texture",
		tag: ["grain", "noise"],
	},
	{
		presetId: "cat-slide-01",
		name: "Slide Deck",
		description: "Presentation slide presets.",
		category: "Layout",
		tag: ["slides"],
	},
	{
		presetId: "cat-chroma-02",
		name: "Ultra Key",
		description: "Fine-detail keying for hair and glass.",
		category: "Keying",
		tag: ["chroma", "keying"],
	},
];

const SEARCH_PLACEHOLDER = "Filter by name, ID, description, category, tag";

const catalogDecorator =
	(items: readonly PresetSearchItem[]): Decorator =>
	(Story) => (
		<OnlineServicesBoundary
			cloudGateway={createStorybookCloudGateway({ catalogItems: items })}
		>
			<div
				style={{
					display: "flex",
					height: 480,
					width: 720,
					flexDirection: "column",
				}}
			>
				<Story />
			</div>
		</OnlineServicesBoundary>
	);

const meta = {
	title: "Catalog/Dialog",
	component: PresetLibrary,
	decorators: [catalogDecorator(SAMPLE_CATALOG)],
} satisfies Meta;

export default meta;
type Story = StoryObj;

const waitForCards = async (canvasElement: HTMLElement): Promise<void> => {
	await waitFor(() => {
		expect(
			canvasElement.querySelectorAll("[data-ws-preset-card]").length,
		).toBeGreaterThan(0);
	});
};

const boundingRect = (el: Element): DOMRect => el.getBoundingClientRect();

/**
 * Issue #734 regression guards for the catalog dialog captures:
 * - exactly one search field (the toolbar one; the side panel must not
 *   duplicate it),
 * - the active view-mode button carries the shared `data-active` selected
 *   surface instead of a cascade-losing class override,
 * - gallery card thumbnails are never occluded by metadata (the info
 *   footer is in-flow below the thumb, not an overlay),
 * - zoom never produces horizontal clipping in the results area,
 * - facet "Clear" buttons are disabled while their facet is inactive.
 */
const assertSingleSearchField = (canvasElement: HTMLElement): void => {
	const inputs = canvasElement.querySelectorAll("input[type='search']");
	expect(inputs).toHaveLength(1);
	expect(inputs[0]?.getAttribute("placeholder")).toBe(
		"Filter by name, ID, description, category, tag",
	);
};

const assertViewToggleActive = (
	canvasElement: HTMLElement,
	activeLabel: string,
	inactiveLabel: string,
): void => {
	const active = canvasElement.querySelector<HTMLButtonElement>(
		`button[aria-label="${activeLabel}"]`,
	);
	const inactive = canvasElement.querySelector<HTMLButtonElement>(
		`button[aria-label="${inactiveLabel}"]`,
	);
	expect(active).not.toBeNull();
	expect(inactive).not.toBeNull();
	// The shared IconButton `active` contract renders `data-active`, which
	// the attribute-scoped rule turns into a visible selected surface.
	expect(active?.hasAttribute("data-active")).toBe(true);
	expect(inactive?.hasAttribute("data-active")).toBe(false);
	const activeBg = getComputedStyle(active as HTMLElement).backgroundColor;
	const inactiveBg = getComputedStyle(inactive as HTMLElement).backgroundColor;
	expect(activeBg).not.toBe("rgba(0, 0, 0, 0)");
	expect(activeBg).not.toBe(inactiveBg);
};

const assertGalleryThumbVisible = (canvasElement: HTMLElement): void => {
	const card = canvasElement.querySelector("[data-ws-preset-card]");
	expect(card).not.toBeNull();
	const thumb = card?.querySelector("[data-ws-preset-thumb]");
	expect(thumb).not.toBeNull();
	const thumbRect = boundingRect(thumb as Element);
	expect(thumbRect.width).toBeGreaterThan(0);
	expect(thumbRect.height).toBeGreaterThan(0);
	// The info footer is the last in-flow child of the card; the thumb must
	// end at or above it — no overlay may cover the artwork.
	const info = card?.lastElementChild;
	expect(info).not.toBeNull();
	const infoRect = boundingRect(info as Element);
	expect(thumbRect.bottom).toBeLessThanOrEqual(infoRect.top + 0.5);
};

const assertNoHorizontalClip = (canvasElement: HTMLElement): void => {
	const gallery = canvasElement.querySelector<HTMLElement>(
		"[data-preset-gallery]",
	);
	const results = gallery?.parentElement;
	expect(results).not.toBeNull();
	expect(results?.scrollWidth).toBeLessThanOrEqual(
		(results?.clientWidth ?? 0) + 1,
	);
};

// Issue #767: gallery card titles wrap to two clamped lines instead of
// truncating to "Glow Esse..." — the title box must never clip
// horizontally against the action buttons.
const assertGalleryTitleNotClipped = (canvasElement: HTMLElement): void => {
	const title = canvasElement.querySelector<HTMLElement>(
		"[data-ws-preset-card] h3",
	);
	expect(title).not.toBeNull();
	expect(title?.scrollWidth ?? 0).toBeLessThanOrEqual(
		(title?.clientWidth ?? 0) + 1,
	);
};

const assertFacetClearsDisabled = (canvasElement: HTMLElement): void => {
	const clears = Array.from(canvasElement.querySelectorAll("button")).filter(
		(b) => b.textContent?.trim() === "Clear",
	);
	expect(clears.length).toBeGreaterThan(0);
	for (const btn of clears) {
		expect((btn as HTMLButtonElement).disabled).toBe(true);
	}
};

export const Default: Story = {
	play: async ({ canvasElement }) => {
		await waitForCards(canvasElement);
		expect(canvasElement.querySelector("[data-preset-gallery]")).not.toBeNull();
		assertSingleSearchField(canvasElement);
		assertViewToggleActive(canvasElement, "Gallery view", "Cards view");
		assertGalleryThumbVisible(canvasElement);
		assertNoHorizontalClip(canvasElement);
		assertFacetClearsDisabled(canvasElement);
		assertGalleryTitleNotClipped(canvasElement);
	},
};

export const ListView: Story = {
	play: async ({ canvasElement }) => {
		await waitForCards(canvasElement);
		const { userEvent } = await import("vitest/browser");
		const toggle = canvasElement.querySelector<HTMLButtonElement>(
			'button[aria-label="List view"]',
		);
		if (!toggle) throw new Error("list view toggle not found");
		await userEvent.click(toggle);
		await waitFor(() => {
			expect(canvasElement.querySelector("table")).not.toBeNull();
		});
		assertViewToggleActive(canvasElement, "List view", "Gallery view");
	},
};

export const CardsView: Story = {
	play: async ({ canvasElement }) => {
		await waitForCards(canvasElement);
		const { userEvent } = await import("vitest/browser");
		const toggle = canvasElement.querySelector<HTMLButtonElement>(
			'button[aria-label="Cards view"]',
		);
		if (!toggle) throw new Error("cards view toggle not found");
		await userEvent.click(toggle);
		await waitFor(() => {
			expect(canvasElement.querySelector("[data-preset-cards]")).not.toBeNull();
		});
		const firstCard = canvasElement.querySelector("[data-ws-preset-card]");
		expect(firstCard).not.toBeNull();
		assertViewToggleActive(canvasElement, "Cards view", "Gallery view");
	},
};

export const SidePanelHidden: Story = {
	play: async ({ canvasElement }) => {
		await waitForCards(canvasElement);
		const { userEvent } = await import("vitest/browser");
		const hideButton = canvasElement.querySelector<HTMLButtonElement>(
			'button[title="Hide filters"]',
		);
		if (!hideButton) throw new Error("hide filters button not found");
		await userEvent.click(hideButton);
		await waitFor(() => {
			expect(
				canvasElement.querySelector('button[title="Show filters"]'),
			).not.toBeNull();
		});
		// The single toolbar search field must survive panel collapse.
		assertSingleSearchField(canvasElement);
	},
};

export const WithQuery: Story = {
	play: async ({ canvasElement }) => {
		await waitForCards(canvasElement);
		const { userEvent } = await import("vitest/browser");
		const input = canvasElement.querySelector<HTMLInputElement>(
			`input[placeholder="${SEARCH_PLACEHOLDER}"]`,
		);
		if (!input) throw new Error("catalog search input not found");
		await userEvent.click(input);
		await userEvent.keyboard("glow");
		await waitFor(() => {
			const cards = canvasElement.querySelectorAll("[data-ws-preset-card]");
			expect(cards.length).toBe(2);
			expect(canvasElement.textContent).toContain("2 / 12 items");
		});
	},
};

export const NoCatalog: Story = {
	decorators: [catalogDecorator([])],
	play: async ({ canvasElement }) => {
		await waitFor(() => {
			expect(
				canvasElement.querySelector("[data-online-preset-empty]"),
			).not.toBeNull();
		});
		expect(canvasElement.textContent).toContain("No online catalog.");
		// Issue #767: the refresh affordance is a labelled button, not a
		// bare icon — and the footer must not advertise zoom for an
		// empty (non-zoomable) catalog.
		const refresh = Array.from(canvasElement.querySelectorAll("button")).find(
			(b) => b.textContent?.includes("Refresh catalog"),
		);
		expect(refresh).not.toBeNull();
		expect(canvasElement.textContent).not.toContain("Ctrl+Wheel:");
	},
};

export const NoMatches: Story = {
	play: async ({ canvasElement }) => {
		await waitForCards(canvasElement);
		const { userEvent } = await import("vitest/browser");
		const input = canvasElement.querySelector<HTMLInputElement>(
			`input[placeholder="${SEARCH_PLACEHOLDER}"]`,
		);
		if (!input) throw new Error("catalog search input not found");
		await userEvent.click(input);
		await userEvent.keyboard("zzz-no-match");
		await waitFor(() => {
			expect(canvasElement.textContent).toContain("No presets match filter.");
		});
		// Issue #767: the clear-filters action carries a visible label (a
		// bare "x" icon read as a dismiss control), and the dead zoom hint
		// stays out of the footer while nothing zoomable is shown.
		const clearFilters = Array.from(
			canvasElement.querySelectorAll("button"),
		).find((b) => b.textContent?.includes("Clear all filters"));
		expect(clearFilters).not.toBeNull();
		expect(canvasElement.textContent).not.toContain("Ctrl+Wheel:");
	},
};

export const GalleryZoomedIn: Story = {
	play: async ({ canvasElement }) => {
		await waitForCards(canvasElement);
		const gallery = canvasElement.querySelector<HTMLElement>(
			"[data-preset-gallery]",
		);
		if (!gallery) throw new Error("gallery grid not found");
		gallery.dispatchEvent(
			new WheelEvent("wheel", { ctrlKey: true, deltaY: -100, bubbles: true }),
		);
		await waitFor(() => {
			expect(canvasElement.textContent).toContain("Ctrl+Wheel: 110%");
		});
		assertNoHorizontalClip(canvasElement);
		assertGalleryThumbVisible(canvasElement);
	},
};

export const GalleryZoomedOut: Story = {
	play: async ({ canvasElement }) => {
		await waitForCards(canvasElement);
		const gallery = canvasElement.querySelector<HTMLElement>(
			"[data-preset-gallery]",
		);
		if (!gallery) throw new Error("gallery grid not found");
		gallery.dispatchEvent(
			new WheelEvent("wheel", { ctrlKey: true, deltaY: 100, bubbles: true }),
		);
		await waitFor(() => {
			expect(canvasElement.textContent).toContain("Ctrl+Wheel: 90%");
		});
		// Zoomed-out tiles must still show the thumbnail above the info
		// footer and must not introduce horizontal clipping.
		assertGalleryThumbVisible(canvasElement);
		assertNoHorizontalClip(canvasElement);
	},
};
