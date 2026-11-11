import type { Meta, StoryObj } from "@storybook/react";
import { type JSX, type ReactElement, useMemo } from "react";
import { SettingsContext } from "@/management/setting/context";
import {
	DEFAULT_SETTINGS,
	mergeSettings,
	type Settings,
} from "@/management/setting/models/settings";
import { css } from "@/styled-system/css";

import { InputsSection } from "./InputsSection";

/**
 * The shared `SettingsProviderDecorator` mounts a real `SettingsProvider`
 * that loads from disk and falls back to `DEFAULT_SETTINGS`. To exercise
 * the four gesture states visually, this wrapper supplies a controlled
 * `SettingsContext` with the gesture overrides the story needs.
 *
 * `updateSettings` is a no-op for visual purposes; the toggle's checked
 * state comes from the patched `settings` object, which is what stories
 * render.
 */
type Args = {
	anchorPoint: boolean;
	alignment: boolean;
};

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
	gestures,
	children,
}: {
	gestures: { anchorPoint: boolean; alignment: boolean };
	children: ReactElement;
}): JSX.Element => {
	const value = useMemo<SettingsBag>(() => {
		const settings = mergeSettings(DEFAULT_SETTINGS, { gestures });
		return {
			settings,
			updateSettings: () => undefined,
			refreshPathsFromDisk: async () => undefined,
			reloadSettingsFromDisk: async () => undefined,
			resetSettings: () => undefined,
			isLoaded: true,
		};
	}, [gestures]);
	return (
		<SettingsContext.Provider value={value}>
			{children}
		</SettingsContext.Provider>
	);
};

const frameStyle = css({
	width: "480px",
	padding: "3",
});

const renderSection = (args: Args): JSX.Element => (
	<div className={frameStyle}>
		<StorySettingsProvider
			gestures={{
				anchorPoint: args.anchorPoint,
				alignment: args.alignment,
			}}
		>
			<InputsSection />
		</StorySettingsProvider>
	</div>
);

const meta = {
	title: "Setting/InputsSection",
	args: {
		anchorPoint: true,
		alignment: true,
	},
	argTypes: {
		anchorPoint: { control: "boolean" },
		alignment: { control: "boolean" },
	},
	render: renderSection,
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

/** Both gesture toggles enabled (defaults). */
export const Default: Story = {};

/** Anchor point gesture disabled — alignment drag remains on. */
export const AnchorOff: Story = {
	args: { anchorPoint: false, alignment: true },
};

/** Alignment gesture disabled — anchor point drag remains on. */
export const AlignmentOff: Story = {
	args: { anchorPoint: true, alignment: false },
};

/** Both gesture toggles disabled — every widget falls back to direct clicks. */
export const BothOff: Story = {
	args: { anchorPoint: false, alignment: false },
};
