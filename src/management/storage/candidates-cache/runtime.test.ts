import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	canUseCepNodeFileBrowser,
	createCepNodeFileBrowserService,
} from "@/management/storage/file-browser-service";
import { readSettings } from "@/management/workspace/persistence/store";
import { readCandidates, writeCandidates } from "./candidates";
import { preloadCandidatesSnapshot, triggerCandidatesRebuild } from "./runtime";

vi.mock("./candidates", () => ({
	readCandidates: vi.fn(),
	writeCandidates: vi.fn(),
}));

vi.mock("@/management/storage/file-browser-service", () => ({
	canUseCepNodeFileBrowser: vi.fn(),
	createCepNodeFileBrowserService: vi.fn(),
}));

vi.mock("@/management/workspace/persistence/store", () => ({
	readSettings: vi.fn(),
}));

/**
 * Mock the user-chosen roots that onboarding wrote to `settings/app.json`.
 * This is the SAME source the directory browser "Anchors" view,
 * `PathDialog`, and `FolderDirectoryPicker` use.
 */
const setupUserChosenRoots = (roots: {
	presetRoot?: string;
	scriptRoot?: string;
	pluginRoot?: string;
}) => {
	vi.mocked(readSettings).mockReset();
	const paths: Record<string, string> = {};
	if (roots.presetRoot) paths.presetRoot = roots.presetRoot;
	if (roots.scriptRoot) paths.scriptRoot = roots.scriptRoot;
	if (roots.pluginRoot) paths.pluginRoot = roots.pluginRoot;
	vi.mocked(readSettings).mockResolvedValue(
		JSON.stringify({ core: { paths } }),
	);
};

const setupEmptySettings = () => {
	vi.mocked(readSettings).mockReset();
	vi.mocked(readSettings).mockResolvedValue(null);
};

describe("candidates runtime cache authority", () => {
	const win = {} as Window;

	beforeEach(() => {
		vi.mocked(readCandidates).mockReset();
		vi.mocked(readCandidates).mockResolvedValue(null);
		vi.mocked(readSettings).mockReset();
	});

	it("returns hit and skips cache lookup when no user-chosen roots are configured", async () => {
		setupEmptySettings();

		await expect(preloadCandidatesSnapshot(win)).resolves.toBe("hit");
		expect(readCandidates).not.toHaveBeenCalled();
	});

	it("returns miss and looks up cache when user-chosen roots are configured but cache is empty", async () => {
		setupUserChosenRoots({
			presetRoot: "D:/TyPlus/Presets",
			scriptRoot: "D:/TyPlus/Scripts",
			pluginRoot: "D:/TyPlus/Plug-ins",
		});
		vi.mocked(readCandidates).mockResolvedValue(null);

		await expect(preloadCandidatesSnapshot(win)).resolves.toBe("miss");

		expect(readCandidates).toHaveBeenCalledWith(
			win,
			expect.objectContaining({ includeDirectorySignatures: false }),
		);
	});

	it("indexes the user-chosen roots from settings/app.json (not the CEP gateway AE-install paths)", async () => {
		// Even if the global getDataServices().resolveSystemPaths() were still
		// reachable, the cache must read from settings/app.json only.
		setupUserChosenRoots({
			presetRoot: "D:/chosen/Presets",
			scriptRoot: "D:/chosen/Scripts",
			pluginRoot: "D:/chosen/Plug-ins",
		});
		vi.mocked(readCandidates).mockResolvedValue(null);

		await preloadCandidatesSnapshot(win);

		expect(readCandidates).toHaveBeenCalledWith(
			win,
			expect.objectContaining({ includeDirectorySignatures: false }),
		);
		// The cache miss path is triggered specifically by the user-chosen roots
		// being present; the AE-install roots from the CEP gateway are not used.
	});
});

describe("triggerCandidatesRebuild", () => {
	const win = {} as Window;

	beforeEach(() => {
		vi.mocked(writeCandidates).mockReset();
		vi.mocked(writeCandidates).mockResolvedValue();
		vi.mocked(canUseCepNodeFileBrowser).mockReset();
		vi.mocked(canUseCepNodeFileBrowser).mockReturnValue(true);
		vi.mocked(createCepNodeFileBrowserService).mockReset();
		vi.mocked(createCepNodeFileBrowserService).mockReturnValue({
			buildQuickActionRootIndexIncremental: vi
				.fn()
				.mockImplementation(async (_roots, onProgress) => {
					await onProgress?.({
						rootFiles: [],
						directorySignatures: [],
						completed: true,
					});
					return { rootFiles: [], directorySignatures: [] };
				}),
		} as unknown as ReturnType<typeof createCepNodeFileBrowserService>);
		setupUserChosenRoots({
			presetRoot: "D:/TyPlus/Presets",
			scriptRoot: "D:/TyPlus/Scripts",
			pluginRoot: "D:/TyPlus/Plug-ins",
		});
	});

	it("writes the candidates cache so it is available after onboarding completes in the same session", async () => {
		await triggerCandidatesRebuild(win);

		expect(writeCandidates).toHaveBeenCalled();
		expect(writeCandidates).toHaveBeenLastCalledWith(
			win,
			expect.objectContaining({
				version: 1,
				roots: expect.arrayContaining([
					expect.objectContaining({ rootKind: "preset" }),
					expect.objectContaining({ rootKind: "script" }),
					expect.objectContaining({ rootKind: "plugin" }),
				]),
			}),
		);
	});

	it("skips writing when the CEP node file browser is unavailable", async () => {
		vi.mocked(canUseCepNodeFileBrowser).mockReturnValue(false);

		await triggerCandidatesRebuild(win);

		expect(writeCandidates).not.toHaveBeenCalled();
	});

	it("skips writing when no user-chosen roots are configured (settings/app.json has no core.paths)", async () => {
		setupEmptySettings();

		await triggerCandidatesRebuild(win);

		expect(writeCandidates).not.toHaveBeenCalled();
	});

	it("uses the user-chosen paths from settings/app.json even when the global resolver would point at the AE install folder", async () => {
		// Setup: settings carries user-chosen paths that differ from the AE install
		// convention (the latter would be C:/Program Files/Adobe/.../Presets).
		setupUserChosenRoots({
			presetRoot: "D:/chosen/Presets",
			scriptRoot: "D:/chosen/Scripts",
			pluginRoot: "D:/chosen/Plug-ins",
		});

		await triggerCandidatesRebuild(win);

		expect(writeCandidates).toHaveBeenCalled();
		const lastCall = vi.mocked(writeCandidates).mock.calls.at(-1);
		expect(lastCall).toBeDefined();
		const writeArg = lastCall?.[1];
		expect(writeArg).toBeDefined();
		const written = writeArg as {
			roots: ReadonlyArray<{ path: string; rootKind: string }>;
		};
		const presetRootEntry = written.roots.find((r) => r.rootKind === "preset");
		expect(presetRootEntry?.path).toBe("D:/chosen/Presets");
		const scriptRootEntry = written.roots.find((r) => r.rootKind === "script");
		expect(scriptRootEntry?.path).toBe("D:/chosen/Scripts");
		const pluginRootEntry = written.roots.find((r) => r.rootKind === "plugin");
		expect(pluginRootEntry?.path).toBe("D:/chosen/Plug-ins");
	});
});
