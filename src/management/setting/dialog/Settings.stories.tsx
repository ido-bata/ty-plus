import type { Meta, StoryObj } from "@storybook/react";
import { type JSX, type ReactElement, useMemo } from "react";
import { SettingsContext } from "@/management/setting/context";
import {
	DEFAULT_SETTINGS,
	mergeSettings,
	type Settings,
} from "@/management/setting/models/settings";
import { css } from "@/styled-system/css";

import { SettingsDialog } from "./Settings";

const largeFrameStyle = css({
	height: "640px",
	width: "880px",
});

const smallFrameStyle = css({
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
		patch: Partial<Settings>,
		options?: { skipPathPersist?: boolean },
	) => void;
	refreshPathsFromDisk: () => Promise<void>;
	reloadSettingsFromDisk: () => Promise<void>;
	resetSettings: () => void;
	isLoaded: boolean;
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

const renderDialog = (hash?: string) => (): JSX.Element => (
	<div className={largeFrameStyle}>
		<StorySettingsProvider hash={hash}>
			<SettingsDialog />
		</StorySettingsProvider>
	</div>
);

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
export const DisplayLanguage: Story = {};

/** 表示 → Style / Appearance section. Hash = #appearance. */
export const DisplayAppearance: Story = {
	render: renderDialog("appearance"),
};

/** 表示 → Background. Hash = #background. */
export const DisplayBackground: Story = {
	render: renderDialog("background"),
};

/** 表示 → Grid. Hash = #grid. */
export const DisplayGrid: Story = {
	render: renderDialog("grid"),
};

/** データ → Paths. Hash = #paths. */
export const DataPaths: Story = {
	render: renderDialog("paths"),
};

/** データ → Network. Hash = #network. */
export const DataNetwork: Story = {
	render: renderDialog("network"),
};

/** データ → ComponentPreview. Hash = #component-preview. */
export const DataComponentPreview: Story = {
	render: renderDialog("component-preview"),
};

/** データ → DesignTokens. Hash = #design-tokens. */
export const DataDesignTokens: Story = {
	render: renderDialog("design-tokens"),
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
	decorators: [
		(StoryComponent) => (
			<div className={smallFrameStyle}>
				<StoryComponent />
			</div>
		),
	],
	render: renderDialog(),
};

/**
 * Hash-routing variant — render with an external mutation. Demonstrates
 * that a `hashchange` event swaps the active section. The actual swap
 * happens at runtime via Storybook's controls; this variant simply
 * opens the dialog at #design-tokens.
 */
export const HashRouted: Story = {
	render: renderDialog("design-tokens"),
};
