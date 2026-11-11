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
});
