import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "storybook/test";
import type { Preset } from "@/management/preset/contract";
import {
	assertRendered,
	expectCanvasLayout,
	measureBox,
} from "@/storybook/quality/layout";
import { PresetListRow } from "./PresetListRow";

const makePreset = (overrides: Partial<Preset> = {}): Preset => ({
	id: "preset-glow",
	type: "preset",
	title: "Glow Pulse",
	filePath: "/preset/root/glow.ffx",
	...overrides,
});

const noop = (): void => undefined;

type Args = {
	preset: Preset;
};

const baseArgs: Args = {
	preset: makePreset(),
};

const rowProps = {
	presetGlyphSiblingProps: {},
	activateCatalogPresetRow: noop,
	runPreset: noop,
	actionsRunLabel: "Run",
	actionsRunBlockedMissingLabel: "Preset asset is missing on disk",
	actionsRunBlockedUnverifiableLabel: "Could not verify preset asset",
};

const meta = {
	title: "Preset/Components/PresetListRow",
	args: baseArgs,
	render: (args: Args) => (
		<ul
			style={{
				listStyle: "none",
				padding: 0,
				margin: 0,
				minWidth: 360,
			}}
		>
			<PresetListRow preset={args.preset} {...rowProps} />
		</ul>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

// Issue #673: kind badges (FFX / SCRIPT / PLUGIN / …) are single words —
// they must render on ONE line inside the 28px framed box. Wrapping
// mid-word ("PLUGIN" → "PLU"/"GIN") made the badge unreadable; the fix
// keeps `white-space: nowrap` and shrinks the font via container-query
// units instead, so the badge may render below the 8px short-badge floor
// but must never clip or split.
const expectSingleLineKindGlyph = (canvasElement: HTMLElement): void => {
	const glyphs = Array.from(
		canvasElement.querySelectorAll<HTMLElement>(".ws-preset-icon--text"),
	);
	expect(glyphs.length).toBeGreaterThan(0);
	for (const glyph of glyphs) {
		const lines = Array.from(
			glyph.querySelectorAll<HTMLElement>(":scope > span"),
		);
		expect(lines).toHaveLength(1);
		const line = lines[0];
		expect(getComputedStyle(line).whiteSpace).toBe("nowrap");
		expect(line.scrollWidth).toBeLessThanOrEqual(line.clientWidth + 1);
		// Issue #751: the effective glyph size (painted fontPx × scale)
		// must stay at the legibility floor — 5–6 grapheme badges used to
		// collapse to ~4.7px inside the framed box.
		const style = getComputedStyle(glyph);
		const fontPx = Number.parseFloat(
			style.getPropertyValue("--ws-glyph-text-font-px"),
		);
		const scale = Number.parseFloat(
			style.getPropertyValue("--ws-glyph-text-scale"),
		);
		expect(fontPx * scale).toBeGreaterThanOrEqual(7);
	}
};

/**
 * Issue #582 regression guard: the kind glyph must stay left-positioned
 * ahead of the title text column, and both must keep non-zero boxes — the
 * row grid must not collapse the icon into the text or vice versa.
 */
const expectIconLeftOfTitle = (canvasElement: HTMLElement): void => {
	const entry = canvasElement.querySelector<HTMLElement>(
		"[data-directory-browser-entry][data-entry-kind='preset']",
	);
	if (!entry) throw new Error("preset list row entry not found");
	// The activation button precedes the trailing run IconButton in DOM
	// order; it is the row surface that owns glyph + title.
	const button = entry.querySelector("button");
	if (!button) throw new Error("preset list row button not found");
	const glyphHost = button.firstElementChild;
	const textColumn = button.children[1];
	const title = textColumn?.firstElementChild;
	if (!glyphHost || !title) {
		throw new Error("preset list row glyph/title not found");
	}
	assertRendered(glyphHost, { label: "preset row glyph" });
	assertRendered(title, { label: "preset row title" });
	const glyphBox = measureBox(glyphHost);
	const titleBox = measureBox(title);
	expect(glyphBox.width).toBeGreaterThan(0);
	expect(glyphBox.height).toBeGreaterThan(0);
	// Glyph column ends before the title column begins (gap tolerance 1px).
	expect(glyphBox.x + glyphBox.width).toBeLessThanOrEqual(titleBox.x + 1);
};

export const Default: Story = {
	play: async ({ canvasElement }) => {
		expectCanvasLayout(canvasElement);
		expectIconLeftOfTitle(canvasElement);
	},
};

export const ScriptPreset: Story = {
	args: {
		preset: makePreset({
			id: "script-anim",
			type: "script",
			title: "Bounce Animator",
			filePath: "/preset/root/bounce.jsx",
		}),
	},
	play: async ({ canvasElement }) => {
		expectCanvasLayout(canvasElement);
		expectSingleLineKindGlyph(canvasElement);
		expectIconLeftOfTitle(canvasElement);
	},
};

export const PluginPreset: Story = {
	args: {
		preset: makePreset({
			id: "plugin-fx",
			type: "plugin",
			title: "Color Suite",
			filePath: "/preset/root/color.aex",
		}),
	},
	play: async ({ canvasElement }) => {
		expectCanvasLayout(canvasElement);
		expectSingleLineKindGlyph(canvasElement);
		expectIconLeftOfTitle(canvasElement);
	},
};

export const LongTitle: Story = {
	args: {
		preset: makePreset({
			title: "Glow Pulse with Extra Long Display Name",
			filePath: "/preset/root/glow-extended-title.ffx",
		}),
	},
	play: async ({ canvasElement }) => {
		expectCanvasLayout(canvasElement);
		expectIconLeftOfTitle(canvasElement);
	},
};

// Issue #454: rows with different title lengths must start their name and
// file-info text at the same x — right after the kind glyph — instead of
// drifting toward the row center.
export const AlignedTitles: Story = {
	render: () => (
		<ul
			style={{
				listStyle: "none",
				padding: 0,
				margin: 0,
				minWidth: 360,
			}}
		>
			<PresetListRow preset={makePreset({ title: "Glow" })} {...rowProps} />
			<PresetListRow
				preset={makePreset({
					id: "preset-long",
					title: "Glow Pulse with Extra Long Display Name",
					filePath: "/preset/root/glow-extended-title.ffx",
				})}
				{...rowProps}
			/>
		</ul>
	),
	play: async ({ canvasElement }) => {
		expectCanvasLayout(canvasElement);
		const titleBoxes = Array.from(canvasElement.querySelectorAll("li")).map(
			(li) => {
				const button = li.querySelector("button");
				const textColumn = button?.children[1];
				const title = textColumn?.firstElementChild;
				if (!title) throw new Error("preset row title not found");
				return title.getBoundingClientRect().x;
			},
		);
		expect(titleBoxes).toHaveLength(2);
		expect(Math.abs(titleBoxes[0] - titleBoxes[1])).toBeLessThanOrEqual(1);
		// #582: both rows keep the glyph column left of the aligned titles.
		for (const li of canvasElement.querySelectorAll("li")) {
			const scope = li as HTMLElement;
			const button = scope.querySelector("button");
			const glyphHost = button?.firstElementChild;
			const title = button?.children[1]?.firstElementChild;
			if (!glyphHost || !title) throw new Error("row glyph/title missing");
			const glyphBox = measureBox(glyphHost);
			const titleBox = measureBox(title);
			expect(glyphBox.x + glyphBox.width).toBeLessThanOrEqual(titleBox.x + 1);
		}
	},
};
