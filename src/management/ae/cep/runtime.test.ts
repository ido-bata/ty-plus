import { describe, expect, it } from "vitest";

import {
	getCepHostSupportRootPath,
	normalizeCepHostProductCode,
} from "./runtime";

const mockWinWithHostApplication = (hostApplication: string) =>
	({
		CSInterface: class {
			getHostEnvironment() {
				return JSON.stringify({ appName: "Adobe After Effects" });
			}
			getSystemPath(id: string) {
				if (id === "hostApplication") {
					return hostApplication;
				}
				return "";
			}
		},
	}) as unknown as Window;

describe("normalizeCepHostProductCode", () => {
	it("maps After Effects app label to AEFT", () => {
		expect(normalizeCepHostProductCode("Adobe After Effects")).toBe("AEFT");
	});
});

describe("getCepHostSupportRootPath", () => {
	// The platform is injected, never read from the machine. `Support Files`
	// is a Windows-only rule and the `.app` parent is a macOS-only rule, so a
	// host-dependent assertion passed on Linux (where the OS is inferred from
	// the path shape) and failed on macOS — the same path shape got a
	// different verdict depending on where the suite ran (Issue #190).

	it("resolves exe under Support Files to that folder", () => {
		const win = mockWinWithHostApplication(
			"C:/Program Files/Adobe/Adobe After Effects 2026/Support Files/AfterFX.exe",
		);
		expect(getCepHostSupportRootPath(win, { platform: "win32" })).toBe(
			"C:/Program Files/Adobe/Adobe After Effects 2026/Support Files",
		);
	});

	it("walks up to Support Files when hostApplication is deeper", () => {
		const win = mockWinWithHostApplication(
			"D:/4_apps/adobe/Adobe After Effects 2026/Support Files/Plug-ins/Effects/foo/AfterFX.exe",
		);
		expect(getCepHostSupportRootPath(win, { platform: "win32" })).toBe(
			"D:/4_apps/adobe/Adobe After Effects 2026/Support Files",
		);
	});

	it("appends Support Files when exe is in the version folder", () => {
		const win = mockWinWithHostApplication(
			"C:/Program Files/Adobe/Adobe After Effects 2026/AfterFX.exe",
		);
		expect(getCepHostSupportRootPath(win, { platform: "win32" })).toBe(
			"C:/Program Files/Adobe/Adobe After Effects 2026/Support Files",
		);
	});

	it("resolves the .app parent as the root on macOS", () => {
		// `Support Files` does not exist on macOS: the version folder that
		// contains the bundle is the install root. This is the layout Adobe
		// ships for After Effects 2026 (`…/Adobe After Effects 2026/
		// Adobe After Effects 2026.app/Contents/MacOS/AfterFX`).
		const win = mockWinWithHostApplication(
			"/Applications/Adobe After Effects 2026/Adobe After Effects 2026.app/Contents/MacOS/AfterFX",
		);
		expect(getCepHostSupportRootPath(win, { platform: "darwin" })).toBe(
			"/Applications/Adobe After Effects 2026",
		);
	});

	it("infers the OS from the path shape when the host reports none", () => {
		// A CEP panel without `process`, and the Linux CI runner, both land
		// here: `normalizeOperatingSystem` yields `unknown` and the path shape
		// decides. This is why the Windows assertions stayed green on Linux
		// while failing on macOS, where `darwin` is known and no inference runs.
		const win = mockWinWithHostApplication(
			"C:/Program Files/Adobe/Adobe After Effects 2026/AfterFX.exe",
		);
		expect(getCepHostSupportRootPath(win, { platform: "linux" })).toBe(
			"C:/Program Files/Adobe/Adobe After Effects 2026/Support Files",
		);
	});
});
