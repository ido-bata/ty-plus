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

export const Default: Story = {
	play: async ({ canvasElement }) => {
		await waitForCards(canvasElement);
		expect(canvasElement.querySelector("[data-preset-gallery]")).not.toBeNull();
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
	},
};
