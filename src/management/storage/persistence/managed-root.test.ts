import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockResolveAppRoot, mockReadInitState, mockIsInitComplete } =
	vi.hoisted(() => ({
		mockResolveAppRoot: vi.fn(),
		mockReadInitState: vi.fn(),
		mockIsInitComplete: vi.fn(),
	}));

vi.mock("@/management/setting/onboarding/initialization", () => ({
	resolveInitializationAppRoot: mockResolveAppRoot,
	readInitializationState: mockReadInitState,
	isInitializationComplete: mockIsInitComplete,
}));

import {
	resolveReadManagedRoot,
	resolveWriteManagedRoot,
} from "./managed-root";

const win = {} as Window;

describe("resolveWriteManagedRoot", () => {
	beforeEach(() => vi.clearAllMocks());

	it("throws when no app root is discoverable", async () => {
		mockResolveAppRoot.mockResolvedValue(null);
		await expect(resolveWriteManagedRoot(win)).rejects.toThrow(
			/ty-plus-init\.json/,
		);
	});

	it("throws when ty-plus-init.json is missing", async () => {
		mockResolveAppRoot.mockResolvedValue("/AE/Support Files");
		mockReadInitState.mockResolvedValue(null);
		mockIsInitComplete.mockReturnValue({ completed: false });
		await expect(resolveWriteManagedRoot(win)).rejects.toThrow(
			/not yet initialized/,
		);
	});

	it("throws when supportRoot is missing/blank", async () => {
		mockResolveAppRoot.mockResolvedValue("/AE/Support Files");
		mockReadInitState.mockResolvedValue({});
		mockIsInitComplete.mockReturnValue({ completed: true, supportRoot: "  " });
		await expect(resolveWriteManagedRoot(win)).rejects.toThrow(/supportRoot/);
	});

	it("returns <supportRoot>/ty-plus when locator is valid", async () => {
		mockResolveAppRoot.mockResolvedValue("/AE/Support Files");
		mockReadInitState.mockResolvedValue({});
		mockIsInitComplete.mockReturnValue({
			completed: true,
			supportRoot: "/D/ae-data",
		});
		await expect(resolveWriteManagedRoot(win)).resolves.toBe(
			"/D/ae-data/ty-plus",
		);
	});

	it("strips trailing slashes and never double-appends ty-plus", async () => {
		mockResolveAppRoot.mockResolvedValue("/AE/Support Files");
		mockReadInitState.mockResolvedValue({});
		mockIsInitComplete.mockReturnValue({
			completed: true,
			supportRoot: "/D/ae-data/ty-plus/",
		});
		await expect(resolveWriteManagedRoot(win)).resolves.toBe(
			"/D/ae-data/ty-plus",
		);
	});
});

describe("resolveReadManagedRoot", () => {
	beforeEach(() => vi.clearAllMocks());

	it("returns null instead of throwing when locator is missing", async () => {
		mockResolveAppRoot.mockResolvedValue(null);
		await expect(resolveReadManagedRoot(win)).resolves.toBeNull();
	});

	it("returns root when locator is valid", async () => {
		mockResolveAppRoot.mockResolvedValue("/AE");
		mockReadInitState.mockResolvedValue({});
		mockIsInitComplete.mockReturnValue({
			completed: true,
			supportRoot: "/D/ae-data",
		});
		await expect(resolveReadManagedRoot(win)).resolves.toBe(
			"/D/ae-data/ty-plus",
		);
	});
});
