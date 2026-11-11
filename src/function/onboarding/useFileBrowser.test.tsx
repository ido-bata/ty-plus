/**
 * @vitest-environment jsdom
 */
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FilePickStep } from "@/function/onboarding/steps-data";
import { useFileBrowser } from "@/function/onboarding/useFileBrowser";
import type { Paths } from "@/function/onboarding/usePaths";

const mocks = vi.hoisted(() => ({
	readDirectory: vi.fn(),
}));

vi.mock("@/management/preset/onboarding-directory", () => ({
	readOnboardingPresetDirectory: mocks.readDirectory,
}));

vi.mock("@/management/storage/file-browser-service", () => ({
	canUseCepNodeFileBrowser: () => true,
	createCepNodeFileBrowserService: () => ({
		getDefaultDirectory: () => "C:/Users/test",
	}),
}));

const paths: Paths = {
	presetRoot: "C:/Program Files/Adobe/After Effects/Support Files/Presets",
	scriptRoot: "C:/Program Files/Adobe/After Effects/Support Files/Scripts",
	pluginRoot: "C:/Program Files/Adobe/Common/Plug-ins/7.0/MediaCore",
};

const currentDir: Record<FilePickStep, string> = {
	presets: paths.presetRoot,
	scripts: paths.scriptRoot,
	plugins: paths.pluginRoot,
};

describe("useFileBrowser", () => {
	it("loads the directory when onboarding enters a file-pick step after mount", async () => {
		mocks.readDirectory.mockReset();
		mocks.readDirectory.mockResolvedValue([
			{
				path: `${paths.presetRoot}/Transitions`,
				name: "Transitions",
				isDirectory: true,
				fileType: "folder",
				extension: "",
			},
		]);
		const setError = vi.fn();
		const { result, rerender } = renderHook(
			({ step }: { step: FilePickStep | null }) =>
				useFileBrowser(step, currentDir, paths, setError),
			{ initialProps: { step: null as FilePickStep | null } },
		);

		expect(result.current.folderEntries).toEqual([]);
		window.dispatchEvent(
			new CustomEvent("browser-refresh", {
				detail: {
					step: "presets",
					dirPath: paths.presetRoot,
				},
			}),
		);
		rerender({ step: "presets" });

		await waitFor(() => {
			expect(result.current.folderEntries).toEqual([
				expect.objectContaining({
					name: "Transitions",
					path: `${paths.presetRoot}/Transitions`,
					isDirectory: true,
				}),
			]);
		});
	});
});
