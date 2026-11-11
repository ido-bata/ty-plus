import { beforeEach, describe, expect, it, vi } from "vitest";

const readSettings = vi.fn();
const readInitializationState = vi.fn();
const resolveInitializationAppRoot = vi.fn();

vi.mock("../../storage/workspace/store", () => ({
	readSettings,
}));

vi.mock("../onboarding/initialization", async () => {
	const actual = await vi.importActual<
		typeof import("../onboarding/initialization")
	>("../onboarding/initialization");
	return {
		...actual,
		readInitializationState,
		resolveInitializationAppRoot,
	};
});

describe("resolveTyPlusManagedRootForPersistence", () => {
	beforeEach(() => {
		readSettings.mockReset();
		readInitializationState.mockReset();
		resolveInitializationAppRoot.mockReset();
		resolveInitializationAppRoot.mockResolvedValue(null);
	});

	it("returns null when host support is known but onboarding locator is incomplete", async () => {
		resolveInitializationAppRoot.mockResolvedValue("/Adobe/AE/Support Files");
		readInitializationState.mockResolvedValue(null);
		readSettings.mockResolvedValue(
			JSON.stringify({ core: { paths: { supportRoot: "/chosen" } } }),
		);
		const win = {
			cep_node: {
				require: () => ({
					existsSync: () => true,
				}),
			},
		} as unknown as Window;
		const { resolveTyPlusManagedRootForPersistence } = await import(
			"./ty-plus-managed-root"
		);
		await expect(
			resolveTyPlusManagedRootForPersistence(win),
		).resolves.toBeNull();
	});

	it("returns managed ty-plus when initialization is complete and settings path exists", async () => {
		resolveInitializationAppRoot.mockResolvedValue("/Adobe/AE/Support Files");
		readInitializationState.mockResolvedValue({
			supportRoot: "/chosen",
			updatedAt: new Date(),
		});
		readSettings.mockResolvedValue(
			JSON.stringify({ core: { paths: { supportRoot: "/chosen" } } }),
		);
		const win = {
			cep_node: {
				require: () => ({
					existsSync: () => true,
				}),
			},
		} as unknown as Window;
		const { resolveTyPlusManagedRootForPersistence } = await import(
			"./ty-plus-managed-root"
		);
		const resolved = await resolveTyPlusManagedRootForPersistence(win);
		expect(resolved?.replace(/\\/g, "/")).toMatch(/chosen\/ty-plus$/);
	});

	it("reads ty-plus-init from host install root when available", async () => {
		resolveInitializationAppRoot.mockResolvedValue("/Adobe/AE/Support Files");
		readInitializationState.mockResolvedValue({
			supportRoot: "/chosen",
			updatedAt: new Date(),
		});
		readSettings.mockResolvedValue(
			JSON.stringify({ core: { paths: { supportRoot: "/chosen" } } }),
		);
		const win = {
			cep_node: {
				require: () => ({
					existsSync: () => true,
				}),
			},
		} as unknown as Window;
		const { resolveTyPlusManagedRootForPersistence } = await import(
			"./ty-plus-managed-root"
		);
		await resolveTyPlusManagedRootForPersistence(win);
		expect(readInitializationState).toHaveBeenCalledWith(
			win,
			"/Adobe/AE/Support Files",
		);
	});

	it("uses locator supportRoot when settings JSON omits core.paths.supportRoot", async () => {
		resolveInitializationAppRoot.mockResolvedValue("/Adobe/AE/Support Files");
		readInitializationState.mockResolvedValue({
			supportRoot: "/from-locator",
			updatedAt: new Date(),
		});
		readSettings.mockResolvedValue("{}");
		const win = {
			cep_node: {
				require: () => ({
					existsSync: () => true,
				}),
			},
		} as unknown as Window;
		const { resolveTyPlusManagedRootForPersistence } = await import(
			"./ty-plus-managed-root"
		);
		const resolved = await resolveTyPlusManagedRootForPersistence(win);
		expect(resolved?.replace(/\\/g, "/")).toMatch(/from-locator\/ty-plus$/);
	});
});
