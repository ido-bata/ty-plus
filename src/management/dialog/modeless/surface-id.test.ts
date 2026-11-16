import { afterEach, describe, expect, test, vi } from "vitest";

import { resolveDialogSurfaceId } from "./surface-id";

describe("resolveDialogSurfaceId", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	test("uses explicit surfaceId from CEP open params before physical extension id", () => {
		vi.stubGlobal("window", {
			CSInterface: class {
				getArguments() {
					return JSON.stringify({ surfaceId: "debug-console" });
				}
				getExtensionID() {
					return "";
				}
			},
		});

		expect(resolveDialogSurfaceId()).toBe("debug-console");
	});

	test("resolves surface ids for dev-prefixed physical extension ids", async () => {
		vi.stubGlobal("__TY_PLUS_EXTENSION_BUNDLE_ID__", "app.ty-plus.dev");
		vi.resetModules();
		const { resolveDialogSurfaceId: resolveDev } = await import("./surface-id");
		vi.stubGlobal("window", {
			CSInterface: class {
				getExtensionID() {
					return "app.ty-plus.dev.dialog-settings";
				}
			},
		});

		expect(resolveDev()).toBe("dialog-settings");
	});
});
