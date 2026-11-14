import { afterEach, describe, expect, it, vi } from "vitest";

const loadModule = async () => {
	vi.resetModules();
	return import("./extension-id");
};

describe("tyPlusExtensionBundleId", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("defaults to the release bundle id when nothing is injected", async () => {
		const { tyPlusExtensionBundleId, tyPlusExtensionId } = await loadModule();
		expect(tyPlusExtensionBundleId).toBe("app.ty-plus");
		expect(tyPlusExtensionId("dialog-settings")).toBe(
			"app.ty-plus.dialog-settings",
		);
		expect(tyPlusExtensionId("panel1")).toBe("app.ty-plus.panel1");
	});

	it("uses the injected dev bundle id", async () => {
		vi.stubGlobal("__TY_PLUS_EXTENSION_BUNDLE_ID__", "app.ty-plus.dev");
		const { tyPlusExtensionBundleId, tyPlusExtensionId } = await loadModule();
		expect(tyPlusExtensionBundleId).toBe("app.ty-plus.dev");
		expect(tyPlusExtensionId("panel1")).toBe("app.ty-plus.dev.panel1");
		expect(tyPlusExtensionId("dialog-preset-add-3")).toBe(
			"app.ty-plus.dev.dialog-preset-add-3",
		);
	});
});
