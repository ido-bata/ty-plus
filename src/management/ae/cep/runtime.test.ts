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
	it("resolves exe under Support Files to that folder", () => {
		const win = mockWinWithHostApplication(
			"C:/Program Files/Adobe/Adobe After Effects 2026/Support Files/AfterFX.exe",
		);
		expect(getCepHostSupportRootPath(win)).toBe(
			"C:/Program Files/Adobe/Adobe After Effects 2026/Support Files",
		);
	});

	it("walks up to Support Files when hostApplication is deeper", () => {
		const win = mockWinWithHostApplication(
			"D:/4_apps/adobe/Adobe After Effects 2026/Support Files/Plug-ins/Effects/foo/AfterFX.exe",
		);
		expect(getCepHostSupportRootPath(win)).toBe(
			"D:/4_apps/adobe/Adobe After Effects 2026/Support Files",
		);
	});

	it("appends Support Files when exe is in the version folder", () => {
		const win = mockWinWithHostApplication(
			"C:/Program Files/Adobe/Adobe After Effects 2026/AfterFX.exe",
		);
		expect(getCepHostSupportRootPath(win)).toBe(
			"C:/Program Files/Adobe/Adobe After Effects 2026/Support Files",
		);
	});
});
