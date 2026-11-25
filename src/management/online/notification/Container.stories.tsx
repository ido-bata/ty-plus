import type { Meta, StoryObj } from "@storybook/react";
import { expect, waitFor } from "storybook/test";

import {
	type NotificationSeedEntry,
	NotificationStoreSeed,
} from "@/storybook/online-services";

import { NotificationContainer } from "./Container";

// NotificationContainer renders the real production component. It reads
// the `notificationStore` pub/sub singleton and portals its toasts to
// `document.body` — `NotificationStoreSeed` pushes the story's entries
// into that store for the story's lifetime (and clears it on unmount),
// which is exactly how production code feeds the container. Assertions
// therefore query `document.body`, not the story canvas.

type Args = {
	entries: readonly NotificationSeedEntry[];
};

const baseArgs: Args = {
	entries: [],
};

const meta = {
	title: "Notification/Container",
	component: NotificationContainer,
	args: baseArgs,
	render: (args: Args) => (
		<NotificationStoreSeed entries={args.entries}>
			<NotificationContainer />
		</NotificationStoreSeed>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

const toastCards = (): HTMLElement[] =>
	Array.from(document.body.querySelectorAll<HTMLElement>('[role="alert"]'));

export const Default: Story = {
	// Issue #528: with zero entries the production container renders
	// nothing — no placeholder label may appear.
	play: async () => {
		expect(toastCards()).toHaveLength(0);
	},
};

export const WithItems: Story = {
	args: {
		entries: [
			{
				message: "Catalog refresh complete (12 presets).",
				type: "info",
				dismissible: true,
			},
			{
				message: "Preset version mismatch — re-import recommended.",
				type: "warning",
				dismissible: true,
			},
			{
				message: "Cloud sync failed. Check your network connection.",
				type: "error",
				dismissible: true,
			},
		],
	},
	play: async () => {
		await waitFor(() => {
			expect(toastCards()).toHaveLength(3);
		});
		// Issue #518: the portal sits fixed at the top-right of the
		// viewport like the production placement.
		const first = toastCards()[0];
		if (!first) throw new Error("notification toast not found");
		const portal = first.parentElement;
		if (!portal) throw new Error("notification portal not found");
		const rect = portal.getBoundingClientRect();
		const viewportWidth = portal.ownerDocument.documentElement.clientWidth;
		expect(rect.top).toBeLessThan(64);
		expect(viewportWidth - rect.right).toBeLessThan(64);
		// Issue #476: messages must not use `word-break: break-all`,
		// which split English words mid-word ("netwo/rk"). Overflow
		// wrapping only kicks in when a token cannot fit on its own.
		const message = first.querySelector<HTMLElement>("div");
		if (!message) throw new Error("notification message not found");
		const style = getComputedStyle(message);
		expect(style.wordBreak).not.toBe("break-all");
		expect(style.overflowWrap).toBe("anywhere");
	},
};

export const LongList: Story = {
	args: {
		entries: [
			{
				message: "Catalog refresh complete.",
				type: "info",
				dismissible: true,
			},
			{
				message: "Disk space running low.",
				type: "warning",
				dismissible: true,
			},
			{
				message: "Network timeout while syncing.",
				type: "error",
				dismissible: true,
			},
			{
				message: "Preset published to catalog.",
				type: "info",
				dismissible: true,
			},
			{
				message: "Telemetry batch sent.",
				type: "info",
				dismissible: true,
			},
			{
				message: "License expiring in 7 days.",
				type: "warning",
				dismissible: true,
			},
			{
				message: "Failed to read cache — falling back to fixtures.",
				type: "error",
				dismissible: true,
			},
			{
				message: "Auto-save triggered.",
				type: "info",
				dismissible: true,
			},
		],
	},
	play: async () => {
		await waitFor(() => {
			expect(toastCards()).toHaveLength(8);
		});
	},
};

export const NonDismissible: Story = {
	args: {
		entries: [
			{
				message: "Critical: AE connection lost. Reopen the panel.",
				type: "error",
				dismissible: false,
			},
		],
	},
	play: async () => {
		await waitFor(() => {
			expect(toastCards()).toHaveLength(1);
		});
		const card = toastCards()[0];
		expect(card?.querySelector("button")).toBeNull();
	},
};
