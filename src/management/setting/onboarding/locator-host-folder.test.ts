import { describe, expect, it, vi } from "vitest";

import { resolveInitializationAppRoot } from "./initialization";

vi.mock("@/management/storage/cep", async () => {
	const actual = await vi.importActual<
		typeof import("@/management/storage/cep")
	>("@/management/storage/cep");
	return {
		...actual,
		cepEvalScriptAvailable: vi.fn(() => true),
		runCepEvalScript: vi.fn(),
	};
});

describe("resolveInitializationAppRoot", () => {
	it("returns only ExtendScript Folder.appPackage path", async () => {
		const { runCepEvalScript } = await import("@/management/storage/cep");
		(runCepEvalScript as ReturnType<typeof vi.fn>).mockResolvedValue(
			"D:/4_apps/adobe/Adobe After Effects 2026/Support Files",
		);

		const win = {} as Window;
		await expect(resolveInitializationAppRoot(win)).resolves.toBe(
			"D:/4_apps/adobe/Adobe After Effects 2026/Support Files",
		);
	});

	it("returns null when ExtendScript returns empty", async () => {
		const { runCepEvalScript } = await import("@/management/storage/cep");
		(runCepEvalScript as ReturnType<typeof vi.fn>).mockResolvedValue("");

		const win = {} as Window;
		await expect(resolveInitializationAppRoot(win)).resolves.toBeNull();
	});
});
