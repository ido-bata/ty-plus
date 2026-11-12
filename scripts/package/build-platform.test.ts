import { describe, expect, it } from "vitest";
import {
	buildPlatformOverride,
	isBuildPlatform,
	resolveBuildPlatform,
} from "./build-platform";

/**
 * The build target platform is decided in exactly one place.
 *
 * Regression context: the release scripts used to derive the platform from
 * `process.platform` independently. A Windows candidate cross-built on macOS
 * was therefore verified as macOS — the gate looked for a macOS worker that
 * does not exist and failed with a misleading error.
 */

describe("build platform resolution", () => {
	it("uses the host platform when no override is set", () => {
		expect(resolveBuildPlatform("darwin", {})).toBe("macos");
		expect(resolveBuildPlatform("win32", {})).toBe("windows");
		expect(resolveBuildPlatform("linux", {})).toBeNull();
	});

	it("honours an explicit override on any host", () => {
		expect(
			resolveBuildPlatform("darwin", { TY_PLUS_BUILD_PLATFORM: "windows" }),
		).toBe("windows");
		expect(
			resolveBuildPlatform("linux", { TY_PLUS_BUILD_PLATFORM: "macos" }),
		).toBe("macos");
	});

	it("ignores an empty or whitespace override instead of failing the build", () => {
		expect(resolveBuildPlatform("darwin", { TY_PLUS_BUILD_PLATFORM: "" })).toBe(
			"macos",
		);
		expect(
			resolveBuildPlatform("darwin", { TY_PLUS_BUILD_PLATFORM: "   " }),
		).toBe("macos");
	});

	it("rejects an unknown platform rather than guessing", () => {
		expect(() => buildPlatformOverride({ TY_PLUS_BUILD_PLATFORM: "linux" })).toThrow(
			/unsupported TY_PLUS_BUILD_PLATFORM/,
		);
		// The rejection must survive resolution too, not silently fall back.
		expect(() =>
			resolveBuildPlatform("darwin", { TY_PLUS_BUILD_PLATFORM: "win64" }),
		).toThrow(/unsupported/);
	});

	it("accepts only the two distribution platforms", () => {
		expect(isBuildPlatform("windows")).toBe(true);
		expect(isBuildPlatform("macos")).toBe(true);
		for (const value of ["linux", "darwin", "win32", "", null, 0]) {
			expect(isBuildPlatform(value)).toBe(false);
		}
	});
});
