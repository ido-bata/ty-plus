import type { Meta, StoryObj } from "@storybook/react";
import { type JSX, type ReactElement, useMemo } from "react";
import { expect } from "storybook/test";
import { SettingsContext } from "@/management/setting/context";
import {
	DEFAULT_SETTINGS,
	mergeSettings,
	type Settings,
	type SettingsPatch,
} from "@/management/setting/models/settings";
import { css } from "@/styled-system/css";

import { SettingsDialog } from "./Settings";

// `<dialog open>` is absolutely positioned; without a positioned ancestor
// it resolves against the viewport and escapes the fixed-size frame
// (same contract as `Dialog/Shell/Layout`, issue #514).
const largeFrameStyle = css({
	position: "relative",
	height: "640px",
	width: "880px",
});

const smallFrameStyle = css({
	position: "relative",
	height: "400px",
	width: "880px",
});

/**
 * Storybook harness for the settings dialog (Issue #143).
 *
 * The `SettingsDialog` shell now hosts a vertical sidebar
 * (`SettingsSidebar`) on the left and a single scrolling section
 * body on the right. Each story below opens the dialog with a
 * different default section to surface the sidebar / body
 * interaction and the hash routing contract.
 */

type SettingsBag = {
	settings: Settings;
	updateSettings: (
		patch: SettingsPatch,
		options?: { skipPathPersist?: boolean },
	) => void;
	refreshPathsFromDisk: () => Promise<void>;
	reloadSettingsFromDisk: () => Promise<void>;
	resetSettings: () => void;
	isLoaded: boolean;
	saveError: string | null;
	reportSaveError: (message: string) => void;
	persistSettingsNow: () => Promise<boolean>;
};

const StorySettingsProvider = ({
	children,
	hash,
}: {
	children: ReactElement;
	hash?: string;
}): JSX.Element => {
	const value = useMemo<SettingsBag>(() => {
		const settings = mergeSettings(DEFAULT_SETTINGS, {});
		return {
			settings,
			updateSettings: () => undefined,
			refreshPathsFromDisk: async () => undefined,
			reloadSettingsFromDisk: async () => undefined,
			resetSettings: () => undefined,
			isLoaded: true,
			saveError: null,
			reportSaveError: () => undefined,
			persistSettingsNow: async () => true,
		};
	}, []);
	return (
		<SettingsContext.Provider value={value}>
			{hash !== undefined && typeof window !== "undefined"
				? (() => {
						if (window.location.hash !== `#${hash}`) {
							window.history.replaceState(null, "", `#${hash}`);
						}
						return children;
					})()
				: children}
		</SettingsContext.Provider>
	);
};

const renderDialogIn =
	(frameStyle: string, hash?: string) => (): JSX.Element => (
		<div className={frameStyle}>
			<StorySettingsProvider hash={hash}>
				<SettingsDialog />
			</StorySettingsProvider>
		</div>
	);

const renderDialog = (hash?: string) => renderDialogIn(largeFrameStyle, hash);

/*
 * `<dialog open>` is absolutely positioned, so the shell must stay inside
 * the story's fixed-size frame — a regression that drops the frame's
 * `position: relative` lets the dialog escape to the 1280x720 viewport
 * (same contract as `Dialog/Shell/Layout`, issue #514).
 */
const expectShellInsideFrame = (canvasElement: HTMLElement): void => {
	const shell = canvasElement.querySelector("[data-dialog-shell]");
	expect(shell).not.toBeNull();
	const frame = shell?.parentElement;
	expect(frame).not.toBeNull();
	if (!shell || !frame) return;
	const shellRect = shell.getBoundingClientRect();
	const frameRect = frame.getBoundingClientRect();
	expect(shellRect.top).toBeGreaterThanOrEqual(frameRect.top - 1);
	expect(shellRect.bottom).toBeLessThanOrEqual(frameRect.bottom + 1);
	expect(shellRect.left).toBeGreaterThanOrEqual(frameRect.left - 1);
	expect(shellRect.right).toBeLessThanOrEqual(frameRect.right + 1);
};

/*
 * The footer action group must stay compact and right-anchored: three
 * `fullWidth` buttons share a bounded equal-column grid, never stretching
 * to equal thirds of the full dialog width.
 */
const expectFooterActionsCompact = (canvasElement: HTMLElement): void => {
	const footer = canvasElement.querySelector("[data-dialog-footer]");
	const actions = canvasElement.querySelector("[data-dialog-footer-actions]");
	expect(footer).not.toBeNull();
	expect(actions).not.toBeNull();
	if (!footer || !actions) return;
	const footerRect = footer.getBoundingClientRect();
	const actionsRect = actions.getBoundingClientRect();
	expect(actionsRect.width).toBeLessThan(footerRect.width * 0.75);
	// Right-anchored: the group's right edge sits at the footer's inner
	// right edge (one canonical inline inset from the border).
	const footerStyle = getComputedStyle(footer);
	const insetRight = Number.parseFloat(footerStyle.paddingRight);
	expect(
		Math.abs(actionsRect.right - (footerRect.right - insetRight)),
	).toBeLessThanOrEqual(1);
};

/*
 * Long sections (e.g. design tokens) must scroll inside the section body
 * rather than being clipped by the fixed footer: the scroll region has
 * overflow content and the footer band sits below the content region.
 */
const expectSectionBodyScrolls = (canvasElement: HTMLElement): void => {
	const body = canvasElement.querySelector<HTMLElement>(
		"[data-settings-sidebar-body]",
	);
	const content = canvasElement.querySelector("[data-dialog-content]");
	const footer = canvasElement.querySelector("[data-dialog-footer]");
	expect(body).not.toBeNull();
	expect(content).not.toBeNull();
	expect(footer).not.toBeNull();
	if (!body || !content || !footer) return;
	expect(body.scrollHeight).toBeGreaterThan(body.clientHeight);
	const contentRect = content.getBoundingClientRect();
	const footerRect = footer.getBoundingClientRect();
	expect(footerRect.top).toBeGreaterThanOrEqual(contentRect.bottom - 1);
};

const meta = {
	title: "Setting/SettingsDialog",
	parameters: {
		layout: "fullscreen",
	},
	render: renderDialog(),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default: 表示 tab, language section is active. Hash is unset. */
export const DisplayLanguage: Story = {
	play: async ({ canvasElement }) => {
		expectShellInsideFrame(canvasElement);
		const tabs = canvasElement.querySelectorAll<HTMLElement>(
			"[data-settings-sidebar-item]",
		);
		expect(tabs.length).toBeGreaterThan(0);
		for (const tab of tabs) {
			expect(tab.getBoundingClientRect().height).toBeGreaterThanOrEqual(24);
		}
		// The display-language select stays inside the section body — it
		// must not overflow the scroll region horizontally.
		const body = canvasElement.querySelector<HTMLElement>(
			"[data-settings-sidebar-body]",
		);
		const select = canvasElement.querySelector<HTMLElement>(
			"[data-settings-sidebar-section='language'] button, [data-settings-sidebar-section='language'] [role='combobox'], [data-settings-sidebar-section='language'] input",
		);
		expect(body).not.toBeNull();
		expect(select).not.toBeNull();
		if (!body || !select) return;
		const bodyRect = body.getBoundingClientRect();
		const selectRect = select.getBoundingClientRect();
		expect(selectRect.left).toBeGreaterThanOrEqual(bodyRect.left - 1);
		expect(selectRect.right).toBeLessThanOrEqual(bodyRect.right + 1);
		// Issue #763: a short single-value picker must not stretch across
		// the whole section — it occupies half the 6-column grid.
		expect(selectRect.width).toBeLessThan(bodyRect.width * 0.75);
	},
};

/** 表示 → Style / Appearance section. Hash = #appearance. */
export const DisplayAppearance: Story = {
	render: renderDialog("appearance"),
};

/** 表示 → Background. Hash = #background. */
export const DisplayBackground: Story = {
	render: renderDialog("background"),
	play: async ({ canvasElement }) => {
		expectShellInsideFrame(canvasElement);
		// Issue #732: mid-sentence words must stay lowercase — the
		// background section copy regressed into title-cased fragments
		// in review captures ("has Its own", "layers In the editor").
		const text = canvasElement.textContent ?? "";
		expect(text).toContain("has its own layered backdrop");
		expect(text).toContain("add layers in the editor");
		expect(text).toContain("available inside After Effects");
		expect(text).not.toMatch(/\b(has|add layers|available) (Its|In|Inside)\b/);
	},
};

/** 表示 → Grid. Hash = #grid. */
export const DisplayGrid: Story = {
	render: renderDialog("grid"),
};

/** データ → Paths. Hash = #paths. */
export const DataPaths: Story = {
	render: renderDialog("paths"),
};

/** データ → ComponentPreview. Hash = #component-preview. */
export const DataComponentPreview: Story = {
	render: renderDialog("component-preview"),
	play: async ({ canvasElement }) => {
		expectShellInsideFrame(canvasElement);
		// Issue #791 (jobs6): a capture read the RangeField numeric box as
		// clipped at the section's right edge. The section body clips
		// horizontally (`overflow-x: hidden`), so any escaping control
		// would be a real overflow — assert none exists.
		const section = canvasElement.querySelector<HTMLElement>(
			"[data-settings-sidebar-body]",
		);
		expect(section).not.toBeNull();
		if (!section) return;
		expect(section.scrollWidth).toBeLessThanOrEqual(section.clientWidth + 1);
	},
};

/** データ → DesignTokens. Hash = #design-tokens. */
export const DataDesignTokens: Story = {
	render: renderDialog("design-tokens"),
	play: async ({ canvasElement }) => {
		expectShellInsideFrame(canvasElement);
		expectFooterActionsCompact(canvasElement);
		expectSectionBodyScrolls(canvasElement);
		// Issue #791 (jobs6): the TEXT ALPHA category must render a control
		// for every token — a capture showed orphan labels with no inputs.
		// Every token field wrapper must contain a focusable control.
		const tokenFields = canvasElement.querySelectorAll(
			"[data-design-token-key]",
		);
		expect(tokenFields.length).toBeGreaterThan(0);
		for (const field of tokenFields) {
			expect(field.querySelector("input")).not.toBeNull();
		}
	},
};

/** データ → Inputs (gesture toggles added by #78). Hash = #inputs. */
export const DataInputs: Story = {
	render: renderDialog("inputs"),
};

/** ワークスペース → WorkspaceBackup. Hash = #workspace-backup. */
export const WorkspaceBackup: Story = {
	render: renderDialog("workspace-backup"),
};

/** ワークスペース → Feedback. Hash = #feedback. */
export const WorkspaceFeedback: Story = {
	render: renderDialog("feedback"),
};

/**
 * Low-resolution variant (panel-1 height=400px). Asserts that the
 * fixed tab bar stays in view while only the body scrolls. Use this
 * story to spot-check viewport clipping regressions.
 */
export const LowResolution: Story = {
	// The small frame must be the dialog's direct positioned ancestor —
	// nesting it outside `renderDialog`'s large frame would leave the
	// 640px frame as the containing block and defeat the constraint.
	render: renderDialogIn(smallFrameStyle, "language"),
	play: async ({ canvasElement }) => {
		// Issue #732: the constrained 880x400 frame must actually constrain
		// the dialog — before the frame became `position: relative` the
		// `<dialog open>` shell escaped to the 1280x720 viewport.
		expectShellInsideFrame(canvasElement);
		const shell = canvasElement.querySelector("[data-dialog-shell]");
		expect(shell).not.toBeNull();
		if (!shell) return;
		const shellRect = shell.getBoundingClientRect();
		expect(shellRect.height).toBeLessThanOrEqual(400 + 1);
		expect(shellRect.width).toBeLessThanOrEqual(880 + 1);
	},
};

/**
 * Hash-routing variant — render with an external mutation. Demonstrates
 * that a `hashchange` event swaps the active section. The actual swap
 * happens at runtime via Storybook's controls; this variant simply
 * opens the dialog at #design-tokens.
 */
export const HashRouted: Story = {
	render: renderDialog("design-tokens"),
	play: async ({ canvasElement }) => {
		expectShellInsideFrame(canvasElement);
		expectFooterActionsCompact(canvasElement);
		expectSectionBodyScrolls(canvasElement);
	},
};
