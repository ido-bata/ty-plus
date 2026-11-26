import type { Meta, StoryObj } from "@storybook/react";
import type { JSX } from "react";
import { useEffect } from "react";
import { expect, userEvent, within } from "storybook/test";
import { css } from "@/styled-system/css";

import {
	SettingsSidebar,
	type SettingsSidebarSectionDef,
} from "./SettingsSidebar";

/**
 * Settings sidebar (Issue #610): the vertical WAI-ARIA tablist that
 * drives the settings dialog body. `SettingsDialog` stories cover the
 * whole-dialog hash routing per section; these stories exercise the
 * sidebar in isolation — group ordering, roving tabindex keyboard
 * navigation, and section-body swapping.
 *
 * Section `render` bodies are lightweight fixtures (the real section
 * components have their own stories under `sections/`); the subject
 * under test is the sidebar chrome itself.
 */

const SECTION_IDS = [
	"language",
	"appearance",
	"background",
	"grid",
	"tips",
	"paths",
	"update",
	"component-preview",
	"design-tokens",
	"inputs",
	"workspace-backup",
	"feedback",
] as const;

const GROUP_OF: Record<string, SettingsSidebarSectionDef["groupId"]> = {
	language: "display",
	appearance: "display",
	background: "display",
	grid: "display",
	tips: "display",
	paths: "data",
	update: "data",
	"component-preview": "data",
	"design-tokens": "data",
	inputs: "data",
	"workspace-backup": "workspace",
	feedback: "workspace",
};

const SectionBody = ({ id }: { id: string }): JSX.Element => (
	<div
		data-story-section-body={id}
		className={css({ padding: "4", color: "text.primary" })}
	>
		Section body: {id}
	</div>
);

const SECTIONS: SettingsSidebarSectionDef[] = SECTION_IDS.map((id) => ({
	sectionId: id,
	groupId: GROUP_OF[id] ?? "display",
	labelKey: `tabs.section.${id}`,
	render: () => <SectionBody id={id} />,
}));

const frameStyle = css({
	height: "30rem",
	width: "46rem",
	display: "flex",
	backgroundColor: "surface.dialog",
	borderWidth: "hairline",
	borderStyle: "solid",
	borderColor: "border.default",
});

const meta = {
	title: "Setting/SettingsSidebar",
	parameters: { layout: "fullscreen" },
	render: () => (
		<div className={frameStyle}>
			<SettingsSidebar sections={SECTIONS} />
		</div>
	),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** All three groups (display / data / workspace) with the default section. */
export const Default: Story = {
	play: async ({ canvasElement }) => {
		const tablist = canvasElement.querySelector(
			"[data-settings-sidebar-tablist]",
		);
		expect(tablist).not.toBeNull();
		expect(tablist?.getAttribute("aria-orientation")).toBe("vertical");
		const tabs = canvasElement.querySelectorAll<HTMLElement>(
			"[data-settings-sidebar-item]",
		);
		expect(tabs).toHaveLength(SECTION_IDS.length);
		// Roving tabindex: exactly one tab is in the natural tab order.
		const tabbable = Array.from(tabs).filter((tab) => tab.tabIndex === 0);
		expect(tabbable).toHaveLength(1);
		expect(tabbable[0]?.dataset.settingsSidebarItem).toBe("language");
	},
};

/**
 * Arrow-key navigation: focus the active tab and press ArrowDown —
 * focus and `aria-selected` must move to the next section in group
 * order, and the body swaps to that section's panel.
 */
export const KeyboardNavigation: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const activeTab = canvas.getByRole("tab", { selected: true });
		activeTab.focus();
		await userEvent.keyboard("{ArrowDown}");
		const next = canvas.getByRole("tab", { selected: true });
		expect(next.dataset.settingsSidebarItem).toBe("appearance");
		expect(
			canvasElement.querySelector("[data-story-section-body='appearance']"),
		).not.toBeNull();
	},
};

/** Hash deep link — `#grid` selects the grid section on mount. */
export const HashRouted: Story = {
	decorators: [
		(StoryComponent) => {
			useEffect(() => {
				if (window.location.hash !== "#grid") {
					window.history.replaceState(null, "", "#grid");
				}
				return () => {
					window.history.replaceState(null, "", window.location.pathname);
				};
			}, []);
			return <StoryComponent />;
		},
	],
	render: () => {
		if (window.location.hash !== "#grid") {
			window.history.replaceState(null, "", "#grid");
		}
		return (
			<div className={frameStyle}>
				<SettingsSidebar sections={SECTIONS} defaultSectionId="language" />
			</div>
		);
	},
	play: async ({ canvasElement }) => {
		const selected = canvasElement.querySelector(
			"[data-settings-sidebar-item][data-settings-sidebar-active='true']",
		);
		expect(selected?.getAttribute("data-settings-sidebar-item")).toBe("grid");
		expect(
			canvasElement.querySelector("[data-story-section-body='grid']"),
		).not.toBeNull();
	},
};
