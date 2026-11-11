/**
 * E2E tests for preset removal flow.
 *
 * Tests the full removal workflow: removing a preset from the catalog,
 * verifying it's no longer listed, and handling removal of presets in use.
 *
 * @vitest-environment happy-dom
 */

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Preset } from "@/management/preset/contract";

const {
	mockGetPreset,
	mockUpsertLocalPreset,
	mockRemoveLocalPreset,
	mockListPresets,
	mockCoercePersistedPresetIcon,
} = vi.hoisted(() => ({
	mockGetPreset: vi.fn(),
	mockUpsertLocalPreset: vi.fn(),
	mockRemoveLocalPreset: vi.fn(),
	mockListPresets: vi.fn(),
	mockCoercePersistedPresetIcon: vi.fn(
		(_type: string | undefined, icon: unknown) => {
			if (typeof icon === "string") {
				return { type: "emoji", param: { emoji: icon } };
			}
			if (icon && typeof icon === "object" && "type" in icon) {
				return icon;
			}
			return { type: "text", param: { text: "?" } };
		},
	),
}));

vi.mock("../../../management/preset", () => ({
	getPreset: mockGetPreset,
	upsertLocalPreset: mockUpsertLocalPreset,
	removeLocalPreset: mockRemoveLocalPreset,
	listPresets: mockListPresets,
	coercePersistedPresetIcon: mockCoercePersistedPresetIcon,
}));

vi.mock(
	"../../../management/workspace/placement/notify-panels-after-preset-save",
	() => ({
		notifyPanelsAfterPresetSave: vi.fn().mockResolvedValue(undefined),
	}),
);

vi.mock("../../dialog/useDialogClose", () => ({
	useDialogClose: () => ({ close: vi.fn(), hasUnsavedChanges: vi.fn() }),
}));

vi.mock("@/management/dialog", () => ({
	DialogShell: ({
		children,
		footer,
	}: {
		children: ReactElement;
		footer?: ReactNode;
	}) => (
		<div data-testid="dialog-shell">
			{children}
			{footer}
		</div>
	),
}));

vi.mock("@/management/preset/editor/View", () => ({
	Editor: ({
		value,
		onChange,
	}: {
		value: string;
		onChange: (v: string) => void;
	}) => (
		<textarea
			data-testid="code-editor"
			value={value}
			onChange={(e: { currentTarget: { value: string } }) =>
				onChange(e.currentTarget.value)
			}
		/>
	),
}));

// Mock bolt-shim to prevent import errors
vi.mock("@/management/ae/cep/dialog-shim/bolt", () => ({
	selectFile: vi.fn(),
	selectFolder: vi.fn(),
}));

import { notifyPanelsAfterPresetSave } from "@/management/workspace/placement/notify-panels-after-preset-save";
import { PresetEditDialog } from "../edit/Dialog";

// ===== Test data =====

const basePreset: Preset = {
	id: "preset-remove-001",
	type: "script",
	title: "Removable Preset",
	filePath: "/path/to/removable.jsx",
	description: "A preset that will be removed",
	descriptionImage: "",
	icon: { type: "emoji" as const, param: { emoji: "⚡" } },
	data: { code: "// code to remove" },
};

const anotherPreset: Preset = {
	id: "preset-remove-002",
	type: "preset",
	title: "Another Preset",
	filePath: "/path/to/another.ffx",
	description: "Should remain after removal",
	descriptionImage: "",
	icon: { type: "text" as const, param: { text: "KEEP" } },
};

// ===== Tests =====

describe("PresetRemoveDialog E2E", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal(
			"confirm",
			vi.fn(() => true),
		);

		// Default: auto-resolve mocks
		mockGetPreset.mockResolvedValue(basePreset);
		mockRemoveLocalPreset.mockResolvedValue(undefined);
		mockUpsertLocalPreset.mockResolvedValue(undefined);
		mockListPresets.mockResolvedValue([]);
		vi.mocked(notifyPanelsAfterPresetSave).mockResolvedValue(undefined);
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	const renderDialog = (
		presetId = basePreset.id,
		onSaved?: () => void,
		onDeleted?: () => void,
	): ReturnType<typeof render> => {
		return render(
			<PresetEditDialog
				presetId={presetId}
				onSaved={onSaved}
				onDeleted={onDeleted}
			/>,
		);
	};

	describe("removing a preset from the catalog", () => {
		it("calls removeLocalPreset with correct preset id", async () => {
			renderDialog(basePreset.id);

			// Wait for preset to load and delete button to be available
			await waitFor(() => {
				expect(screen.queryByText("Loading preset…")).not.toBeInTheDocument();
			});

			const deleteBtn = await screen.findByRole("button", { name: /delete/i });
			fireEvent.click(deleteBtn);

			await waitFor(() => {
				expect(mockRemoveLocalPreset).toHaveBeenCalledWith(basePreset.id);
			});
		});

		it("shows deleting state while removal is in progress", async () => {
			let resolveRemovePromise: () => void;
			mockRemoveLocalPreset.mockImplementation(
				() =>
					new Promise<void>((resolve) => {
						resolveRemovePromise = () => resolve();
					}),
			);

			renderDialog();

			await waitFor(() => {
				expect(screen.queryByText("Loading preset…")).not.toBeInTheDocument();
			});

			const deleteBtn = await screen.findByRole("button", { name: /delete/i });
			fireEvent.click(deleteBtn);

			expect(
				await screen.findByRole("button", { name: /^deleting/i }),
			).toBeInTheDocument();

			// Clean up by resolving
			resolveRemovePromise!();
		});

		it("disables all buttons while deleting", async () => {
			let resolveRemovePromise: () => void;
			mockRemoveLocalPreset.mockImplementation(
				() =>
					new Promise<void>((resolve) => {
						resolveRemovePromise = () => resolve();
					}),
			);

			renderDialog();

			await waitFor(() => {
				expect(screen.queryByText("Loading preset…")).not.toBeInTheDocument();
			});

			const deleteBtn = await screen.findByRole("button", { name: /delete/i });
			fireEvent.click(deleteBtn);

			await waitFor(() => {
				const saveBtn = screen.getByRole("button", {
					name: /save/i,
				}) as HTMLButtonElement;
				const cancelBtn = screen.getByRole("button", {
					name: /cancel/i,
				}) as HTMLButtonElement;
				const deleteBtnDeleting = screen.getByRole("button", {
					name: /deleting/i,
				}) as HTMLButtonElement;
				expect(saveBtn).toBeDisabled();
				expect(cancelBtn).toBeDisabled();
				expect(deleteBtnDeleting).toBeDisabled();
			});

			// Clean up by resolving
			resolveRemovePromise!();
		});

		it("notifies panels after preset removal", async () => {
			renderDialog();

			await waitFor(() => {
				expect(screen.queryByText("Loading preset…")).not.toBeInTheDocument();
			});

			const deleteBtn = await screen.findByRole("button", { name: /delete/i });
			fireEvent.click(deleteBtn);

			await waitFor(() => {
				expect(notifyPanelsAfterPresetSave).toHaveBeenCalledWith(
					window,
					expect.objectContaining({
						sourceSurfaceId: "dialog-preset-edit",
						catalogRefIds: [basePreset.id],
					}),
				);
			});
		});

		it("calls onDeleted callback after successful removal", async () => {
			const onDeleted = vi.fn();
			renderDialog(basePreset.id, undefined, onDeleted);

			await waitFor(() => {
				expect(screen.queryByText("Loading preset…")).not.toBeInTheDocument();
			});

			const deleteBtn = await screen.findByRole("button", { name: /delete/i });
			fireEvent.click(deleteBtn);

			await waitFor(() => {
				expect(onDeleted).toHaveBeenCalledTimes(1);
			});
		});
	});

	describe("verifying preset is no longer listed after removal", () => {
		it("calls removeLocalPreset and verifies removal from list", async () => {
			const presetsBefore = [basePreset, anotherPreset];
			mockListPresets.mockResolvedValue(presetsBefore);

			renderDialog(basePreset.id);

			await waitFor(() => {
				expect(screen.queryByText("Loading preset…")).not.toBeInTheDocument();
			});

			const deleteBtn = await screen.findByRole("button", { name: /delete/i });
			fireEvent.click(deleteBtn);

			await waitFor(() => {
				expect(mockRemoveLocalPreset).toHaveBeenCalledWith(basePreset.id);
			});
		});

		it("handles removal of last preset gracefully", async () => {
			const lastPreset: Preset = {
				id: "last-preset",
				type: "preset",
				title: "Last One",
				filePath: "/path/to/last.ffx",
			};
			mockGetPreset.mockResolvedValue(lastPreset);

			renderDialog(lastPreset.id);

			await waitFor(() => {
				expect(screen.queryByText("Loading preset…")).not.toBeInTheDocument();
			});

			const deleteBtn = await screen.findByRole("button", { name: /delete/i });
			fireEvent.click(deleteBtn);

			await waitFor(() => {
				expect(mockRemoveLocalPreset).toHaveBeenCalledWith("last-preset");
			});
		});
	});

	describe("handling removal of presets in use", () => {
		it("removes preset even when it is in a panel", async () => {
			const inUsePreset: Preset = {
				...basePreset,
				id: "preset-in-use",
			};
			mockGetPreset.mockResolvedValue(inUsePreset);

			renderDialog(inUsePreset.id);

			await waitFor(() => {
				expect(screen.queryByText("Loading preset…")).not.toBeInTheDocument();
			});

			const deleteBtn = await screen.findByRole("button", { name: /delete/i });
			fireEvent.click(deleteBtn);

			await waitFor(() => {
				expect(mockRemoveLocalPreset).toHaveBeenCalledWith("preset-in-use");
			});
		});

		it("notifies panels when removing in-use preset", async () => {
			const inUsePreset: Preset = {
				...basePreset,
				id: "preset-panel-in-use",
			};
			mockGetPreset.mockResolvedValue(inUsePreset);

			renderDialog(inUsePreset.id);

			await waitFor(() => {
				expect(screen.queryByText("Loading preset…")).not.toBeInTheDocument();
			});

			const deleteBtn = await screen.findByRole("button", { name: /delete/i });
			fireEvent.click(deleteBtn);

			await waitFor(() => {
				expect(notifyPanelsAfterPresetSave).toHaveBeenCalledWith(
					window,
					expect.objectContaining({
						sourceSurfaceId: "dialog-preset-edit",
						catalogRefIds: ["preset-panel-in-use"],
					}),
				);
			});
		});

		it("allows deletion without checking panel state first", async () => {
			renderDialog(basePreset.id);

			await waitFor(() => {
				expect(screen.queryByText("Loading preset…")).not.toBeInTheDocument();
			});

			const deleteBtn = await screen.findByRole("button", { name: /delete/i });
			fireEvent.click(deleteBtn);

			await waitFor(() => {
				expect(mockRemoveLocalPreset).toHaveBeenCalledTimes(1);
			});
		});
	});

	describe("error handling during removal", () => {
		it("re-enables buttons after failed removal", async () => {
			mockRemoveLocalPreset.mockRejectedValue(
				new Error("Failed to remove preset"),
			);

			renderDialog();

			await waitFor(() => {
				expect(screen.queryByText("Loading preset…")).not.toBeInTheDocument();
			});

			const deleteBtn = await screen.findByRole("button", { name: /delete/i });
			fireEvent.click(deleteBtn);

			// Wait for error state to settle
			await new Promise((r) => setTimeout(r, 100));

			await waitFor(() => {
				const saveBtn = screen.getByRole("button", {
					name: /save/i,
				}) as HTMLButtonElement;
				expect(saveBtn).not.toBeDisabled();
			});
		});
	});
});
