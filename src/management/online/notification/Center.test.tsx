// @vitest-environment happy-dom

/**
 * `NotificationCenter` reads the static notification feed — there is no
 * gateway or boot boundary in the notification path.
 */
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationCenter } from "./Center";
import { fetchNotificationFeed } from "./feed";
import {
	loadNotificationsStore,
	saveNotificationsStore,
} from "./notifications";

vi.mock("./feed", () => ({
	fetchNotificationFeed: vi.fn(async () => null),
}));

vi.mock("./notifications", () => ({
	loadNotificationsStore: vi.fn(async () => ({ items: [], readAtById: {} })),
	saveNotificationsStore: vi.fn(async () => {}),
}));

const mockedFetchFeed = vi.mocked(fetchNotificationFeed);

describe("NotificationCenter — feed source", () => {
	beforeEach(() => {
		mockedFetchFeed.mockClear();
	});

	afterEach(() => {
		cleanup();
	});

	it("fetches the static feed once the local store resolves", async () => {
		render(<NotificationCenter />);

		// Once the local store resolves, `initialized` flips and the empty
		// item list triggers `syncRemote`, which fetches the feed.
		await waitFor(() => {
			expect(mockedFetchFeed).toHaveBeenCalled();
		});
	});

	it("still reads the local store", async () => {
		render(<NotificationCenter />);

		await waitFor(() => {
			expect(loadNotificationsStore).toHaveBeenCalled();
		});
		expect(saveNotificationsStore).not.toHaveBeenCalled();
	});
});
