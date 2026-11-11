/**
 * @vitest-environment jsdom
 */

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useCatalogViewMode } from "./catalog-view-mode";

describe("useCatalogViewMode", () => {
	it("defaults to list view", () => {
		const { result } = renderHook(() => useCatalogViewMode());
		expect(result.current.viewMode).toBe("list");
		expect(result.current.isIconView).toBe(false);
	});

	it("accepts an initial mode", () => {
		const { result } = renderHook(() => useCatalogViewMode("icons"));
		expect(result.current.viewMode).toBe("icons");
		expect(result.current.isIconView).toBe(true);
	});

	it("toggles between list and icons", () => {
		const { result } = renderHook(() => useCatalogViewMode());
		act(() => {
			result.current.toggleView();
		});
		expect(result.current.viewMode).toBe("icons");
		act(() => {
			result.current.toggleView();
		});
		expect(result.current.viewMode).toBe("list");
	});

	it("supports direct setViewMode", () => {
		const { result } = renderHook(() => useCatalogViewMode());
		act(() => {
			result.current.setViewMode("icons");
		});
		expect(result.current.isIconView).toBe(true);
	});
});
