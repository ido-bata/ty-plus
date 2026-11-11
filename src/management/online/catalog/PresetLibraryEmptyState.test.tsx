// @vitest-environment happy-dom

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PresetLibraryEmptyState } from "./PresetLibraryEmptyState";

afterEach(cleanup);

describe("PresetLibraryEmptyState — Issue #128 disconnected state", () => {
	it("renders the friendly 'No online catalog' copy when the catalog returned 0 live items", () => {
		const { container } = render(
			<PresetLibraryEmptyState
				loading={false}
				catalogLength={0}
				filteredLength={0}
				onRefresh={() => {}}
				onClearFilters={() => {}}
			/>,
		);
		expect(container.textContent).toBe("No online catalog.");
		expect(container.querySelector("[data-gateway-boot-reason]")).toBeNull();
	});

	it("renders the disconnected copy when the live gateway is not built", () => {
		const { container } = render(
			<PresetLibraryEmptyState
				loading={false}
				catalogLength={0}
				filteredLength={0}
				onRefresh={() => {}}
				onClearFilters={() => {}}
				disconnected
				disconnectedReason="Worker runtime unavailable on this host"
				disconnectedReasonTag="worker-runtime-failed"
			/>,
		);
		const empty = container.querySelector(
			"[data-online-preset-empty]",
		) as HTMLElement | null;
		expect(empty).not.toBeNull();
		expect(empty?.getAttribute("data-gateway-boot-reason")).toBe(
			"worker-runtime-failed",
		);
		expect(container.textContent).toContain(
			"Online preset library is unavailable.",
		);
		expect(container.textContent).toContain(
			"Worker runtime unavailable on this host",
		);
	});

	// `onRefresh` only reloads the catalog; it cannot rebuild the cloud
	// gateway. With a boot failure present the control therefore has to be
	// disabled rather than invite a click that cannot recover anything.
	it("disables the refresh control when the gateway boot failed", () => {
		const onRefresh = vi.fn();
		const { getByRole } = render(
			<PresetLibraryEmptyState
				loading={false}
				catalogLength={0}
				filteredLength={0}
				onRefresh={onRefresh}
				onClearFilters={() => {}}
				disconnected
				disconnectedReasonTag="missing-extension-root"
			/>,
		);
		const button = getByRole("button");
		expect(button).toBeDisabled();
		expect(button.getAttribute("title")).toContain("reload the panel");
		fireEvent.click(button);
		expect(onRefresh).not.toHaveBeenCalled();
	});

	it("fires onRefresh when the gateway is healthy and only the query failed", () => {
		const onRefresh = vi.fn();
		const { getByRole } = render(
			<PresetLibraryEmptyState
				loading={false}
				catalogLength={0}
				filteredLength={0}
				onRefresh={onRefresh}
				onClearFilters={() => {}}
				disconnected
			/>,
		);
		const button = getByRole("button");
		expect(button).toBeEnabled();
		expect(button.getAttribute("title")).toBe("Refresh catalog");
		fireEvent.click(button);
		expect(onRefresh).toHaveBeenCalledTimes(1);
	});

	it("returns null while loading and does not flash the empty copy", () => {
		const { container } = render(
			<PresetLibraryEmptyState
				loading
				catalogLength={0}
				filteredLength={0}
				onRefresh={() => {}}
				onClearFilters={() => {}}
			/>,
		);
		expect(container.querySelector("[data-online-preset-empty]")).toBeNull();
	});

	it("shows the 'no presets match filter' copy on the filter-miss branch", () => {
		const { container } = render(
			<PresetLibraryEmptyState
				loading={false}
				catalogLength={10}
				filteredLength={0}
				onRefresh={() => {}}
				onClearFilters={() => {}}
			/>,
		);
		expect(container.textContent).toBe("No presets match filter.");
	});
});
