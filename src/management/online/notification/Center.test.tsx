// @vitest-environment happy-dom

/**
 * Issue #69: `NotificationCenter` must not leak `GatewayBootRequiredError`
 * as an unhandled rejection when the cloud gateway never booted (the R0
 * offline default). The static notification feed is the designed fallback.
 */
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	__resetDataServicesForTests,
	setDataServicesBootMode,
} from "@/management/workspace/services";
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

describe("NotificationCenter — unbooted gateway (Issue #69)", () => {
	beforeEach(() => {
		__resetDataServicesForTests();
		// Live boot mode with no registered gateway: `getDataServices()`
		// throws `GatewayBootRequiredError`; `tryGetDataServices()` returns null.
		setDataServicesBootMode("live");
		mockedFetchFeed.mockClear();
	});

	afterEach(() => {
		cleanup();
		__resetDataServicesForTests();
	});

	it("falls back to the static feed instead of throwing GatewayBootRequiredError", async () => {
		render(<NotificationCenter />);

		// Once the local store resolves, `initialized` flips and the empty
		// item list triggers `syncRemote`, which must reach the feed
		// fallback rather than rejecting on `getDataServices()`.
		await waitFor(() => {
			expect(mockedFetchFeed).toHaveBeenCalled();
		});
	});

	it("still reads the local store without a gateway", async () => {
		render(<NotificationCenter />);

		await waitFor(() => {
			expect(loadNotificationsStore).toHaveBeenCalled();
		});
		expect(saveNotificationsStore).not.toHaveBeenCalled();
	});
});
