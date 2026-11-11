/**
 * @vitest-environment jsdom
 */
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { View } from "@/function/onboarding/View";

afterEach(() => {
	cleanup();
});

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/function/onboarding/ui/Animation", () => ({
	Animation: () => null,
}));

vi.mock("@/function/onboarding/useMenu", () => ({
	useMenu: () => undefined,
}));

vi.mock("@/function/onboarding/usePaths", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@/function/onboarding/usePaths")>();
	return {
		...actual,
		isPathAeAppFolder: () => Promise.resolve(true),
	};
});

vi.mock("@/management/ae/cep/contexts/Context", () => ({
	useCep: () => ({ panelSurfaceId: "panel-1" }),
}));

vi.mock("@/management/i18n/Context", () => ({
	useI18n: () => ({ locale: "en", setLocale: vi.fn() }),
}));

vi.mock("@/management/setting/onboarding/initialization", () => ({
	completeInitialization: vi.fn(),
	isInitializationComplete: () => ({ completed: true }),
	mergeOnboardingSettings: vi.fn(),
	readInitializationState: () =>
		Promise.resolve({ supportRoot: "C:/Ae", updatedAt: new Date(0) }),
	readSupportRootFromSettingsJson: () => null,
	resolveInitializationAppRoot: () => Promise.resolve("C:/Ae"),
}));

vi.mock("@/management/storage", () => ({
	readSettings: () => Promise.resolve(null),
	writeSettings: vi.fn(),
}));

vi.mock("@/management/preset/onboarding-directory", () => ({
	readOnboardingPresetDirectory: ({ dirPath }: { dirPath: string }) => {
		if (dirPath === "C:/Ae/Presets") {
			return Promise.resolve([
				{
					path: "C:/Ae/Presets/First",
					name: "First",
					isDirectory: true,
					fileType: "folder",
					extension: "",
				},
			]);
		}
		if (dirPath === "C:/Ae/Presets/First") {
			return Promise.resolve([
				{
					path: "C:/Ae/Presets/First/Second",
					name: "Second",
					isDirectory: true,
					fileType: "folder",
					extension: "",
				},
			]);
		}
		if (dirPath === "C:/Ae/Presets/First/Second") {
			return Promise.resolve([
				{
					path: "C:/Ae/Presets/First/Second/Third",
					name: "Third",
					isDirectory: true,
					fileType: "folder",
					extension: "",
				},
			]);
		}
		return Promise.resolve([]);
	},
}));

vi.mock("@/management/storage/file-browser-service", () => ({
	canUseCepNodeFileBrowser: () => true,
	createCepNodeFileBrowserService: () => ({
		getDefaultDirectory: () => "C:/Ae",
		getAncestorDirectoryOrNull: () => null,
	}),
}));

vi.mock("@/management/storage/read/scoped-directory", () => ({
	createScopedDirectoryService: () => ({}),
	readScopedDirectory: () => Promise.resolve([]),
	resolveScopedParentDirectory: () => null,
}));

describe("onboarding directory navigation", () => {
	it("loads the clicked child directory instead of keeping the parent listing", async () => {
		render(<View />);

		fireEvent.click(screen.getByRole("button", { name: "actions.next" }));
		fireEvent.click(screen.getByRole("button", { name: "actions.next" }));
		await waitFor(() => {
			expect(
				screen.getByRole("button", { name: "actions.next" }),
			).not.toBeDisabled();
		});
		fireEvent.click(screen.getByRole("button", { name: "actions.next" }));
		await waitFor(() => {
			expect(screen.getByTestId("onboarding-title").textContent).toMatch(
				/step\.(subfolders|presets)\.title/,
			);
		});
		if (
			screen.getByTestId("onboarding-title").textContent?.includes("subfolders")
		) {
			fireEvent.click(screen.getByRole("button", { name: "actions.next" }));
		}

		const first = await screen.findByText("First");
		fireEvent.doubleClick(first);

		const second = await screen.findByText("Second");
		fireEvent.doubleClick(second);

		await waitFor(() => {
			expect(screen.getByText("Third")).toBeInTheDocument();
		});
	});
});

describe("onboarding view-mode toggle", () => {
	it("toggles between modal and fullscreen via the header button", () => {
		render(<View />);

		const shell = screen.getByTestId("onboarding-shell");
		const toggle = screen.getByTestId("onboarding-view-mode-toggle");

		expect(shell).toHaveAttribute("data-view-mode", "modal");
		expect(toggle).toHaveAttribute("aria-pressed", "false");

		fireEvent.click(toggle);

		expect(shell).toHaveAttribute("data-view-mode", "fullscreen");
		expect(toggle).toHaveAttribute("aria-pressed", "true");

		fireEvent.click(toggle);

		expect(shell).toHaveAttribute("data-view-mode", "modal");
		expect(toggle).toHaveAttribute("aria-pressed", "false");
	});
});
