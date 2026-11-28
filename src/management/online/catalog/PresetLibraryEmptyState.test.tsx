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
		// jobs6 (#792): the retry action is a labelled button now, so the
		// copy is asserted with `toContain` rather than exact equality.
		expect(container.textContent).toContain(
			i18n.t("online:catalog.emptyNoCatalog"),
		);
		expect(container.textContent).toContain(
			i18n.t("online:catalog.refreshCatalog"),
		);
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

	it("shows a loading label instead of the empty copy while loading", () => {
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
		// jobs6 (#792): a bare `null` left the panel blank — the loading
		// branch must paint a status, without the empty-state marker.
		expect(
			container.querySelector("[data-online-preset-loading]"),
		).not.toBeNull();
		expect(container.textContent).toContain(i18n.t("common:app.loading"));
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
		// jobs6 (#792): labelled clear-filters button — assert the copy,
		// not exact textContent (the button carries its own label).
		expect(container.textContent).toContain(
			i18n.t("online:catalog.emptyNoMatch"),
		);
		expect(container.textContent).toContain(
			i18n.t("online:catalog.clearAllFilters"),
		);
	});
});
