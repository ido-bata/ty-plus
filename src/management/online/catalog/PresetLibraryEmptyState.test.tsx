// @vitest-environment happy-dom

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@/management/i18n/index";
import { labelOfGatewayBootFailureReason } from "@/management/panel/cloud-gateway-boot";
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
		expect(container.textContent).toBe(i18n.t("online:catalog.emptyNoCatalog"));
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
			i18n.t("online:catalog.emptyUnavailable"),
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
		expect(button.getAttribute("title")).toBe(
			i18n.t("online:catalog.gatewayBootRetryHint", {
				reason: labelOfGatewayBootFailureReason("missing-extension-root"),
			}),
		);
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
		expect(button.getAttribute("title")).toBe(
			i18n.t("online:catalog.refreshCatalog"),
		);
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
		expect(container.textContent).toBe(i18n.t("online:catalog.emptyNoMatch"));
	});
});
