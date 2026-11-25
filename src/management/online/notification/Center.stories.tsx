import type { Decorator, Meta, StoryObj } from "@storybook/react";
import { expect, waitFor } from "storybook/test";

import type {
	CloudGateway,
	NotificationSummary,
} from "@/management/online/contract";
import {
	createStorybookCloudGateway,
	OnlineServicesBoundary,
} from "@/storybook/online-services";

import { NotificationCenter } from "./Center";

// NotificationCenter renders the real production component. Its data comes
// from two sources, both fixture-driven here:
//
//   - the local notifications store (`cache/notifications.json`) — served
//     by the in-memory persistence gateway seeded per story. A non-empty
//     seeded `items` list short-circuits the remote sync entirely.
//   - the cloud gateway `listNotifications` / `getNotificationBlocks` —
//     installed via `OnlineServicesBoundary`. When present it wins over
//     the static notification feed.
//
// The component owns view state internally (list vs detail), so stories
// that need the detail surface click a notification card in `play`.

const SHELL_STYLE = {
	display: "flex",
	flexDirection: "column",
	height: 360,
	width: 480,
} as const;

const makeItem = (
	id: string,
	name: string,
	overrides: Partial<NotificationSummary> = {},
): NotificationSummary => ({
	notificationId: id,
	name,
	summary: `Short summary for ${name.toLowerCase()}.`,
	category: "general",
	publishedAt: "2026-09-08T12:00:00.000Z",
	...overrides,
});

const SAMPLE_ITEMS: readonly NotificationSummary[] = [
	makeItem("n-1", "Catalog refreshed", {
		summary: "12 new presets synced from cloud.",
		category: "catalog",
	}),
	makeItem("n-2", "Preset version mismatch", {
		summary: "Re-import recommended for compatibility.",
		category: "compatibility",
	}),
	makeItem("n-3", "Auto-save triggered", {
		summary: "Working set backed up to disk.",
		category: "system",
	}),
];

const LONG_LIST: readonly NotificationSummary[] = [
	...SAMPLE_ITEMS,
	makeItem("n-4", "License renewed", { category: "billing" }),
	makeItem("n-5", "Telemetry batch sent", { category: "system" }),
	makeItem("n-6", "New comment on preset", { category: "social" }),
	makeItem("n-7", "Disk space low", { category: "system" }),
	makeItem("n-8", "Cloud sync failed", { category: "network" }),
	makeItem("n-9", "Catalog indexed", { category: "catalog" }),
	makeItem("n-10", "AE eval timeout", { category: "runtime" }),
];

const SAMPLE_BLOCKS: Record<string, unknown[]> = {
	"n-1": [
		{
			id: "b-1",
			type: "heading_1",
			heading_1: { rich_text: [{ plain_text: "Release notes" }] },
		},
		{
			id: "b-2",
			type: "paragraph",
			paragraph: {
				rich_text: [
					{ plain_text: "This release ships " },
					{ plain_text: "12 new presets", annotations: { bold: true } },
					{
						plain_text: " and resolves the regression in the icon pipeline.",
					},
				],
			},
		},
		{
			id: "b-3",
			type: "heading_3",
			heading_3: { rich_text: [{ plain_text: "Highlights" }] },
		},
		{
			id: "b-4",
			type: "bulleted_list_item",
			bulleted_list_item: {
				rich_text: [{ plain_text: "Faster catalog indexing" }],
			},
		},
		{
			id: "b-5",
			type: "bulleted_list_item",
			bulleted_list_item: {
				rich_text: [{ plain_text: "Improved thumbnails for footage" }],
			},
		},
		{
			id: "b-6",
			type: "callout",
			callout: {
				rich_text: [
					{
						plain_text: "Restart After Effects to apply IPC changes.",
					},
				],
				icon: { emoji: "⚠" },
			},
		},
		{ id: "b-7", type: "divider" },
		{
			id: "b-8",
			type: "quote",
			quote: {
				rich_text: [
					{
						plain_text:
							"Sync latency dropped from 1.2s to 240ms in this build.",
					},
				],
			},
		},
	],
};

type CenterFixture = {
	notifications?: readonly NotificationSummary[];
	notificationBlocks?: Readonly<Record<string, unknown[]>>;
	readAtById?: Record<string, string>;
	isFixture?: boolean;
	/** When true, `listNotifications` never resolves (loading state). */
	pendingList?: boolean;
	/** When true, `getNotificationBlocks` never resolves. */
	pendingBlocks?: boolean;
};

const centerDecorator =
	(fixture: CenterFixture): Decorator =>
	(Story) => {
		const gateway: CloudGateway = createStorybookCloudGateway({
			...(fixture.notifications
				? { notifications: fixture.notifications }
				: {}),
			...(fixture.notificationBlocks
				? { notificationBlocks: fixture.notificationBlocks }
				: {}),
			...(fixture.isFixture ? { isFixture: true } : {}),
		});
		if (fixture.pendingList) {
			gateway.listNotifications = () =>
				new Promise<NotificationSummary[]>(() => {});
		}
		if (fixture.pendingBlocks) {
			gateway.getNotificationBlocks = () => new Promise<unknown[]>(() => {});
		}
		return (
			<OnlineServicesBoundary
				cloudGateway={gateway}
				persistenceSeed={{
					notifications: {
						items: [],
						readAtById: fixture.readAtById ?? {},
					},
				}}
			>
				<div style={SHELL_STYLE}>
					<Story />
				</div>
			</OnlineServicesBoundary>
		);
	};

const meta = {
	title: "Notification/Center",
	component: NotificationCenter,
	// `notifications: []` keeps the gateway's `listNotifications` present so
	// the component never falls through to the real static-feed fetch.
	decorators: [centerDecorator({ notifications: [] })],
} satisfies Meta;

export default meta;
type Story = StoryObj;

const notificationCards = (canvasElement: HTMLElement): HTMLElement[] =>
	Array.from(
		canvasElement.querySelectorAll<HTMLElement>("[data-notification-id]"),
	);

export const Default: Story = {
	// Empty store + gateway `listNotifications` → `[]`: the sync resolves
	// to an empty remote list and the empty state stays (the static feed
	// is never reached because the gateway method exists).
	play: async ({ canvasElement }) => {
		await waitFor(() => {
			expect(canvasElement.textContent).toContain("No notifications");
		});
	},
};

export const Loading: Story = {
	decorators: [centerDecorator({ pendingList: true })],
	play: async ({ canvasElement }) => {
		await waitFor(() => {
			expect(canvasElement.textContent).toContain("Loading…");
		});
	},
};

export const WithItems: Story = {
	decorators: [
		centerDecorator({
			notifications: SAMPLE_ITEMS,
			readAtById: { "n-3": "2026-09-08T11:30:00.000Z" },
		}),
	],
	play: async ({ canvasElement }) => {
		await waitFor(() => {
			expect(notificationCards(canvasElement)).toHaveLength(3);
		});
	},
};

export const LongList: Story = {
	decorators: [
		centerDecorator({
			notifications: LONG_LIST,
			readAtById: {
				"n-3": "2026-09-08T11:30:00.000Z",
				"n-4": "2026-09-07T09:10:00.000Z",
				"n-9": "2026-09-06T17:00:00.000Z",
			},
		}),
	],
	play: async ({ canvasElement }) => {
		await waitFor(() => {
			expect(notificationCards(canvasElement)).toHaveLength(10);
		});
	},
};

export const FixtureMode: Story = {
	decorators: [
		centerDecorator({
			notifications: SAMPLE_ITEMS,
			isFixture: true,
		}),
	],
	play: async ({ canvasElement }) => {
		await waitFor(() => {
			expect(
				canvasElement.textContent?.includes("placeholder (offline fixture)"),
			).toBe(true);
		});
		// Issue #475: fixture cards must not be dimmed with a global
		// `opacity` — the fixture badge carries the marker and the card
		// keeps full text contrast.
		const card = notificationCards(canvasElement)[0];
		if (!card) throw new Error("notification card not found");
		expect(getComputedStyle(card).opacity).toBe("1");
	},
};

export const DetailView: Story = {
	decorators: [
		centerDecorator({
			notifications: SAMPLE_ITEMS,
			notificationBlocks: SAMPLE_BLOCKS,
			readAtById: { "n-1": "2026-09-08T11:30:00.000Z" },
		}),
	],
	play: async ({ canvasElement }) => {
		await waitFor(() => {
			expect(notificationCards(canvasElement).length).toBeGreaterThan(0);
		});
		const { userEvent } = await import("vitest/browser");
		const firstCard = notificationCards(canvasElement)[0];
		if (!firstCard) throw new Error("notification card not found");
		await userEvent.click(firstCard);
		await waitFor(() => {
			// Detail header shows the notification name and the
			// mark-unread toggle (the card was already read via seed).
			expect(
				canvasElement.querySelector("[aria-label='Mark unread']"),
			).not.toBeNull();
		});
		const toggle = canvasElement.querySelector<HTMLButtonElement>(
			"[aria-label='Mark unread']",
		);
		expect(toggle?.getAttribute("aria-pressed")).toBe("true");
		// Blocks load through `getNotificationBlocks`; the callout emoji
		// renders inline like the product callout surface (Issue #476).
		await waitFor(() => {
			expect(canvasElement.textContent).toContain("Release notes");
			expect(canvasElement.textContent).toContain("⚠");
		});
	},
};

export const DetailLoading: Story = {
	decorators: [
		centerDecorator({
			notifications: SAMPLE_ITEMS,
			pendingBlocks: true,
		}),
	],
	play: async ({ canvasElement }) => {
		await waitFor(() => {
			expect(notificationCards(canvasElement).length).toBeGreaterThan(0);
		});
		const { userEvent } = await import("vitest/browser");
		const firstCard = notificationCards(canvasElement)[0];
		if (!firstCard) throw new Error("notification card not found");
		await userEvent.click(firstCard);
		await waitFor(() => {
			expect(canvasElement.textContent).toContain("Loading…");
		});
	},
};
